export interface Snapshot {
  version: 1;
  devices: Record<string, DeviceSnapshot>;
  currentDeviceId?: string;
}

export interface DeviceSnapshot {
  id: string;
  name?: string;

  publicKey: string;
  fingerprint: string;

  trustStatus: "trusted" | "revoked";

  addedAt: number;
  lastSeen: number;

  lastSyncedAt: number;

  files: Record<string, SnapshotEntry>;
}

export interface SnapshotEntry {
  lastSyncedHash: string;
  lastSyncedTimestamp: number;
  lastSyncedBy?: string;
}