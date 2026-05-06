import { App, Notice, TFile } from "obsidian";

import { Manifest, ManifestFileEntry } from "../types/manifest";
import { FileSnapshot, Snapshot } from "../types/snapshot";
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

	// Build maps by fileId
	const localById = new Map<string, ManifestFileEntry>();
	const remoteById = new Map<string, ManifestFileEntry>();
	const baseById = new Map<string, FileSnapshot>();

	for (const entry of Object.values(localFiles)) {
		localById.set(entry.fileId, entry);
	}

	for (const entry of Object.values(remoteFiles)) {
		remoteById.set(entry.fileId, entry);
	}

	for (const entry of Object.values(baseFiles)) {
		baseById.set(entry.fileId, entry);
	}

	const allFileIds = new Set<string>([
		...localById.keys(),
		...remoteById.keys(),
	]);

	for (const fileId of allFileIds) {
		const local = localById.get(fileId);
		const remote = remoteById.get(fileId);
		const base = baseById.get(fileId);

		// renames
		if (local && remote && local.path !== remote.path) {
			renames.push({
				fileId,
				oldPath: remote.path,
				newPath: local.path,
			});
			continue;
		}

		// both exist
		if (local && remote) {
			// already identical
			if (local.hash === remote.hash) continue;

			const baseHash = base?.lastSyncedHash;

			// first encounter between devices
			if (!baseHash) {
				// IMPORTANT FIX:
				// DO NOT guess ownership by fileId comparison anymore
				// Instead: prefer "last modified wins" OR safe conflict

				// If timestamps exist in manifests in future, use them.
				// For now: safest behavior is conflict instead of overwrite
				conflicts.push({
					path: local.path,
					localHash: local.hash,
					remoteHash: remote.hash,
				});
				continue;
			}

			const localChanged = local.hash !== baseHash;
			const remoteChanged = remote.hash !== baseHash;

			// true conflict - both changed
			if (localChanged && remoteChanged) {
				conflicts.push({
					path: local.path,
					localHash: local.hash,
					remoteHash: remote.hash,
					baseHash,
				});
				continue;
			}

			// only locals changed
			if (localChanged && !remoteChanged) {
				uploads.push({
					path: local.path,
					action: "upload",
					localHash: local.hash,
					fileId,
				});
				continue;
			}

			// only remotes changed
			if (remoteChanged && !localChanged) {
				downloads.push({
					path: remote.path,
					action: "download",
					remoteHash: remote.hash,
					fileId,
				});
				continue;
			}

			continue;
		}

		// only locals exist
		if (local && !remote) {
			uploads.push({
				path: local.path,
				action: "upload",
				localHash: local.hash,
				fileId,
			});
			continue;
		}

		// only remotes exist
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
