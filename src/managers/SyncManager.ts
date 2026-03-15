import { App } from "obsidian";

import { Manifest } from "types/manifest";
import { SyncPlan } from "types/sync";

import FloppyDiskPlugin from "main";

import { createSyncPlan, executeSync } from "utils/sync";

export class SyncManager {

  private app: App
  private plugin: FloppyDiskPlugin

  constructor(app: App, plugin: FloppyDiskPlugin) {
    this.app = app
    this.plugin = plugin
  }

  async syncDevice(remoteDeviceId: string): Promise<void> {
    // load snapshot (base state)
    const snapshot = await this.plugin.snapshotManager.loadSnapshot()

    // handshake
    await this.plugin.webrtcManager.performHandshake(remoteDeviceId)

    // exchange manifests
    const remoteManifest: Manifest = await this.plugin.webrtcManager.requestRemoteManifest(remoteDeviceId)

    const localManifest: Manifest = await this.plugin.webrtcManager.generateLocalManifest()

    // create sync plan (three-way merge)
    const plan: SyncPlan = createSyncPlan(
      localManifest,
      remoteManifest,
      snapshot
    )

    // execute sync actions
    await executeSync(
      this.app,
      this.plugin.webrtcManager,
      this.plugin.snapshotManager,
      plan,
      remoteDeviceId
    )

    // update snapshot after successful sync
    await this.plugin.snapshotManager.updateSnapshotAfterSync(
      remoteDeviceId,
      localManifest
    )
  }

   // TODO: per-device pause hook
  pauseDeviceSync(_remoteDeviceId: string) {
  }
}