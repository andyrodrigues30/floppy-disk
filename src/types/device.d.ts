export interface DeviceKeys {
  signingKeyPair: CryptoKeyPair;      // ECDSA keys for signing/verification
  encryptionKeyPair: CryptoKeyPair;   // RSA-OAEP keys for encrypt/decrypt
}

// this device (local device)
export interface ThisDevice extends DeviceKeys {
  readonly id: string;
  publicKey: string; // base64 (main public key for display / fingerprint)
  fingerprint: string; // short hash of public key
  name?: string;
  readonly createdAt?: number;
  privateKey?: CryptoKey; // optional in memory
}

// base device for all remote devices
export interface BaseDevice {
  readonly id: string;
  readonly publicKey: string;
  readonly fingerprint: string;
  readonly addedAt: number;
  name?: string;
  lastSeen?: number;
}

export type Device =
  | PendingIncomingDevice
  | PendingOutgoingDevice
  | TrustedDevice
  | RevokedDevice;

export interface RemoteDevice {
  device: Device;
  connection: RTCPeerConnection;
  channel: RTCDataChannel;
}

// trust state for devices
export type DeviceTrustStatus =
  | "pending-incoming"
  | "pending-outgoing"
  | "trusted"
  | "revoked";

// discriminated union for trust states
export interface PendingIncomingDevice extends BaseDevice {
  trustStatus: "pending-incoming";
}

export interface PendingOutgoingDevice extends BaseDevice {
  trustStatus: "pending-outgoing";
}

export interface TrustedDevice extends BaseDevice {
  trustStatus: "trusted";
}

export interface RevokedDevice extends BaseDevice {
  trustStatus: "revoked";
}