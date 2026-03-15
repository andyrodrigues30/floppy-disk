import { Notice, TFile } from "obsidian";

import { Manifest } from "types/manifest";
import {
    ManifestResponseMessage,
    FileChunkMessage,
    HandshakeMessage,
    Message
} from "types/messages";

import FloppyDiskPlugin from "main";

import { isFileChunkMessage, isFileCompleteMessage } from "utils/messageGuards";
import { generateManifest } from "../utils/manifest";
import { FloppyDiskCrypto } from "utils/cryptoHelper";
import { isTextFile } from "utils/isTextFile";
import { CONNECTION_CHANGED_EVENT } from "utils/events";

const CHUNK_SIZE = 64 * 1024;

type ConnectionEntry = {
    peer: RTCPeerConnection;
    channel: RTCDataChannel;
};

export class WebRTCManager {
    private plugin: FloppyDiskPlugin;
    private connections: Map<string, ConnectionEntry> = new Map();
    private fileBuffers: Map<string, Uint8Array[]> = new Map();
    private pendingManifestResolvers: Map<string, (manifest: Manifest) => void> = new Map();

    constructor(plugin: FloppyDiskPlugin) {
        this.plugin = plugin;
    }

    // connect
    private createPeer(deviceId: string): RTCPeerConnection {
        const peer = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ],
        });

        const channel = peer.createDataChannel("floppy-disk");

        this.attachConnection(deviceId, peer, channel);

        return peer;
    }

    public async createOffer(deviceId: string): Promise<string> {
        const peer = this.createPeer(deviceId);

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        await this.waitForIceGathering(peer);

        return JSON.stringify(peer.localDescription);
    }

    public async acceptOffer(
        deviceId: string,
        offerString: string
    ): Promise<string> {

        const peer = this.createPeer(deviceId);

        const offer = JSON.parse(offerString);

        await peer.setRemoteDescription(offer);

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        await this.waitForIceGathering(peer);

        return JSON.stringify(peer.localDescription);
    }

    public async finalizeConnection(
        deviceId: string,
        answerString: string
    ) {
        const entry = this.connections.get(deviceId);
        if (!entry) throw new Error("Peer not found");

        const answer = JSON.parse(answerString);

        await entry.peer.setRemoteDescription(answer);
    }

    private waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
        return new Promise((resolve) => {
            if (peer.iceGatheringState === "complete") {
                resolve();
                return;
            }

            peer.onicegatheringstatechange = () => {
                if (peer.iceGatheringState === "complete") {
                    resolve();
                }
            };
        });
    }

    public isConnected(deviceId: string): boolean {
        return this.connections.get(deviceId)?.peer.connectionState === "connected";
    }

    public async connectToDevice(deviceId: string): Promise<void> {
        if (this.isConnected(deviceId)) return;

        const peer = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        const channel = peer.createDataChannel("floppy-disk");

        this.attachConnection(deviceId, peer, channel);

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        new Notice("Connection offer created. Send to remote device.");
    }

    private attachConnection(
        deviceId: string,
        peer: RTCPeerConnection,
        channel: RTCDataChannel
    ) {
        this.connections.set(deviceId, { peer, channel });

        peer.onconnectionstatechange = () => {
            if (
                peer.connectionState === "failed" ||
                peer.connectionState === "disconnected" ||
                peer.connectionState === "closed"
            ) {
                this.connections.delete(deviceId);
            }

            this.plugin.app.workspace.trigger(CONNECTION_CHANGED_EVENT);
        };

        peer.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("ICE candidate for", deviceId);
            }
        };

        channel.onopen = () => this.startHandshake(deviceId);

        channel.onmessage = (event) =>
            this.handleMessage(deviceId, event.data);

        channel.onclose = () => {
            this.connections.delete(deviceId);
            this.plugin.app.workspace.trigger(CONNECTION_CHANGED_EVENT);
        };
    }

    // messaging
    public sendMessage(deviceId: string, msg: Message) {
        const entry = this.connections.get(deviceId);
        if (!entry || entry.channel.readyState !== "open") return;

        entry.channel.send(JSON.stringify(msg));
    }

    private async handleMessage(
        deviceId: string,
        data: string | ArrayBuffer
    ) {
        if (typeof data !== "string") return;

        let msg: Message;

        try {
            msg = JSON.parse(data);
        } catch {
            return;
        }

        switch (msg.type) {

            case "REQUEST_MANIFEST":
                await this.sendManifest(deviceId);
                break;

            case "MANIFEST_RESPONSE":
                this.pendingManifestResolvers
                    .get(deviceId)
                    ?.(msg.payload);

                this.pendingManifestResolvers.delete(deviceId);
                break;

            case "FILE_CHUNK":
                await this.handleFileChunk(msg);
                break;

            case "FILE_COMPLETE":
                await this.assembleFile(msg.path);
                break;

            case "HANDSHAKE":
                await this.handleHandshake(msg);
                break;

            case "HANDSHAKE_ACK":
                console.warn("Handshake ack:", msg.accepted);
                break;
        }
    }

    // handshaking
    public async startHandshake(deviceId: string) {
        const device = this.plugin.settings.thisDevice;

        const payload = new TextEncoder().encode(device.fingerprint);

        const signature = await FloppyDiskCrypto.signData(
            device.signingKeyPair.privateKey,
            payload.buffer
        );

        const handshake: HandshakeMessage = {
            type: "HANDSHAKE",
            deviceId: device.id,
            deviceName: device.name,
            publicKey: device.publicKey,
            fingerprint: device.fingerprint,
            signature: Array.from(new Uint8Array(signature)),
        };

        this.sendMessage(deviceId, handshake);
    }

    private async handleHandshake(msg: HandshakeMessage) {
        let accepted = false;

        try {
            const jwk: JsonWebKey = JSON.parse(atob(msg.publicKey));

            const publicKey = await crypto.subtle.importKey(
                "jwk",
                jwk,
                { name: "ECDSA", namedCurve: "P-256" },
                true,
                ["verify"]
            );

            const encoder = new TextEncoder();
            const data = encoder.encode(msg.fingerprint).buffer;
            const signature = new Uint8Array(msg.signature).buffer;

            accepted = await crypto.subtle.verify(
                { name: "ECDSA", hash: "SHA-256" },
                publicKey,
                signature,
                data
            );

            if (accepted) {
                await this.plugin.deviceManager.trustDevice(
                    msg.deviceId,
                    msg.deviceName ?? msg.deviceId,
                    msg.publicKey
                );

                this.plugin.app.workspace.trigger(CONNECTION_CHANGED_EVENT);
            }
        } catch (err) {
            console.error("Handshake error:", err);
        }

        this.sendMessage(msg.deviceId, {
            type: "HANDSHAKE_ACK",
            accepted,
        });
    }

    private async sendManifest(deviceId: string) {
        const manifest = await generateManifest(
            this.plugin.app,
            this.plugin.app.vault.getName(),
            this.plugin.settings.thisDevice.id
        );

        const msg: ManifestResponseMessage = {
            type: "MANIFEST_RESPONSE",
            payload: manifest,
        };

        this.sendMessage(deviceId, msg);
    }

    public async generateLocalManifest(): Promise<Manifest> {
        if (!this.plugin.snapshotManager) {
            throw new Error("WebRTCManager: snapshotManager not initialized");
        }

        // Device ID should come from plugin settings (single source of truth)
        const deviceId: string = this.plugin.settings.thisDevice.id;

        if (!deviceId) {
            throw new Error("Current device ID is missing in settings");
        }

        const vaultId: string = this.plugin.app.vault.getName();

        return generateManifest(
            this.plugin.app,
            vaultId,
            deviceId
        );
    }

    public async requestRemoteManifest(
        deviceId: string
    ): Promise<Manifest> {
        return new Promise((resolve, reject) => {

            if (!this.connections.has(deviceId)) {
                return reject(new Error("Device not connected"));
            }

            this.pendingManifestResolvers.set(deviceId, resolve);

            this.sendMessage(deviceId, {
                type: "REQUEST_MANIFEST",
            });

            setTimeout(() => {
                if (this.pendingManifestResolvers.has(deviceId)) {
                    this.pendingManifestResolvers.delete(deviceId);
                    reject(new Error("Manifest request timeout"));
                }
            }, 10000);

        });
    }

    //  file transfer
    public async sendFileInChunks(deviceId: string, path: string) {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return;

        const buffer = await this.plugin.app.vault.readBinary(file);

        let offset = 0;
        let index = 0;

        while (offset < buffer.byteLength) {
            const chunk = buffer.slice(offset, offset + CHUNK_SIZE);

            this.sendMessage(deviceId, {
                type: "FILE_CHUNK",
                path,
                chunkIndex: index,
                totalChunks: Math.ceil(buffer.byteLength / CHUNK_SIZE),
                data: chunk,
            });

            offset += CHUNK_SIZE;
            index++;
        }

        this.sendMessage(deviceId, {
            type: "FILE_COMPLETE",
            path,
        });
    }

    private async handleFileChunk(msg: FileChunkMessage) {
        if (!this.fileBuffers.has(msg.path)) {
            this.fileBuffers.set(msg.path, []);
        }

        const buffers = this.fileBuffers.get(msg.path)!;

        buffers[msg.chunkIndex] = new Uint8Array(msg.data);
    }

    private async assembleFile(path: string) {
        const buffers = this.fileBuffers.get(path);
        if (!buffers) return;

        const totalLength = buffers.reduce(
            (sum, chunk) => sum + chunk.length,
            0
        );

        const fullBuffer = new Uint8Array(totalLength);

        let offset = 0;
        for (const chunk of buffers) {
            fullBuffer.set(chunk, offset);
            offset += chunk.length;
        }

        this.fileBuffers.delete(path);

        const file = this.plugin.app.vault.getAbstractFileByPath(path);

        if (isTextFile(path)) {
            const content = new TextDecoder().decode(fullBuffer);

            if (file instanceof TFile) {
                await this.plugin.app.vault.modify(file, content);
            } else {
                await this.plugin.app.vault.create(path, content);
            }
        } else {
            await this.plugin.app.vault.adapter.writeBinary(
                path,
                fullBuffer.buffer
            );
        }

        if (this.plugin.snapshotManager) {
            const hash = await FloppyDiskCrypto.computeHash(
                fullBuffer.buffer
            );

            await this.plugin.snapshotManager.updateFileSync(path, hash);
        }
    }

    // KEEP
    public async reconnectAllDevices(): Promise<void> {
        const devices = this.plugin.deviceManager.getTrustedDevices();

        for (const device of devices) {
            if (!this.isConnected(device.id)) {
                console.warn("Attempting connection to", device.id);
                await this.connectToDevice(device.id);
            }
        }
    }

    public getConnections(): string[] {
        return Array.from(this.connections.keys());
    }

    // request a file from a remote device and assemble chunks
    public async requestFile(
        deviceId: string,
        path: string
    ): Promise<Uint8Array> {

        const channel = this.connections.get(deviceId)?.channel;

        if (!channel || channel.readyState !== "open") {
            throw new Error(`No open channel to device ${deviceId}`);
        }

        // initialize buffer in Map
        this.fileBuffers.set(path, []);

        return new Promise((resolve, reject) => {

            const timeout = setTimeout(() => {
                this.fileBuffers.delete(path);
                reject(new Error(`File request timed out: ${path}`));
            }, 10000);

            const handleMessage = (event: MessageEvent) => {
                if (!this.fileBuffers.has(path)) return;

                if (typeof event.data === "string") {
                    let parsed: unknown;

                    try {
                        parsed = JSON.parse(event.data);
                    } catch {
                        return;
                    }

                    if (isFileChunkMessage(parsed) && parsed.path === path) {

                        const buffers = this.fileBuffers.get(path)!;

                        buffers[parsed.chunkIndex] =
                            new Uint8Array(parsed.data);

                    } else if (isFileCompleteMessage(parsed) &&
                        parsed.path === path) {

                        const buffers = this.fileBuffers.get(path);

                        if (!buffers) return;

                        const totalLength = buffers.reduce(
                            (sum, chunk) => sum + chunk.length,
                            0
                        );

                        const fullBuffer = new Uint8Array(totalLength);

                        let offset = 0;
                        for (const chunk of buffers) {
                            if (!chunk) continue;
                            fullBuffer.set(chunk, offset);
                            offset += chunk.length;
                        }

                        // cleanup
                        this.fileBuffers.delete(path);
                        channel.removeEventListener("message", handleMessage);
                        clearTimeout(timeout);

                        resolve(fullBuffer);
                    }
                }
            };

            channel.addEventListener("message", handleMessage);

            // Send request
            channel.send(JSON.stringify({
                type: "FILE_REQUEST",
                path
            }));
        });
    }
}
