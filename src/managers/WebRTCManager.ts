import { Notice, TFile } from "obsidian";

import { Manifest } from "../types/manifest";
import {
	ManifestResponseMessage,
	FileChunkMessage,
	HandshakeMessage,
	Message,
} from "../types/messages";

import FloppyDiskPlugin from "../main";

import {
	isFileChunkMessage,
	isFileCompleteMessage,
} from "../utils/messageGuards";
import { generateManifest } from "../utils/manifest";
import { FloppyDiskCrypto } from "../utils/cryptoHelper";
import { isTextFile } from "../utils/isTextFile";
import { CONNECTION_CHANGED_EVENT } from "../utils/events";

const CHUNK_SIZE = 64 * 1024;

type ConnectionEntry = {
	peer: RTCPeerConnection;
	channel: RTCDataChannel;
};

export class WebRTCManager {
	private plugin: FloppyDiskPlugin;
	private connections: Map<string, ConnectionEntry> = new Map();
	private pendingConnections = new Map<
		string,
		{
			resolve: () => void;
			reject: (err: any) => void;
		}
	>();
	private readyConnections = new Set<string>();
	private fileBuffers: Map<string, Uint8Array[]> = new Map();
	private fileChunkTotals = new Map<string, number>();
	private pendingManifestResolvers: Map<
		string,
		(manifest: Manifest) => void
	> = new Map();

	constructor(plugin: FloppyDiskPlugin) {
		this.plugin = plugin;
	}

	private updateUI() {
		this.plugin.app.workspace.trigger(CONNECTION_CHANGED_EVENT);
	};

	// connect
	private createPeer(id: string, isInitiator: boolean): RTCPeerConnection {
		const peer = new RTCPeerConnection({
			iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
		});

		if (isInitiator) {
			const channel = peer.createDataChannel("floppy-disk");
			this.attachConnection(id, peer, channel);
		} else {
			peer.ondatachannel = (event) => {
				this.attachConnection(id, peer, event.channel);
			};
		}

		return peer;
	}

	public async createOffer(id: string): Promise<string> {
		const peer = this.createPeer(id, true);

		const offer = await peer.createOffer();
		await peer.setLocalDescription(offer);

		await this.waitForIceGathering(peer);

		return JSON.stringify(peer.localDescription);
	}

	public async acceptOffer(id: string, offerString: string): Promise<string> {
		const peer = this.createPeer(id, false);

		const offer = JSON.parse(offerString);

		await peer.setRemoteDescription(offer);

		const answer = await peer.createAnswer();
		await peer.setLocalDescription(answer);

		await this.waitForIceGathering(peer);

		return JSON.stringify(peer.localDescription);
	}

