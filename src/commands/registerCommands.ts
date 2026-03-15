import FloppyDiskPlugin from "../main";
import { syncVault, toggleSyncPanel } from "utils/syncVault";
import { Notice } from "obsidian";

export function registerCommands(plugin: FloppyDiskPlugin): void {
    plugin.addCommand({
        id: "sync-vault",
        name: "Sync vault",
        callback: async () => {
            await syncVault(plugin.app, plugin.snapshotManager, plugin.webrtcManager)
        }
    });

    plugin.addCommand({
        id: "open-sync-panel",
        name: "Open sync panel",
        callback: async () => toggleSyncPanel(plugin.app),
    });

    plugin.addCommand({
        id: "close-sync-panel",
        name: "Close sync panel",
        callback: async () => toggleSyncPanel(plugin.app),
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
        },
    });
}

