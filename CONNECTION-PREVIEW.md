# Music Assistant CD Shelf preview

Targets Music Assistant server **2.10.9**. The preview connects, loads albums, opens covers and track listings, and plays the selected album on your chosen player. The original `CDShelf/` source is preserved.

## Run on Windows

1. Download this repository as a ZIP using **Code → Download ZIP**, then extract it.
2. Open a terminal in the extracted repository folder (the folder containing the new root `index.html`).
3. With Python installed, run `py -m http.server 8080 --bind 127.0.0.1`.
4. Open **http://127.0.0.1:8080** in your browser. Do not open index.html directly from File Explorer: it uses JavaScript modules.
5. Enter Music Assistant's direct address, for example `http://192.168.1.50:8095`. Check that this address opens Music Assistant in another tab. The Home Assistant sidebar/Ingress URL is not the direct server address.
6. Enter a **Music Assistant** access token generated in Music Assistant's user/profile settings. A Home Assistant long-lived token is not interchangeable. Use an account allowed to read players. Never commit or send the token to GitHub or chat.
7. Click **Connect**. The screen should report the server version, list players and load your album collection above. Choose your intended listening room (for example the Onkyo).
8. Swipe or scroll the spines. Tap a spine to reveal the cover and its track list. Use search, alphabetical jumps or Previous/Next shelf to move through larger collections.
9. Press **Play album** when ready. This replaces the selected room's queue and plays the album in track order. Connecting, choosing a player and opening a cover do not change playback.

For an existing local copy: replace the root `index.html` and the complete `web/` folder from the latest repository ZIP. Keep the Python server running, then press **Ctrl+F5** in your browser. Your browser's saved address and player selection stay available.

The token needs permission to read the library and players, read queues and control playback. A read-only token may connect successfully but be unable to start an album. Track listings are informational in this preview; use Music Assistant for pause/skip/volume controls.

For a tablet on your home network, bind the server to `0.0.0.0` instead and open `http://YOUR-PC-LAN-IP:8080` on the tablet. Allow Python through Windows Firewall on your private network if prompted.\n\nOn Linux, use `python3 -m http.server 8080 --bind 127.0.0.1` instead.

If the direct Music Assistant address does not open, check the app's exposed web port/network settings first. This preview does not bypass Home Assistant Ingress authentication.

## Privacy and connection behaviour

- Requests go directly from your browser to the Music Assistant address you enter. No external libraries, analytics or cloud relay are used.
- Remember this device is checked by default: after a successful connection the server address and token are saved in this browser's local storage. The selected player is remembered too. The token stays out of URLs and source files, but browser storage can be read by someone with access to the browser profile.
- Returning to the page automatically connects and loads the collection, without starting playback. Each browser/device needs its own initial setup. Use the same site address and port each time.
- Uncheck Remember for memory-only use. Forget connection disconnects and removes the saved token; Disconnect keeps the saved setup for the next visit. Connection failures reveal the form for retrying or editing settings.
- HTTPS pages require a secure `wss://` connection. For initial local testing, local HTTP can connect to Music Assistant's HTTP address. Browsers may request permission to access your local network.

## Verification

Run `npm test` with Node.js 20+ (no dependency installation needed). Tests use a simulated Music Assistant WebSocket to check URL validation, token authentication, player discovery, rejected tokens, timeouts and disconnects. Live testing against Steve's server is still required.

## Source references

- [Music Assistant 2.10.9 WebSocket implementation](https://github.com/music-assistant/server/blob/2.10.9/music_assistant/controllers/webserver/websocket_client.py)
- [Music Assistant 2.10.9 player API](https://github.com/music-assistant/server/blob/2.10.9/music_assistant/controllers/players/controller.py)
- Original shelf concept/code: ChrisHoppyBot. LMS packaging and subsequent UI work: Joe Leech, [mrj0e/cdshelf](https://github.com/mrj0e/cdshelf). The new connection preview is separate from the original LMS code.
