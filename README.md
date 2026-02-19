# Floppy Disk
> An Obsidian plugin allowing you to sync your notes, track changes, and manage trusted devices.

Floppy Disk keeps your data private while letting you synchronize effortlessly across your own devices, transferring encrypted data using peer-to-peer WebRTC connections,  end-to-end encryption and real-time file transfers across devices securely and directly, without relying on cloud services.

## Features
**Device Management**
- View your current device ID and fingerprint.
- Add new devices to sync with.
- Manage pending and trusted devices.
- Regenerate keys if needed.

**Secure File Sync**
- End-to-end encryption with ECDSA for signing and RSA-OAEP for encryption.
- Incremental file updates using SHA-256 hashes.
- Conflict detection and notifications.

**Flexible File Transfer**
- Supports all note types and binary files. 
- Files are split into chunks for reliable WebRTC transfer.
- Automatic reconstruction of files on the remote device.

**Conflict Detection**
- Automatic detection of changes on multiple devices.
- Notifies you of conflicts for manual resolution.

**Snapshot Tracking**
- Maintains snapshots of file states per device for efficient syncing.
- Tracks last synced hashes to optimize sync operations.

## Installation
1. Download the latest release from the [releases page](https://github.com/andyrodrigues30/floppy-disk/releases).  
2. Place the plugin folder into your Obsidian vault’s `plugins` directory:  `<VAULT>/.obsidian/plugins/floppy-disk/`
3. Enable the plugin from Settings > Community Plugins > Floppy Disk.