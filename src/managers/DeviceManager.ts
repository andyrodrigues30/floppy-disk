import { Notice } from "obsidian";

import { Device } from "../types/device";

import FloppyDiskPlugin from "../main";

export class DeviceManager {
    private plugin: FloppyDiskPlugin

    constructor(plugin: FloppyDiskPlugin) {
        this.plugin = plugin
    }

    public getDevices(): Record<string, Device> {
        return this.plugin.settings.devices
    }

    public getDeviceById(id: string): Device | undefined {
        return this.plugin.settings.devices[id]
    }

    public getTrustedDevices(): Device[] {
        return Object.values(this.plugin.settings.devices)
            .filter(d => d.trustStatus === "trusted")
    }

    // revoke a device
    public async revokeDevice(id: string): Promise<void> {
        const device = this.plugin.settings.devices[id];
        if (!device) return;

        device.trustStatus = "revoked";

        await this.plugin.saveSettings();

        new Notice("Trust revoked.");

        this.plugin.refreshSettingsUI();
    }

    // remove a device entirely
    public async removeDevice(id: string): Promise<void> {
        if (!this.plugin.settings.devices[id]) return;

        delete this.plugin.settings.devices[id];

        await this.plugin.saveSettings();

        new Notice("Device deleted.");

        this.plugin.refreshSettingsUI();
    }

    async updateLastSeen(id: string): Promise<void> {
        const device = this.plugin.settings.devices[id]
        if (!device) return

        device.lastSeen = Date.now()
        await this.plugin.saveSettings()
    }

    public async trustDevice(
        id: string,
        name: string,
        publicKey: string,
        fingerprint: string
    ): Promise<void> {

        const now = Date.now();
        this.plugin.settings.devices[id] = {
            id,
            name: name ?? id,
            publicKey,
            fingerprint,
            trustStatus: "trusted",
            addedAt: now,
            lastSeen: now
        };

        await this.plugin.saveSettings();

        this.plugin.refreshSettingsUI();
    }
}