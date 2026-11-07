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
    const response = msg.command === 'auth' && FakeSocket.rejectAuth ? { message_id: String(msg.message_id), error_code: 20, details: 'sensitive server detail' } : { message_id: String(msg.message_id), result };
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
  const client = new MusicAssistantClient({ WebSocketImpl: FakeSocket, timeout: 50 });
  assert.equal((await client.connect('http://host:8095', ' secret ')).server_version, '2.10.9');
  assert.equal((await client.players())[0].player_id, 'onkyo');
  const socket = FakeSocket.instances.at(-1);
  assert.equal(socket.url, 'ws://host:8095/ws');
  assert.deepEqual(socket.sent.map(m => m.command), ['auth', 'players/all', 'config/players']);
  assert.equal(typeof socket.sent[0].message_id, 'string');
  assert.equal(socket.sent[0].args.token, 'secret'); client.disconnect();
});
test('auth rejection closes socket without exposing server details or token', async () => {
  FakeSocket.rejectAuth = true;
  const client = new MusicAssistantClient({ WebSocketImpl: FakeSocket, timeout: 50 });
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

test('slow track responses get a longer allowance without changing other request timeouts', async () => {
  const client = new MusicAssistantClient({ timeout: 10, trackTimeout: 100 });
  client.socket = { readyState: 1, send(raw) {
    const { message_id, command } = JSON.parse(raw);
    setTimeout(() => client.receive({ data: JSON.stringify({ message_id, result: command.includes('album_tracks') ? [{ item_id: 'track1' }] : [] }) }), 30);
  }, close() {} };
  assert.equal((await client.albumTracks({ item_id: '1' })).length, 1);
  await assert.rejects(client.players(), /did not respond in time/);
  client.disconnect();
});

test('reopening albums shares pending requests and caches independent arrays; refresh discards stale results', async () => {
  const client = new MusicAssistantClient(); let calls = 0; const responses = [];
  client.request = () => { calls++; return new Promise((resolve, reject) => responses.push({ resolve, reject })); };
  const album = { item_id: '1', provider: 'library' };
  const first = client.albumTracks(album), second = client.albumTracks(album);
  assert.equal(calls, 1);
  responses[0].resolve([{ item_id: 'track' }]);
  const a = await first, b = await second; a.pop();
  assert.equal(b.length, 1); assert.equal((await client.albumTracks(album)).length, 1); assert.equal(calls, 1);
  client.clearTrackCache();
  const stale = client.albumTracks(album);
  client.clearTrackCache();
  responses[1].resolve([{ item_id: 'old' }]); await stale;
  assert.equal(client.trackCache.size, 0);
  const retry = client.albumTracks(album);
  responses[2].reject(new Error('temporary failure'));
  await assert.rejects(retry, /temporary failure/);
  const recovered = client.albumTracks(album);
  responses[3].resolve([{ item_id: 'new' }]); assert.equal((await recovered)[0].item_id, 'new');
  client.disconnect(); assert.equal(client.trackCache.size, 0);
});

test('track timeout suggests retrying the album without requiring reconnection', async () => {
  const client = new MusicAssistantClient({ trackTimeout: 5 });
  client.socket = { readyState: 1, send() {}, close() {} };
  await assert.rejects(client.albumTracks({ item_id: '1' }), /Close and reopen this album/);
  assert.equal(client.trackRequests.size, 0); assert.equal(client.pending.size, 0);
  client.disconnect();
});

test('a superseded connection cannot authenticate through or close the newer socket', async () => {
  class DelayedSocket {
    static instances=[];
    constructor(url) {this.url=url;this.readyState=1;this.sent=[];DelayedSocket.instances.push(this);if(url.includes('new-host'))queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({server_version:'2.10.9'})}));}
    send(raw){const msg=JSON.parse(raw);this.sent.push(msg);queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({message_id:msg.message_id,result:{authenticated:true}})}));}
    close(){this.readyState=3;this.onclose?.();}
  }
  const client=new MusicAssistantClient({WebSocketImpl:DelayedSocket,timeout:20});
  const old=client.connect('http://old-host','old-token').catch(error=>error);
  await client.connect('http://new-host','new-token');
  DelayedSocket.instances[0].onmessage?.({data:JSON.stringify({server_version:'2.10.9'})});
  await old;
  const current=DelayedSocket.instances[1];
  assert.equal(current.readyState,1,'late failure of the old attempt closed the new connection');
  assert.deepEqual(current.sent.map(x=>x.args.token),['new-token']);
  client.disconnect();
});

test('explicit disconnect cancels an in-progress handshake immediately', async () => {
  class SilentSocket {constructor(){this.readyState=1;}close(){this.readyState=3;}}
  const client=new MusicAssistantClient({WebSocketImpl:SilentSocket,timeout:10000});
  const pending=client.connectManaged('ws://host/api/ws');
  const rejected=assert.rejects(pending,/cancelled/);
  client.disconnect();await rejected;assert.equal(client.handshake,null);
});


test('malformed greetings fail cleanly rather than throwing from an event callback', async () => {
  class SilentSocket {constructor(){this.readyState=1;}close(){this.readyState=3;}}
  for (const response of ['null','[]']) {
    const client=new MusicAssistantClient({WebSocketImpl:SilentSocket});
    const pending=client.connectManaged('ws://host/api/ws');
    const rejected=assert.rejects(pending,/invalid response/);
    assert.doesNotThrow(()=>client.socket.onmessage({data:response}));
    await rejected;
  }
});
