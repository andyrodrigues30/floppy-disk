export interface Snapshot {
    version: number;
    currentDeviceId?: string;
    files: Record<string, FileSnapshot>;
}

export interface FileSnapshot {
  lastSyncedHash: string;
  lastSyncedTimestamp: number;
  lastSyncedBy?: string;
}