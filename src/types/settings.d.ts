import { Device, ThisDevice } from "types/device"

// plugin settings
export interface FloppyDiskSettings {
  devices: Record<string, Device>;
  vaultId: string;
  deviceId: string;
  deviceName?: string;
  thisDevice: ThisDevice;
  hostModeEnabled: boolean;
  maxBackupsPerFile: number;
}