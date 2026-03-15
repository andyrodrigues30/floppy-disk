import { ItemView, WorkspaceLeaf } from "obsidian"
import FloppyDiskPlugin from "main"

export const SYNC_VIEW_TYPE = "floppy-disk-sync-view"

export class SyncView extends ItemView {
  plugin: FloppyDiskPlugin
  selectedDeviceId: string | null = null

  constructor(leaf: WorkspaceLeaf, plugin: FloppyDiskPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string {
    return SYNC_VIEW_TYPE
  }

  getDisplayText(): string {
    return "Floppy disk sync"
  }

  getIcon(): string {
    return "refresh-cw"
  }

  async onOpen(): Promise<void> {
    this.render()
  }

  render(): void {
    const { contentEl } = this
    contentEl.empty()

    const devices = Object.values(this.plugin.settings.devices)
      .filter(d => d.trustStatus === "trusted")

    const remoteDevices = this.plugin.remoteDevices

    contentEl.createEl("h2", { text: "Devices" })

    const devicesContainer = contentEl.createDiv()

    devices.forEach(device => {
      const remote = remoteDevices.get(device.id)

      const connectionStatus =
        remote?.connection?.connectionState === "connected"
          ? "Online"
          : "Offline"

      const row = devicesContainer.createDiv("device-row")

      if (!this.selectedDeviceId) {
        this.selectedDeviceId = device.id
      }

      if (device.id === this.selectedDeviceId) {
        row.addClass("device-selected")
      }

      row.createEl("div", { text: device.name ?? device.id })
      row.createEl("div", { text: `Connection: ${connectionStatus}` })

      row.createEl("div", {
        text: `Last Seen: ${
          device.lastSeen
            ? new Date(device.lastSeen).toLocaleString()
            : "Never"
        }`
      })

      const lastSynced = this.plugin.snapshotManager.getLastSynced(device.id)

      row.createEl("div", {
        text: `Last Synced: ${
          lastSynced
            ? new Date(lastSynced).toLocaleString()
            : "Never"
        }`
      })

      const isSyncing =
        this.plugin.snapshotManager.isDeviceSyncing(device.id)

      const button = row.createEl("button", {
        text: isSyncing ? "Pause" : "Sync"
      })

      button.onclick = (e) => {
        e.stopPropagation()

        if (isSyncing) {
          this.plugin.snapshotManager.pauseDeviceSync(device.id)
        } else {
          this.plugin.snapshotManager.startDeviceSync(device.id)
        }

        this.render()
      }

      row.onclick = () => {
        this.selectedDeviceId = device.id
        this.render()
      }
    })

    // =============================
    // Activity
    // =============================

    if (!this.selectedDeviceId) return

    const progress =
      this.plugin.snapshotManager.getDeviceProgress(this.selectedDeviceId)

    contentEl.createEl("h2", { text: "Activity" })

    if (!progress) {
      contentEl.createEl("div", { text: "No activity." })
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
    if (!files?.length) return

    container.createEl("h3", { text: title })

    const list = container.createEl("ul")

    for (const file of files) {
      list.createEl("li", { text: file })
    }
  }
}