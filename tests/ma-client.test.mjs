import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicAssistantClient, websocketAddress } from '../web/ma-client.js';

class FakeSocket {
  static instances = []; static rejectAuth = false; static silent = false;
  constructor(url) {
    this.url = url; this.readyState = 1; this.sent = []; FakeSocket.instances.push(this);
    if (!FakeSocket.silent) queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ server_version: '2.10.9' }) }));
  }
  send(raw) {
    const msg = JSON.parse(raw); this.sent.push(msg);
    const result = msg.command === 'auth' ? { authenticated: true } : [{ player_id: 'onkyo', name: 'Onkyo', available: true }];
    const response = msg.command === 'auth' && FakeSocket.rejectAuth ? { message_id: msg.message_id, error_code: 20, details: 'sensitive server detail' } : { message_id: msg.message_id, result };
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(response) }));
  }
  close() { this.readyState = 3; this.onclose?.(); }
}
test('normalises direct addresses and rejects unsafe or wrong endpoints', () => {
  assert.equal(websocketAddress('http://192.168.1.50:8095/'), 'ws://192.168.1.50:8095/ws');
  assert.equal(websocketAddress('https://music.example.test'), 'wss://music.example.test/ws');
  assert.equal(websocketAddress('ws://host:8095/ws'), 'ws://host:8095/ws');
  for (const value of ['ftp://host', 'http://user:password@host', 'http://host?token=secret', 'http://host#secret', 'http://host/api/hassio_ingress/test']) assert.throws(() => websocketAddress(value));
  assert.throws(() => websocketAddress('http://host:8095', 'https:'), /HTTPS/);
});
test('authenticates before listing players; token never enters URL; no playback calls', async () => {
  const client = new MusicAssistantClient({ WebSocketImpl: FakeSocket });
  assert.equal((await client.connect('http://host:8095', ' secret ')).server_version, '2.10.9');
  assert.equal((await client.players())[0].player_id, 'onkyo');
  const socket = FakeSocket.instances.at(-1);
  assert.equal(socket.url, 'ws://host:8095/ws');
  assert.deepEqual(socket.sent.map(m => m.command), ['auth', 'players/all']);
  assert.equal(socket.sent[0].args.token, 'secret'); client.disconnect();
});
test('auth rejection closes socket without exposing server details or token', async () => {
  FakeSocket.rejectAuth = true;
  const client = new MusicAssistantClient({ WebSocketImpl: FakeSocket });
  try { await assert.rejects(client.connect('http://host', 'private-token'), error => !error.message.includes('private-token') && !error.message.includes('sensitive') && /rejected/.test(error.message)); }
  finally { FakeSocket.rejectAuth = false; }
  assert.equal(FakeSocket.instances.at(-1).readyState, 3);
});
test('unresponsive handshake times out and closes socket', async () => {
  FakeSocket.silent = true;
  const client = new MusicAssistantClient({ WebSocketImpl: FakeSocket, timeout: 10 });
  try { await assert.rejects(client.connect('http://host', 'secret'), /timed out/); }
  finally { FakeSocket.silent = false; }
  assert.equal(FakeSocket.instances.at(-1).readyState, 3);
});
test('unexpected disconnection clears requests and notifies caller', async () => {
  let lost = false;
  const client = new MusicAssistantClient({ WebSocketImpl: FakeSocket, onDisconnect: () => { lost = true; } });
  await client.connect('http://host', 'secret');
  FakeSocket.instances.at(-1).close();
  assert.equal(lost, true); assert.equal(client.pending.size, 0);
  await assert.rejects(client.players(), /Connect/);
});
