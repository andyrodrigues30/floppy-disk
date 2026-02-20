import { BaseMessage, ConflictNotificationMessage, FileChunkMessage, FileCompleteMessage, FileRequestMessage, HandshakeAckMessage, HandshakeMessage, ManifestResponseMessage, RequestManifestMessage } from "types/messages";

export function isRequestManifestMessage(obj: unknown): obj is RequestManifestMessage {
    return typeof obj === "object" && obj !== null && (obj as BaseMessage).type === "REQUEST_MANIFEST"
}

export function isManifestResponseMessage(obj: unknown): obj is ManifestResponseMessage {
    return (
        typeof obj === "object" &&
        obj !== null &&
        (obj as BaseMessage).type === "MANIFEST_RESPONSE" &&
        typeof (obj as ManifestResponseMessage).payload === "object"
    )
}

export function isFileRequestMessage(obj: unknown): obj is FileRequestMessage {
    return (
        typeof obj === "object" &&
        obj !== null &&
        (obj as BaseMessage).type === "FILE_REQUEST" &&
        typeof (obj as FileRequestMessage).path === "string"
    )
}

export function isFileChunkMessage(obj: unknown): obj is FileChunkMessage {
    if (typeof obj !== "object" || obj === null) return false;

    const maybe = obj as Partial<FileChunkMessage>;

    return maybe.type === "FILE_CHUNK" &&
        typeof maybe.path === "string" &&
        typeof maybe.chunkIndex === "number" &&
        typeof maybe.totalChunks === "number" &&
        maybe.data instanceof ArrayBuffer;
}


export function isFileCompleteMessage(obj: unknown): obj is FileCompleteMessage {
    return typeof obj === "object" &&
        obj !== null &&
        (obj as BaseMessage).type === "FILE_COMPLETE" &&
        typeof (obj as FileCompleteMessage).path === "string"
}

export function isConflictNotificationMessage(obj: unknown): obj is ConflictNotificationMessage {
    return (
        typeof obj === "object" &&
        obj !== null &&
        (obj as BaseMessage).type === "CONFLICT" &&
        typeof (obj as ConflictNotificationMessage).path === "string" &&
        typeof (obj as ConflictNotificationMessage).localHash === "string" &&
        typeof (obj as ConflictNotificationMessage).remoteHash === "string"
    )
}

export function isHandshakeMessage(obj: unknown): obj is HandshakeMessage {
    return (
        typeof obj === "object" &&
        obj !== null &&
        (obj as BaseMessage).type === "HANDSHAKE" &&
        typeof (obj as HandshakeMessage).deviceId === "string" &&
        typeof (obj as HandshakeMessage).publicKey === "object" &&
        (obj as HandshakeMessage).signature instanceof ArrayBuffer
    )
}

export function isHandshakeAckMessage(obj: unknown): obj is HandshakeAckMessage {
    return (
        typeof obj === "object" &&
        obj !== null &&
        (obj as BaseMessage).type === "HANDSHAKE_ACK" &&
        typeof (obj as HandshakeAckMessage).accepted === "boolean"
    )
}