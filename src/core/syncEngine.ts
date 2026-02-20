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

