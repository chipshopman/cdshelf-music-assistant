# Set up CD Shelf in Home Assistant

This is the first **experimental** Home Assistant app/add-on release, version **0.1.1**, targeting Music Assistant **2.10.9**. The backend has been tested with a simulated Music Assistant server, including real HTTP/WebSocket connections and multiple screens. A container build and a real Home Assistant OS installation have not yet been verified. Keep the existing PC version available during this first installation.

## Install

1. In Home Assistant, open **Settings → Apps → Install app**, or **Settings → Add-ons → Add-on Store** on versions using the older names.
2. Open the top-right **⋮ → Repositories** menu and add:

   ```text
   https://github.com/chipshopman/cdshelf-music-assistant
   ```

3. Find **CD Shelf** under **CD Shelf for Music Assistant**. Refresh the store if necessary, then select **Install**. Home Assistant builds this first version on your machine, so installation can take several minutes and needs internet access for the Python image and dependencies.
4. Open its **Configuration** tab and enter the two settings below. Save.
5. Start the app. Enable **Start on boot** and **Show in sidebar**.
6. Select **Open Web UI**, or **CD Shelf** in the sidebar. The collection should load without any token prompt.
7. Choose the playback device in **Play on** (names include the provider/protocol), open a CD and press its triangle or **Play album**. Opening CD Shelf or a cover does not start music. Play replaces the selected device's queue.

On a tablet, sign in to your usual Home Assistant address or Companion app and choose **CD Shelf** in the sidebar. No Python server on the PC is needed. Each browser remembers its playback device. Home Assistant Ingress handles access; non-admin users can see the sidebar entry because `panel_admin` is false. This does not give them access to the app's configuration.

## Configuration

| Setting | Enter once as the administrator |
| --- | --- |
| Music Assistant address (`music_assistant_url`) | The direct Music Assistant server address, e.g. `http://192.168.1.50:8095`. Use the LAN address you already use to connect to Music Assistant. |
| Music Assistant access token (`music_assistant_token`) | A token created in **Music Assistant's user/profile settings**, with permission to read the library and players, read queues and control playback. A Home Assistant long-lived token is not interchangeable. |

Use the direct server address, without `/ws`, a Home Assistant Ingress path, credentials or query parameters. **127.0.0.1 refers to this new app's own container**, not your Music Assistant server. The token field is masked in the configuration UI. Do not put a real token into the repository, screenshots or issue reports.

Save changed settings and restart CD Shelf to apply them. The backend reads `/data/options.json` on startup. Reopening CD Shelf or using **Reconnect** then connects with the centrally saved configuration. Users do not need a copy of the token.

## What is stored where

- Home Assistant stores the token in the app's options. The backend sends it directly to Music Assistant for authentication. It is not inserted into HTML, browser JavaScript, browser storage or browser requests. Administrators and backups can still contain these options; this is not an encrypted secrets vault.
- The browser communicates only with CD Shelf through Home Assistant Ingress for the library, playback and proxied cover IDs. It does not need direct access to Music Assistant's port or NAS.
- All people allowed to open CD Shelf share the configured Music Assistant account's available players and playback rights. This version does not map individual Home Assistant users to separate Music Assistant accounts.
- CD Shelf exposes no host port, does not need host networking, a Supervisor API token or access to Home Assistant configuration files. Its web server accepts only the Supervisor Ingress proxy's TCP address, not user-supplied forwarding headers.
- The bridge allows only the library/player/playback commands this UI uses, including Stop, plus an optional player-name configuration read. That read returns only player IDs, names and default names; configuration values are stripped server-side. All other configuration commands, browser-supplied authentication and impersonation arguments are rejected. Authentication responses and unrelated upstream events are not passed to browsers.
- The original standalone version keeps its separate browser-storage connection option; its existing saved token is not needed by this Home Assistant version. You may use **Forget connection** in the old PC version if you no longer need it.

## Troubleshooting

**CD Shelf does not appear in the store:** Check that the repository URL was added successfully, refresh the store, and look for CD Shelf in the repository's section. This release supports x86-64/amd64 and ARM64/aarch64 Home Assistant OS machines.

**Installation fails:** Check the installation/Supervisor log for the build error. This version builds from `python:3.13-alpine` and installs the dependency pinned in `requirements.txt`; it does not rely on a pre-published CD Shelf container image. Report the build error without sharing configuration tokens.

**The page asks for an administrator to configure the connection:** Fill in both fields in the app Configuration tab, save and restart the app. No token needs to be entered in the collection screen.

**Music Assistant rejected the saved token:** Replace the token in CD Shelf's Configuration tab, save and restart. Confirm that it is a Music Assistant user token with the required library, player and playback permissions.

**Cannot reach Music Assistant:** Check its LAN address and port; use the same direct Music Assistant address that worked in the PC version. Avoid `localhost`, `127.0.0.1`, and the Home Assistant sidebar URL. For HTTPS Music Assistant servers, the certificate must be valid and trusted by the container; certificate checking is not disabled.

**Music Assistant restarts or the tablet loses its connection:** Use **Reconnect**, or reopen the CD Shelf sidebar entry. There is no endless retry loop and no automatic playback.

**Renamed players still show an old name:** Use Refresh players. CD Shelf prefers saved custom names and includes the provider/protocol to distinguish connections. Reading saved names needs the Music Assistant token’s player-configuration read permission; if unavailable, a note explains that live names are being used. Player browsing and playback still work with the existing read/control permissions.

**AirPlay does not play:** The Android tablet is a remote control; Music Assistant sends the AirPlay stream itself. Test that player directly in Music Assistant to check its pairing, availability and provider settings.

**Some covers are blank:** Artwork uses Music Assistant 2.10.9 image proxy IDs. Missing IDs get a text fallback. The original NAS paths are never opened directly by the browser.

**Sidebar entry missing for another user:** Enable Show in sidebar for the app and check that user's sidebar customisation. Users must be able to sign in to your Home Assistant instance.

Put back stops the selected device (or its active group) and closes the cover after a successful Stop response. It can also stop playback with no cover open; browsing, changing shelves and searching do not stop playback. Pause, skip and volume remain in Music Assistant. Live player status is refreshed with **Refresh players**. CD Shelf does not change NAS files or move Music Assistant's library.

## Development and attribution

The installable frontend under `cdshelf/www/` is generated from the root `index.html` and `web/`. After changing those sources, run `npm run prepare-addon` before committing. `npm test` checks that packaged assets match. Backend tests: install `cdshelf/requirements.txt` in a virtual environment, then run `python -m unittest discover -s tests -p 'test_*.py' -v` from the repository root.

For a container build check, run `docker build -t cdshelf-test ./cdshelf`. This app is Ingress-only; it intentionally denies ordinary direct connections, so publishing its port is not a substitute for testing in Home Assistant.

Original concept/code: ChrisHoppyBot. LMS packaging/UI: Joe Leech, [mrj0e/cdshelf](https://github.com/mrj0e/cdshelf). Maintainer permission for this adaptation has been given to Steve; the adaptation does not assign a new licence to the original source.

Implementation references: [Home Assistant Ingress](https://contributors.home-assistant.io/apps/guides/ingress/), [app options](https://contributors.home-assistant.io/apps/guides/options/), [repository installation](https://contributors.home-assistant.io/apps/guides/repository/), and [Music Assistant 2.10.9 WebSocket API](https://github.com/music-assistant/server/blob/2.10.9/music_assistant/controllers/webserver/websocket_client.py).
