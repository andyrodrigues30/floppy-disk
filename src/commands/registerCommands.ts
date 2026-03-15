import FloppyDiskPlugin from "../main";
import { SyncView } from "ui/SyncView";
import { Notice } from "obsidian";

export function registerCommands(plugin: FloppyDiskPlugin): void {
    plugin.addCommand({
        id: "open-sync-panel",
        name: "Open sync panel",
        callback: async () => await SyncView.toggle(plugin.app)
    });

    plugin.addCommand({
        id: "close-sync-panel",
        name: "Close sync panel",
        callback: async () => await SyncView.toggle(plugin.app)
    });

    plugin.addCommand({
        id: "regenerate-keys",
        name: "Regenerate device keys",
        callback: async () => {
            if (plugin.settingsTab) {
                await plugin.settingsTab.regenerateKeys();
            } else {
                new Notice("Cannot regenerate keys.")
            }
        }
    });
}

