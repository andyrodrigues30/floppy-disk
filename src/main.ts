import { Notice, Plugin } from "obsidian";
import { SnapshotManager } from "managers/SnapshotManager";
import { DeviceManager } from "managers/DeviceManager";
import { WebRTCManager } from "managers/WebRTCManager";
import { DEFAULT_SETTINGS } from "settings/defaults";
import { FloppyDiskSettingsTab } from "settings/FloppyDiskSettingsTab";
import { registerCommands } from "commands/registerCommands";
import { SYNC_VIEW_TYPE, SyncView } from "ui/SyncView";
import { createThisDevice } from "utils/device";
import { Device, RemoteDevice } from "types/device";
import { FloppyDiskSettings } from "types/settings";
import { SyncProgress } from "types/sync";

export default class FloppyDiskPlugin extends Plugin {
  public settings!: FloppyDiskSettings;
  public snapshotManager!: SnapshotManager;
  public deviceManager: DeviceManager;
  public webrtcManager!: WebRTCManager;
  settingsTab?: FloppyDiskSettingsTab;


  async onload() {
    new Notice("Floppy disk plugin loaded.");

    // load saved settings
    const loaded = (await this.loadData()) as Partial<FloppyDiskSettings> | null;

    // type-safe initialization
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
      thisDevice: loaded?.thisDevice ?? (await createThisDevice()),
      deviceName: loaded?.deviceName ?? DEFAULT_SETTINGS.deviceName,
    };

    // commands
    registerCommands(this);

    await this.ensureDeviceId();
    this.settings.vaultId = this.app.vault.getName();

    // create managers AFTER deviceId exists
    this.snapshotManager = new SnapshotManager(this.app, this.settings);
    await this.snapshotManager.ensureSnapshotExists();
    await this.snapshotManager.setCurrentDevice(this.settings.deviceId)
    this.deviceManager = new DeviceManager(this);
    this.webrtcManager = new WebRTCManager(this);

    // add settings tab
    this.settingsTab = new FloppyDiskSettingsTab(this.app, this, this.webrtcManager, this.settings.deviceId);
    this.addSettingTab(this.settingsTab);

    // sync view
    this.registerView(
      SYNC_VIEW_TYPE,
      (leaf) => new SyncView(leaf, this)
    );

    // ribbon icon - open sync panel
    this.addRibbonIcon("refresh-cw", "Open sync panel", async () => await SyncView.toggle(this.app))
  }

  onunload() {
    new Notice("Floppy disk plugin unloaded.");
  }

  get remoteDevices(): Map<string, RemoteDevice> {
    return this.webrtcManager.getRemoteDevices()
  }

  public syncProgress: SyncProgress = {
    phase: "idle",
    totalFiles: 0,
    processedFiles: 0,
    uploads: [],
    downloads: [],
    conflicts: [],
  };

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    new Notice("Plugin settings updated.");
  }

  private async ensureDeviceId(): Promise<void> {
    if (!this.settings.deviceId) {
      this.settings.deviceId = crypto.randomUUID();
      await this.saveSettings();
    }
  }

  // find a device by ID
  public findDevice(deviceId: string): Device | undefined {
    return this.settings.devices[deviceId];
  }

  public refreshSettingsUI(): void {
    this.settingsTab?.display();
  }
}
