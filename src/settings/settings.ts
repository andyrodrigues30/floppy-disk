import FloppyDiskPlugin from "main";
import { App, PluginSettingTab, Setting } from "obsidian";

export class FloppyDiskSettingsTab extends PluginSettingTab {
    declare plugin: FloppyDiskPlugin;

    constructor(app: App, plugin: FloppyDiskPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // this device section
        new Setting(containerEl).setName("This device").setHeading();
    }
}