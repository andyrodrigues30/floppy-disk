import FloppyDiskPlugin from "main";

import { PairingOfferMessage, PairingAnswerMessage } from "types/pairing";

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
            answerMsg.publicKey
        );

        // now trigger actual connection
        await this.plugin.webrtcManager.connectToDevice(
            answerMsg.deviceId
        );
    }
}