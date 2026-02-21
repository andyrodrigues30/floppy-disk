// TODO: #14 - sync panel

import { ItemView, WorkspaceLeaf } from "obsidian";
import FloppyDiskPlugin from "main";

export const SYNC_VIEW_TYPE = "floppy-disk-sync-view";

export class SyncView extends ItemView {
  plugin: FloppyDiskPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: FloppyDiskPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return SYNC_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Floppy disk sync";
  }

  getIcon(): string {
    return "refresh-cw";
  }

  async onOpen(): Promise<void> {
    // this.plugin.onSyncUpdate(() => this.render());
    this.render();
  }

  async onClose(): Promise<void> {
    // optional: remove listeners if you add unsubscribe logic
  }

  render(): void {
    const { contentEl } = this;
    contentEl.empty();

    const progress = this.plugin.syncProgress;

    contentEl.createEl("h2", { text: "Sync status" });

    // Phase
    contentEl.createEl("div", {
      text: `Phase: ${progress.phase}`,
      cls: "sync-phase",
    });

    // Progress Bar
    const percent =
      progress.totalFiles === 0
        ? 0
        : Math.round(
            (progress.processedFiles / progress.totalFiles) * 100
          );

    const barContainer = contentEl.createDiv("sync-bar-container");
    const bar = barContainer.createDiv("sync-bar");
    bar.style.width = `${percent}%`;

    contentEl.createEl("div", {
      text: `${progress.processedFiles} / ${progress.totalFiles} files (${percent}%)`,
      cls: "sync-progress-text",
    });

    // Current file
    if (progress.currentFile) {
      contentEl.createEl("div", {
        text: `Current: ${progress.currentFile}`,
        cls: "sync-current-file",
      });
    }

    // Change Lists
    this.renderFileList(contentEl, "Uploads", progress.uploads);
    this.renderFileList(contentEl, "Downloads", progress.downloads);
    this.renderFileList(contentEl, "Conflicts", progress.conflicts);
  }

  private renderFileList(
    container: HTMLElement,
    title: string,
    files: string[]
  ): void {
    if (!files.length) return;

    container.createEl("h3", { text: title });

    const list = container.createEl("ul");
    for (const file of files) {
      list.createEl("li", { text: file });
    }
  }
}