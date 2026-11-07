import { albumKey, artistName, artworkUrl, durationLabel, filterAlbums, loadAlbumLibrary } from './library.js';
const $ = id => document.getElementById(id);
const PAGE_SIZE = 150; // Keep DOM and artwork requests bounded on tablets.
const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; };

export class AlbumShelf {
  constructor(client, getPlayer) {
    this.client = client; this.getPlayer = getPlayer; this.albums = []; this.filtered = [];
    this.page = 0; this.generation = 0; this.selectionGeneration = 0; this.selected = null; this.playingRequest = false;
    $('album-search').oninput = () => this.filter(); $('album-sort').onchange = () => this.filter();
    $('reload-albums').onclick = () => this.load(this.address, { artworkBase: this.artworkBase });
    $('previous-shelf').onclick = () => { this.page--; this.render(); };
    $('next-shelf').onclick = () => { this.page++; this.render(); };
    $('close-album').onclick = () => this.closeAlbum();
    $('play-album').onclick = () => this.play();
    $('spine-frame').onkeydown = event => { if (event.key === 'Escape') this.closeAlbum(); };
  }
  async load(address, { artworkBase = null } = {}) {
    this.client.clearTrackCache();
    const generation = ++this.generation; this.address = address; this.artworkBase = artworkBase;
    this.closeAlbum(); this.albums = []; this.filtered = []; this.page = 0;
    $('rack').replaceChildren(); $('alphabet').replaceChildren(); $('shelf-empty').hidden = true;
    $('shelf').hidden = false; document.body.classList.add('has-shelf');
    $('reload-albums').disabled = true; $('album-search').disabled = true; $('album-sort').disabled = true;
    $('previous-shelf').disabled = true; $('next-shelf').disabled = true; $('shelf-page').textContent = '';
    $('library-status').textContent = 'Loading your album collection…';
    try {
      const albums = await loadAlbumLibrary(this.client, {
        cancelled: () => generation !== this.generation,
        onProgress: count => { if (generation === this.generation) $('library-status').textContent = `Loading your album collection… ${count} albums`; },
      });
      if (!albums || generation !== this.generation) return;
      this.albums = albums; this.filter();
    } catch (error) {
      if (generation === this.generation) $('library-status').textContent = `Could not load albums. ${error.message}`;
    } finally {
      if (generation === this.generation) { $('reload-albums').disabled = false; $('album-search').disabled = false; $('album-sort').disabled = false; }
    }
  }
  reset() {
    this.generation++; this.closeAlbum(); this.albums = []; this.filtered = [];
    $('shelf').hidden = true; $('rack').replaceChildren(); document.body.classList.remove('has-shelf', 'connection-editing');
  }
  filter() {
    this.closeAlbum(); this.page = 0;
    this.filtered = filterAlbums(this.albums, $('album-search').value, $('album-sort').value);
    $('library-status').textContent = `${this.filtered.length} of ${this.albums.length} albums · select a spine to see the cover`;
    this.renderAlphabet(); this.render();
  }
  initial(album) {
    const text = $('album-sort').value === 'title' ? album.name || '' : artistName(album);
    const letter = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
    return /^[A-Z]$/.test(letter) ? letter : '#';
  }
  renderAlphabet() {
    $('alphabet').replaceChildren();
    for (const letter of '#ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const index = this.filtered.findIndex(album => this.initial(album) === letter);
      const button = node('button', 'quiet', letter); button.type = 'button'; button.disabled = index < 0;
      button.setAttribute('aria-label', `Jump to ${letter}`);
      button.onclick = () => {
        this.closeAlbum(); this.page = Math.floor(index / PAGE_SIZE); this.render();
        const box = $('rack').children[index % PAGE_SIZE]; this.centre(box); box?.querySelector('button')?.focus({ preventScroll: true });
      };
      $('alphabet').append(button);
    }
  }
  render() {
    this.closeAlbum(); const rack = $('rack'); rack.replaceChildren();
    const pages = Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
    this.page = Math.min(Math.max(this.page, 0), pages - 1);
    const subset = this.filtered.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);
    for (const album of subset) rack.append(this.makeCase(album));
    $('spine-frame').scrollLeft = 0;
    $('shelf-empty').hidden = subset.length > 0;
    $('shelf-empty').textContent = this.albums.length ? 'No albums match this search.' : 'No albums are in the Music Assistant library yet. Check its library sync, then refresh albums.';
    $('previous-shelf').disabled = this.page === 0; $('next-shelf').disabled = this.page >= pages - 1;
    $('shelf-page').textContent = this.filtered.length ? `Shelf ${this.page + 1} of ${pages}` : 'No albums';
  }
  makeCase(album) {
    const box = node('div', 'cd-box'); box.dataset.albumKey = albumKey(album);
    let hash = 0; for (const c of albumKey(album)) hash = (hash * 31 + c.charCodeAt(0)) | 0;
    box.style.setProperty('--case-colour', `hsl(${Math.abs(hash) % 360} 18% 25%)`);
    const title = `${artistName(album)} — ${album.name || 'Untitled album'}${album.version ? ` (${album.version})` : ''}`;
    const spine = node('button', 'face-spine'); spine.type = 'button'; spine.title = title;
    spine.setAttribute('aria-label', `Open ${title}`); spine.setAttribute('aria-expanded', 'false');
    const thumbnail = artworkUrl(album, this.address, 160, this.artworkBase); const coverUrl = artworkUrl(album, this.address, 512, this.artworkBase);
    if (thumbnail) { const img = node('img'); img.src = thumbnail; img.loading = 'lazy'; img.alt = ''; img.onerror = () => img.remove(); spine.append(img); }
    spine.append(node('span', 'spine-text', title), node('span', 'spine-glass-overlay'));
    const cover = node('div', 'face-cover-container'); cover.setAttribute('aria-hidden', 'true'); cover.inert = true;
    const fallback = node('div', 'cover-fallback'); fallback.append(node('strong', '', album.name || 'Untitled album'), node('small', '', artistName(album))); cover.append(fallback);
    const playCover = node('button', 'cover-play', '▶'); playCover.type = 'button';
    playCover.setAttribute('aria-label', `Play ${title}`); playCover.title = 'Play album'; playCover.disabled = true;
    playCover.onclick = () => { if (this.selected === album) this.play(); };
    cover.append(playCover);
    // Full-size artwork is loaded only when this case is opened.
    box.append(spine, cover);
    spine.onclick = () => this.openAlbum(album, box, coverUrl, title);
    return box;
  }
  centre(box) {
    if (!box) return;
    const frame = $('spine-frame');
    requestAnimationFrame(() => frame.scrollTo({ left: box.offsetLeft - frame.offsetLeft - (frame.clientWidth - box.clientWidth) / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }
  closeAlbum() {
    this.selectionGeneration++; this.selected = null; $('album-detail').hidden = true;
    $('close-album').disabled = true; this.playerChanged();
    for (const box of $('rack').children) { box.classList.remove('expanded'); const cover = box.querySelector('.face-cover-container'); cover.inert = true; cover.setAttribute('aria-hidden', 'true'); const button = box.querySelector('button'); button?.setAttribute('aria-expanded', 'false'); if (button) button.tabIndex = 0; }
  }
  async openAlbum(album, box, coverUrl, title) {
    this.closeAlbum(); const generation = this.selectionGeneration; this.selected = album;
    box.classList.add('expanded'); box.querySelector('button').setAttribute('aria-expanded', 'true');
    const cover = box.querySelector('.face-cover-container'); cover.inert = false; cover.setAttribute('aria-hidden', 'false');
    $('close-album').disabled = false;
    if (coverUrl && !cover.querySelector('img')) { const img = node('img'); img.alt = ''; img.src = coverUrl; img.onerror = () => img.remove(); cover.append(img, node('span', 'jewel-case-overlay'), node('span', 'case-label', title)); }
    this.centre(box); setTimeout(() => { if (this.selected === album) this.centre(box); }, 360);
    $('album-detail').hidden = false; $('album-title').textContent = album.name || 'Untitled album';
    $('album-artist').textContent = artistName(album); $('album-version').textContent = [album.version, album.year || ''].filter(Boolean).join(' · ');
    $('play-status').textContent = ''; $('album-tracks').replaceChildren(); $('tracks-status').textContent = 'Loading tracks…';
    this.playerChanged();
    try {
      const tracks = await this.client.albumTracks(album);
      if (generation !== this.selectionGeneration) return;
      if (!Array.isArray(tracks)) throw new Error('Unexpected track-list response.');
      tracks.sort((a,b) => (a.disc_number || 1) - (b.disc_number || 1) || (a.track_number || 0) - (b.track_number || 0));
      const multipleDiscs = tracks.some(track => track.disc_number > 1);
      for (const [index, track] of tracks.entries()) {
        const row = node('li'); const number = `${multipleDiscs ? `${track.disc_number || 1}.` : ''}${track.track_number || index + 1}`;
        row.append(node('span', 'track-num', number), node('span', 'track-name', track.name || 'Untitled track'), node('span', 'track-time', durationLabel(track.duration)));
        $('album-tracks').append(row);
      }
      $('tracks-status').textContent = tracks.length ? `${tracks.length} tracks` : 'No track listing available.';
    } catch (error) { if (generation === this.selectionGeneration) $('tracks-status').textContent = `Could not load tracks. ${error.message}`; }
  }
  playerChanged() {
    const player = this.getPlayer();
    $('play-destination').textContent = player ? `On ${player.name || player.player_id}${player.available === false ? ' · unavailable' : ''}` : 'Choose a device using Play on.';
    const disabled = this.playingRequest || !player || player.available === false || !this.selected;
    $('play-album').disabled = disabled;
    for (const button of $('rack').querySelectorAll('.cover-play')) button.disabled = disabled || !button.closest('.cd-box').classList.contains('expanded');
  }
  async play() {
    const album = this.selected, player = this.getPlayer();
    if (this.playingRequest || !album || !player || player.available === false) return;
    const generation = this.selectionGeneration; this.playingRequest = true; this.playerChanged();
    $('play-status').dataset.error = 'false'; $('play-status').textContent = `Sending ${album.name} to ${player.name || player.player_id}…`;
    try {
      await this.client.playAlbum(album, player.player_id);
      if (generation === this.selectionGeneration) $('play-status').textContent = `Playback requested on ${player.name || player.player_id}.`;
    } catch (error) { if (generation === this.selectionGeneration) { $('play-status').dataset.error = 'true'; $('play-status').textContent = `Could not start playback. ${error.message}`; } }
    finally { this.playingRequest = false; this.playerChanged(); }
  }
}
