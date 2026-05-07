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

        const fileId = snapshot.pathIndex[file.path];

        if (!fileId) {
          throw new Error(`Missing fileId for ${file.path}`);
        }

        const existing = snapshot.files[fileId];

        // fileId MUST come ONLY from snapshot
        if (!existing?.fileId) {
          throw new Error(
            `Missing fileId for ${file.path}. Snapshot not initialized correctly.`
          );
        }

        const stat = await app.vault.adapter.stat(file.path);

        if (!stat) {
          throw new Error(`Failed to stat ${file.path}`);
        }

        return {
          fileId: existing.fileId,
          path: file.path,
          hash,
          modified: stat.mtime,
          deviceId
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
    path.startsWith(`${app.vault.configDir}/plugins/floppy-disk/`) ||
    path.endsWith(".bak") ||
    path.includes(".bak.")
  );
}