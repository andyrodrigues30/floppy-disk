import { Device, PendingIncomingDevice, PendingOutgoingDevice, RevokedDevice, TrustedDevice } from "types/device";

export function isPendingDevice(device: Device): device is PendingIncomingDevice | PendingOutgoingDevice {
    return device.trustStatus === "pending-incoming" || device.trustStatus === "pending-outgoing";
}

export function isTrustedDevice(device: Device): device is TrustedDevice {
    return device.trustStatus === "trusted";
}

export function isRevokedDevice(device: Device): device is RevokedDevice {
    return device.trustStatus === "revoked";
}