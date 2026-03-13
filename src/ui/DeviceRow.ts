import { Setting, Notice } from "obsidian";
import FloppyDiskPlugin from "../main";
import { Device, RevokedDevice } from "types/device";

export class DeviceRow {
  private plugin: FloppyDiskPlugin;
  private containerEl: HTMLElement;
  private deviceId: string;

  constructor(containerEl: HTMLElement, plugin: FloppyDiskPlugin, device: Device) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.deviceId = device.id;
  }

  private get device(): Device | undefined {
    return this.plugin.settings.devices[this.deviceId];
  }

  render(): void {
    const device = this.device;
    if (!device) return;

    const setting = new Setting(this.containerEl)
      .setName(device.name ?? device.id)
      .setDesc(
        `Fingerprint: ${device.fingerprint}\nStatus: ${device.trustStatus}`
      );

    this.renderActions(setting, device);
  }

  private renderActions(setting: Setting, device: Device): void {
    if (device.trustStatus === "trusted") {
      setting.addButton((btn) =>
        btn
          .setWarning()
          .setButtonText("Revoke")
          .onClick(async () => {
            await this.revokeDevice(device.id);
          })
      );
    }

    // delete button (always visible)
    setting.addExtraButton((btn) =>
      btn
        .setIcon("trash")
        .setTooltip("Delete device")
        .onClick(async (): Promise<void> => {
          this.removeDevice(device.id)
        })
    );
  }

  // revoke a device
  private async revokeDevice(deviceId: string): Promise<void> {
    const device = this.plugin.settings.devices[deviceId];
    if (!device) return;

    device.trustStatus = "revoked";

    await this.plugin.saveSettings();

    new Notice("Trust revoked.");

    this.plugin.refreshSettingsUI();
  }

  // remove a device entirely
  private async removeDevice(deviceId: string): Promise<void> {
    if (!this.plugin.settings.devices[deviceId]) return;

    delete this.plugin.settings.devices[deviceId];

    await this.plugin.saveSettings();

    new Notice("Device deleted.");

    this.plugin.refreshSettingsUI();
  }
}
