export interface Manifest {
  vaultId: string
  deviceId: string
  generatedAt: number
  files: Record<string, string>
}
