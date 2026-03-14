import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import FloppyDiskPlugin from "main";
import { FloppyDiskCrypto } from "utils/cryptoHelper";
import { DeviceRow } from "ui/DeviceRow";
import { Device } from "types/device";
import { WebRTCManager } from "core/WebRTCManager";

export class FloppyDiskSettingsTab extends PluginSettingTab {
  declare plugin: FloppyDiskPlugin;
  private webrtc: WebRTCManager;
  private deviceId: string;

  constructor(app: App, plugin: FloppyDiskPlugin, webrtc: WebRTCManager, deviceId: string) {
    super(app, plugin);
    this.webrtc = webrtc;
    this.deviceId = deviceId;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // this device section
    new Setting(containerEl).setName("This device").setHeading();
    this.renderCurrentDevice(containerEl);

    // pair device section
    this.renderPairDevice(containerEl);

    // trusted devices
    new Setting(containerEl).setName("Devices").setHeading();
    this.renderDevices(containerEl);
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

    new Setting(containerEl)
      .setName("Public key")
      .setDesc(device.publicKey)

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

  private renderPairDevice(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Pair new device").setHeading()

    new Setting(containerEl)
      .setName("Copy code")
      .setDesc("Add this to other device")
      .addButton(btn =>
        btn
          .setButtonText("Copy")
          .onClick(async () => await this.copyPairCode())
      );

    let pairCode = "";
    new Setting(containerEl)
      .setName("Pair code")
      .setDesc("Code generated from other device")
      .addTextArea((text) => {
        text
          .onChange((value: string) => {
            pairCode = value.trim();
          });

        text.inputEl.classList.add("settings-pair-code");
      })
      .addButton((btn) =>
        btn
          .setCta()
          .setButtonText("Pair devices")
          .onClick(async (): Promise<void> => await this.submitPairCode(pairCode))
      );

  }

  private renderDevices(containerEl: HTMLElement): void {
    const devices: Device[] = Object.values(this.plugin.settings.devices);;

    if (!devices.length) {
      new Setting(containerEl).setDesc("No devices yet.");
      return;
    }

    devices.forEach((device) => {
      new DeviceRow(containerEl, this.plugin, device).render();
    });
  }

  // register device without trust state (trust handled by handshake)
  public async addDevice(
    deviceName: string,
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
      name: deviceName,
      publicKey,
      fingerprint: await FloppyDiskCrypto.computeFingerprint(publicKey),
      addedAt: Date.now(),
      trustStatus: "revoked"
    };

    this.plugin.settings.devices[newDevice.id] = newDevice;
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

  public getDeviceStatus(device: Device) {
    if (device.trustStatus === "revoked") return "Revoked";
    if (device.trustStatus === "trusted") return "Trusted";
    return "Added";
  }

  private async copyPairCode() {
    const offer = await this.webrtc.createPairingOffer();
    await navigator.clipboard.writeText(offer);
    new Notice("Code copied, add it to the other device.");
  }

  private async submitPairCode(pairCode: string) {
    try {
      const parsed = JSON.parse(pairCode.trim());

      // recieve offer
      if (parsed?.type === "PAIR_OFFER") {
        const answer = await this.webrtc.acceptPairingOffer(parsed);

        await navigator.clipboard.writeText(answer);
        new Notice("Pairing");
        
        return;
      }

      // complete pairing
      if (parsed?.type === "PAIR_ANSWER") {
        await this.webrtc.completePairing(parsed);

        // trust after pairing
        if (parsed.deviceId && parsed.deviceName && parsed.publicKey) {
          await this.webrtc.updateTrustedDevice(parsed.deviceId, parsed.deviceName, parsed.publicKey);
        }

        await this.plugin.saveSettings();

        // refresh UI
        this.plugin.settingsTab?.display();

        new Notice("Pairing complete");

        return;
      }

      new Notice("Invalid pairing code");
    } catch {
      new Notice("Invalid pairing code");
    }
  }
}