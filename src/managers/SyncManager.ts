import { App, Notice } from "obsidian";

import { Manifest } from "../types/manifest";
import { SyncPlan } from "../types/sync";

import FloppyDiskPlugin from "../main";

import { createSyncPlan, executeSync } from "../utils/sync";

export class SyncManager {
	private app: App;
	private plugin: FloppyDiskPlugin;
	private pausedDevices = new Set<string>();
	private activeSyncDeviceId: string | null = null;

	constructor(app: App, plugin: FloppyDiskPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	async syncDevice(remoteDeviceId: string): Promise<void> {
		try {
			// load snapshot (base state)
			const snapshot = await this.plugin.snapshotManager.loadSnapshot();

			// handshake
			await this.plugin.webrtcManager.startHandshake(remoteDeviceId);

			// exchange manifests
			const remoteManifest: Manifest =
				await this.plugin.webrtcManager.requestRemoteManifest(
					remoteDeviceId,
				);

			const localManifest: Manifest =
				await this.plugin.webrtcManager.generateLocalManifest();

			// create sync plan (three-way merge)
			const plan: SyncPlan = createSyncPlan(
				localManifest,
				remoteManifest,
				snapshot,
			);

			// detect conflicts from plan
			const conflicts = plan.conflicts;

			if (conflicts.length > 0) {
				this.plugin.syncProgress.conflicts = conflicts;

				this.updateProgress(remoteDeviceId, {
					phase: "conflict",
					conflicts: plan.conflicts,
				});

				new Notice(
					`Sync paused: ${conflicts.length} conflict(s) detected.`,
				);

				return; // STOP sync until user resolves
			}

			// execute sync actions
			await executeSync(
				this.app,
				this.plugin.webrtcManager,
				this.plugin.snapshotManager,
				plan,
				remoteDeviceId,
				(update) => {
					Object.assign(this.plugin.syncProgress, update);
				},
			);

			// update snapshot after successful sync
			await this.plugin.snapshotManager.updateSnapshotAfterSync(
				remoteDeviceId,
				localManifest,
			);

			this.updateProgress(remoteDeviceId, {
				phase: "complete",
				currentFile: undefined,
			});

			new Notice("Sync completed successfully.");
		} catch (err) {
			console.error(err);
			new Notice("Sync failed.");
		} finally {
			this.plugin.syncProgress.phase = "idle";
			this.plugin.snapshotManager.finishDeviceSync(remoteDeviceId);
		}
	}

	public pauseDeviceSync(id: string): void {
		if (this.activeSyncDeviceId === id) {
			this.activeSyncDeviceId = null;
		}

		this.pausedDevices.add(id);

		const progress = this.plugin.syncProgress;
		progress.phase = "idle";
		progress.currentFile = undefined;

		this.plugin.snapshotManager.pauseDeviceSync(id);
	}

	public async startDeviceSync(id: string): Promise<void> {
		// already syncing another device
		if (this.activeSyncDeviceId && this.activeSyncDeviceId !== id) {
			new Notice(`Already syncing with ${this.activeSyncDeviceId}`);
			return;
		}

		this.activeSyncDeviceId = id;

		const progress = this.plugin.syncProgress;

		if (progress.conflicts.length > 0) {
			progress.phase = "conflict";
			return;
		}

		progress.phase = "comparing";

		this.plugin.snapshotManager.startDeviceSync(id);

		await this.syncDevice(id);

		this.activeSyncDeviceId = null;
	}

	private updateProgress(deviceId: string, update: Partial<SyncProgress>) {
		const current = this.plugin.syncProgress;

		Object.assign(current, update);

		this.plugin.snapshotManager.setDeviceProgress(deviceId, current);
	}

	public async resolveConflict(
		remoteDeviceId: string,
		path: string,
		choice: "local" | "remote",
	): Promise<void> {
		const progress = this.plugin.syncProgress;

		const conflict = progress.conflicts.find((c) => c.path === path);
		if (!conflict) return;

		progress.phase = "conflict";
		progress.currentFile = path;

		if (choice === "local") {
			await this.plugin.webrtcManager.sendFileInChunks(
				remoteDeviceId,
				path,
			);
		} else {
			await this.plugin.webrtcManager.requestFile(remoteDeviceId, path);
		}

		// remove conflict
		progress.conflicts = progress.conflicts.filter((c) => c.path !== path);

		// if no conflicts remain AND device is not paused - resume
		if (
			progress.conflicts.length === 0 &&
			!this.pausedDevices.has(remoteDeviceId)
		) {
			progress.phase = "comparing";
			await this.syncDevice(remoteDeviceId);
		}
	}
}
