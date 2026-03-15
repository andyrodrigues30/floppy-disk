import FloppyDiskPlugin from "main";

import { PairingOfferMessage, PairingAnswerMessage } from "types/pairing";

export class PairingManager {
    private plugin: FloppyDiskPlugin;

    constructor(plugin: FloppyDiskPlugin) {
        this.plugin = plugin;
    }

    // create pairing offer
    public async createOffer(): Promise<string> {
        const peer = new RTCPeerConnection();
        peer.createDataChannel("pairing");

        const sessionId = crypto.randomUUID();

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        const device = this.plugin.settings.thisDevice;

        const message: PairingOfferMessage = {
            type: "PAIR_OFFER",
            sessionId,
            deviceId: device.id,
            deviceName: device.name,
            publicKey: device.publicKey,
            fingerprint: device.fingerprint,
            offer: {
                type: offer.type,
                sdp: offer.sdp ?? "",
            },
        };

        return JSON.stringify(message);
    }

    // accept pairing offer
    public async acceptOffer(
        offerMsg: PairingOfferMessage
    ): Promise<string> {
        const peer = new RTCPeerConnection();

        await peer.setRemoteDescription({
            type: offerMsg.offer.type,
            sdp: offerMsg.offer.sdp,
        });

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        const device = this.plugin.settings.thisDevice;

        // trust remote device immediately after acceptance
        await this.plugin.deviceManager.trustDevice(
            offerMsg.deviceId,
            offerMsg.deviceName ?? offerMsg.deviceId,
            offerMsg.publicKey
        );

        const answerMsg: PairingAnswerMessage = {
            type: "PAIR_ANSWER",
            sessionId: offerMsg.sessionId,
            deviceId: device.id,
            deviceName: device.name,
            publicKey: device.publicKey,
            fingerprint: device.fingerprint,
            answer: {
                type: answer.type,
                sdp: answer.sdp ?? "",
            },
        };

        return JSON.stringify(answerMsg);
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