import { Notice, Plugin } from "obsidian";
import { SnapshotManager } from "core/SnapshotManager";
import { WebRTCManager } from "core/WebRTCManager";
import { DEFAULT_SETTINGS } from "settings/defaults";
import { FloppyDiskSettingsTab } from "settings/FloppyDiskSettingsTab";
import { syncVault } from "commands/syncVault";
import { createThisDevice } from "utils/device";
import { Device } from "types/device";
import { FloppyDiskSettings } from "types/settings";

export default class FloppyDiskPlugin extends Plugin {
  public settings!: FloppyDiskSettings;
  public snapshotManager!: SnapshotManager;
  public webrtcManager!: WebRTCManager;
  settingsTab?: FloppyDiskSettingsTab;

  
  async onload() {
    new Notice("Floppy disk plugin loaded");

    // load saved settings
    const loaded = (await this.loadData()) as Partial<FloppyDiskSettings> | null;

    // type-safe initialization
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
      thisDevice: loaded?.thisDevice ?? (await createThisDevice()),
      trustedDevices: loaded?.trustedDevices ?? {},
      deviceName: loaded?.deviceName ?? DEFAULT_SETTINGS.deviceName,
    };

    // add settings tab
    this.settingsTab = new FloppyDiskSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);

    await this.ensureDeviceId();
    this.settings.vaultId = this.app.vault.getName();
    
    // create managers AFTER deviceId exists
    this.snapshotManager = new SnapshotManager(this.app, this.settings);
    await this.snapshotManager.ensureSnapshotExists();

    this.webrtcManager = new WebRTCManager(this);

    // ribbon icon
    this.addRibbonIcon("dice", "Sync vault", async () => {
      new Notice("Syncing vault...");
      await syncVault(this.app, this.snapshotManager, this.webrtcManager);
    });

    // command
    this.addCommand({
      id: "sync-vault",
      name: "Sync vault",
      callback: async () => await syncVault(this.app, this.snapshotManager, this.webrtcManager),
    });
  }
  
  onunload() {
    new Notice("Floppy disk plugin unloaded");
  }
  
  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    new Notice("Plugin settings updated");
  }
  
  private async ensureDeviceId(): Promise<void> {
    if (!this.settings.deviceId) {
      this.settings.deviceId = crypto.randomUUID();
      await this.saveSettings();
    }
  }

  // find a device by ID
  public findDevice(deviceId: string): Device | undefined {
    return Object.values(this.settings.trustedDevices).find(d => d.id === deviceId);
  }
}
