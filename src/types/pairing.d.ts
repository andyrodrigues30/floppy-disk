export interface RTCSessionPayload {
  type: "offer" | "answer";
  sdp: string;
}

export interface PairingOfferMessage {
  type: "PAIR_OFFER";
  offer: RTCSessionPayload;
}

export interface PairingAnswerMessage {
  type: "PAIR_ANSWER";
  answer: RTCSessionPayload;
}

export type PairingMessage =
  | PairingOfferMessage
  | PairingAnswerMessage;