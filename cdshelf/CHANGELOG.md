# Changelog

## 0.1.3

- Red-team review: prevent superseded or cancelled connection attempts from closing/authenticating through a newer connection.
- Block upstream redirects before sending the saved Music Assistant token; use the final direct server address in configuration.
- Restrict managed playback requests to numeric library album URIs and bound library page sizes to 200.
- Accept raster artwork only, rejecting SVG/active content and applying a sandbox content policy to proxied images.
- Expire unanswered bridge requests after 75 seconds; use independent upstream IDs so late replies cannot satisfy reused browser request IDs.
- Reject malformed greetings cleanly. Normal browsing, playback, Put back and display controls remain available.
- Findings, preconditions and verification are documented in RED-TEAM-REVIEW.md at the repository root.

## 0.1.2

- Full screen control shows CD Shelf alone, with an exit button and browser exit support.
- Open on its own opens the existing Ingress page in a separate tab without Home Assistant's header/sidebar.
- Keeps server-side authentication and does not expose an extra network port.
- Explains what to try when a browser blocks embedded full-screen requests.

## 0.1.1

- Device labels show player names and provider/output protocols, with IDs where needed to distinguish otherwise identical entries.
- Refresh players reads saved custom names as well as live state; configuration-name access is optional and does not prevent playback with a more restricted token.
- Put back sends Stop to the selected player before closing the CD. It also works with no cover open; browsing/searching never sends Stop.
- Playback and stop status stays visible below the control row.
- The Ingress bridge supports Stop and a sanitised, names-only player configuration read.

## 0.1.0

- First experimental Home Assistant app/add-on package for amd64 and aarch64.
- Opens through Home Assistant Ingress and can be shown in the sidebar for non-admin users.
- Music Assistant token configured centrally and used only by the backend.
- Album browsing, tracks and explicit album playback through a restricted WebSocket bridge.
- Cover artwork served through the same Ingress connection, including when Home Assistant is accessed over HTTPS.
- Keeps the standalone PC-served version available.
