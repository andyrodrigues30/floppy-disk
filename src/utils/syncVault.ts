import { App, Notice } from "obsidian";
import { SnapshotManager } from "core/SnapshotManager";
import { createSyncPlan, executeSync } from "core/syncEngine";
import { WebRTCManager } from "core/WebRTCManager";
import { Manifest } from "types/manifest";
import { SYNC_VIEW_TYPE } from "ui/SyncView";

export async function syncVault(
    app: App,
    snapshotManager: SnapshotManager,
    webrtcManager: WebRTCManager,
    remoteDeviceId?: string
) {
    if (!remoteDeviceId) return;

    const snapshot = await snapshotManager.loadSnapshot();

    try {
        await webrtcManager.performHandshake(remoteDeviceId);
    } catch (err) {
        console.error("Handshake failed:", err);
        new Notice(`Handshake with ${remoteDeviceId} failed.`);
        return;
    }

    const remoteManifest: Manifest = await webrtcManager.requestRemoteManifest(remoteDeviceId);
    const localManifest: Manifest = await webrtcManager.generateLocalManifest();

    const plan = createSyncPlan(localManifest, remoteManifest, snapshot);
    await executeSync(app, webrtcManager, snapshotManager, plan, remoteDeviceId);

    await snapshotManager.updateSnapshotAfterSync(remoteDeviceId, localManifest);
}

export async function toggleSyncPanel(app: App) {
    const leaves = app.workspace.getLeavesOfType(SYNC_VIEW_TYPE);

    if (leaves.length > 0) {
        leaves.forEach(leaf => leaf.detach());
    } else {
        const leaf = app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: SYNC_VIEW_TYPE,
                active: true,
            });
            await app.workspace.revealLeaf(leaf);
        } else {
            new Notice("Cannot open sync panel.")
        }
    }
}
