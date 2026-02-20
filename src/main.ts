import { Notice, Plugin } from "obsidian";
import { FloppyDiskSettingsTab } from "settings/settings";

export default class FloppyDiskPlugin extends Plugin {
  settingsTab?: FloppyDiskSettingsTab;
  
  async onload() {
    new Notice("Floppy disk plugin loaded");

    // add settings tab
    this.settingsTab = new FloppyDiskSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);
  }

  onunload() {
    new Notice("Floppy disk plugin unloaded");
  }
}
