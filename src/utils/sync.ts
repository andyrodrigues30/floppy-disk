import { App, Notice, TFile } from "obsidian";

import { Manifest } from "../types/manifest";
import { Snapshot } from "../types/snapshot";
import {
	FileConflict,
	RenameAction,
	SyncAction,
	SyncPlan,
	SyncProgress,
} from "../types/sync";
import { WebRTCManager } from "../managers/WebRTCManager";
import { SnapshotManager } from "../managers/SnapshotManager";
import { FloppyDiskCrypto } from "./cryptoHelper";
import { isTextFile } from "./isTextFile";

type ManifestEntry = {
	fileId: string;
	path: string;
	hash: string;
};

export function createSyncPlan(
	localManifest: Manifest,
	remoteManifest: Manifest,
	snapshot: Snapshot,
): SyncPlan {
	const uploads: SyncAction[] = [];
	const downloads: SyncAction[] = [];
	const deletes: SyncAction[] = [];
	const conflicts: FileConflict[] = [];
	const renames: RenameAction[] = [];

	const localFiles = localManifest.files;
	const remoteFiles = remoteManifest.files;
	const baseFiles = snapshot.files || {};

	// build fileId maps
	const localById = new Map<string, ManifestEntry>();
	const remoteById = new Map<string, ManifestEntry>();
	const baseById = new Map<string, any>();

	for (const entry of Object.values(localFiles)) {
		localById.set(entry.fileId, entry);
	}

	for (const entry of Object.values(remoteFiles)) {
		remoteById.set(entry.fileId, entry);
	}

	for (const entry of Object.values(baseFiles)) {
		if (entry.fileId) {
			baseById.set(entry.fileId, entry);
		}
	}

	const allFileIds = new Set<string>([
		...localById.keys(),
		...remoteById.keys(),
	]);

	for (const fileId of allFileIds) {
		const local = localById.get(fileId);
		const remote = remoteById.get(fileId);
		const base = baseById.get(fileId);

		// renames - run first
		if (local && remote && local.path !== remote.path) {
			renames.push({
				fileId,
				oldPath: remote.path,
				newPath: local.path,
			});

			continue;
		}

		// both sides exist
		if (local && remote) {
			// identical content - skip
			if (local.hash === remote.hash) continue;

			const baseHash = base?.lastSyncedHash;
			const baseDevice = base?.lastSyncedBy;
			const currentDevice = snapshot.currentDeviceId;

			const cameFromRemoteDevice =
				baseDevice && baseDevice !== currentDevice;

			// new file or unknown state
			if (!baseHash) {
				// prevent swap/ping-pong when remote-originated
				if (cameFromRemoteDevice) {
					downloads.push({
						path: remote.path,
						action: "download",
						remoteHash: remote.hash,
						fileId,
					});
					continue;
				}

				const localWins = local.fileId > remote.fileId;

				if (localWins) {
					uploads.push({
						path: local.path,
						action: "upload",
						localHash: local.hash,
						fileId,
					});
				} else {
					downloads.push({
						path: remote.path,
						action: "download",
						remoteHash: remote.hash,
						fileId,
					});
				}

				continue;
			}

			// directional-aware change detection
			const localChanged = local.hash !== baseHash;

			const remoteChanged =
				remote.hash !== baseHash &&
				baseDevice !== currentDevice;

			if (localChanged && remoteChanged) {
				conflicts.push({
					path: local.path,
					localHash: local.hash,
					remoteHash: remote.hash,
					baseHash,
				});
			} else if (localChanged) {
				uploads.push({
					path: local.path,
					action: "upload",
					localHash: local.hash,
					fileId,
				});
			} else if (remoteChanged) {
				downloads.push({
					path: remote.path,
					action: "download",
					remoteHash: remote.hash,
					fileId,
				});
			}

			continue;
		}

		// only local exists
		if (local && !remote) {
			uploads.push({
				path: local.path,
				action: "upload",
				localHash: local.hash,
				fileId,
			});
			continue;
		}

		// only remote exists
		if (remote && !local) {
			downloads.push({
				path: remote.path,
				action: "download",
				remoteHash: remote.hash,
				fileId,
			});
			continue;
		}
	}

	return { uploads, downloads, deletes, conflicts, renames };
}

export async function executeSync(
	app: App,
	webrtcManager: WebRTCManager,
	snapshotManager: SnapshotManager,
	plan: SyncPlan,
	remoteDeviceId: string,
	progressCb?: (update: Partial<SyncProgress>) => void,
): Promise<void> {
	// helper to backup a file
	async function backupFile(path: string): Promise<void> {
		const file = app.vault.getAbstractFileByPath(path);

		if (file instanceof TFile) {
			const backupPath = `${path}.bak`;
			// ONLY create backup if it doesn't exist
			try {
				await app.vault.adapter.copy(file.path, backupPath);
			} catch {
				/* empty */
			}
		}
	}

	// handle uploads
	for (const action of plan.uploads) {
		const file = app.vault.getAbstractFileByPath(action.path);
		if (!(file instanceof TFile)) continue;

		await backupFile(action.path);

		// send file to remote via WebRTCManager
		progressCb?.({
			phase: "uploading",
			currentFile: action.path,
			uploads: [action.path],
		});

		await webrtcManager.sendFileInChunks(remoteDeviceId, action.path);
		console.warn(`Uploaded: ${action.path}`);
	}

	// handle downloads
	for (const action of plan.downloads) {
		// request remote file from device
		const buffer: Uint8Array = await webrtcManager.requestFile(
			remoteDeviceId,
			action.path,
		);

		const arrayBuffer: ArrayBuffer = toArrayBuffer(buffer);
		const file = app.vault.getAbstractFileByPath(action.path);

		if (file instanceof TFile) {
			await backupFile(action.path);

			progressCb?.({
				phase: "downloading",
				currentFile: action.path,
				downloads: [action.path],
			});

			if (isTextFile(action.path)) {
				const content = new TextDecoder().decode(arrayBuffer);
				await app.vault.modify(file, content);
			} else {
				await app.vault.adapter.writeBinary(action.path, arrayBuffer);
			}
		} else {
			if (isTextFile(action.path)) {
				const content = new TextDecoder().decode(arrayBuffer);
				await app.vault.create(action.path, content);
			} else {
				await app.vault.adapter.writeBinary(action.path, arrayBuffer);
			}
		}

		// update snapshot hash
		const hash = await FloppyDiskCrypto.computeHash(arrayBuffer);
		await snapshotManager.updateFileSync(action.path, hash);

		console.warn(`Downloaded: ${action.path}`);
	}

	// handle conflicts
	for (const action of plan.conflicts) {
		console.warn(`Conflict detected for file: ${action.path}`);

		const file = app.vault.getAbstractFileByPath(action.path);

		if (file instanceof TFile) {
			// create .conflict copy as a temporary resolution
			const conflictPath = `${action.path}.conflict`;
			const buffer = await app.vault.readBinary(file);
			await app.vault.createBinary(conflictPath, buffer);
		}
	}

	// handle deletes
	for (const action of plan.deletes) {
		const file = app.vault.getAbstractFileByPath(action.path);
		if (file instanceof TFile) {
			await backupFile(action.path);
			await app.fileManager.trashFile(file);
			console.warn(`Deleted: ${action.path}`);
		}
	}

	new Notice("Sync completed.");
}

function toArrayBuffer(buf: Uint8Array): ArrayBuffer {
	const arrayBuffer = new ArrayBuffer(buf.byteLength);
	const view = new Uint8Array(arrayBuffer);
	view.set(buf);
	return arrayBuffer;
}
