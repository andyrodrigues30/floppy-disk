import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import FloppyDiskPlugin from "main";
import { FloppyDiskCrypto } from "utils/cryptoHelper";
import { isTrustedDevice } from "utils/deviceGuards";
import { DeviceRow } from "ui/DeviceRow";
import { Device } from "types/device";

export class FloppyDiskSettingsTab extends PluginSettingTab {
  declare plugin: FloppyDiskPlugin;

  constructor(app: App, plugin: FloppyDiskPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("This device").setHeading();
    this.renderCurrentDevice(containerEl);

    new Setting(containerEl).setName("Trusted devices").setHeading();
    this.renderTrustedDevices(containerEl);
  }

  private renderCurrentDevice(containerEl: HTMLElement): void {
    const device = this.plugin.settings.thisDevice;

    new Setting(containerEl)
      .setName("Device name")
      .setDesc("Give this device a friendly name")
      .addText((text) =>
        text
          .setPlaceholder("Optional")
          .setValue(this.plugin.settings.deviceName ?? "")
          .onChange(async (value: string) => {
            this.plugin.settings.deviceName = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Device ID")
      .setDesc(device.id)
      .addButton((btn) =>
        btn
          .setButtonText("Copy")
          .onClick(() => {
            void navigator.clipboard.writeText(device.id);
            new Notice("Device ID copied.");
          })
      );

    new Setting(containerEl)
      .setName("Public key")
      .setDesc(device.publicKey)
      .addButton((btn) =>
        btn
          .setButtonText("Copy")
          .onClick(() => {
            void navigator.clipboard.writeText(device.publicKey);
            new Notice("Public key copied.");
          })
      );

    new Setting(containerEl)
      .setName("Fingerprint")
      .setDesc(device.fingerprint);

    new Setting(containerEl)
      .setName("Regenerate keys")
      .setDesc("Regenerating keys requires updating other devices.")
      .addButton((btn) =>
        btn
          .setWarning()
          .setButtonText("Regenerate")
          .onClick(async () => {
            await this.regenerateKeys();
            new Notice("Keys regenerated.");
            this.display();
          })
      );
  }

  private renderTrustedDevices(containerEl: HTMLElement): void {
    const trusted: Device[] =
      this.plugin.settings.devices.filter(isTrustedDevice);

    if (!trusted.length) {
      new Setting(containerEl).setDesc("No trusted devices yet.");
      return;
    }

    trusted.forEach((device) => {
      new DeviceRow(containerEl, this.plugin, device).render();
    });
  }

  // register device without trust state (trust handled by handshake)
  public async addDevice(
    deviceId: string,
    publicKey: string
  ): Promise<void> {
    if (!publicKey) throw new Error("public key is required");

    const existing = this.plugin.findDevice(deviceId);
    if (existing) {
      new Notice("Device already exists.");
      return;
    }

    const newDevice: Device = {
      id: deviceId,
      name: deviceId,
      publicKey,
      fingerprint: await FloppyDiskCrypto.computeFingerprint(publicKey),
      addedAt: Date.now(),
      trustStatus: "revoked"
    };

    this.plugin.settings.devices.push(newDevice);
    await this.plugin.saveSettings();

    new Notice("Device added. Trust will be established via handshake.");
  }

  public async regenerateKeys(): Promise<void> {
    if (!this.plugin.settings.thisDevice) return;

    const newKeys = await FloppyDiskCrypto.generateDeviceKeys();

    const exportedPublicKey = await FloppyDiskCrypto.computeExportedKey(
      newKeys.signingKeyPair.publicKey
    );

    const publicKeyBase64 = btoa(JSON.stringify(exportedPublicKey));

    const fingerprint =
      await FloppyDiskCrypto.computeFingerprint(publicKeyBase64);

    this.plugin.settings.thisDevice = {
      ...this.plugin.settings.thisDevice,
      publicKey: publicKeyBase64,
      fingerprint,
      signingKeyPair: newKeys.signingKeyPair,
      encryptionKeyPair: newKeys.encryptionKeyPair,
      privateKey: newKeys.signingKeyPair.privateKey,
    };

    await this.plugin.saveSettings();
  }
}