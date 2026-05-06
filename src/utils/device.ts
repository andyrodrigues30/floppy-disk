import { ThisDevice } from "../types/device";

import { FloppyDiskCrypto } from "../utils/cryptoHelper";

export async function createThisDevice(): Promise<ThisDevice> {

  // generate key pairs
  const signingKeys = await FloppyDiskCrypto.generateSigningKeyPair();
  const encryptionKeys = await FloppyDiskCrypto.generateEncryptionKeyPair();

  // export to JWK (for storage)
  const signingPublicJwk = await FloppyDiskCrypto.exportSigningPublicKey(signingKeys.publicKey);
  const signingPrivateJwk = await FloppyDiskCrypto.exportSigningPrivateKey(signingKeys.privateKey);

  const encryptionPublicJwk = await FloppyDiskCrypto.exportEncryptionPublicKey(encryptionKeys.publicKey);
  const encryptionPrivateJwk = await FloppyDiskCrypto.exportEncryptionPrivateKey(encryptionKeys.privateKey);

  // fingerprint based on public key JWK
  const publicKeyString = JSON.stringify(signingPublicJwk);
  const fingerprint = await FloppyDiskCrypto.computeFingerprint(publicKeyString);


  return {
    id: crypto.randomUUID(),
    name: "This Device",
    publicKey: publicKeyString,
    fingerprint,
    createdAt: Date.now(),
    signingKeyPair: {
      publicKeyJwk: signingPublicJwk,
      privateKeyJwk: signingPrivateJwk,
    },

    encryptionKeyPair: {
      publicKeyJwk: encryptionPublicJwk,
      privateKeyJwk: encryptionPrivateJwk
    }
  };
}