import { App, TFile } from "obsidian";

import { FloppyDiskSettings } from "../types/settings";
import { FileSnapshot, Snapshot } from "../types/snapshot";
import { Manifest } from "../types/manifest";
import { SyncProgress } from "../types/sync";
import { FloppyDiskCrypto } from "../utils/cryptoHelper";

export class SnapshotManager {
	private app: App;
	private snapshot: Snapshot | null = null;
	private SNAPSHOT_PATH: string;

	private activeSyncs: Set<string> = new Set();
	private deviceProgress: Map<string, SyncProgress> = new Map();
	private lastSynced: Map<string, number> = new Map();

	constructor(app: App, settings: FloppyDiskSettings) {
		this.app = app;
		this.SNAPSHOT_PATH = `${this.app.vault.configDir}/snapshot.json`;
	}

	private createEmptySnapshot(): Snapshot {
		return {
			version: 1,
			currentDeviceId: undefined,
			files: {},
			pathIndex: {},
		};
	}

	public async ensureFileIdsExist(): Promise<void> {
		const snapshot = await this.loadSnapshot();
		const files = this.app.vault.getFiles();

		let changed = false;

		if (!snapshot.pathIndex) snapshot.pathIndex = {};

		for (const file of files) {
			let fileId = snapshot.pathIndex[file.path];

			if (!fileId) {
				fileId = crypto.randomUUID();
				snapshot.pathIndex[file.path] = fileId;

				snapshot.files[fileId] = {
					fileId,

					currentHash: "",
					modifiedTime: 0,

					lastSyncedHash: "",
					lastSyncedTimestamp: 0,

					lastSyncedBy: "",
				};

				changed = true;
			}

			// ensure reverse consistency
			if (!snapshot.files[fileId]) {
				snapshot.files[fileId] = {
					fileId,

					currentHash: "",
					modifiedTime: 0,

					lastSyncedHash: "",
					lastSyncedTimestamp: 0,

					lastSyncedBy: "",
				};

				changed = true;
			}
		}

		if (changed) {
			await this.saveSnapshot();
		}
	}

	public async ensureSnapshotExists(): Promise<Snapshot> {
		await this.loadSnapshot();
		await this.saveSnapshot();
		return this.snapshot as Snapshot;
	}

	private isValidSnapshot(obj: unknown): obj is Snapshot {
		if (typeof obj !== "object" || obj === null) return false;
		const maybe = obj as Record<string, unknown>;
		return maybe.version === 1 && typeof maybe.files === "object";
	}

	public getSnapshot(): Snapshot | null {
		return this.snapshot;
	}

	public async loadSnapshot(): Promise<Snapshot> {
		if (this.snapshot) return this.snapshot;

		const file = this.app.vault.getAbstractFileByPath(this.SNAPSHOT_PATH);

		if (!(file instanceof TFile)) {
			this.snapshot = this.createEmptySnapshot();
			await this.saveSnapshot();
			return this.snapshot;
		}

		try {
			const raw = await this.app.vault.read(file);

			if (!raw.trim()) {
				this.snapshot = this.createEmptySnapshot();
			} else {
				const parsed: unknown = JSON.parse(raw);
				this.snapshot = this.isValidSnapshot(parsed)
					? parsed
					: this.createEmptySnapshot();
			}
		} catch {
			this.snapshot = this.createEmptySnapshot();
		}

		return this.snapshot;
	}

	public async saveSnapshot(): Promise<void> {
		if (!this.snapshot) {
			this.snapshot = this.createEmptySnapshot();
		}

		const content = JSON.stringify(this.snapshot, null, 2);
		const file = this.app.vault.getAbstractFileByPath(this.SNAPSHOT_PATH);

		if (file instanceof TFile) {
			await this.app.vault.modify(file, content);
		} else {
			await this.app.vault.adapter.write(this.SNAPSHOT_PATH, content);
		}
	}

	public async setCurrentDevice(id: string) {
		if (!this.snapshot) {
			this.snapshot = this.createEmptySnapshot();
		}

		this.snapshot.currentDeviceId = id;
		await this.saveSnapshot();
	}

	// sync state
	public isDeviceSyncing(id: string): boolean {
		return this.activeSyncs.has(id);
	}

	public startDeviceSync(id: string) {
		this.activeSyncs.add(id);
	}

