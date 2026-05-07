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

        // ensure file has fileId
        let fileId = snapshot.pathIndex?.[file.path];

        if (!fileId) {
          fileId = crypto.randomUUID();

          snapshot.pathIndex ??= {};
          snapshot.pathIndex[file.path] = fileId;

          const stat = await app.vault.adapter.stat(file.path);

          snapshot.files[fileId] = {
            fileId,

            lastSyncedHash: "",
            lastSyncedTimestamp: 0,
            lastSyncedBy: deviceId ?? "",

            currentHash: "",
            modifiedTime: stat?.mtime ?? Date.now()
          };

          await snapshotManager.saveSnapshot();
        }

        const existing = snapshot.files[fileId];

        if (!existing) {
          throw new Error(
            `Missing snapshot entry for ${file.path}`
          );
        }

        // read file
        const buffer =
          await app.vault.readBinary(file);

        // hash content
        const hash =
          await FloppyDiskCrypto.computeHash(buffer);

        // filesystem metadata
        const stat =
          await app.vault.adapter.stat(file.path);

        if (!stat) {
          throw new Error(
            `Failed to stat ${file.path}`
          );
        }

        return {
          fileId,
          path: file.path,
          hash,
          modified:
            stat.mtime ??
            existing.modifiedTime ??
            Date.now(),
          deviceId
        };
      })
  );

  // build manifest map
  for (const entry of results) {
    manifest.files[entry.fileId] = {
      fileId: entry.fileId,
      path: entry.path,
      hash: entry.hash,
      modified: entry.modified,
      deviceId: entry.deviceId
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