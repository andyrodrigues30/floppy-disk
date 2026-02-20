import { Notice, Plugin } from "obsidian";
import { SnapshotManager } from "core/snapshot";
import { DEFAULT_SETTINGS } from "settings/defaults";
import { FloppyDiskSettingsTab } from "settings/settings";
import { createThisDevice } from "utils/device";
import { FloppyDiskSettings } from "types/settings";

export default class FloppyDiskPlugin extends Plugin {
  public settings!: FloppyDiskSettings;
  public snapshotManager!: SnapshotManager;
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
  }
  
  onunload() {
    new Notice("Floppy disk plugin unloaded");
  }
  
  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    new Notice("Plugin settings updated");
  }
}
