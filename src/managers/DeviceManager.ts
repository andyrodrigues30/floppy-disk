import FloppyDiskPlugin from "main"
import { Notice } from "obsidian"
import { Device } from "types/device"
import { FloppyDiskCrypto } from "utils/cryptoHelper"

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
    public async revokeDevice(deviceId: string): Promise<void> {
        const device = this.plugin.settings.devices[deviceId];
        if (!device) return;

        device.trustStatus = "revoked";

        await this.plugin.saveSettings();

        new Notice("Trust revoked.");

        this.plugin.refreshSettingsUI();
    }

    // remove a device entirely
    public async removeDevice(deviceId: string): Promise<void> {
        if (!this.plugin.settings.devices[deviceId]) return;

        delete this.plugin.settings.devices[deviceId];

        await this.plugin.saveSettings();

        new Notice("Device deleted.");

        this.plugin.refreshSettingsUI();
    }

    async updateLastSeen(deviceId: string): Promise<void> {
        const device = this.plugin.settings.devices[deviceId]
        if (!device) return

        device.lastSeen = Date.now()
        await this.plugin.saveSettings()
    }

    public async trustDevice(
        deviceId: string,
        deviceName: string,
        publicKey: string
    ): Promise<void> {
        const devices = this.plugin.settings.devices;
        const now = Date.now();

        const fingerprint = await FloppyDiskCrypto.computeFingerprint(publicKey);
        const existing = devices[deviceId];

        if (existing) {
            existing.trustStatus = "trusted";
            existing.publicKey = publicKey;
            existing.lastSeen = now;
        } else {
            devices[deviceId] = {
                id: deviceId,
                name: deviceName ?? deviceId,
                publicKey,
                fingerprint,
                trustStatus: "trusted",
                addedAt: now,
                lastSeen: now
            };
        }

        await this.plugin.saveSettings();
    }
}