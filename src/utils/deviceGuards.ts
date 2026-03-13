import { Device, RevokedDevice, TrustedDevice } from "types/device";

export function isTrustedDevice(device: Device): device is TrustedDevice {
    return device.trustStatus === "trusted";
}

export function isRevokedDevice(device: Device): device is RevokedDevice {
    return device.trustStatus === "revoked";
}