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
): SyncPlan {

	const uploads: SyncAction[] = [];
	const downloads: SyncAction[] = [];
	const deletes: SyncAction[] = [];
	const conflicts: FileConflict[] = [];
	const renames: RenameAction[] = [];

	const localById = new Map<string, ManifestFileEntry>();
	const remoteById = new Map<string, ManifestFileEntry>();

	for (const entry of Object.values(localManifest.files)) {
		localById.set(entry.fileId, entry);
	}

	for (const entry of Object.values(remoteManifest.files)) {
		remoteById.set(entry.fileId, entry);
	}

	const allIds = new Set([
		...localById.keys(),
		...remoteById.keys(),
	]);

	for (const fileId of allIds) {

		const local = localById.get(fileId);
		const remote = remoteById.get(fileId);

		// local only
		if (local && !remote) {
			uploads.push({
				action: "upload",
				path: local.path,
				localHash: local.hash,
				fileId,
			});

			continue;
		}

		// remote only
		if (!local && remote) {
			downloads.push({
				action: "download",
				path: remote.path,
				remoteHash: remote.hash,
				fileId,
			});

			continue;
		}

		if (!local || !remote) continue;

		// rename detection
		if (local.path !== remote.path) {

			const newest =
				local.modified >= remote.modified
					? local
					: remote;

			renames.push({
				fileId,
				oldPath:
					newest === local
						? remote.path
						: local.path,

				newPath: newest.path,
			});

			continue;
		}

		// identical
		if (local.hash === remote.hash) {
			continue;
		}

		// newest wins
		if (local.modified > remote.modified) {

			uploads.push({
				action: "upload",
				path: local.path,
				localHash: local.hash,
				fileId,
			});

			continue;
		}

		if (remote.modified > local.modified) {

			downloads.push({
				action: "download",
				path: remote.path,
				remoteHash: remote.hash,
				fileId,
			});

			continue;
		}

		// exact same timestamp but different hash
		// true conflict
		conflicts.push({
			path: local.path,
			localHash: local.hash,
			remoteHash: remote.hash,
		});
	}

	return {
		uploads,
		downloads,
		deletes,
		conflicts,
		renames,
	};
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
