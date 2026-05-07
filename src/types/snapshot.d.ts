export interface Snapshot {
    version: number;
    currentDeviceId?: string;
    files: Record<string, FileSnapshot>;
    pathIndex: Record<string, string>
}

export interface FileSnapshot {
  fileId: string;

  // current known state
  currentHash: string;
  modifiedTime: number;

  // last successful sync state
  lastSyncedHash: string;
  lastSyncedTimestamp: number;

  lastSyncedBy?: string;
}