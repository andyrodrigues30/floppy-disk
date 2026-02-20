import { FloppyDiskSettings } from "types/settings";
import { TrustedDevice } from "types/device";

export const DEFAULT_SETTINGS: Omit<FloppyDiskSettings, "thisDevice"> = {
  vaultId: "",
  deviceId: "",
  deviceName: undefined,
  hostModeEnabled: false,
  trustedDevices: {} as Record<string, TrustedDevice>,
  maxBackupsPerFile: 5,
  devices: []
};