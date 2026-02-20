import { App, Notice, TFile } from "obsidian"
import { WebRTCManager } from "./webrtc"
import { SnapshotManager } from "./snapshot"
import { FloppyDiskCrypto } from "utils/cryptoHelper"
import { SyncAction, SyncPlan } from "types/sync"
import { Snapshot } from "types/snapshot"
import { Manifest } from "types/manifest"


export function createSyncPlan(
    localManifest: Manifest,
    remoteManifest: Manifest,
    snapshot: Snapshot,
): SyncPlan {
    const uploads: SyncAction[] = []
    const downloads: SyncAction[] = []
    const deletes: SyncAction[] = []
    const conflicts: SyncAction[] = []

    const remoteFiles = remoteManifest.files
    const localFiles = localManifest.files

    // get snapshot of the remote device (if exists)
    const remoteSnapshot = snapshot.devices[remoteManifest.deviceId]?.files || {}

    // combine all unique file paths
    const allPaths = new Set<string>([
        ...Object.keys(localFiles),
        ...Object.keys(remoteFiles)
    ])

    for (const path of allPaths) {
        const localHash = localFiles[path]
        const remoteHash = remoteFiles[path]
        const baseHash = remoteSnapshot[path]?.lastSyncedHash

        if (localHash === remoteHash) {
            // same on both sides THEN SKIP
            continue
        } else if (baseHash === undefined) {
            // new file on device/s THEN UPLOAD/DOWNLOAD
            if (localHash && !remoteHash) {
                uploads.push({ path, action: "upload", localHash, baseHash })
            } else if (!localHash && remoteHash) {
                downloads.push({ path, action: "download", remoteHash, baseHash })
            } else {
                // both exist but no base THEN CONFLICT
                conflicts.push({ path, action: "conflict", localHash, remoteHash })
            }
        } else if (localHash === baseHash && remoteHash !== baseHash) {
            // local unchanged, remote changed THEN DOWNLOAD
            downloads.push({ path, action: "download", localHash, remoteHash, baseHash })
        } else if (remoteHash === baseHash && localHash !== baseHash) {
            // remote unchanged, local changed THEN UPLOAD
            uploads.push({ path, action: "upload", localHash, remoteHash, baseHash })
        } else {
            // both changed since last sync THEN CONFLICT
            conflicts.push({ path, action: "conflict", localHash, remoteHash, baseHash })
        }
    }

    return { uploads, downloads, deletes, conflicts }
}

export async function executeSync(
    app: App,
    webrtcManager: WebRTCManager,
    snapshotManager: SnapshotManager,
    plan: SyncPlan,
    remoteDeviceId: string
): Promise<void> {
    // helper to backup a file
    async function backupFile(path: string): Promise<void> {
        const file = app.vault.getAbstractFileByPath(path)
        if (file instanceof TFile) {
            const backupPath = `${path}.bak`
            // ONLY create backup if it doesn't exist
            try {
                await app.vault.adapter.copy(file.path, backupPath)
            } catch { /* empty */ }
        }
    }

    // handle uploads
    for (const action of plan.uploads) {
        const file = app.vault.getAbstractFileByPath(action.path);
        if (!(file instanceof TFile)) continue;

        await backupFile(action.path);
        // send file to remote via WebRTCManager
        await webrtcManager.sendFileInChunks(remoteDeviceId, action.path);
        console.warn(`Uploaded: ${action.path}`);
    }

    // handle downloads
    for (const action of plan.downloads) {
        // request remote file from device
        const buffer: Uint8Array = await webrtcManager.requestFile(remoteDeviceId, action.path);

        const arrayBuffer: ArrayBuffer = toArrayBuffer(buffer);
        const file = app.vault.getAbstractFileByPath(action.path);

        if (file instanceof TFile) {
            await backupFile(action.path);

            if (action.path.match(/\.(txt|md|csv|json|js|ts)$/i)) {
                const content = new TextDecoder().decode(arrayBuffer);
                await app.vault.modify(file, content);
            } else {
                await app.vault.adapter.writeBinary(action.path, arrayBuffer);
            }
        } else {
            if (action.path.match(/\.(txt|md|csv|json|js|ts)$/i)) {
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

    new Notice("Sync execution completed")
}

function toArrayBuffer(buf: Uint8Array): ArrayBuffer {
    const arrayBuffer = new ArrayBuffer(buf.byteLength);
    const view = new Uint8Array(arrayBuffer);
    view.set(buf);
    return arrayBuffer;
}