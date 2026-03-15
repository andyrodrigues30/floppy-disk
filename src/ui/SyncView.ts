import {
  App,
  ItemView,
  WorkspaceLeaf,
  Setting,
  Notice
} from "obsidian"

import FloppyDiskPlugin from "main"
import { SyncProgress } from "types/sync"
import { Device } from "types/device"

export const SYNC_VIEW_TYPE = "floppy-disk-sync-view"

export class SyncView extends ItemView {
  plugin: FloppyDiskPlugin
  selectedDeviceId: string | null = null

  constructor(leaf: WorkspaceLeaf, plugin: FloppyDiskPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string { return SYNC_VIEW_TYPE }

  getDisplayText(): string { return "Floppy disk sync" }

  getIcon(): string { return "refresh-cw" }

  async onOpen(): Promise<void> {
    this.render()
  }

  render(): void {
    const { contentEl } = this
    contentEl.empty()

    this.renderDevicesSection(contentEl)
    this.renderActivitySection(contentEl, this.selectedDeviceId)
  }

  private renderDevicesSection(contentEl: HTMLElement): void {

    new Setting(contentEl).setName("Devices").setHeading()

    const devicesContainer = contentEl.createDiv()
    const remoteDevices = this.plugin.remoteDevices

    const devices: Device[] = this.plugin.deviceManager.getTrustedDevices()

    if (!devices) {
      new Setting(contentEl).setDesc("No devices.")
      return
    }

    devices.forEach((device: Device) => {

      const remote = remoteDevices.get(device.id)

      const connectionStatus =
        remote?.connection?.connectionState === "connected"
          ? "Online"
          : "Offline"

      if (!this.selectedDeviceId) {
        this.selectedDeviceId = device.id
      }

      const lastSynced = this.plugin.snapshotManager.getLastSynced(device.id)

      const isSyncing =
        this.plugin.snapshotManager.isDeviceSyncing(device.id)

      const setting = new Setting(devicesContainer)
        .setName(device.name ?? device.id)
        .setDesc(
          `Connection: ${connectionStatus} | Last Seen: ${
            device.lastSeen
              ? new Date(device.lastSeen).toLocaleString()
              : "Never"
          } | Last Synced: ${
            lastSynced
              ? new Date(lastSynced).toLocaleString()
              : "Never"
          }`
        )

      if (device.id === this.selectedDeviceId) {
        setting.settingEl.addClass("device-selected")
      }

      setting.addButton(button => {
        button
          .setButtonText(isSyncing ? "Pause" : "Sync")
          .onClick(() => {

            if (isSyncing) {
              this.plugin.snapshotManager.pauseDeviceSync(device.id)
            } else {
              this.plugin.snapshotManager.startDeviceSync(device.id)
            }

            this.render()
          })
      })

      setting.settingEl.onclick = () => {
        this.selectedDeviceId = device.id
        this.render()
      }

    })
  }

  private renderActivitySection(
    contentEl: HTMLElement,
    selectedDeviceId: string | null
  ): void {

    if (!selectedDeviceId) return
    
    new Setting(contentEl).setName("Activity").setHeading()
    
    const progress: SyncProgress | undefined = this.plugin.snapshotManager.getDeviceProgress(selectedDeviceId)
    if (!progress) {
      new Setting(contentEl).setDesc("No activity.")
      return
    }

    this.renderFileList(contentEl, "Uploads", progress.uploads)
    this.renderFileList(contentEl, "Downloads", progress.downloads)
    this.renderFileList(contentEl, "Conflicts", progress.conflicts)
  }

  private renderFileList(
    container: HTMLElement,
    title: string,
    files: string[]
  ): void {

    if (files.length === 0) return

    new Setting(container).setName(title).setHeading()

    files.forEach((file: string) => {
      new Setting(container).setDesc(file)
    })
  }

  static async toggle(app: App) {
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
}