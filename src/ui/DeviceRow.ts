import { Setting, Notice } from "obsidian";
import FloppyDiskPlugin from "../main";
import { Device, RevokedDevice, TrustedDevice } from "types/device";
import { PairDeviceModal } from "./PairDeviceModal";

export class DeviceRow {
  private plugin: FloppyDiskPlugin;
  private containerEl: HTMLElement;
  private device: Device;

  constructor(containerEl: HTMLElement, plugin: FloppyDiskPlugin, device: Device) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.device = device;
  }

  render(): void {
    const setting = new Setting(this.containerEl)
      .setName(this.device.name ?? this.device.id)
      .setDesc(
        `Fingerprint: ${this.device.fingerprint}\nStatus: ${this.device.trustStatus}`
      );

    this.renderActions(setting);
  }

  private renderActions(setting: Setting): void {
    switch (this.device.trustStatus) {
      case "trusted":
        setting.addButton((btn) =>
          btn
            .setWarning()
            .setButtonText("Revoke")
            .onClick(async (): Promise<void> => {
              await this.revokeDevice(this.device.id);
              await this.plugin.saveSettings();
              new Notice("Trust revoked.");
              this.plugin.settingsTab?.display();
            })
        );
        break;
    }

    // delete button (always visible)
    setting.addExtraButton((btn) =>
      btn
        .setIcon("trash")
        .setTooltip("Delete device")
        .onClick(async (): Promise<void> => {
          this.removeDevice(this.device.id)
        })
    );
  }

  // revoke a device
  private async revokeDevice(deviceId: string): Promise<void> {
    const device = this.plugin.findDevice(deviceId);
    if (!device) {
      new Notice("Device not found.");
      return;
    }

    const revoked: RevokedDevice = {
      ...device,
      trustStatus: "revoked",
    };

    this.plugin.settings.trustedDevices[deviceId] = revoked;
    await this.plugin.saveSettings();
    new Notice(`Trust revoked for device: ${device.name ?? device.id}.`);
  }

  // remove a device entirely
  private async removeDevice(deviceId: string): Promise<void> {
    if (!this.plugin.settings.trustedDevices[deviceId]) {
      new Notice("Device not found.");
      return;
    }

    this.plugin.settings.devices = this.plugin.settings.devices.filter(
      (d) => d.id !== this.device.id
    );

    await this.plugin.saveSettings();
    new Notice("Device deleted.");
    this.plugin.settingsTab?.display();
  }
}
