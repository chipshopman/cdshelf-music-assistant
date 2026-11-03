import { MusicAssistantClient } from './ma-client.js';
const $ = id => document.getElementById(id);
const status = (text, kind = '') => { $('status').textContent = text; $('status').dataset.kind = kind; };
const read = (storage, key) => { try { return storage.getItem(key) || ''; } catch { return ''; } };
const write = (storage, key, value) => { try { value ? storage.setItem(key, value) : storage.removeItem(key); } catch {} };
let players = [], busy = false;
function disconnected() {
  $('connected').hidden = true; $('disconnect').hidden = true; $('connect').disabled = false;
  status('Disconnected. Connect again when you are ready.');
}
const client = new MusicAssistantClient({ onDisconnect: disconnected });
$('server').value = read(localStorage, 'cdshelf.server');
$('token').value = read(sessionStorage, 'cdshelf.token');
$('remember').checked = Boolean($('token').value);
$('reveal').onclick = () => {
  const show = $('token').type === 'password'; $('token').type = show ? 'text' : 'password';
  $('reveal').textContent = show ? 'Hide' : 'Show'; $('reveal').setAttribute('aria-pressed', String(show));
};
$('remember').onchange = () => { if (!$('remember').checked) write(sessionStorage, 'cdshelf.token', ''); };
function describePlayer() {
  const player = players.find(p => p.player_id === $('player').value);
  $('player-detail').textContent = player ? (player.available === false ? 'Currently unavailable. Check the receiver or speaker is online.' : 'Player found. No playback commands have been sent.') : '';
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
$('connection-form').onsubmit = async event => {
  event.preventDefault(); if (busy) return; busy = true;
  $('connect').disabled = true; $('connected').hidden = true; $('disconnect').hidden = true;
  write(sessionStorage, 'cdshelf.token', '');
  status('Connecting and checking your access token…');
  try {
    const info = await client.connect($('server').value, $('token').value, location.protocol);
    await loadPlayers();
    write(localStorage, 'cdshelf.server', $('server').value.trim());
    if ($('remember').checked) write(sessionStorage, 'cdshelf.token', $('token').value.trim());
    $('server-detail').textContent = `Music Assistant ${info.server_version}${info.server_version !== '2.10.9' ? ' · this preview targets 2.10.9; other versions have not been verified' : ''}`;
    $('connected').hidden = false; $('disconnect').hidden = false;
    status(`Connected · ${players.length} player${players.length === 1 ? '' : 's'} found.`, 'success');
  } catch (error) { client.disconnect(); status(error.message, 'error'); }
  finally { busy = false; $('connect').disabled = false; }
};
$('player').onchange = describePlayer;
$('refresh').onclick = async () => {
  $('refresh').disabled = true;
  try { await loadPlayers(); status(`Connected · ${players.length} players found.`, 'success'); }
  catch (error) { status(error.message, 'error'); }
  finally { $('refresh').disabled = false; }
};
$('disconnect').onclick = () => { client.disconnect(); write(sessionStorage, 'cdshelf.token', ''); $('token').value = ''; disconnected(); };
window.addEventListener('pagehide', () => client.disconnect());
