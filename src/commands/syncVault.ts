import { App, Notice } from "obsidian";
import { SnapshotManager } from "core/snapshot";
import { createSyncPlan, executeSync } from "core/syncEngine";
import { WebRTCManager } from "core/webrtc";
import { Manifest } from "types/manifest";

export async function syncVault(
    app: App,
    snapshotManager: SnapshotManager,
    webrtcManager: WebRTCManager,
    remoteDeviceId?: string
) {
    if (!remoteDeviceId) return;

    const snapshot = await snapshotManager.loadSnapshot();

    try {
        const trusted = await webrtcManager.performHandshake(remoteDeviceId);
        if (!trusted) {
            new Notice(`Device ${remoteDeviceId} not trusted. Aborting sync.`);
            return;
        }
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