import { MusicAssistantClient, managedEndpoints } from './ma-client.js';
import { AlbumShelf } from './shelf.js';
const $ = id => document.getElementById(id);
const status = (text, kind = '') => { $('status').textContent = text; $('status').dataset.kind = kind; };
const read = (storage, key) => { try { return storage.getItem(key) || ''; } catch { return ''; } };
const write = (storage, key, value) => { try { value ? storage.setItem(key, value) : storage.removeItem(key); } catch {} };
const managed = document.body.dataset.managed === 'true';
let players = [], busy = false, manuallyDisconnected = false;
const savedConnection = (() => { if (managed) return {}; try { return JSON.parse(read(localStorage, 'cdshelf.connection')) || {}; } catch { return {}; } })();
function disconnected() {
  shelf.reset();
  $('connected').hidden = true; $('disconnect').hidden = true; $('connect').disabled = false;
  status('Disconnected. Connect again when you are ready.');
}
const client = new MusicAssistantClient({ onDisconnect: disconnected });
const shelf = new AlbumShelf(client, () => players.find(player => player.player_id === $('player').value));
$('server').value = managed ? '' : savedConnection.server || read(localStorage, 'cdshelf.server');
$('token').value = managed ? '' : savedConnection.token || read(sessionStorage, 'cdshelf.token');
$('remember').checked = true;
$('forget-connection').hidden = managed || !savedConnection.token;
if (managed) {
  $('connection-intro').textContent = 'Connected through Home Assistant.';
  $('managed-help').hidden = false; $('managed-reconnect').hidden = false;
  $('managed-reconnect').onclick = connect;
}
$('reveal').onclick = () => {
  const show = $('token').type === 'password'; $('token').type = show ? 'text' : 'password';
  $('reveal').textContent = show ? 'Hide' : 'Show'; $('reveal').setAttribute('aria-pressed', String(show));
};
$('remember').onchange = () => {
  if (!$('remember').checked) {
    write(localStorage, 'cdshelf.connection', ''); write(sessionStorage, 'cdshelf.token', '');
    $('forget-connection').hidden = true;
  }
};
function describePlayer() {
  const player = players.find(p => p.player_id === $('player').value);
  $('player-detail').textContent = player ? `${player.name || player.player_id} · ${player.available === false ? 'Currently unavailable. Check the receiver or speaker is online.' : 'Ready for album playback.'}` : '';
  shelf.playerChanged();
  write(localStorage, 'cdshelf.player', $('player').value);
}
async function loadPlayers() {
  const result = await client.players();
  if (!Array.isArray(result)) throw new Error('Unexpected player response from Music Assistant.');
  players = result;
  const selected = $('player').value || read(localStorage, 'cdshelf.player');
  $('player').replaceChildren();
  for (const player of players) {
    const option = document.createElement('option'); option.value = player.player_id;
    option.textContent = `${player.name || player.player_id}${player.available === false ? ' · unavailable' : ''}`;
    $('player').append(option);
  }
  if (players.some(p => p.player_id === selected)) $('player').value = selected;
  $('player').disabled = !players.length;
  describePlayer();
  if (!players.length) $('player-detail').textContent = 'No players found. Add a player provider in Music Assistant, then refresh.';
}
async function connect() {
  if (busy) return; busy = true; manuallyDisconnected = false;
  document.body.classList.add('auto-connecting');
  $('token').type = 'password'; $('reveal').textContent = 'Show'; $('reveal').setAttribute('aria-pressed', 'false');
  $('connect').disabled = true; $('connected').hidden = true; $('disconnect').hidden = true;
  shelf.reset();
  write(sessionStorage, 'cdshelf.token', '');
  status(managed ? 'Connecting to your music…' : 'Connecting and checking your access token…');
  $('managed-reconnect').disabled = true;
  try {
    const endpoints = managed ? managedEndpoints(document.baseURI) : null;
    const info = managed ? await client.connectManaged(endpoints.socket) : await client.connect($('server').value, $('token').value, location.protocol);
    await loadPlayers();
    if (!managed) write(localStorage, 'cdshelf.server', $('server').value.trim());
    if (!managed && $('remember').checked) {
      const credentials = JSON.stringify({ server: $('server').value.trim(), token: $('token').value.trim() });
      write(localStorage, 'cdshelf.connection', credentials);
      $('forget-connection').hidden = read(localStorage, 'cdshelf.connection') !== credentials;
    } else if (!managed) { write(localStorage, 'cdshelf.connection', ''); $('forget-connection').hidden = true; }
    $('server-detail').textContent = `Music Assistant ${info.server_version}${info.server_version !== '2.10.9' ? ' · this preview targets 2.10.9; other versions have not been verified' : ''}`;
    $('connected').hidden = false; $('disconnect').hidden = false;
    status(`Connected · ${players.length} player${players.length === 1 ? '' : 's'} found.${!managed && $('remember').checked && $('forget-connection').hidden ? ' This browser could not save the connection; allow site storage to remember it.' : ''}`, 'success');
    document.body.classList.remove('connection-editing');
    shelf.load(managed ? location.origin : $('server').value.trim(), { artworkBase: managed ? endpoints.artwork : null });
  } catch (error) { client.disconnect(); status(error.message, 'error'); }
  finally { busy = false; $('connect').disabled = false; $('managed-reconnect').disabled = false; document.body.classList.remove('auto-connecting'); }
}
$('connection-form').onsubmit = event => { event.preventDefault(); return connect(); };
$('player').onchange = describePlayer;
$('refresh').onclick = async () => {
  $('refresh').disabled = true;
  try { await loadPlayers(); status(`Connected · ${players.length} players found.`, 'success'); }
  catch (error) { status(error.message, 'error'); }
  finally { $('refresh').disabled = false; }
};
$('disconnect').onclick = () => { manuallyDisconnected = true; client.disconnect(); disconnected(); };
$('forget-connection').onclick = () => {
  manuallyDisconnected = true; client.disconnect();
  write(localStorage, 'cdshelf.connection', ''); write(sessionStorage, 'cdshelf.token', '');
  $('token').value = ''; $('forget-connection').hidden = true; disconnected();
  status('Connection forgotten on this device.');
};
window.addEventListener('pagehide', () => client.disconnect());
const editConnection = document.createElement('button');
editConnection.type = 'button'; editConnection.className = 'quiet connection-toggle'; editConnection.textContent = 'Connection settings';
editConnection.onclick = () => document.body.classList.toggle('connection-editing');
if (!managed) $('connected').append(editConnection);

// Reconnect when revisiting a page restored from the browser back/forward cache.
window.addEventListener('pageshow', event => { if (event.persisted && !manuallyDisconnected && (managed || ($('remember').checked && $('server').value && $('token').value))) connect(); });
if (managed || ($('server').value && $('token').value)) connect();
