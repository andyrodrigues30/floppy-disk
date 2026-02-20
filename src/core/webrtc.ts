import { TFile } from "obsidian"
import FloppyDiskPlugin from "main"
import { generateManifest } from "./manifest"
import { FloppyDiskCrypto } from "utils/cryptoHelper"
import { Manifest } from "types/manifest"
import { Device, RemoteDevice } from "types/device"
import {
    BaseMessage,
    RequestManifestMessage,
    ManifestResponseMessage,
    FileChunkMessage,
    HandshakeMessage,
    HandshakeAckMessage,
    FileCompleteMessage
} from "types/messages"
import {
    isConflictNotificationMessage,
    isFileChunkMessage,
    isFileCompleteMessage,
    isFileRequestMessage,
    isHandshakeAckMessage,
    isHandshakeMessage,
    isManifestResponseMessage,
    isRequestManifestMessage
} from "utils/messageGuards"

const CHUNK_SIZE = 64 * 1024;

export class WebRTCManager {
    private plugin: FloppyDiskPlugin;
    private remoteDevices: Map<string, RemoteDevice> = new Map();
    private channels: Record<string, RTCDataChannel> = {};
    private fileBuffers: Record<string, Uint8Array[]> = {};

    constructor(plugin: FloppyDiskPlugin) {
        this.plugin = plugin;
    }

    // connect to a device
    public connect(deviceId: string, channel: RTCDataChannel) {
        this.channels[deviceId] = channel

        channel.onmessage = async (event: MessageEvent<string | ArrayBuffer>) => {
            await this.handleMessage(deviceId, event.data)
        }

        channel.onclose = () => {
            delete this.channels[deviceId]
        }
    }

    // send message to a connected device
    public sendMessage(deviceId: string, msg: BaseMessage | FileChunkMessage) {
        const channel = this.channels[deviceId]
        if (!channel || channel.readyState !== "open") return

        if ("data" in msg && msg.data instanceof ArrayBuffer) {
            channel.send(msg.data)
        } else {
            channel.send(JSON.stringify(msg))
        }
    }

    // handle incoming messages
    private async handleMessage(deviceId: string, data: string | ArrayBuffer) {
        try {
            if (typeof data === "string") {
                const parsed: unknown = JSON.parse(data)
                if (isRequestManifestMessage(parsed)) {
                    await this.sendManifest(deviceId)
                } else if (isManifestResponseMessage(parsed)) {
                    console.warn("Received manifest from", deviceId, parsed.payload)
                } else if (isFileRequestMessage(parsed)) {
                    await this.sendFileInChunks(deviceId, parsed.path)
                } else if (isFileChunkMessage(parsed)) {
                    await this.handleFileChunk(parsed)
                } else if (isFileCompleteMessage(parsed)) {
                    await this.assembleFile(parsed.path)
                } else if (isConflictNotificationMessage(parsed)) {
                    console.warn("Conflict detected on file", parsed.path)
                } else if (isHandshakeMessage(parsed)) {
                    await this.handleHandshake(parsed)
                } else if (isHandshakeAckMessage(parsed)) {
                    console.warn("Handshake ack from", deviceId, parsed.accepted)
                } else {
                    console.warn("Unknown message received", parsed)
                }
            } else if (data instanceof ArrayBuffer) {
                console.warn("Unexpected raw ArrayBuffer received from", deviceId)
            }
        } catch (err) {
            console.error("WebRTCManager: Failed to parse message", err)
        }
    }

    // generate local manifest
    public async generateLocalManifest(): Promise<Manifest> {
        if (!this.plugin.snapshotManager) {
            throw new Error("WebRTCManager: snapshotManager not initialized")
        }

        const snapshot = await this.plugin.snapshotManager.loadSnapshot()
        let deviceId: string

        if (snapshot.currentDeviceId) {
            deviceId = snapshot.currentDeviceId
        } else {
            // register the current device and get the id
            await this.plugin.snapshotManager.registerCurrentDevice()
            deviceId = snapshot.currentDeviceId!
        }

        const vaultId = this.plugin.app.vault.getName()

        return generateManifest(this.plugin.app, vaultId, deviceId)
    }

