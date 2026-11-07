import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MusicAssistantClient, managedEndpoints } from '../web/ma-client.js';
import { artworkUrl } from '../web/library.js';

class ManagedSocket {
  static error = null;
  constructor(url) {
    this.url = url; this.readyState = 1; this.sent = []; ManagedSocket.latest = this;
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ server_version: '2.10.9', ...(ManagedSocket.error ? { managed_error: ManagedSocket.error } : {}) }) }));
  }
  send(raw) {
    const data = JSON.parse(raw); this.sent.push(data);
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ message_id: data.message_id, result: [] }) }));
  }
  close() { this.readyState = 3; }
}

test('Ingress connection needs no browser token and makes no browser auth request', async () => {
  const client = new MusicAssistantClient({ WebSocketImpl: ManagedSocket });
  const endpoint = 'wss://home.example/api/hassio_ingress/test/api/ws';
  assert.equal((await client.connectManaged(endpoint)).server_version, '2.10.9');
  assert.equal(ManagedSocket.latest.url, endpoint);
  assert.deepEqual(ManagedSocket.latest.sent, []);
  await client.players();
  assert.deepEqual(ManagedSocket.latest.sent.map(x => x.command), ['players/all']);
  client.disconnect();
});

test('server configuration errors are shown and close the managed connection', async () => {
  ManagedSocket.error = 'Ask the administrator to update the app configuration.';
  const client = new MusicAssistantClient({ WebSocketImpl: ManagedSocket });
  try { await assert.rejects(client.connectManaged('ws://host/api/ws'), /administrator/); }
  finally { ManagedSocket.error = null; }
  assert.equal(ManagedSocket.latest.readyState, 3);
});

test('socket and covers retain HTTPS Ingress prefixes and use the same origin', () => {
  const endpoints = managedEndpoints('https://ha.example/api/hassio_ingress/session/');
  assert.equal(endpoints.socket, 'wss://ha.example/api/hassio_ingress/session/api/ws');
  assert.equal(endpoints.artwork, 'https://ha.example/api/hassio_ingress/session/api/imageproxy/');
  const album = { image: { proxy_id: 'a'.repeat(64), path: '/nas/private.jpg' } };
  assert.equal(artworkUrl(album, 'http://internal-ma:8095', 160, endpoints.artwork), endpoints.artwork + 'a'.repeat(64) + '?size=160');
  album.image.proxy_id = null;
  assert.equal(artworkUrl(album, 'http://internal-ma:8095', 160, endpoints.artwork), '');
  assert.equal(managedEndpoints('http://ha.local/prefix/index.html').socket, 'ws://ha.local/prefix/api/ws');
});

test('installable add-on assets match the standalone source', () => {
  const files = ['index.html', ...readdirSync(new URL('../web/', import.meta.url)).filter(x => /\.(js|css)$/.test(x)).map(x => 'web/' + x)];
  for (const path of files) {
    assert.equal(readFileSync(new URL('../cdshelf/www/' + path, import.meta.url), 'utf8'), readFileSync(new URL('../' + path, import.meta.url), 'utf8'), `${path}: run npm run prepare-addon`);
  }
});
