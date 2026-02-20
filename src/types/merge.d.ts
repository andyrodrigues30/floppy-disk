export interface MergeInput {
  path: string
  base: string
  local: string
  remote: string
}

export interface MergeResult {
  path: string
  mergedText: string
  hasConflicts: boolean
}
