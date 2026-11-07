import { mergePlayerNames } from './players.js';
// Preserve Home Assistant's per-installation Ingress prefix for every request.
export function managedEndpoints(baseURI) {
  const socket = new URL('api/ws', baseURI);
  socket.protocol = socket.protocol === 'https:' ? 'wss:' : 'ws:';
  return { socket: socket.href, artwork: new URL('api/imageproxy/', baseURI).href };
}

export function websocketAddress(value, pageProtocol = '') {
  const url = new URL(value.trim());
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) throw new Error('Use an http:// or https:// Music Assistant address.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Use the server address without credentials, query strings or a fragment.');
  if (!['/', '/ws', ''].includes(url.pathname)) throw new Error('Use the direct Music Assistant address, not a Home Assistant Ingress or sidebar URL.');
  if (pageProtocol === 'https:' && ['http:', 'ws:'].includes(url.protocol)) throw new Error('This HTTPS page needs an HTTPS Music Assistant address. Alternatively, serve CD Shelf over local HTTP.');
  url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  return url.href;
}

// MA 2.10.9: server greeting, auth command, then request/response messages.
// Keep tokens out of URLs, logs and error messages.
export class MusicAssistantClient {
  constructor({ WebSocketImpl = globalThis.WebSocket, timeout = 12000, trackTimeout = 60000, onDisconnect = () => {} } = {}) {
    this.trackTimeout = trackTimeout; this.trackCache = new Map(); this.trackRequests = new Map();
    this.WebSocketImpl = WebSocketImpl; this.timeout = timeout; this.onDisconnect = onDisconnect;
    this.pending = new Map(); this.sequence = 0; this.socket = null;
  }
  async connect(address, token, pageProtocol = '') {
    this.managed = false;
    if (!token?.trim()) { this.disconnect(); throw new Error('Enter a Music Assistant access token.'); }
    return this.openSocket(websocketAddress(address, pageProtocol), { token: token.trim() });
  }
  async connectManaged(endpoint) {
    this.managed = true;
    return this.openSocket(endpoint, null);
  }
  async openSocket(endpoint, authArgs) {
    this.disconnect();
    const socket = this.socket = new this.WebSocketImpl(endpoint);
    try {
      const info = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Connection timed out. Check the address and local-network access.')), this.timeout);
        let settled = false;
        const finish = (error, data) => {
          if (settled) return; settled = true; clearTimeout(timer);
          if (this.handshake?.socket === socket) this.handshake = null;
          error ? reject(error) : resolve(data);
        };
        this.handshake = { socket, cancel: () => finish(new Error('Connection cancelled.')) };
        socket.onmessage = event => {
          let data; try { data = JSON.parse(event.data); } catch { finish(new Error('The server returned an invalid response.')); return; }
          if (!data || typeof data !== 'object' || Array.isArray(data)) { finish(new Error('The server returned an invalid response.')); return; }
          if (!data.server_version) return;
          socket.onmessage = event => this.receive(event);
          finish(null, data);
        };
        socket.onerror = () => finish(new Error('Cannot reach Music Assistant. Check its direct address, HTTPS settings and network access.'));
        socket.onclose = () => finish(new Error('Music Assistant closed the connection before sign-in.'));
      });
      if (this.socket !== socket || socket.readyState !== 1) throw new Error('Connection cancelled.');
      socket.onerror = () => {}; // onclose handles loss after the initial greeting.
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.clearTrackCache();
        this.rejectPending(new Error('Music Assistant disconnected. Connect again to continue.'));
        this.onDisconnect();
      };
      if (info.managed_error) throw new Error(info.managed_error);
      if (authArgs) await this.request('auth', authArgs);
      return info;
    } catch (error) { if (this.socket === socket) this.disconnect(); throw error; }
  }
  request(command, args = {}, { timeout = this.timeout } = {}) {
    if (!this.socket || this.socket.readyState !== 1) return Promise.reject(new Error('Connect to Music Assistant first.'));
    // Music Assistant uses string request IDs; its replies must match our Map keys.
    const message_id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(message_id); reject(new Error(command === 'music/albums/album_tracks' ? 'Music Assistant is taking too long to return the tracks. Close and reopen this album to retry; you can still use Play album.' : 'Music Assistant did not respond in time. Try connecting again.')); }, timeout);
      this.pending.set(message_id, { resolve, reject, timer, chunks: [], command });
      try { this.socket.send(JSON.stringify({ message_id, command, args })); }
      catch { clearTimeout(timer); this.pending.delete(message_id); reject(new Error('Could not send the request to Music Assistant.')); }
    });
  }
  receive(event) {
    let data; try { data = JSON.parse(event.data); } catch { return; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const message_id = String(data.message_id);
    const entry = this.pending.get(message_id); if (!entry) return;
    if (data.error_code !== undefined) {
      clearTimeout(entry.timer); this.pending.delete(message_id);
      if (data.error_code === 408) { entry.reject(new Error('Music Assistant took too long to respond. Please retry the action.')); return; }
      const action = entry.command === 'auth' ? 'sign-in' : entry.command.startsWith('music/') ? 'library request' : entry.command.startsWith('player_queues/') ? 'playback request' : 'player request';
      entry.reject(new Error(this.managed ? `Music Assistant rejected the ${action}. Ask the administrator to check the app’s Music Assistant token and permissions.` : `Music Assistant rejected the ${action}. Check that your token is valid and has the required library, player or playback permissions.`)); return;
    }
    if (data.partial) { entry.chunks.push(...(Array.isArray(data.result) ? data.result : [data.result])); return; }
    clearTimeout(entry.timer); this.pending.delete(message_id);
    entry.resolve(entry.chunks.length ? [...entry.chunks, ...(Array.isArray(data.result) ? data.result : [data.result])] : data.result);
  }
  async players() {
    const [players, configs] = await Promise.all([
      this.request('players/all'),
      this.request('config/players', { include_values: false }, { timeout: 4000 }).catch(() => null),
    ]);
    if (!Array.isArray(players)) throw new Error('Unexpected player response from Music Assistant.');
    this.playerNamesAvailable = Array.isArray(configs);
    return mergePlayerNames(players, configs);
  }
  stopPlayer(playerId) {
    if (!playerId) return Promise.reject(new Error('Choose a listening room first.'));
    // Music Assistant redirects this command to the active queue/group when needed.
    return this.request('players/cmd/stop', { player_id: playerId });
  }
  albumPage(offset = 0, limit = 200) {
    return this.request('music/albums/library_items', { offset, limit, order_by: 'sort_name', summary: false });
  }
  async albumTracks(album) {
    const provider = album.provider || 'library';
    const key = JSON.stringify([provider, String(album.item_id)]);
    if (this.trackCache.has(key)) return this.trackCache.get(key).slice();
    let request = this.trackRequests.get(key);
    if (!request) {
      request = this.request('music/albums/album_tracks', {
        item_id: String(album.item_id), provider_instance_id_or_domain: provider,
      }, { timeout: this.trackTimeout }).then(tracks => {
        if (!Array.isArray(tracks)) throw new Error('Unexpected track-list response.');
        // Ignore results from before a refresh or disconnection.
        if (this.trackRequests.get(key) === request && tracks.length) {
          if (this.trackCache.size >= 100) this.trackCache.delete(this.trackCache.keys().next().value);
          this.trackCache.set(key, tracks.slice());
        }
        return tracks;
      }).finally(() => {
        if (this.trackRequests.get(key) === request) this.trackRequests.delete(key);
      });
      this.trackRequests.set(key, request);
    }
    return (await request).slice();
  }
  clearTrackCache() {
    this.trackCache.clear(); this.trackRequests.clear();
  }
  async playAlbum(album, playerId) {
    if (!playerId) throw new Error('Choose a listening room first.');
    const queue = await this.request('player_queues/get_active_queue', { player_id: playerId });
    if (!queue?.queue_id) throw new Error('No playback queue is available for this room. Check the player in Music Assistant.');
    const uri = album.uri || `${album.provider || 'library'}://album/${album.item_id}`;
    return this.request('player_queues/play_media', { queue_id: queue.queue_id, media: uri, option: 'replace', shuffle: false });
  }
  rejectPending(error) { for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); } this.pending.clear(); }
  disconnect() {
    const handshake = this.handshake; this.handshake = null; handshake?.cancel();
    this.clearTrackCache();
    const socket = this.socket; this.socket = null;
    if (socket) { socket.onclose = null; socket.close(); }
    this.rejectPending(new Error('Disconnected.'));
  }
}