	public async finalizeConnection(id: string, answerString: string) {
		const entry = this.connections.get(id);
		if (!entry) throw new Error("Peer not found");

		const answer = JSON.parse(answerString);

		// apply remote answer first
		await entry.peer.setRemoteDescription(answer);

		// mark connection as established (your new logic)
		this.pendingConnections.get(id)?.resolve();
		this.pendingConnections.delete(id);
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

	private getIdByChannel(channel: RTCDataChannel): string | undefined {
		for (const [id, conn] of this.connections.entries()) {
			if (conn.channel === channel) {
				return id;
			}
		}
		return undefined;
	}

	public isConnected(id: string): boolean {
		const entry = this.connections.get(id);
		if (!entry) return false;

		console.log("MAP STATE KEYS:", Array.from(this.connections.keys()));

		const peer = entry.peer;
		const channel = entry.channel;

		console.log("CHECK CONNECTION:", id, {
			connectionState: peer.connectionState,
			iceState: peer.iceConnectionState,
			channel: channel.readyState
		});

		return channel.readyState === "open";
	}

	public isReady(id: string): boolean {
		return this.readyConnections.has(id);
	}

	public async connectToDevice(id: string): Promise<string> {
		const trusted = this.plugin.deviceManager.getTrustedDevices();
		if (!trusted.find(d => d.id === id)) {
			throw new Error("Attempting to connect to unknown device");
		}

		const existing = this.connections.get(id);

		if (existing) {
			const pc = existing.peer;
			const channel = existing.channel;

			const isAlive =
				pc.connectionState === "connected" &&
				channel.readyState === "open";

			if (isAlive) {
				console.warn("Already connected to", id);
				return "";
			}

			console.warn("Cleaning up stale connection:", id);

			try {
				pc.close();
			} catch { }

			this.connections.delete(id);
			this.readyConnections.delete(id);
		}

		const peer = new RTCPeerConnection({
			iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
		});

		const channel = peer.createDataChannel("floppy-disk");

		this.attachConnection(id, peer, channel);

		const offer = await peer.createOffer();
		await peer.setLocalDescription(offer);

		await this.waitForIceGathering(peer);

		return JSON.stringify(peer.localDescription);
	}

	async reconnect(deviceId: string) {
		console.log("Reconnecting to", deviceId);
		await new Promise(r => setTimeout(r, 1000));

		this.connectToDevice(deviceId);
	}

	private attachConnection(
		id: string,
		peer: RTCPeerConnection,
		channel: RTCDataChannel,
	) {
		console.log("ATTACH:", id, { peer, channel });

		// handles reconnects
		this.connections.set(id, { peer, channel });

		peer.onconnectionstatechange = () => {
			const state = peer.connectionState;
			console.log(`[RTC] onconnectionstatechange: ${id} | ${state}`);

			if (
				state === "failed" ||
				state === "disconnected" ||
				state === "closed"
			) {
				this.connections.delete(id);
				this.readyConnections.delete(id);
				this.reconnect(id);
			}

			this.updateUI();
		};

		channel.onopen = () => {
			console.log("[RTC] CHANNEL OPEN:", id);

			this.updateUI();

			// start identity verification
			this.startHandshake(id);
		};

		channel.onclose = () => {
			console.log("[RTC] CHANNEL CLOSED:", id);

			this.connections.delete(id);
			this.readyConnections.delete(id); // keep state consistent

			this.updateUI();
		};

		channel.onmessage = (event) => {
			const realId = this.getIdByChannel(channel);

			if (!realId) {
				console.warn("[RTC] Unknown channel for message");
				return;
			}

			this.handleMessage(realId, event.data);
		};
	}

	// messaging
	public sendMessage(id: string, msg: Message) {
		const entry = this.connections.get(id);
		if (!entry || entry.channel.readyState !== "open") return;

		entry.channel.send(JSON.stringify(msg));
	}

	private async handleMessage(id: string, data: string | ArrayBuffer) {
		if (typeof data !== "string") return;

		let msg: Message;

		try {
			msg = JSON.parse(data);
		} catch {
			return;
		}

		switch (msg.type) {
			case "REQUEST_MANIFEST":
				this.handleManifestRequest(id);
				break;

			case "MANIFEST_RESPONSE":
				console.log(`[SYNC] MANIFEST RECIEVED: ${id}`);
				this.pendingManifestResolvers.get(id)?.(msg.payload);

				this.pendingManifestResolvers.delete(id);
				break;

			case "FILE_REQUEST":
				if (typeof msg.path === "string") {
					await this.sendFileInChunks(id, msg.path);
				}
				break;
			case "FILE_CHUNK":
				await this.handleFileChunk(msg);
				break;

			case "FILE_COMPLETE":
				await this.assembleFile(msg.path);
				break;

			case "HANDSHAKE":
				console.log(`[RTC] HANDSHAKE RECEIVED ${id}`)
				await this.handleHandshake(msg);
				break;

			case "HANDSHAKE_ACK":
				console.log(`[RTC] HANDSHAKE ACK: ${id} accepted: ${msg.accepted}`);

				console.log("[DEBUG] READY SET:", {
					idFromChannel: id,
					readyConnections: Array.from(this.readyConnections),
					allConnections: Array.from(this.connections.keys())
				});

				if (msg.accepted) {
					// mark connection as ready for sync
					this.readyConnections.add(id);

					console.log(`[RTC] Connection READY: ${id}`);
					this.updateUI();
				}

				break;
		}
	}

	// handshaking
	public async startHandshake(id: string) {
		console.log(`[RTC] SENDING HANDSHAKE: ${id}`);
		const device = this.plugin.settings.thisDevice;

		const payload = new TextEncoder().encode(device.fingerprint);

		const privateKey = await FloppyDiskCrypto.importSigningPrivateKey(
			device.signingKeyPair.privateKeyJwk,
		);

		const signature = await FloppyDiskCrypto.signData(
			privateKey,
			payload.buffer,
		);

		const handshake: HandshakeMessage = {
			type: "HANDSHAKE",
			deviceId: device.id,
			deviceName: device.name,
			publicKey: device.publicKey,
			fingerprint: device.fingerprint,
			signature: Array.from(new Uint8Array(signature)),
		};

		this.sendMessage(id, handshake);
	}

	private async handleHandshake(msg: HandshakeMessage) {
		let accepted = false;

		try {
			const jwk: JsonWebKey = JSON.parse(msg.publicKey);

			const publicKey =
				await FloppyDiskCrypto.importSigningPublicKey(jwk);

			const encoder = new TextEncoder();
			const data = encoder.encode(msg.fingerprint).buffer;
			const signature = new Uint8Array(msg.signature).buffer;

			accepted = await FloppyDiskCrypto.verifySignature(
				publicKey,
				signature,
				data,
			);

			if (accepted) {
				console.log(`[RTC] HANDSHAKE VERIFIED: ${msg.deviceId}`);

				// find the connection that received this handshake
				const entry = [...this.connections.entries()]
					.find(([_, conn]) => conn.channel.readyState === "open");

				if (!entry) {
					console.warn("No active connection for handshake");
					return;
				}

				const [oldId, conn] = entry;

				// if already correct, skip
				if (oldId !== msg.deviceId) {
					console.log(`[RTC] REBIND ${oldId} → ${msg.deviceId}`);

					this.connections.delete(oldId);
					this.connections.set(msg.deviceId, conn);

					this.readyConnections.delete(oldId);
				}

				this.readyConnections.add(msg.deviceId);

				this.updateUI();
				console.log("CONNECTIONS AFTER HANDSHAKE:", Array.from(this.connections.keys()));
			}
		} catch (err) {
			console.error("Handshake error:", err);
		}

		this.sendMessage(msg.deviceId, {
			type: "HANDSHAKE_ACK",
			accepted,
		});
	}

	private async handleManifestRequest(id: string) {
		try {
			// ensure snapshot is stable BEFORE responding
			await this.plugin.snapshotManager.ensureFileIdsExist();
			await this.plugin.snapshotManager.loadSnapshot();

			const manifest = await this.plugin.webrtcManager.generateLocalManifest();

			this.sendMessage(id, {
				type: "MANIFEST_RESPONSE",
				payload: manifest,
			});

		} catch (err) {
			console.error("[MANIFEST ERROR]", err);
		}
	}

	// private async sendManifest(id: string) {

	// 	// ensure snapshot is consistent with vault
	// 	await this.plugin.snapshotManager.ensureFileIdsExist();

	// 	// reload snapshot AFTER repair
	// 	await this.plugin.snapshotManager.loadSnapshot();

	// 	const manifest = await generateManifest(
	// 		this.plugin.app,
	// 		this.plugin.app.vault.getName(),
	// 		this.plugin.settings.thisDevice.id,
	// 		this.plugin.snapshotManager
	// 	);

	// 	const msg: ManifestResponseMessage = {
	// 		type: "MANIFEST_RESPONSE",
	// 		payload: manifest,
	// 	};

	// 	this.sendMessage(id, msg);
	// }

	public async generateLocalManifest(): Promise<Manifest> {
		if (!this.plugin.snapshotManager) {
			throw new Error("WebRTCManager: snapshotManager not initialized");
		}

		await this.plugin.snapshotManager.ensureFileIdsExist();

		const id: string = this.plugin.settings.thisDevice.id;

		if (!id) {
			throw new Error("Current device ID is missing in settings");
		}

		const vaultId: string = this.plugin.app.vault.getName();

		return generateManifest(this.plugin.app, vaultId, id, this.plugin.snapshotManager);
	}

	public async requestRemoteManifest(id: string): Promise<Manifest> {
		console.log(`[SYNC] REQUESTING MANIFEST: ${id}`);
		return new Promise((resolve, reject) => {
			if (!this.connections.has(id)) {
				return reject(new Error("Device not connected"));
			}

			this.pendingManifestResolvers.set(id, resolve);

			if (!this.connections.has(id)) {
				throw new Error("Device not connected");
			}

			if (!this.readyConnections.has(id)) {
				throw new Error("Device not handshake-ready");
			}
			this.sendMessage(id, {
				type: "REQUEST_MANIFEST",
			});

			setTimeout(() => {
				if (this.pendingManifestResolvers.has(id)) {
					this.pendingManifestResolvers.delete(id);
					reject(new Error("Manifest request timeout"));
				}
			}, 10000);
		});
	}

	//  file transfer
	public async sendFileInChunks(id: string, path: string) {
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;

		const buffer = await this.plugin.app.vault.readBinary(file);

		let offset = 0;
		let index = 0;

		while (offset < buffer.byteLength) {
			const chunk = buffer.slice(offset, offset + CHUNK_SIZE);

			const chunkBase64 = btoa(
				String.fromCharCode(...new Uint8Array(chunk)),
			);

			this.sendMessage(id, {
				type: "FILE_CHUNK",
				path,
				chunkIndex: index,
				totalChunks: Math.ceil(buffer.byteLength / CHUNK_SIZE),
				data: chunkBase64,
			});

			offset += CHUNK_SIZE;
			index++;
		}

		this.sendMessage(id, {
			type: "FILE_COMPLETE",
			path,
		});
	}

	private async handleFileChunk(msg: FileChunkMessage) {
		if (!this.fileBuffers.has(msg.path)) {
			this.fileBuffers.set(msg.path, []);
			this.fileChunkTotals.set(msg.path, msg.totalChunks);
		}

		const buffers = this.fileBuffers.get(msg.path)!;

		const binaryString = atob(msg.data);
		const bytes = new Uint8Array(binaryString.length);

		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		buffers[msg.chunkIndex] = bytes;
	}

	private async assembleFile(path: string) {
		const buffers = this.fileBuffers.get(path);
		const total = this.fileChunkTotals.get(path);

		if (!buffers || total === undefined) return;

		if (buffers.filter(Boolean).length !== total) {
			console.warn("Missing chunks for", path);
			return;
		}

		const totalLength = buffers.reduce(
			(sum, chunk) => sum + chunk.length,
			0,
		);

		const fullBuffer = new Uint8Array(totalLength);

		let offset = 0;
		for (const chunk of buffers) {
			fullBuffer.set(chunk, offset);
			offset += chunk.length;
		}

		if (isTextFile(path)) {
			const content = new TextDecoder().decode(fullBuffer);

			const file = this.plugin.app.vault.getAbstractFileByPath(path);

			if (file instanceof TFile) {
				await this.plugin.app.vault.modify(file, content);
			} else {
				await this.plugin.app.vault.create(path, content);
			}
		} else {
			await this.plugin.app.vault.adapter.writeBinary(path, fullBuffer);
		}

		const hash = await FloppyDiskCrypto.computeHash(fullBuffer.buffer);

		await this.plugin.snapshotManager.updateFileSync(path, hash);

		this.fileBuffers.delete(path);
		this.fileChunkTotals.delete(path);
	}

	public async reconnectAllDevices(): Promise<void> {
		const devices = this.plugin.deviceManager.getTrustedDevices();

		for (const device of devices) {
			if (this.isConnected(device.id)) continue;

			console.warn("Attempting connection to", device.id);

			try {
				await this.connectToDevice(device.id);
			} catch (e) {
				console.warn("Failed to connect:", device.id, e);
			}
		}
	}

	public getConnections(): string[] {
		return Array.from(this.connections.keys());
	}

	// request a file from a remote device and assemble chunks
	public async requestFile(id: string, path: string): Promise<Uint8Array> {
		const channel = this.connections.get(id)?.channel;

		if (!channel || channel.readyState !== "open") {
			throw new Error(`No open channel to device ${id}`);
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

						buffers[parsed.chunkIndex] = new Uint8Array(
							parsed.data,
						);
					} else if (
						isFileCompleteMessage(parsed) &&
						parsed.path === path
					) {
						const buffers = this.fileBuffers.get(path);

						if (!buffers) return;

						const totalLength = buffers.reduce(
							(sum, chunk) => sum + chunk.length,
							0,
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
			channel.send(
				JSON.stringify({
					type: "FILE_REQUEST",
					path,
				}),
			);
		});
	}
}
