import { Manifest } from "types/manifest"

export interface BaseMessage {
  type: string
}

export interface RequestManifestMessage extends BaseMessage {
  type: "REQUEST_MANIFEST"
}

export interface ManifestResponseMessage extends BaseMessage {
  type: "MANIFEST_RESPONSE"
  payload: Manifest
}

export interface FileRequestMessage extends BaseMessage {
  type: "FILE_REQUEST"
  path: string
}

export interface FileChunkMessage extends BaseMessage {
  type: "FILE_CHUNK"
  path: string
  chunkIndex: number
  totalChunks: number
  data: ArrayBuffer
}

export interface FileCompleteMessage extends BaseMessage {
  type: "FILE_COMPLETE"
  path: string
}

export interface ConflictNotificationMessage extends BaseMessage {
  type: "CONFLICT"
  path: string
  localHash: string
  remoteHash: string
  baseHash?: string
}

export interface HandshakeMessage extends BaseMessage {
  type: "HANDSHAKE"
  deviceId: string
  publicKey: JsonWebKey
  signature: ArrayBuffer
}

export interface HandshakeAckMessage extends BaseMessage {
  type: "HANDSHAKE_ACK"
  accepted: boolean
}
