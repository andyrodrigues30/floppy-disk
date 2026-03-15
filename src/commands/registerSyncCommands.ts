import FloppyDiskPlugin from "../main";
import { SyncView } from "ui/SyncView";

export function registerSyncCommands(plugin: FloppyDiskPlugin): void {
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
}

