import { App } from "obsidian";
import { FloppyDiskCrypto } from "utils/cryptoHelper";
import { Manifest } from "types/manifest";

export async function generateManifest(
  app: App,
  vaultId: string,
  deviceId: string
): Promise<Manifest> {
  const files = app.vault.getFiles()

  const manifest: Manifest = {
    vaultId,
    deviceId,
    generatedAt: Date.now(),
    files: {}
  }

  const hashPromises = files
    .filter(file => !shouldExclude(app, file.path))
    .map(async (file) => {
      const buffer = await app.vault.readBinary(file)
      const hash = await FloppyDiskCrypto.computeHash(buffer)
      return { path: file.path, hash }
    })

  const results = await Promise.all(hashPromises);

  for (const { path, hash } of results) {
    manifest.files[path] = hash
  }

  return manifest
}


function shouldExclude(app: App, path: string): boolean {
  return (
    path.startsWith(app.vault.configDir) ||
    path.startsWith(".trash/") ||
    path.startsWith(".git/") ||
    path.startsWith(`${app.vault.configDir}/plugins/floppy-disk/`)
  )
}
