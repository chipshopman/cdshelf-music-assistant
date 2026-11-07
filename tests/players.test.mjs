import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicAssistantClient } from '../web/ma-client.js';
import { playerName, playerProtocol, mergePlayerNames, playerLabels } from '../web/players.js';

test('renamed players override stale runtime names and refresh without changing IDs', async () => {
  const client = new MusicAssistantClient(); let name = 'Onkyo DLNA';
  client.request = async command => command === 'players/all' ? [{player_id:'amp',name:'Onkyo',provider:'dlna--instance'}] : [{player_id:'amp',name}];
  let players = await client.players();
  assert.equal(playerName(players[0]), 'Onkyo DLNA');
  assert.match(playerLabels(players)[0], /Onkyo DLNA — DLNA/);
  name = 'Downstairs receiver'; players = await client.players();
  assert.equal(playerName(players[0]), 'Downstairs receiver'); assert.equal(players[0].player_id, 'amp');
});

test('configuration permissions are optional: player discovery and live display names still work', async () => {
  const client = new MusicAssistantClient();
  client.request = async command => {if(command === 'config/players') throw Error('Denied'); return [{player_id:'amp',name:'raw name',display_name:'My receiver'}];};
  assert.equal(playerName((await client.players())[0]), 'My receiver'); assert.equal(client.playerNamesAvailable, false);
});

test('identifies distinct transports and disambiguates identical player/protocol labels', () => {
  const players=[{player_id:'a',name:'Onkyo',provider:'airplay--one'},{player_id:'b',name:'Onkyo',provider:'dlna--two'}];
  assert.deepEqual(playerLabels(players),['Onkyo — AirPlay','Onkyo — DLNA / UPnP']);
  players.push({...players[0],player_id:'c'});
  assert.match(playerLabels(players)[0], /\[a\]/); assert.match(playerLabels(players)[2], /\[c\]/);
  assert.equal(playerProtocol({provider:'homeassistant--1'}),'Home Assistant');
  assert.equal(playerProtocol({provider:'universal_player',active_output_protocol:'air',output_protocols:[{output_protocol_id:'air',name:'AirPlay',protocol_domain:'airplay'}]}),'AirPlay');
  assert.equal(mergePlayerNames([{player_id:'a',name:'x'}],null)[0].display_name,'x');
});

test('stop uses the selected player ID and no queue or library mutation', async () => {
  const client = new MusicAssistantClient(); const calls=[];
  client.request=async(command,args)=>calls.push({command,args});
  await client.stopPlayer('onkyo');
  assert.deepEqual(calls,[{command:'players/cmd/stop',args:{player_id:'onkyo'}}]);
  await assert.rejects(client.stopPlayer(''),/Choose/); assert.equal(calls.length,1);
});
