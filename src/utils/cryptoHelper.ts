import { DeviceKeys } from "types/device";

export class FloppyDiskCrypto {
  // signing key pair (ECDSA) - for handshakes and identity
  public static async generateSigningKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true,
      ["sign", "verify"]
    );
  }

  public static async signData(privateKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
    return crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      data
    );
  }
  
  // encryption key pair (RSA-OAEP) - optional file/message encryption
  public static async generateEncryptionKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );
  }

  public static async encryptData(publicKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
    return crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      data
    );
  }

  public static async decryptData(privateKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
    return crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      data
    );
  }

  // generate both signing and encryption key pairs for a device
  public static async generateDeviceKeys(): Promise<DeviceKeys> {
    const signingKeyPair = await this.generateSigningKeyPair();
    const encryptionKeyPair = await this.generateEncryptionKeyPair();
    return { signingKeyPair, encryptionKeyPair };
  }

  // convert ArrayBuffer to hex string
  public static arrayBufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // compute SHA-256 hash of ArrayBuffer and return hex string
  public static async computeHash(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return this.arrayBufferToHex(digest);
  }

  // compute a short fingerprint (16 hex chars) from a public key string
  public static async computeFingerprint(publicKey: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(publicKey);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return this.arrayBufferToHex(hash).slice(0, 16);
  }

  // convert CryptoKey to JsonWebKey
  public static async computeExportedKey(publicKey: CryptoKey): Promise<JsonWebKey> {
    const exportedPublicKey = await crypto.subtle.exportKey("jwk", publicKey);
    return exportedPublicKey;
  }
}