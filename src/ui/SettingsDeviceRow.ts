import { Setting } from "obsidian";
import FloppyDiskPlugin from "../main";
import { Device } from "types/device";

export class SettingsDeviceRow {
  private plugin: FloppyDiskPlugin;
  private containerEl: HTMLElement;
  private deviceId: string;

  constructor(containerEl: HTMLElement, plugin: FloppyDiskPlugin, device: Device) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.deviceId = device.id;
  }

  render(): void {
    const device = this.plugin.deviceManager.getDeviceById(this.deviceId);;

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
            await this.plugin.deviceManager.removeDevice(device.id);
          })
      );
    }

    // delete button (always visible)
    setting.addExtraButton((btn) =>
      btn
        .setIcon("trash")
        .setTooltip("Delete device")
        .onClick(async (): Promise<void> => {
          await this.plugin.deviceManager.removeDevice(device.id);
        })
    );
  }
}
