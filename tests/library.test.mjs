import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicAssistantClient } from '../web/ma-client.js';
import { loadAlbumLibrary, filterAlbums, artworkUrl, durationLabel } from '../web/library.js';
const album = (id, name = `Album ${id}`, artist = 'Artist') => ({item_id:String(id),provider:'library',uri:`library://album/${id}`,name,artists:[{name:artist}]});
test('loads all 451 albums over paginated API, including beyond 300', async () => {
  const all=Array.from({length:451},(_,i)=>album(i)); const offsets=[];
  const result=await loadAlbumLibrary({albumPage:async(offset,limit)=>{offsets.push(offset);return all.slice(offset,offset+limit);}});
  assert.equal(result.length,451); assert.deepEqual(offsets,[0,200,400]);
});
test('handles empty collections, stops repeated pages and cancels stale loads', async () => {
  assert.deepEqual(await loadAlbumLibrary({albumPage:async()=>[]}),[]);
  await assert.rejects(loadAlbumLibrary({albumPage:async()=>[album(1),album(2)]},{pageSize:2}),/repeated/);
  let cancelled=false;
  assert.equal(await loadAlbumLibrary({albumPage:async()=>{cancelled=true;return[album(1)];}},{cancelled:()=>cancelled}),null);
});
test('searches artist, album and version; supports natural sorting', () => {
  const all=[album(1,'Volume 10','Tallis'),album(2,'Volume 2','Tallis'),album(3,'The Lamb','Tavener')];
  assert.deepEqual(filterAlbums(all,'TALLIS').map(a=>a.item_id),['2','1']);
  assert.equal(filterAlbums(all,'missing').length,0);
});
test('uses MA image proxy for local NAS artwork without placing credentials in URL', () => {
  const a=album(1);a.metadata={images:[{type:'thumb',path:'/nas/music/front.jpg',provider:'filesystem_smb',proxy_id:'a'.repeat(64)}]};
  assert.equal(artworkUrl(a,'http://192.168.1.50:8095',160),`http://192.168.1.50:8095/imageproxy/${'a'.repeat(64)}?size=160`);
  a.metadata.images[0].proxy_id=null; assert.equal(artworkUrl(a,'http://host:8095'),'');
  a.image={path:'javascript:alert(1)',remotely_accessible:true};assert.equal(artworkUrl(a,'http://host'),'');
  a.image={path:'https://example.test/cover.jpg',remotely_accessible:true};assert.equal(artworkUrl(a,'http://host'),'https://example.test/cover.jpg');
  assert.equal(artworkUrl(album(3),'http://host'),'');
});
test('album calls use 2.10.9 arguments and playback resolves the selected active queue', async () => {
  const client=new MusicAssistantClient(); const calls=[];
  client.request=async(command,args)=>{calls.push({command,args});return command==='player_queues/get_active_queue'?{queue_id:'onkyo-group'}:[];};
  await client.albumPage(200,200);await client.albumTracks(album(1));await client.playAlbum(album(1),'onkyo');
  assert.deepEqual(calls[0],{command:'music/albums/library_items',args:{offset:200,limit:200,order_by:'sort_name',summary:false}});
  assert.deepEqual(calls[1],{command:'music/albums/album_tracks',args:{item_id:'1',provider_instance_id_or_domain:'library'}});
  assert.deepEqual(calls[2],{command:'player_queues/get_active_queue',args:{player_id:'onkyo'}});
  assert.deepEqual(calls[3],{command:'player_queues/play_media',args:{queue_id:'onkyo-group',media:'library://album/1',option:'replace',shuffle:false}});
});
test('missing player or queue cannot issue playback', async()=>{
  const client=new MusicAssistantClient();const calls=[];client.request=async(c)=>{calls.push(c);return null;};
  await assert.rejects(client.playAlbum(album(1),''),/Choose/);assert.equal(calls.length,0);
  await assert.rejects(client.playAlbum(album(1),'missing'),/No playback queue/);assert.deepEqual(calls,['player_queues/get_active_queue']);
});
test('formats track duration including lengthy classical movements',()=>{assert.equal(durationLabel(3672),'61:12');assert.equal(durationLabel(null),'');});
