import test from 'node:test';
import assert from 'node:assert/strict';
import { AlbumShelf } from '../web/shelf.js';
function setup(stopPlayer = async () => {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id,{disabled:false,hidden:false,textContent:'',dataset:{},children:[],querySelectorAll:()=>[],replaceChildren(){}});
    return elements.get(id);
  };
  globalThis.document={getElementById:element,body:{classList:{remove(){}}}};
  let player={player_id:'onkyo',name:'Onkyo',available:true};
  const shelf=new AlbumShelf({stopPlayer},()=>player); shelf.selected={item_id:'album1'};
  return {shelf,element,setPlayer:p=>player=p};
}
test('explicit Put back waits for Stop before closing the CD; remains usable with no open cover', async()=>{
  let finish; const calls=[];
  const {shelf,element}=setup(id=>{calls.push(id);return new Promise(r=>finish=r)});
  const pending=element('close-album').onclick();
  assert.equal(shelf.selected.item_id,'album1');assert(element('close-album').disabled);assert(element('play-album').disabled);
  finish();await pending;
  assert.deepEqual(calls,['onkyo']);assert.equal(shelf.selected,null);assert(element('album-detail').hidden);
  assert.match(element('play-status').textContent,/Playback stopped/);assert.equal(element('close-album').disabled,false);
});
test('stop failure leaves CD open and gives a visible retry message',async()=>{
  const {shelf,element}=setup(async()=>{throw Error('Device unavailable')});
  await element('close-album').onclick();
  assert.equal(shelf.selected.item_id,'album1');assert.match(element('play-status').textContent,/Could not stop playback/);
  assert.equal(element('close-album').disabled,false);
});
test('closing a cover internally does not stop music; offline devices cannot receive Stop',async()=>{
  const calls=[];const {shelf,setPlayer}=setup(async id=>calls.push(id));
  shelf.closeAlbum();assert.deepEqual(calls,[]);
  setPlayer({player_id:'onkyo',available:false});await shelf.putBack();assert.deepEqual(calls,[]);
});
test('Stop captures its destination and cannot close a different album opened while waiting',async()=>{
  let finish;const calls=[];const {shelf,setPlayer}=setup(id=>{calls.push(id);return new Promise(r=>finish=r)});
  const pending=shelf.putBack();await shelf.putBack();assert.equal(calls.length,1);
  setPlayer({player_id:'denon',name:'Denon',available:true});shelf.selectionGeneration++;shelf.selected={item_id:'other'};
  finish();await pending;assert.equal(calls[0],'onkyo');assert.equal(shelf.selected.item_id,'other');
});
