import { App, Notice } from "obsidian";

import { Manifest } from "types/manifest";
import { SyncPlan } from "types/sync";

import FloppyDiskPlugin from "main";

import { createSyncPlan, executeSync } from "utils/sync";

export class SyncManager {
  private app: App;
  private plugin: FloppyDiskPlugin;

  constructor(app: App, plugin: FloppyDiskPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  async syncDevice(remoteDeviceId: string): Promise<void> {
    try {
      // load snapshot (base state)
      const snapshot = await this.plugin.snapshotManager.loadSnapshot();

      // handshake
      await this.plugin.webrtcManager.performHandshake(remoteDeviceId);

      // exchange manifests
      const remoteManifest: Manifest =
        await this.plugin.webrtcManager.requestRemoteManifest(remoteDeviceId);

      const localManifest: Manifest =
        await this.plugin.webrtcManager.generateLocalManifest();

      // create sync plan (three-way merge)
      const plan: SyncPlan = createSyncPlan(
        localManifest,
        remoteManifest,
        snapshot
      );

      // detect conflicts from plan
      const conflicts = plan.conflicts;

      if (conflicts.length > 0) {
        this.plugin.syncProgress.conflicts = conflicts;

        this.plugin.syncProgress.phase = "conflict";

        new Notice(
          `Sync paused: ${conflicts.length} conflict(s) detected.`
        );

        return; // STOP sync until user resolves
      }

      // execute sync actions
      await executeSync(
        this.app,
        this.plugin.webrtcManager,
        this.plugin.snapshotManager,
        plan,
        remoteDeviceId
      );

      // update snapshot after successful sync
      await this.plugin.snapshotManager.updateSnapshotAfterSync(
        remoteDeviceId,
        localManifest
      );

      new Notice("Sync completed successfully.");
    } catch (err) {
      console.error(err);
      new Notice("Sync failed.");
    }
  }

  // TODO: per-device pause hook
  pauseDeviceSync(_remoteDeviceId: string) { }
}