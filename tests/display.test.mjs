import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDisplayMode } from '../web/display.js';
function fixture({embedded=true,blocked=false,supported=true}={}) {
  const elements = Object.fromEntries(['fullscreen','open-standalone','display-status'].map(id=>[id,{hidden:true,disabled:false,setAttribute(key,value){this[key]=value}}]));
  let handler, entries=0;
  const doc={baseURI:'https://ha.example/api/hassio_ingress/session/index.html',fullscreenElement:null,getElementById:id=>elements[id],addEventListener:(event,fn)=>handler=fn,documentElement:{},async exitFullscreen(){doc.fullscreenElement=null;handler();}};
  if(supported)doc.documentElement.requestFullscreen=async()=>{entries++;if(blocked)throw Error('denied');doc.fullscreenElement=doc.documentElement;handler();};
  const self={};setupDisplayMode(doc,{self,top:embedded?{}:self});
  return {doc,elements,entries:()=>entries,change:()=>handler()};
}
test('opens the same authenticated Ingress page without its parent wrapper',()=>{
  const {elements}=fixture();assert.equal(elements['open-standalone'].hidden,false);
  assert.equal(elements['open-standalone'].href,'https://ha.example/api/hassio_ingress/session/');
  assert.equal(fixture({embedded:false}).elements['open-standalone'].hidden,true);
});
test('fullscreen enters on a click and exits cleanly, including external browser exit',async()=>{
  const {doc,elements,entries,change}=fixture();const button=elements.fullscreen;
  assert.equal(entries(),0);await button.onclick();assert.equal(entries(),1);assert.equal(button.textContent,'Exit full screen');assert.equal(button['aria-pressed'],'true');
  await button.onclick();assert.equal(button.textContent,'Full screen');
  await button.onclick();doc.fullscreenElement=null;change();assert.equal(button['aria-pressed'],'false');
});
test('blocked or unsupported full screen preserves usable controls and a fallback',async()=>{
  const {elements}=fixture({blocked:true});await elements.fullscreen.onclick();
  assert.equal(elements['display-status'].hidden,false);assert.match(elements['display-status'].textContent,/Open on its own/);assert.equal(elements.fullscreen.disabled,false);
  assert.equal(fixture({supported:false}).elements.fullscreen.disabled,true);
});
