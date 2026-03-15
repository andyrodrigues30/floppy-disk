import { Notice, Plugin } from "obsidian";

import { Device } from "types/device";
import { FloppyDiskSettings } from "types/settings";
import { SyncProgress } from "types/sync";

import { DEFAULT_SETTINGS } from "settings";

import { registerSyncCommands } from "commands/registerSyncCommands";
import { registerRegenerateKeysCommands } from "commands/registerRegenerateKeysCommands";
import { SnapshotManager } from "managers/SnapshotManager";
import { SyncManager } from "managers/SyncManager";
import { DeviceManager } from "managers/DeviceManager";
import { WebRTCManager } from "managers/WebRTCManager";

import { FloppyDiskSettingsTab } from "ui/FloppyDiskSettingsTab";
import { CONFLICT_DIFF_VIEW_TYPE, ConflictDiffView } from "ui/ConflictDiffView";
import { SYNC_VIEW_TYPE, SyncView } from "ui/SyncView";

import { createThisDevice } from "utils/device";
import { PairingManager } from "managers/PairingManager";


export default class FloppyDiskPlugin extends Plugin {
  public settings!: FloppyDiskSettings;

  public snapshotManager!: SnapshotManager;
  public pairingManager!: PairingManager;
  public syncManager!: SyncManager;
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
    };

    // register commands
    registerSyncCommands(this);
    registerRegenerateKeysCommands(this);

    await this.ensureDeviceId();
    this.settings.vaultId = this.app.vault.getName();

    // create managers AFTER deviceId exists
    this.snapshotManager = new SnapshotManager(this.app, this.settings);
    await this.snapshotManager.ensureSnapshotExists();
    await this.snapshotManager.setCurrentDevice(this.settings.thisDevice.id)
    this.webrtcManager = new WebRTCManager(this);
    this.pairingManager = new PairingManager(this);
    this.syncManager = new SyncManager(this.app, this);
    this.deviceManager = new DeviceManager(this);

    // add settings tab
    this.settingsTab = new FloppyDiskSettingsTab(this.app, this, this.webrtcManager, this.settings.thisDevice.id);
    this.addSettingTab(this.settingsTab);

    // register views
    this.registerView(
      CONFLICT_DIFF_VIEW_TYPE,
      (leaf) => new ConflictDiffView(leaf, this)
    );

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
    if (!this.settings.thisDevice.id) {
      this.settings.thisDevice.id = crypto.randomUUID();
      await this.saveSettings();
    }
  }

  // find a device by ID
  public findDevice(id: string): Device | undefined {
    return this.settings.devices[id];
  }

  public refreshSettingsUI(): void {
    this.settingsTab?.display();
  }
}
