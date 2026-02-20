import { Notice, Plugin } from "obsidian";

export default class FloppyDiskPlugin extends Plugin {

  async onload() {
    new Notice("Floppy disk plugin loaded");
  }
  
  onunload() {
    new Notice("Floppy disk plugin unloaded");
  }
}
