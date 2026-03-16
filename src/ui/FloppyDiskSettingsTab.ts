import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import FloppyDiskPlugin from "main";
import { FloppyDiskCrypto } from "utils/cryptoHelper";
import { DeviceRow } from "ui/DeviceRow";
import { Device } from "types/device";
import { WebRTCManager } from "managers/WebRTCManager";

export class FloppyDiskSettingsTab extends PluginSettingTab {
  declare plugin: FloppyDiskPlugin;
  private webrtc: WebRTCManager;
  private pairingConnectionId?: string;
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

    // generate new runtime keys
    const signingKeys = await FloppyDiskCrypto.generateSigningKeyPair();
    const encryptionKeys = await FloppyDiskCrypto.generateEncryptionKeyPair();

    // export signing keys
    const signingPublicJwk = await FloppyDiskCrypto.exportSigningPublicKey(signingKeys.publicKey);
    const signingPrivateJwk = await FloppyDiskCrypto.exportSigningPrivateKey(signingKeys.privateKey);

    // export encryption keys
    const encryptionPublicJwk = await FloppyDiskCrypto.exportEncryptionPublicKey(encryptionKeys.publicKey);
    const encryptionPrivateJwk = await FloppyDiskCrypto.exportEncryptionPrivateKey(encryptionKeys.privateKey);

    // fingerprint based on signing public key
    const publicKeyString = JSON.stringify(signingPublicJwk);
    const fingerprint = await FloppyDiskCrypto.computeFingerprint(publicKeyString);

    // update stored device
    this.plugin.settings.thisDevice = {
      ...this.plugin.settings.thisDevice,

      publicKey: publicKeyString,
      fingerprint,

      signingKeyPair: {
        publicKeyJwk: signingPublicJwk,
        privateKeyJwk: signingPrivateJwk,
      },

      encryptionKeyPair: {
        publicKeyJwk: encryptionPublicJwk,
        privateKeyJwk: encryptionPrivateJwk,
      },
    };

    await this.plugin.saveSettings();
  }

  private async copyPairCode() {
    this.pairingConnectionId = crypto.randomUUID();
    const offer = await this.plugin.webrtcManager.createOffer(this.pairingConnectionId);
    await navigator.clipboard.writeText(offer);
    new Notice("Code copied, add it to the other device.");
  }

  private async submitPairCode(pairCode: string) {
    try {
      const parsed = JSON.parse(pairCode.trim());

      // offer
      if (parsed?.type === "offer" && parsed?.sdp) {
        const pairingId = crypto.randomUUID();
        const answer = await this.plugin.webrtcManager.acceptOffer(
          pairingId,
          JSON.stringify(parsed)
        );

        await navigator.clipboard.writeText(answer);

        new Notice("Answer generated. Send it back to the other device.");
        return;
      }

      // answer
      if (parsed?.type === "answer" && parsed?.sdp) {

        if (!this.pairingConnectionId) {
          new Notice("No pairing session active.");
          return;
        }

        await this.plugin.webrtcManager.finalizeConnection(
          this.pairingConnectionId,
          JSON.stringify(parsed)
        );

        new Notice("Pairing complete!");
        return;
      }

      new Notice("Invalid pairing code");

    } catch (e) {
      new Notice("Invalid pairing code");
    }
  }
}