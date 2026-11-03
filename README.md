# CD Shelf for Music Assistant

A Music Assistant adaptation of CD Shelf, targeting server **2.10.9**.

## First preview: connection screen

The new root `index.html` connects to your Music Assistant server, authenticates using a Music Assistant access token and lists its players. This is a connection preview; album browsing and playback are not implemented yet.

**[Start here: run and test the connection screen](CONNECTION-PREVIEW.md)**

No build tools or npm packages are needed to run the screen. Serve this folder with Python's HTTP server and open it in a browser. The original LMS source under `CDShelf/` and archives under `releases/` are unchanged.

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

Run `npm test` with Node.js 20+. No dependency installation is required. Tests simulate the Music Assistant connection; verification against a real server is still needed.