    public async requestRemoteManifest(deviceId: string): Promise<Manifest> {
        const channel = this.channels[deviceId];
        if (!channel || channel.readyState !== "open") {
            throw new Error(`No open channel to device ${deviceId}`);
        }

        return new Promise<Manifest>((resolve, reject) => {
            const handleMessage = (event: MessageEvent<string | ArrayBuffer>) => {
                if (typeof event.data === "string") {
                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(event.data);
                    } catch {
                        return; // invalid JSON
                    }

                    // check parsed message
                    if (isManifestResponseMessage(parsed)) {
                        channel.removeEventListener("message", handleMessage);
                        resolve(parsed.payload);
                    }
                }
            };

            channel.addEventListener("message", handleMessage);

            // send request manifest message
            const request: RequestManifestMessage = { type: "REQUEST_MANIFEST" };
            this.sendMessage(deviceId, request);

            setTimeout(() => {
                channel.removeEventListener("message", handleMessage);
                reject(new Error(`Manifest request to ${deviceId} timed out`));
            }, 5000);
        });
    }

    // send local manifest to a remote device
    private async sendManifest(deviceId: string) {
        const manifest: Manifest = await this.generateLocalManifest()
        const msg: ManifestResponseMessage = {
            type: "MANIFEST_RESPONSE",
            payload: manifest
        }
        this.sendMessage(deviceId, msg)
    }

    private async handleHandshake(msg: HandshakeMessage) {
        console.warn("Received handshake from", msg.deviceId)

        let accepted = false

        try {
            // convert incoming device signature from ArrayBuffer
            const payload = new TextEncoder().encode(msg.deviceId)

            const remotePublicKey = await crypto.subtle.importKey(
                "jwk",
                msg.publicKey,
                { name: "ECDSA", namedCurve: "P-256" },
                true,
                ["verify"]
            )

            accepted = await this.verifySignature(remotePublicKey, payload.buffer, msg.signature)

            if (accepted) {
                console.warn("Handshake verified. Device trusted:", msg.deviceId)
                await this.registerTrustedDevice(msg.deviceId, msg.publicKey)
            } else {
                console.warn("Handshake signature invalid from device:", msg.deviceId)
            }

        } catch (err) {
            console.error("Error verifying handshake:", err)
        }

        // reply with ack
        const ack: HandshakeAckMessage = { type: "HANDSHAKE_ACK", accepted }
        this.sendMessage(msg.deviceId, ack)
    }

    public async performHandshake(remoteDeviceId: string): Promise<boolean> {
        // find the remote device
        const remoteDevice: Device | undefined = this.plugin.findDevice(remoteDeviceId);
        if (!remoteDevice) {
            console.warn(`Handshake failed: device ${remoteDeviceId} not found`);
            return false;
        }

        // only trusted devices can handshake
        if (remoteDevice.trustStatus !== "trusted") {
            console.warn(`Handshake failed: device ${remoteDeviceId} is not trusted`);
            return false;
        }

        try {
            const connection: RTCPeerConnection = new RTCPeerConnection();
            const channel: RTCDataChannel = connection.createDataChannel("handshake");

            const remote: RemoteDevice = {
                device: remoteDevice,
                connection,
                channel,
            };
            this.remoteDevices.set(remoteDeviceId, remote);

            channel.onopen = async () => {
                const payload = new TextEncoder().encode(this.plugin.settings.thisDevice.fingerprint);
                const signature = await FloppyDiskCrypto.signData(
                    this.plugin.settings.thisDevice.signingKeyPair.privateKey,
                    payload.buffer
                );

                const handshakeMsg = {
                    type: "HANDSHAKE",
                    deviceId: this.plugin.settings.thisDevice.id,
                    fingerprint: this.plugin.settings.thisDevice.fingerprint,
                    signature: Array.from(new Uint8Array(signature)), // send as array
                    publicKey: this.plugin.settings.thisDevice.signingKeyPair.publicKey,
                };
                channel.send(JSON.stringify(handshakeMsg));
            };

            const handshakeConfirmed: boolean = await new Promise<boolean>((resolve) => {
                channel.onmessage = (ev: MessageEvent) => {
                    try {
                        if (typeof ev.data !== "string") return;
                        const data: unknown = JSON.parse(ev.data);

                        // runtime type check
                        if (
                            typeof data === "object" &&
                            data !== null &&
                            (data as HandshakeAckMessage).type === "HANDSHAKE_ACK" &&
                            typeof (data as HandshakeAckMessage).accepted === "boolean" &&
                            (data as HandshakeAckMessage).accepted === true
                        ) {
                            resolve(true);
                        }
                    } catch {
                        resolve(false);
                    }
                };

                // optional timeout
                setTimeout(() => resolve(false), 10000);
            });


            return handshakeConfirmed;
        } catch (err) {
            console.error("Handshake error:", err);
            return false;
        }
    }

    // verify a signature given public key and data
    private async verifySignature(
        publicKey: CryptoKey,
        data: ArrayBuffer,
        signature: ArrayBuffer
    ): Promise<boolean> {
        return crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            publicKey,
            signature,
            data
        )
    }

    // register a trusted device in SnapshotManager
    private async registerTrustedDevice(deviceId: string, publicKey: JsonWebKey) {
        const snapshot = await this.plugin.snapshotManager.loadSnapshot()
        const now = Date.now()

        if (!snapshot.devices[deviceId]) {
            snapshot.devices[deviceId] = {
                deviceId,
                name: deviceId,
                lastSeen: now,
                lastSyncedAt: 0,
                files: {},
                publicKey
            }
        } else {
            snapshot.devices[deviceId].publicKey = publicKey
            snapshot.devices[deviceId].lastSeen = now
        }

        await this.plugin.snapshotManager.saveSnapshot()
    }

    public async sendFileInChunks(deviceId: string, path: string) {
        const file = this.plugin.app.vault.getAbstractFileByPath(path)
        if (!(file instanceof TFile)) return

        const buffer = await this.plugin.app.vault.readBinary(file)
        let offset = 0
        let chunkIndex = 0
        const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE)

        while (offset < buffer.byteLength) {
            const chunk = buffer.slice(offset, offset + CHUNK_SIZE)
            const msg: FileChunkMessage = {
                type: "FILE_CHUNK",
                path,
                chunkIndex,
                totalChunks,
                data: chunk
            }
            this.sendMessage(deviceId, msg)
            offset += CHUNK_SIZE
            chunkIndex++
        }

        // notify completion
        const completeMsg: FileCompleteMessage = { type: "FILE_COMPLETE", path }
        this.sendMessage(deviceId, completeMsg)
    }

    // request a file from a remote device and assemble chunks
    public async requestFile(deviceId: string, path: string): Promise<Uint8Array> {
        const channel = this.channels[deviceId];
        if (!channel || channel.readyState !== "open") {
            throw new Error(`No open channel to device ${deviceId}`);
        }

        // clear previous buffer if exists
        this.fileBuffers[path] = [];

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                delete this.fileBuffers[path];
                reject(new Error(`File request timed out: ${path}`));
            }, 10000); // 10s timeout

            const handleMessage = (event: MessageEvent<string | ArrayBuffer>) => {
                if (!this.fileBuffers[path]) return;

                if (event.data instanceof ArrayBuffer) {
                    // raw chunk received
                    this.fileBuffers[path].push(new Uint8Array(event.data));
                } else if (typeof event.data === "string") {
                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(event.data);
                    } catch {
                        return;
                    }

                    if (isFileChunkMessage(parsed) && parsed.path === path) {
                        this.fileBuffers[path][parsed.chunkIndex] = new Uint8Array(parsed.data);
                    } else if (isFileCompleteMessage(parsed) && parsed.path === path) {
                        // assemble chunks
                        const buffers = this.fileBuffers[path];
                        const totalLength = buffers.reduce((sum, chunk) => sum + chunk.length, 0);
                        const fullBuffer = new Uint8Array(totalLength);
                        let offset = 0;
                        for (const chunk of buffers) {
                            fullBuffer.set(chunk, offset);
                            offset += chunk.length;
                        }

                        // cleanup
                        delete this.fileBuffers[path];
                        channel.removeEventListener("message", handleMessage);
                        clearTimeout(timeout);

                        resolve(fullBuffer);
                    }
                }
            };

            channel.addEventListener("message", handleMessage);

            // send file request
            const requestMsg = { type: "FILE_REQUEST", path } as const;
            channel.send(JSON.stringify(requestMsg));
        });
    }


    // handle received file chunk
    private async handleFileChunk(msg: FileChunkMessage) {
        if (!this.fileBuffers[msg.path]) this.fileBuffers[msg.path] = []
        const bufferArray = this.fileBuffers[msg.path]!
        bufferArray[msg.chunkIndex] = new Uint8Array(msg.data)
    }

    // assemble file after chunks received
    private async assembleFile(path: string): Promise<void> {
        const buffers = this.fileBuffers[path]
        if (!buffers) return

        // combine chunks
        const totalLength = buffers.reduce((sum, chunk) => sum + chunk.length, 0)
        const fullBuffer = new Uint8Array(totalLength)
        let offset = 0
        for (const chunk of buffers) {
            fullBuffer.set(chunk, offset)
            offset += chunk.length
        }

        // remove chunks
        delete this.fileBuffers[path]

        // text or binary file
        const file = this.plugin.app.vault.getAbstractFileByPath(path)

        if (file instanceof TFile) {
            if (path.match(/\.(txt|md|csv|json|js|ts)$/i)) {
                const decoder = new TextDecoder()
                const content = decoder.decode(fullBuffer)
                await this.plugin.app.vault.modify(file, content)
            } else {
                await this.plugin.app.vault.adapter.writeBinary(path, fullBuffer.buffer)
            }
        } else {
            if (path.match(/\.(txt|md|csv|json|js|ts)$/i)) {
                const decoder = new TextDecoder()
                const content = decoder.decode(fullBuffer)
                await this.plugin.app.vault.create(path, content)
            } else {
                await this.plugin.app.vault.adapter.writeBinary(path, fullBuffer.buffer)
            }
        }


        // update snapshot
        if (this.plugin.snapshotManager) {
            const hash = await FloppyDiskCrypto.computeHash(fullBuffer.buffer)
            await this.plugin.snapshotManager.updateFileSync(path, hash)
        }
    }
}
