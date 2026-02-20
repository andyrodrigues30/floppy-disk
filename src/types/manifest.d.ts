export type FileHashMap = Record<string, string>;

export interface Manifest {
  vaultId: string
  deviceId: string
  generatedAt: number
  files: FileHashMap
}