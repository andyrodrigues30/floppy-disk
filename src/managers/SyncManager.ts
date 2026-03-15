import { App, Notice } from "obsidian";

import { Manifest } from "types/manifest";
import { SyncPlan } from "types/sync";

import FloppyDiskPlugin from "main";

import { createSyncPlan, executeSync } from "utils/sync";

export class SyncManager {
  private app: App;
  private plugin: FloppyDiskPlugin;
  private pausedDevices = new Set<string>();

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

        new Notice(`Sync paused: ${conflicts.length} conflict(s) detected.`);

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

  public pauseDeviceSync(deviceId: string): void {

    this.pausedDevices.add(deviceId);

    // stop sync phase
    const progress = this.plugin.syncProgress;
    progress.phase = "idle";
    progress.currentFile = undefined;

    // update SnapshotManager UI state
    this.plugin.snapshotManager.pauseDeviceSync(deviceId);

    console.log(`Sync paused for ${deviceId}`);
  }

  public async resumeDeviceSync(deviceId: string): Promise<void> {
    if (!this.pausedDevices.has(deviceId)) {
      return;
    }

    this.pausedDevices.delete(deviceId);

    const progress = this.plugin.syncProgress;

    // if conflicts still exist - stay in conflict mode
    if (progress.conflicts.length > 0) {
      progress.phase = "conflict";
      return;
    }

    progress.phase = "comparing";

    // update UI state
    this.plugin.snapshotManager.startDeviceSync(deviceId);

    await this.syncDevice(deviceId);
  }

  public async resolveConflict(
    remoteDeviceId: string,
    path: string,
    choice: "local" | "remote"
  ): Promise<void> {

    const progress = this.plugin.syncProgress;

    const conflict = progress.conflicts.find(c => c.path === path);
    if (!conflict) return;

    progress.phase = "conflict";
    progress.currentFile = path;

    if (choice === "local") {
      await this.plugin.webrtcManager.sendFileInChunks(
        remoteDeviceId,
        path
      );
    } else {
      await this.plugin.webrtcManager.requestFile(
        remoteDeviceId,
        path
      );
    }

    // remove conflict
    progress.conflicts = progress.conflicts.filter(
      c => c.path !== path
    );

    // if no conflicts remain AND device is not paused - resume
    if (
      progress.conflicts.length === 0 &&
      !this.pausedDevices.has(remoteDeviceId)
    ) {
      progress.phase = "comparing";
      await this.syncDevice(remoteDeviceId);
    }
  }
}