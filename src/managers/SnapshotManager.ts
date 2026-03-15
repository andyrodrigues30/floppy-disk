import { App, TFile } from "obsidian";

import { FloppyDiskSettings } from "types/settings";
import { FileSnapshot, Snapshot } from "types/snapshot";
import { Manifest } from "types/manifest";
import { SyncProgress } from "types/sync";

export class SnapshotManager {
  private app: App
  private snapshot: Snapshot | null = null
  private SNAPSHOT_PATH: string

  private activeSyncs: Set<string> = new Set()
  private deviceProgress: Map<string, SyncProgress> = new Map()
  private lastSynced: Map<string, number> = new Map()

  constructor(app: App, settings: FloppyDiskSettings) {
    this.app = app
    this.SNAPSHOT_PATH = `${this.app.vault.configDir}/snapshot.json`
  }

  private createEmptySnapshot(): Snapshot {
    return {
      version: 1,
      currentDeviceId: undefined,
      files: {}
    }
  }

  public async ensureSnapshotExists(): Promise<Snapshot> {
    await this.loadSnapshot()
    await this.saveSnapshot()
    return this.snapshot as Snapshot
  }

  private isValidSnapshot(obj: unknown): obj is Snapshot {
    if (typeof obj !== "object" || obj === null) return false
    const maybe = obj as Record<string, unknown>
    return maybe.version === 1 && typeof maybe.files === "object"
  }

  public getSnapshot(): Snapshot | null {
    return this.snapshot
  }

  public async loadSnapshot(): Promise<Snapshot> {
    if (this.snapshot) return this.snapshot

    const file = this.app.vault.getAbstractFileByPath(this.SNAPSHOT_PATH)

    if (!(file instanceof TFile)) {
      this.snapshot = this.createEmptySnapshot()
      await this.saveSnapshot()
      return this.snapshot
    }

    try {
      const raw = await this.app.vault.read(file)

      if (!raw.trim()) {
        this.snapshot = this.createEmptySnapshot()
      } else {
        const parsed: unknown = JSON.parse(raw)
        this.snapshot = this.isValidSnapshot(parsed)
          ? parsed
          : this.createEmptySnapshot()
      }
    } catch {
      this.snapshot = this.createEmptySnapshot()
    }

    return this.snapshot
  }

  public async saveSnapshot(): Promise<void> {
    if (!this.snapshot) {
      this.snapshot = this.createEmptySnapshot()
    }

    const content = JSON.stringify(this.snapshot, null, 2)
    const file = this.app.vault.getAbstractFileByPath(this.SNAPSHOT_PATH)

    if (file instanceof TFile) {
      await this.app.vault.modify(file, content)
    } else {
      await this.app.vault.adapter.write(this.SNAPSHOT_PATH, content)
    }
  }

  public async setCurrentDevice(deviceId: string) {
    if (!this.snapshot) {
      this.snapshot = this.createEmptySnapshot()
    }

    this.snapshot.currentDeviceId = deviceId
    await this.saveSnapshot()
  }

  // sync state
  public startDeviceSync(deviceId: string) {
    this.activeSyncs.add(deviceId);
  }

  public pauseDeviceSync(deviceId: string) {
    this.activeSyncs.delete(deviceId);
  }

  public isDeviceSyncing(deviceId: string): boolean {
    return this.activeSyncs.has(deviceId);
  }

  // progress tracking
  public setDeviceProgress(deviceId: string, progress: SyncProgress) {
    this.deviceProgress.set(deviceId, progress)
  }

  public getDeviceProgress(deviceId: string): SyncProgress | undefined {
    return this.deviceProgress.get(deviceId)
  }

  // last synced
  public getLastSynced(deviceId: string): number | undefined {
    return this.lastSynced.get(deviceId)
  }

  private updateLastSynced(deviceId: string) {
    this.lastSynced.set(deviceId, Date.now())
  }

  // sync updates
  public async updateSnapshotAfterSync(
    remoteDeviceId: string,
    finalManifest: Manifest
  ): Promise<Snapshot> {
    const snapshot = await this.loadSnapshot()

    if (!snapshot.currentDeviceId) {
      throw new Error("FloppyDisk: currentDeviceId missing")
    }

    const currentDeviceId = snapshot.currentDeviceId
    const now = Date.now()

    for (const [path, hash] of Object.entries(finalManifest.files)) {
      const fileSnapshot: FileSnapshot = {
        lastSyncedHash: hash,
        lastSyncedTimestamp: now,
        lastSyncedBy: currentDeviceId
      }

      snapshot.files[path] = fileSnapshot
    }

    this.updateLastSynced(remoteDeviceId)

    await this.saveSnapshot()
    return snapshot
  }

  public async updateFileSync(
    filePath: string,
    fileHash: string
  ): Promise<void> {
    const snapshot = await this.loadSnapshot()

    if (!snapshot.currentDeviceId) {
      throw new Error("FloppyDisk: currentDeviceId missing")
    }

    const deviceId = snapshot.currentDeviceId
    const now = Date.now()

    const fileSnapshot: FileSnapshot = {
      lastSyncedHash: fileHash,
      lastSyncedTimestamp: now,
      lastSyncedBy: deviceId
    }

    snapshot.files[filePath] = fileSnapshot

    await this.saveSnapshot()
  }
}