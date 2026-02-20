import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import FloppyDiskPlugin from "main";
import { FloppyDiskCrypto } from "utils/cryptoHelper";

export class FloppyDiskSettingsTab extends PluginSettingTab {
    declare plugin: FloppyDiskPlugin;

    constructor(app: App, plugin: FloppyDiskPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // this device section
        new Setting(containerEl).setName("This device").setHeading();
        this.renderCurrentDevice(containerEl);

    }

    private renderCurrentDevice(containerEl: HTMLElement): void {
    const device = this.plugin.settings.thisDevice;

    new Setting(containerEl)
      .setName("Device name")
      .setDesc("Give this device a friendly name syncing")
      .addText((text) =>
        text
          .setPlaceholder("Optional")
          .setValue(this.plugin.settings.deviceName ?? "")
          .onChange(async (value: string): Promise<void> => {
            const trimmed = value.trim();
            this.plugin.settings.deviceName = trimmed;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Device ID")
      .setDesc("Copy this to add this device to another device")
      .setDesc(device.id)
      .addButton((btn) =>
        btn
          .setButtonText("Copy")
          .onClick((): void => {
            void navigator.clipboard.writeText(device.id);
            new Notice("Device ID copied");
          })
      )

    new Setting(containerEl)
      .setName("Public key")
      .setDesc(`Copy this to add this device to another device:\n${device.publicKey}`)
      .addButton((btn) =>
        btn
          .setButtonText("Copy")
          .onClick((): void => {
            void navigator.clipboard.writeText(device.publicKey);
            new Notice("Public key copied");
          })
      );

    new Setting(containerEl)
      .setName("Fingerprint")
      .setDesc(device.fingerprint)

    new Setting(containerEl)
      .setName("Regenerate keys")
      .setDesc("Regenerating keys will require you to updated it on other devices.")
      .addButton((btn) =>
        btn
          .setWarning()
          .setButtonText("Regenerate")
          .onClick(async (): Promise<void> => {
            await this.regenerateKeys();
            await this.plugin.saveSettings();
            new Notice("Keys regenerated");
            this.display();
          })
      );
  }

  private async regenerateKeys(): Promise<void> {
    if (!this.plugin.settings.thisDevice) return;

    // generate new key pairs
    const newKeys = await FloppyDiskCrypto.generateDeviceKeys();

    // keep existing id, name, and fingerprint updated
    const exportedPublicKey = await FloppyDiskCrypto.computeExportedKey(
      newKeys.signingKeyPair.publicKey
    );
    const publicKeyBase64 = btoa(JSON.stringify(exportedPublicKey));
    const fingerprint = await FloppyDiskCrypto.computeFingerprint(publicKeyBase64);

    this.plugin.settings.thisDevice = {
      ...this.plugin.settings.thisDevice,
      publicKey: publicKeyBase64,
      fingerprint,
      signingKeyPair: newKeys.signingKeyPair,
      encryptionKeyPair: newKeys.encryptionKeyPair,
      privateKey: newKeys.signingKeyPair.privateKey,
    };

    new Notice("Keys regenerated");
    await this.plugin.saveSettings();
  }
}