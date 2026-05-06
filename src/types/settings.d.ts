import { Device, ThisDevice } from "../types/device";

export interface FloppyDiskSettings {
  devices: Record<string, Device>;
  vaultId: string;
  thisDevice: ThisDevice;
  hostModeEnabled: boolean;
  maxBackupsPerFile: number;
}