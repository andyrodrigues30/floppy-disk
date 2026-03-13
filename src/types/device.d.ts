export interface DeviceKeys {
  signingKeyPair: CryptoKeyPair;
  encryptionKeyPair: CryptoKeyPair;
}

// Local device
export interface ThisDevice extends DeviceKeys {
  readonly id: string;
  publicKey: string;
  fingerprint: string;
  name?: string;
  readonly createdAt?: number;
  privateKey?: CryptoKey;
}

// Base remote device
export interface BaseDevice {
  readonly id: string;
  publicKey: string;
  readonly fingerprint: string;
  readonly addedAt: number;
  name?: string;
  lastSeen?: number;
}

// Trust status (minimal model)
export type DeviceTrustStatus =
  | "trusted"
  | "revoked";

export interface TrustedDevice extends BaseDevice {
  trustStatus: "trusted";
}

export interface RevokedDevice extends BaseDevice {
  trustStatus: "revoked";
}

export type Device = TrustedDevice | RevokedDevice;

export interface RemoteDevice {
  device: Device;
  connection: RTCPeerConnection;
  channel: RTCDataChannel;
}