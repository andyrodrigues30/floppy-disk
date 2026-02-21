import { App, TFile } from "obsidian"
import getDefaultDeviceName from "utils/device"
import { FloppyDiskSettings } from "types/settings"
import { Snapshot } from "types/snapshot"
import { Manifest } from "types/manifest"

export class SnapshotManager {
    private app: App
    private settings: FloppyDiskSettings
    private snapshot: Snapshot | null = null
    private SNAPSHOT_PATH: string

    constructor(app: App, settings: FloppyDiskSettings) {
        this.app = app
        this.settings = settings
        this.SNAPSHOT_PATH = `${this.app.vault.configDir}/snapshot.json`
    }

    // initialisation
    private createEmptySnapshot(): Snapshot {
        return {
            version: 1,
            devices: {},
            currentDeviceId: undefined
        }
    }

    public async ensureSnapshotExists(): Promise<Snapshot> {
        // await this.ensureFolderExists()
        await this.loadSnapshot()
        await this.saveSnapshot()
        return this.snapshot as Snapshot
    }

    private isValidSnapshot(obj: unknown): obj is Snapshot {
        if (typeof obj !== "object" || obj === null) return false
        const maybe = obj as Record<string, unknown>
        return maybe.version === 1 && typeof maybe.devices === "object"
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
            await this.registerCurrentDevice()
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

        await this.registerCurrentDevice()
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

    // device registration
    public async registerCurrentDevice(userProvidedName?: string): Promise<void> {
        if (!this.settings.deviceId) {
            throw new Error("FloppyDisk: deviceId not initialised in settings")
        }

        if (!this.snapshot) {
            this.snapshot = this.createEmptySnapshot()
        }

        const deviceId = this.settings.deviceId
        const now = Date.now()
        const existingDevice = this.snapshot.devices[deviceId]

        const defaultName = getDefaultDeviceName()
        const finalName =
            userProvidedName?.trim() ||
            this.settings.deviceName?.trim() ||
            defaultName

        this.snapshot.currentDeviceId = deviceId

        this.snapshot.devices[deviceId] = {
            deviceId,
            name: finalName,
            lastSeen: now,
            lastSyncedAt: existingDevice?.lastSyncedAt ?? 0,
            files: existingDevice?.files ?? {}
        }

        await this.saveSnapshot()
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

        if (!snapshot.devices[remoteDeviceId]) {
            snapshot.devices[remoteDeviceId] = {
                deviceId: remoteDeviceId,
                name: undefined,
                lastSeen: now,
                lastSyncedAt: now,
                files: {}
            }
        }

        const deviceSnapshot = snapshot.devices[remoteDeviceId]
        deviceSnapshot.lastSyncedAt = now
        deviceSnapshot.files = {}

        for (const [path, hash] of Object.entries(finalManifest.files)) {
            deviceSnapshot.files[path] = {
                lastSyncedHash: hash,
                lastSyncedTimestamp: now,
                lastSyncedBy: currentDeviceId
            }
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

        if (!snapshot.devices[deviceId]) {
            await this.registerCurrentDevice()
        }

        const deviceSnapshot = snapshot.devices[deviceId]

        if (!deviceSnapshot) {
            throw new Error("FloppyDisk: Failed to initialise current device snapshot")
        }


        deviceSnapshot.files[filePath] = {
            lastSyncedHash: fileHash,
            lastSyncedTimestamp: now,
            lastSyncedBy: deviceId
        }

        deviceSnapshot.lastSyncedAt = now

        await this.saveSnapshot()
    }
}