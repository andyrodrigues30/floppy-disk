import { Notice } from "obsidian";

import FloppyDiskPlugin from "../main";


export function registerRegenerateKeysCommands(plugin: FloppyDiskPlugin): void {
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

