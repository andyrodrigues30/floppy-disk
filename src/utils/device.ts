import { Platform } from "obsidian"
import { ThisDevice } from "types/device";
import { DeviceKeys } from "types/device";
import { FloppyDiskCrypto } from "utils/cryptoHelper";

// create the local device with keys
export async function createThisDevice(): Promise<ThisDevice> {
  // generate signing + encryption key pairs
  const keys: DeviceKeys = await FloppyDiskCrypto.generateDeviceKeys();

  // export public key to base64 for fingerprint / display
  const exportedPublicKey = await FloppyDiskCrypto.computeExportedKey(keys.signingKeyPair.publicKey);

  const publicKeyBase64 = btoa(JSON.stringify(exportedPublicKey));

  // compute short fingerprint
  const fingerprint = await FloppyDiskCrypto.computeFingerprint(publicKeyBase64);

  return {
    id: crypto.randomUUID(),
    name: "This Device",
    publicKey: publicKeyBase64,
    fingerprint,
    createdAt: Date.now(),
    signingKeyPair: keys.signingKeyPair,
    encryptionKeyPair: keys.encryptionKeyPair,
    privateKey: keys.signingKeyPair.privateKey,
  };
}

export default function getDefaultDeviceName():string {
    if (Platform.isMobile) return "Mobile Device"
    if (Platform.isMacOS) return "Mac"
    if (Platform.isWin) return "Windows PC"
    if (Platform.isLinux) return "Linux PC"
    return "Unknown Device"
}
