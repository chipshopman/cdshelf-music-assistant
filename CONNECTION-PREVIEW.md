# Music Assistant connection preview

Targets Music Assistant server **2.10.9**. This first step verifies connection, authentication and player discovery. It does not yet browse albums or play music. The original `CDShelf/` source is preserved.

## Run on Windows

1. Download this repository as a ZIP using **Code → Download ZIP**, then extract it.
2. Open a terminal in the extracted repository folder (the folder containing the new root `index.html`).
3. With Python installed, run `py -m http.server 8080 --bind 127.0.0.1`.
4. Open **http://127.0.0.1:8080** in your browser. Do not open index.html directly from File Explorer: it uses JavaScript modules.
5. Enter Music Assistant's direct address, for example `http://192.168.1.50:8095`. Check that this address opens Music Assistant in another tab. The Home Assistant sidebar/Ingress URL is not the direct server address.
6. Enter a **Music Assistant** access token generated in Music Assistant's user/profile settings. A Home Assistant long-lived token is not interchangeable. Use an account allowed to read players. Never commit or send the token to GitHub or chat.
7. Click **Connect**. The screen should report the server version and list players, including the Onkyo if configured. Choosing a player does not change playback.

On Linux, use `python3 -m http.server 8080 --bind 127.0.0.1` instead.

If the direct Music Assistant address does not open, check the app's exposed web port/network settings first. This preview does not bypass Home Assistant Ingress authentication.

## Privacy and connection behaviour

- Requests go directly from your browser to the Music Assistant address you enter. No external libraries, analytics or cloud relay are used.
- Only the server address and selected player ID go into local storage.
- Tokens stay in memory by default. The optional checkbox stores the token in session storage for that browser tab; it is not persistent local storage. Browsers may restore a tab's session storage when restoring a session. Disconnect clears the saved token and form field; unchecking the box clears the saved token immediately.
- No automatic connection occurs on page load. Connect again after reopening or losing a connection.
- HTTPS pages require a secure `wss://` connection. For initial local testing, local HTTP can connect to Music Assistant's HTTP address. Browsers may request permission to access your local network.

## Verification

Run `npm test` with Node.js 20+ (no dependency installation needed). Tests use a simulated Music Assistant WebSocket to check URL validation, token authentication, player discovery, rejected tokens, timeouts and disconnects. Live testing against Steve's server is still required.

## Source references

- [Music Assistant 2.10.9 WebSocket implementation](https://github.com/music-assistant/server/blob/2.10.9/music_assistant/controllers/webserver/websocket_client.py)
- [Music Assistant 2.10.9 player API](https://github.com/music-assistant/server/blob/2.10.9/music_assistant/controllers/players/controller.py)
- Original shelf concept/code: ChrisHoppyBot. LMS packaging and subsequent UI work: Joe Leech, [mrj0e/cdshelf](https://github.com/mrj0e/cdshelf). The new connection preview is separate from the original LMS code.
