export interface SyncAction {
  path: string
  action: "upload" | "download" | "conflict" | "skip"
  localHash?: string
  remoteHash?: string
  baseHash?: string
}

export interface SyncPlan {
  uploads: SyncAction[]
  downloads: SyncAction[]
  deletes: SyncAction[]
  conflicts: SyncAction[]
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
  conflicts: string[];
}