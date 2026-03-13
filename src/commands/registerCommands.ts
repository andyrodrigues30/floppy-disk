import FloppyDiskPlugin from "../main";
import { syncVault } from "utils/syncVault";
import { SYNC_VIEW_TYPE } from "ui/SyncView";
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
        callback: async () => {
            const leaf = plugin.app.workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({
                    type: SYNC_VIEW_TYPE,
                    active: true,
                });
                await plugin.app.workspace.revealLeaf(leaf);
            } else {
                new Notice("Cannot open sync panel.")
            }
        },
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