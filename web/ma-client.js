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
  constructor({ WebSocketImpl = globalThis.WebSocket, timeout = 12000, onDisconnect = () => {} } = {}) {
    this.WebSocketImpl = WebSocketImpl; this.timeout = timeout; this.onDisconnect = onDisconnect;
    this.pending = new Map(); this.sequence = 0; this.socket = null;
  }
  async connect(address, token, pageProtocol = '') {
    this.disconnect();
    if (!token?.trim()) throw new Error('Enter a Music Assistant access token.');
    const endpoint = websocketAddress(address, pageProtocol);
    const socket = this.socket = new this.WebSocketImpl(endpoint);
    try {
      const info = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Connection timed out. Check the address and local-network access.')), this.timeout);
        const finish = (error, data) => { clearTimeout(timer); error ? reject(error) : resolve(data); };
        socket.onmessage = event => {
          let data; try { data = JSON.parse(event.data); } catch { finish(new Error('The server returned an invalid response.')); return; }
          if (!data.server_version) return;
          socket.onmessage = event => this.receive(event);
          finish(null, data);
        };
        socket.onerror = () => finish(new Error('Cannot reach Music Assistant. Check its direct address, HTTPS settings and network access.'));
        socket.onclose = () => finish(new Error('Music Assistant closed the connection before sign-in.'));
      });
      socket.onerror = () => {}; // onclose handles loss after the initial greeting.
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.rejectPending(new Error('Music Assistant disconnected. Connect again to continue.'));
        this.onDisconnect();
      };
      await this.request('auth', { token: token.trim() });
      return info;
    } catch (error) { this.disconnect(); throw error; }
  }
  request(command, args = {}) {
    if (!this.socket || this.socket.readyState !== 1) return Promise.reject(new Error('Connect to Music Assistant first.'));
    const message_id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(message_id); reject(new Error('Music Assistant did not respond in time. Try connecting again.')); }, this.timeout);
      this.pending.set(message_id, { resolve, reject, timer, chunks: [] });
      try { this.socket.send(JSON.stringify({ message_id, command, args })); }
      catch { clearTimeout(timer); this.pending.delete(message_id); reject(new Error('Could not send the request to Music Assistant.')); }
    });
  }
  receive(event) {
    let data; try { data = JSON.parse(event.data); } catch { return; }
    const entry = this.pending.get(data.message_id); if (!entry) return;
    if (data.error_code !== undefined) {
      clearTimeout(entry.timer); this.pending.delete(data.message_id);
      entry.reject(new Error('Music Assistant rejected the request. Check that your token is valid and has permission to read players.')); return;
    }
    if (data.partial) { entry.chunks.push(...(Array.isArray(data.result) ? data.result : [data.result])); return; }
    clearTimeout(entry.timer); this.pending.delete(data.message_id);
    entry.resolve(entry.chunks.length ? [...entry.chunks, ...(Array.isArray(data.result) ? data.result : [data.result])] : data.result);
  }
  players() { return this.request('players/all'); }
  rejectPending(error) { for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); } this.pending.clear(); }
  disconnect() {
    const socket = this.socket; this.socket = null;
    if (socket) { socket.onclose = null; socket.close(); }
    this.rejectPending(new Error('Disconnected.'));
  }
}
