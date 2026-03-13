export interface RTCSessionPayload {
  type: "offer" | "answer";
  sdp: string;
}

export interface PairingOfferMessage {
  type: "PAIR_OFFER";
  sessionId: string;
  offer: RTCSessionPayload;
}

export interface PairingAnswerMessage {
  type: "PAIR_ANSWER";
  sessionId: string;
  answer: RTCSessionPayload;
}

export type PairingMessage =
  | PairingOfferMessage
  | PairingAnswerMessage;