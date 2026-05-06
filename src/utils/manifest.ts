import { App } from "obsidian";

import { Manifest } from "../types/manifest";
import { SnapshotManager } from "../managers/SnapshotManager";
import { FloppyDiskCrypto } from "../utils/cryptoHelper";

export async function generateManifest(
  app: App,
  vaultId: string,
  deviceId: string,
  snapshotManager: SnapshotManager
): Promise<Manifest> {

  const snapshot = await snapshotManager.loadSnapshot();
  const files = app.vault.getFiles();

  const manifest: Manifest = {
    vaultId,
    deviceId,
    generatedAt: Date.now(),
    files: {}
  };

  const results = await Promise.all(
    files
      .filter(file => !shouldExclude(app, file.path))
      .map(async (file) => {

        const buffer = await app.vault.readBinary(file);
        const hash = await FloppyDiskCrypto.computeHash(buffer);

        const existing = snapshot.files[file.path];

        // IMPORTANT:
        // fileId MUST come ONLY from snapshot
        if (!existing?.fileId) {
          throw new Error(
            `Missing fileId for ${file.path}. Snapshot not initialized correctly.`
          );
        }

        return {
          fileId: existing.fileId,
          path: file.path,
          hash
        };
      })
  );

  for (const entry of results) {
    manifest.files[entry.fileId] = {
      fileId: entry.fileId,
      path: entry.path,
      hash: entry.hash
    };
  }

  return manifest;
}

function shouldExclude(app: App, path: string): boolean {
  return (
    path.startsWith(app.vault.configDir) ||
    path.startsWith(".trash/") ||
    path.startsWith(".git/") ||
    path.startsWith(`${app.vault.configDir}/plugins/floppy-disk/`)||
    path.endsWith(".bak") ||
    path.includes(".bak.")
  );
}