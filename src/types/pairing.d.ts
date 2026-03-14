export interface RTCSessionPayload {
  type: RTCSdpType;
  sdp: string;
}

export interface PairingOfferMessage {
  type: "PAIR_OFFER";
  sessionId: string;
  deviceId: string;
  deviceName?: string;
  publicKey: string;
  fingerprint: string;
  offer: RTCSessionPayload;
}

export interface PairingAnswerMessage {
  type: "PAIR_ANSWER";
  sessionId: string;
  deviceId: string;
  deviceName?: string;
  publicKey: string;
  fingerprint: string;
  answer: RTCSessionPayload;
}

export type PairingMessage =
  | PairingOfferMessage
  | PairingAnswerMessage;