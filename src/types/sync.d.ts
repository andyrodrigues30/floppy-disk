export interface SyncAction {
  path: string;
  fileId: string;
  action: "upload" | "download" | "delete" | "skip";
  localHash?: string;
  remoteHash?: string;
  baseHash?: string;
}

export interface SyncPlan {
  uploads: SyncAction[];
  downloads: SyncAction[];
  deletes: SyncAction[];
  conflicts: FileConflict[];
  renames: RenameAction[];
}

export type SyncPhase =
  | "idle"
  | "handshake"
  | "comparing"
  | "uploading"
  | "downloading"
  | "conflict"
  | "complete"
  | "error";

export interface SyncProgress {
  phase: SyncPhase;
  totalFiles: number;
  processedFiles: number;
  currentFile?: string;
  uploads: string[];
  downloads: string[];
  conflicts: FileConflict[];
  currentConflict?: FileConflict;
}

export interface DeviceActivity {
  uploads: string[];
  downloads: string[];
  conflicts: string[];
}

export interface FileConflict {
  path: string;
  localHash: string;
  remoteHash: string;
  baseHash?: string;
}

export interface RenameAction {
  fileId: string;
  oldPath: string;
  newPath: string;
}