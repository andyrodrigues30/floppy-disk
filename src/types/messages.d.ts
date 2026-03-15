import { Manifest } from "types/manifest";

export interface BaseMessage {
  type: string;
}

export interface RequestManifestMessage extends BaseMessage {
  type: "REQUEST_MANIFEST";
}

export interface ManifestResponseMessage extends BaseMessage {
  type: "MANIFEST_RESPONSE";
  payload: Manifest;
}

export interface FileRequestMessage extends BaseMessage {
  type: "FILE_REQUEST";
  path: string;
}

export interface FileChunkMessage extends BaseMessage {
  type: "FILE_CHUNK";
  path: string;
  chunkIndex: number;
  totalChunks: number;
  data: ArrayBuffer;
}

export interface FileCompleteMessage extends BaseMessage {
  type: "FILE_COMPLETE";
  path: string;
}

export interface ConflictNotificationMessage extends BaseMessage {
  type: "CONFLICT";
  path: string;
  localHash: string;
  remoteHash: string;
  baseHash?: string;
}

export interface HandshakeMessage extends BaseMessage {
  type: "HANDSHAKE";
  deviceId: string;
  deviceName?: string;
  publicKey: string;
  fingerprint: string;
  signature: number[];
}

export interface HandshakeAckMessage extends BaseMessage {
  type: "HANDSHAKE_ACK";
  accepted: boolean;
}

export interface OfferSignalMessage extends BaseMessage {
  type: "OFFER";
  deviceId: string;
  payload: RTCSessionDescriptionInit;
}

export interface AnswerSignalMessage extends BaseMessage {
  type: "ANSWER";
  deviceId: string;
  payload: RTCSessionDescriptionInit;
}

export interface IceSignalMessage extends BaseMessage {
  type: "ICE";
  deviceId: string;
  candidate: RTCIceCandidateInit;
}

export type Message =
  | RequestManifestMessage
  | ManifestResponseMessage
  | FileRequestMessage
  | FileChunkMessage
  | FileCompleteMessage
  | ConflictNotificationMessage
  | HandshakeMessage
  | HandshakeAckMessage
  | OfferSignalMessage
  | AnswerSignalMessage
  | IceSignalMessage;