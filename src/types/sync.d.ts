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