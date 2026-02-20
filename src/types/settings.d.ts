import { Device, ThisDevice } from "types/device"

// plugin settings
export interface FloppyDiskSettings {
  devices: Device[];
  vaultId: string
  deviceId: string
  deviceName?: string
  thisDevice: ThisDevice;
  hostModeEnabled: boolean
  trustedDevices: Record<string, Device>
  maxBackupsPerFile: number
}