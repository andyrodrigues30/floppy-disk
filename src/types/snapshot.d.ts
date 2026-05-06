export interface Snapshot {
    version: number;
    currentDeviceId?: string;
    files: Record<string, FileSnapshot>;
    pathIndex: Record<string, string>
}

export interface FileSnapshot {
  fileId: string;
  lastSyncedHash: string;
  lastSyncedTimestamp: number;
  lastSyncedBy?: string;
}
