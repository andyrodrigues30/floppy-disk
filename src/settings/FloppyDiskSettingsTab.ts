import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import FloppyDiskPlugin from "main";
import { FloppyDiskCrypto } from "utils/cryptoHelper";
import { isPendingDevice, isTrustedDevice } from "utils/deviceGuards";
import { DeviceRow } from "ui/DeviceRow";
import { Device, DeviceTrustStatus } from "types/device";


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
    // add device section
    this.renderAddDevice(containerEl);
    // pending devices
    new Setting(containerEl).setName("Pending devices").setHeading();
    this.renderPendingDevices(containerEl);
    // trusted devices
    new Setting(containerEl).setName("Trusted devices").setHeading();
    this.renderTrustedDevices(containerEl);
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
            new Notice("Device ID copied.");
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
            new Notice("Public key copied.");
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
            new Notice("Keys regenerated.");
            this.display();
          })
      );
  }

  private renderAddDevice(containerEl: HTMLElement): void {
    let deviceId = "";
    let publicKey = "";

    new Setting(containerEl).setName("Add device").setHeading()
      .addButton((btn) =>
        btn
          .setCta()
          .setButtonText("Add device")
          .onClick(async (): Promise<void> => {
            if (!publicKey || !deviceId) {
              new Notice("Public key required.");
              return;
            }
            await this.addDevice(deviceId, publicKey);
            await this.plugin.saveSettings();
            new Notice("Device added (pending).");
            this.display();
          })
      );

    new Setting(containerEl)
      .setName("Device ID")
      .setDesc("In device settings of the device to add")
      .addText((text) => {
        text
          .onChange((value: string) => {
            deviceId = value.trim()
          })
      });

    new Setting(containerEl)
      .setName("Public key")
      .addTextArea((text) => {
        text
          .onChange((value: string) => {
            publicKey = value.trim();
          });

        text.inputEl.classList.add("settings-public-key");
      })
  }

  private renderPendingDevices(containerEl: HTMLElement): void {
    const pending: Device[] = this.plugin.settings.devices.filter(isPendingDevice);

    if (!pending.length) {
      new Setting(containerEl).setDesc("No pending devices.");
      return;
    }

    pending.forEach((device) => {
      new DeviceRow(containerEl, this.plugin, device).render();
    });
  }

  private renderTrustedDevices(containerEl: HTMLElement): void {
    const trusted: Device[] = this.plugin.settings.devices.filter(isTrustedDevice);


    if (!trusted.length) {
      new Setting(containerEl).setDesc("No trusted devices yet.");
      return;
    }

    trusted.forEach((device) => {
      new DeviceRow(containerEl, this.plugin, device).render();
    });
  }

  // add a new device (incoming or outgoing pending)
  public async addDevice(
    deviceId: string,
    publicKey: string,
    name?: string,
    outgoing: boolean = false
  ): Promise<void> {
    if (!publicKey) throw new Error("Public key is required");

    const existing = this.plugin.findDevice(deviceId);
    if (existing) {
      new Notice("Device already exists.");
      return;
    }

    const trustStatus: DeviceTrustStatus = outgoing ? "pending-outgoing" : "pending-incoming";

    const newDevice: Device = {
      id: deviceId,
      publicKey,
      fingerprint: await FloppyDiskCrypto.computeFingerprint(publicKey),
      addedAt: Date.now(),
      name,
      trustStatus,
    };

    this.plugin.settings.trustedDevices[deviceId] = newDevice;
    await this.plugin.saveSettings();
    new Notice(`Device added: ${name ?? deviceId} (${trustStatus}).`);
  }

  public async regenerateKeys(): Promise<void> {
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

    new Notice("Keys regenerated.");
    await this.plugin.saveSettings();
  }
}