export interface StoredKeyPair {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}

export interface DeviceKeys {
  signingKeyPair: CryptoKeyPair;
  encryptionKeyPair: CryptoKeyPair;
}

// local device
export interface ThisDevice {
  id: string;
  name: string;
  fingerprint: string;
  createdAt: number;

  publicKey: string;

  signingKeyPair: StoredKeyPair;
  encryptionKeyPair: StoredKeyPair;
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

// trust status (minimal model)
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