	public pauseDeviceSync(id: string) {
		this.activeSyncs.delete(id);
	}

	public finishDeviceSync(id: string) {
		this.activeSyncs.delete(id);
	}

	// progress tracking
	public setDeviceProgress(id: string, progress: SyncProgress) {
		this.deviceProgress.set(id, progress);
	}

	public getDeviceProgress(id: string): SyncProgress | undefined {
		return this.deviceProgress.get(id);
	}

	// last synced
	public getLastSynced(id: string): number | undefined {
		return this.lastSynced.get(id);
	}

	private updateLastSynced(id: string) {
		this.lastSynced.set(id, Date.now());
	}

	// sync updates
	public async updateSnapshotAfterSync(
		remoteDeviceId: string,
		finalManifest: Manifest,
	): Promise<Snapshot> {
		const snapshot = await this.loadSnapshot();

		if (!snapshot.currentDeviceId) {
			throw new Error("FloppyDisk: currentDeviceId missing");
		}

		const currentDeviceId = snapshot.currentDeviceId;
		const now = Date.now();

		for (const entry of Object.values(finalManifest.files)) {
			snapshot.pathIndex ??= {};
			snapshot.pathIndex[entry.path] = entry.fileId;

			snapshot.files[entry.fileId] = {
				fileId: entry.fileId,

				currentHash: entry.hash,
				modifiedTime: now,

				lastSyncedHash: entry.hash,
				lastSyncedTimestamp: now,

				lastSyncedBy: currentDeviceId,
			};
		}

		await this.saveSnapshot();
		return snapshot;
	}

	public async updateFileSync(
		filePath: string,
		fileHash: string,
	): Promise<void> {
		const snapshot = await this.loadSnapshot();

		if (!snapshot.currentDeviceId) {
			throw new Error("FloppyDisk: currentDeviceId missing");
		}

		const deviceId = snapshot.currentDeviceId;
		const now = Date.now();

		// get file id
		const fileId = await this.getOrCreateFileId(filePath);

		// ensure pathIndex exists
		if (!snapshot.pathIndex) snapshot.pathIndex = {};
		snapshot.pathIndex[filePath] = fileId;

		snapshot.files[fileId] = {
			fileId,

			currentHash: fileHash,
			modifiedTime: now,

			lastSyncedHash: fileHash,
			lastSyncedTimestamp: now,

			lastSyncedBy: deviceId,
		};

		await this.saveSnapshot();
	}

	public recordLastSynced(id: string) {
		this.lastSynced.set(id, Date.now());
	}

	public async updateLocalFileState(file: TFile): Promise<void> {
		const snapshot = await this.loadSnapshot();

		if (!snapshot.pathIndex) {
			snapshot.pathIndex = {};
		}

		let fileId = snapshot.pathIndex[file.path];

		// new file
		if (!fileId) {
			fileId = crypto.randomUUID();

			snapshot.pathIndex[file.path] = fileId;
		}

		const buffer = await this.app.vault.readBinary(file);

		const hash = await FloppyDiskCrypto.computeHash(buffer);

		const stat = await this.app.vault.adapter.stat(file.path);

		snapshot.files[fileId] = {
			fileId,

			currentHash: hash,

			modifiedTime: stat?.mtime ?? Date.now(),

			lastSyncedHash: snapshot.files[fileId]?.lastSyncedHash ?? "",

			lastSyncedTimestamp:
				snapshot.files[fileId]?.lastSyncedTimestamp ?? 0,

			lastSyncedBy: snapshot.files[fileId]?.lastSyncedBy ?? "",
		};

		await this.saveSnapshot();
	}

	public async getOrCreateFileId(path: string): Promise<string> {
		const snapshot = await this.loadSnapshot();

		if (!snapshot.pathIndex) snapshot.pathIndex = {};

		let fileId = snapshot.pathIndex[path];

		if (!fileId) {
			fileId = crypto.randomUUID();

			snapshot.pathIndex[path] = fileId;

			snapshot.files[fileId] = {
				fileId,
				currentHash: "",
				modifiedTime: 0,
				lastSyncedHash: "",
				lastSyncedTimestamp: 0,
				lastSyncedBy: "",
			};

			await this.saveSnapshot();
		}

		return fileId;
	}
}
