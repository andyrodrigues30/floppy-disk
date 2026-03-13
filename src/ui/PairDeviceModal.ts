import { Modal, Setting, Notice } from "obsidian";
import { WebRTCManager } from "core/WebRTCManager";

export class PairDeviceModal extends Modal {
  private webrtc: WebRTCManager;
  private deviceId: string;

  constructor(app: any, webrtc: WebRTCManager, deviceId: string) {
    super(app);
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
          .setCta()
          .onClick(async () => {
            const offer = await this.webrtc.createPairingOffer(this.deviceId);
            await navigator.clipboard.writeText(offer);
            new Notice("Pair code copied");
          })
      );

    // paste pair code
    let input = "";

    new Setting(contentEl)
      .setName("Paste Pair Code")
      .addTextArea(text =>
        text.onChange(value => {
          input = value;
        })
      );

    new Setting(contentEl)
      .addButton(btn =>
        btn.setButtonText("Submit")
          .onClick(async () => {
            try {
              const parsed = JSON.parse(input);

              if (parsed.type === "PAIR_OFFER") {
                const answer =
                  await this.webrtc.acceptPairingOffer(this.deviceId, input);

                await navigator.clipboard.writeText(answer);
                new Notice("Answer copied");
              }

              if (parsed.type === "PAIR_ANSWER") {
                await this.webrtc.completePairing(this.deviceId, input);
                new Notice("Pairing complete");
              }

            } catch {
              new Notice("Invalid pairing code");
            }
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}