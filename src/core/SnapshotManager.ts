import { App, TFile } from "obsidian"
import getDefaultDeviceName from "utils/device"
import { FloppyDiskSettings } from "types/settings"
import { FileSnapshot, Snapshot } from "types/snapshot"
import { Manifest } from "types/manifest"

export class SnapshotManager {
    private app: App
    private snapshot: Snapshot | null = null
    private SNAPSHOT_PATH: string

    constructor(app: App, settings: FloppyDiskSettings) {
        this.app = app
        this.SNAPSHOT_PATH = `${this.app.vault.configDir}/snapshot.json`
    }

    // initialisation
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

    // loading/saving
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

    // device context
    public setCurrentDevice(deviceId: string): void {
        if (!this.snapshot) {
            this.snapshot = this.createEmptySnapshot()
        }

        this.snapshot.currentDeviceId = deviceId
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