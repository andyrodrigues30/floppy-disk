export interface ManifestFileEntry {
  fileId: string;
  path: string;
  hash: string;
  modified: number;
  deviceId: string;
}

export type ManifestFileMap = Record<string, ManifestFileEntry>;

export interface Manifest {
  vaultId: string;
  deviceId: string;
  generatedAt: number;
  files: ManifestFileMap;
}
