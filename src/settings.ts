import { FloppyDiskSettings } from "./types/settings";

export const DEFAULT_SETTINGS: FloppyDiskSettings = {
  vaultId: "",
  hostModeEnabled: false,
  devices: {},
  maxBackupsPerFile: 5,
  thisDevice: undefined as any
};