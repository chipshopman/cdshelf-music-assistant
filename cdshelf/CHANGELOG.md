# Changelog

## 0.1.0

- First experimental Home Assistant app/add-on package for amd64 and aarch64.
- Opens through Home Assistant Ingress and can be shown in the sidebar for non-admin users.
- Music Assistant token configured centrally and used only by the backend.
- Album browsing, tracks and explicit album playback through a restricted WebSocket bridge.
- Cover artwork served through the same Ingress connection, including when Home Assistant is accessed over HTTPS.
- Keeps the standalone PC-served version available.
