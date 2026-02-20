export interface Snapshot {
  version: 1
  devices: Record<string, DeviceSnapshot>
  currentDeviceId?: string
}

export interface DeviceSnapshot {
  deviceId: string
  name?: string
  lastSeen: number
  lastSyncedAt: number
  files: Record<string, SnapshotEntry>
  publicKey?: JsonWebKey
}

export interface SnapshotEntry {
  lastSyncedHash: string
  lastSyncedTimestamp: number
  lastSyncedBy?: string
}