# CD Shelf for Music Assistant

A Music Assistant adaptation of CD Shelf, targeting server **2.10.9**.

## Shelf preview

The root `index.html` connects to your Music Assistant server and displays your library as a shelf of CD spines. Swipe or scroll along the shelf, tap a spine to pull out the cover and view the track list, then select **Play album** to play through the chosen room. Playback replaces that room's queue and starts the album in track order.

- Loads the complete library in batches; no 300-album cap.
- Search by artist/title/version, sort by artist or album, and jump by letter.
- Shows 150 cases per shelf page to keep tablet rendering manageable; alphabet jumps and search cover the entire loaded collection.
- Loads full-size covers only when selected; missing art gets a readable fallback.
- Retains player selection for Onkyo, Denon and Sonos destinations already configured in Music Assistant.
- Fetches multidisc track listings and resolves the selected player's active queue before playback.
- No playback on connect, room selection, refresh or opening an album.

The shelf's expanding jewel-case treatment is adapted from CD Shelf 0.7.6. Printed spines are simulated from cover artwork and metadata. Pause/skip/volume remain in Music Assistant for this stage.

**[Start here: run and test the shelf](CONNECTION-PREVIEW.md)**

No build tools or npm packages are needed to run the screen. Serve this folder with Python's HTTP server and open it in a browser. When updating an existing local copy, replace the root `index.html` and the entire `web/` folder, then hard-refresh the browser. The original LMS source under `CDShelf/` and archives under `releases/` are unchanged.

## Attribution

CD Shelf is based on the **“CD Shelf – a custom 3D CD spine browser”** shared by Reddit user **ChrisHoppyBot** in r/squeezebox. Original concept and code by ChrisHoppyBot. LMS plugin packaging, Material integration, player selection and subsequent UI modifications by Joe Leech.

- [Original repository](https://github.com/mrj0e/cdshelf)
- [Original Reddit post](https://www.reddit.com/r/squeezebox/comments/1v733oc/share_cd_shelf_a_custom_3d_cd_spine_browser/)

The maintainer has given Steve permission to pursue this Music Assistant adaptation. This statement does not assign a new licence to the original code.

## Original LMS version

![Original CD Shelf screenshot](images/cdshelf-screenshot.png)

The extracted **0.7.6** LMS source is in `CDShelf/`. It requires Lyrion Music Server and is not the new Music Assistant preview. The original LMS installation repository remains:

`https://raw.githubusercontent.com/mrj0e/cdshelf/main/repo.xml`

## Development checks

Run `npm test` with Node.js 20+. No dependency installation is required. Tests cover the string-ID connection regression, paginated libraries, missing artwork, search and playback targeting. These use simulated responses; real library/artwork/playback verification against Steve's server is still required.
