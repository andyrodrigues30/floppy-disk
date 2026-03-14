import { Modal, Setting, Notice } from "obsidian";
import { WebRTCManager } from "core/WebRTCManager";
import FloppyDiskPlugin from "main";

export class PairDeviceModal extends Modal {
  private plugin: FloppyDiskPlugin;
  private webrtc: WebRTCManager;
  private deviceId: string;

  constructor(app: any, plugin: FloppyDiskPlugin, webrtc: WebRTCManager, deviceId: string) {
    super(app);
    this.plugin = plugin;
    this.webrtc = webrtc;
    this.deviceId = deviceId;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", { text: "Pair Device" });

    // generate offer
    new Setting(contentEl)
      .setName("Create Pair Code")
      .addButton(btn =>
        btn.setButtonText("Generate")
          .onClick(async () => await this.generateOffer())
      );


    // paste pair code
    let input = "";
    new Setting(contentEl)
      .setName("Paste Pair Code")
      .addTextArea(text =>
        text.onChange(value => input = value)
      );


    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText("Submit")
          .setCta()
          .onClick(async () => this.submitPairCode(input))
      );
  }

  onClose() {
    this.contentEl.empty();
  }

  private async generateOffer() {
    const offer = await this.webrtc.createPairingOffer();
    await navigator.clipboard.writeText(offer);
    new Notice("Pair code copied");
  }

  private async submitPairCode(input: string) {
    try {
      const parsed = JSON.parse(input.trim());

      console.warn("PARSED", parsed)

      // recieve offer
      if (parsed?.type === "PAIR_OFFER") {
        const answer = await this.webrtc.acceptPairingOffer(parsed);

        await navigator.clipboard.writeText(answer);
        new Notice("Answer copied. Send it back to the other device.");
        
        this.close();
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

        this.close();
        return;
      }

      new Notice("Invalid pairing code");
    } catch {
      new Notice("Invalid pairing code");
    }
  }
}