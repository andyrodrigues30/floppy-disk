import { Modal, App, Setting } from "obsidian";

import { FileConflict } from "types/sync";

import FloppyDiskPlugin from "main";

export class ConflictModal extends Modal {
  constructor(
    app: App,
    private plugin: FloppyDiskPlugin,
    private deviceId: string,
    private conflict: FileConflict,
    private onResolve: () => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Resolve Conflict" });

    contentEl.createEl("p", { text: this.conflict.path });

    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText("Keep Local")
          .setCta()
          .onClick(async () => {
            await this.plugin.syncManager.resolveConflict(
              this.deviceId,
              this.conflict.path,
              "local"
            );
            this.close();
            this.onResolve();
          })
      )
      .addButton(btn =>
        btn
          .setButtonText("Keep Remote")
          .setCta()
          .onClick(async () => {
            await this.plugin.syncManager.resolveConflict(
              this.deviceId,
              this.conflict.path,
              "remote"
            );
            this.close();
            this.onResolve();
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}