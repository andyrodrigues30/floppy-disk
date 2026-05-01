import { PairingAnswerMessage } from "../types/pairing";

import FloppyDiskPlugin from "../main";

export class PairingManager {
    private plugin: FloppyDiskPlugin;

    constructor(plugin: FloppyDiskPlugin) {
        this.plugin = plugin;
    }

    // complete pairing after answer received
    public async completePairing(
        answerMsg: PairingAnswerMessage
    ): Promise<void> {
        await this.plugin.deviceManager.trustDevice(
            answerMsg.deviceId,
            answerMsg.deviceName ?? answerMsg.deviceId,
            answerMsg.publicKey,
            answerMsg.fingerprint
        );

        await this.plugin.saveSettings();
    }
}