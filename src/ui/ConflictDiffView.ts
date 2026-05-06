import {
    ItemView,
    WorkspaceLeaf,
    Setting,
    Notice
} from "obsidian";
import { diffLines } from "diff";

import { FileConflict } from "../types/sync";
import FloppyDiskPlugin from "../main";


export const CONFLICT_DIFF_VIEW_TYPE =
    "floppy-disk-conflict-diff-view";

export class ConflictDiffView extends ItemView {
    private conflict?: FileConflict;
    private deviceId!: string;

    private baseContent = "";
    private localContent = "";
    private remoteContent = "";

    constructor(
        leaf: WorkspaceLeaf,
        private plugin: FloppyDiskPlugin
    ) {
        super(leaf);
    }

    getViewType() { return CONFLICT_DIFF_VIEW_TYPE; }

    getDisplayText() { return "Conflict resolution"; }

    getIcon() { return "alert-triangle"; }

    async setConflict(
        deviceId: string,
        conflict: FileConflict,
        baseContent: string,
        localContent: string,
        remoteContent: string
    ) {
        this.deviceId = deviceId;
        this.conflict = conflict;

        this.baseContent = baseContent;
        this.localContent = localContent;
        this.remoteContent = remoteContent;

        this.plugin.syncProgress.currentConflict = conflict;

        await this.render();
    }

    async onOpen() {
        await this.render();
    }

    async render() {
        const { contentEl } = this;
        contentEl.empty();

        if (!this.conflict) {
            contentEl.createEl("p", { text: "No conflict selected." });
            return;
        }

        contentEl.createEl("h2", { text: "Resolve conflict" });
        contentEl.createEl("h3", { text: this.conflict.path });

        // Three-way diff sections
        this.renderDiffSection(
            contentEl,
            "Base → Local",
            this.baseContent,
            this.localContent
        );

        this.renderDiffSection(
            contentEl,
            "Base → Remote",
            this.baseContent,
            this.remoteContent
        );

        const container = contentEl.createDiv();

        new Setting(container)
            .addButton(btn =>
                btn
                    .setButtonText("Keep local")
                    .setCta()
                    .onClick(() => this.resolve("local"))
            )
            .addButton(btn =>
                btn
                    .setButtonText("Keep remote")
                    .setCta()
                    .onClick(() => this.resolve("remote"))
            );
    }

    private renderDiffSection(
        parent: HTMLElement,
        title: string,
        oldText: string,
        newText: string
    ) {
        parent.createEl("h4", { text: title });

        const diff = diffLines(oldText || "", newText || "");

        const container = parent.createDiv({ cls: "diff-container" });

        for (const part of diff) {
            const lineEl = container.createEl("pre");

            if (part.added) {
                lineEl.addClass("diff-added");
            } else if (part.removed) {
                lineEl.addClass("diff-removed");
            }

            lineEl.setText(part.value);
        }
    }

    private async resolve(choice: "local" | "remote") {
        if (!this.conflict) return;

        try {
            await this.plugin.syncManager.resolveConflict(
                this.deviceId,
                this.conflict.path,
                choice
            );

            new Notice("Conflict resolved.");

            this.plugin.syncProgress.currentConflict = undefined;

            this.leaf.detach();
        } catch (err) {
            console.error(err);
            new Notice("Failed to resolve conflict.");
        }
    }
}