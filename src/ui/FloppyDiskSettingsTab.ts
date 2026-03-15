import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import FloppyDiskPlugin from "main";
import { FloppyDiskCrypto } from "utils/cryptoHelper";
import { DeviceRow } from "ui/DeviceRow";
import { Device } from "types/device";
import { WebRTCManager } from "managers/WebRTCManager";

export class FloppyDiskSettingsTab extends PluginSettingTab {
  declare plugin: FloppyDiskPlugin;
  private webrtc: WebRTCManager;
  private pairCodeInput?: HTMLTextAreaElement;

  constructor(app: App, plugin: FloppyDiskPlugin, webrtc: WebRTCManager, deviceId: string) {
    super(app, plugin);
    this.webrtc = webrtc;
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
          .setValue(this.plugin.settings.thisDevice.name ?? "")
          .onChange(async (value: string) => {
            this.plugin.settings.thisDevice.name = value.trim();
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
            this.plugin.refreshSettingsUI();
          })
      );
  }

  private renderPairDevice(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Pair new device")
      .setHeading();

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
          .setPlaceholder("Paste pairing code here")
          .onChange((value: string) => {
            pairCode = value.trim();
          });

        text.inputEl.classList.add("settings-pair-code");

        // store reference so it can be cleared later
        this.pairCodeInput = text.inputEl;
      })
      .addButton((btn) =>
        btn
          .setCta()
          .setButtonText("Pair devices")
          .onClick(async (): Promise<void> => {
            await this.submitPairCode(pairCode);
          })
      );
  }

  private renderDevices(containerEl: HTMLElement): void {
    const devices: Device[] = Object.values(this.plugin.deviceManager.getDevices());;

    if (!devices.length) {
      new Setting(containerEl).setDesc("No devices yet.");
      return;
    }

    devices.forEach((device) => {
      new DeviceRow(containerEl, this.plugin, device).render();
    });
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

  private async copyPairCode() {
    const offer = await this.plugin.webrtcManager.createOffer(
      this.plugin.settings.thisDevice.id
    );
    await navigator.clipboard.writeText(offer);
    new Notice("Code copied, add it to the other device.");
  }

  private async submitPairCode(pairCode: string) {
    try {
      const parsed = JSON.parse(pairCode.trim());

      // recieve offer
      if (parsed?.type === "PAIR_OFFER") {
        const answer = await this.plugin.webrtcManager.acceptOffer(
          this.plugin.settings.thisDevice.id,
          JSON.stringify(parsed)
        );

        await navigator.clipboard.writeText(answer);
        new Notice("Pairing");

        return;
      }

      // complete pairing
      if (parsed?.type === "PAIR_ANSWER") {
        await this.plugin.pairingManager.completePairing(parsed);

        // trust after pairing
        if (parsed.deviceId && parsed.deviceName && parsed.publicKey) {
          await this.plugin.deviceManager.trustDevice(parsed.deviceId, parsed.deviceName, parsed.publicKey);
        }

        await this.plugin.saveSettings();

        if (this.pairCodeInput) {
          this.pairCodeInput.value = "";
        }

        // refresh UI
        this.plugin.refreshSettingsUI();

        new Notice("Pairing complete");

        return;
      }

      new Notice("Invalid pairing code");
    } catch {
      new Notice("Invalid pairing code");
    }
  }
}