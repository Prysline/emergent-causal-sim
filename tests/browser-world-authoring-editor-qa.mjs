import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-world-authoring-editor-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:820}});
const consoleErrors=[],pageErrors=[];
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
page.on('pageerror',error=>pageErrors.push(String(error)));

await page.goto('http://127.0.0.1:4173/editor.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimWorldEditor?.getSession);

let snapshot=await page.evaluate(()=>({
  session:window.SimWorldEditor.getSession(),
  document:window.SimWorldEditor.getDocument(),
  runtimeGlobals:{
    initializer:typeof window.SimWorldInitializer,
    world:typeof window.SimWorld,
    spatial:typeof window.SimSpatial,
    engine:typeof window.SimEngine,
    validator:typeof window.SimValidator
  },
  mapCells:document.querySelectorAll('#editorMap [data-cell]').length,
  sceneItems:document.querySelectorAll('#sceneList [data-scene-type][data-scene-id]').length,
  residentMarkers:document.querySelectorAll('#editorMap [data-entity-type="resident"]').length,
  objectMarkers:document.querySelectorAll('#editorMap [data-entity-type="container"], #editorMap [data-entity-type="source"]').length,
  oldEntityDots:document.querySelectorAll('#editorMap .entity-dot').length,
  width:innerWidth,
  docWidth:document.documentElement.scrollWidth
}));
assert.equal(snapshot.session.currentZ,0);
assert.equal(snapshot.session.dirty,false);
assert.equal(snapshot.session.validation.ok,true);
assert.equal(snapshot.mapCells,96);
assert.equal(snapshot.sceneItems,
  Object.keys(snapshot.document.furniture||{}).length+
  Object.keys(snapshot.document.entities?.containers||{}).length+
  Object.keys(snapshot.document.entities?.sources||{}).length+
  Object.keys(snapshot.document.residents||{}).length,
  'scene list must expose every current furniture/object/resident instance');
assert.ok(snapshot.residentMarkers>0,'resident authored positions must use typed map markers');
assert.ok(snapshot.objectMarkers>0,'container/source authored positions must use typed map markers');
assert.equal(snapshot.oldEntityDots,0,'generic green entity dots must be removed');
for(const value of Object.values(snapshot.runtimeGlobals))assert.equal(value,'undefined','Editor must not bootstrap runtime simulation modules');
assert.ok(snapshot.docWidth<=snapshot.width+1,`desktop document overflow: ${snapshot.docWidth}>${snapshot.width}`);

await page.click('[data-scene-type="resident"][data-scene-id="zhen"]');
snapshot=await page.evaluate(()=>({session:window.SimWorldEditor.getSession(),document:window.SimWorldEditor.getDocument(),selectionText:document.querySelector('#selectionSummary')?.textContent||''}));
assert.deepEqual(snapshot.session.selection,{kind:'entity',type:'resident',id:'zhen'});
assert.deepEqual(snapshot.session.selectedCell,{x:9,y:3,z:0});
assert.equal(snapshot.session.dirty,false,'scene selection must remain presentation-only');
assert.match(snapshot.selectionText,/阿真/,'Inspector must identify the selected resident by name');

await page.fill('#newLayerZ','1');
await page.click('#addLayer');
snapshot=await page.evaluate(()=>({session:window.SimWorldEditor.getSession(),document:window.SimWorldEditor.getDocument()}));
assert.equal(snapshot.session.currentZ,1);
assert.equal(snapshot.session.dirty,true);
assert.deepEqual(snapshot.document.map.layers.map(layer=>layer.z),[0,1]);

await page.click('[data-tool="floor"]');
await page.click('[data-cell="2,2"]');
snapshot=await page.evaluate(()=>({session:window.SimWorldEditor.getSession(),document:window.SimWorldEditor.getDocument()}));
assert.equal(snapshot.document.map.layers.find(layer=>layer.z===1).cells['2,2'].terrain,'floor');
assert.equal(snapshot.session.validation.ok,true);

const downloadPromise=page.waitForEvent('download');
await page.click('#exportWorld');
const download=await downloadPromise;
assert.ok(download.suggestedFilename().endsWith('.world.json'));
snapshot=await page.evaluate(()=>({session:window.SimWorldEditor.getSession(),fingerprint:window.SimWorldEditor.semanticFingerprint()}));
assert.equal(snapshot.session.dirty,false,'export should establish the current authoring document as the clean baseline');
const cleanFingerprint=snapshot.fingerprint;

await page.click('#layerPrev');
const afterLayerSwitch=await page.evaluate(()=>({session:window.SimWorldEditor.getSession(),fingerprint:window.SimWorldEditor.semanticFingerprint()}));
assert.equal(afterLayerSwitch.session.currentZ,0);
assert.equal(afterLayerSwitch.session.dirty,false,'Z-level presentation switch must not dirty authoring truth');
assert.equal(afterLayerSwitch.fingerprint,cleanFingerprint,'Z-level presentation switch must be state-inert');

await page.click('[data-scene-type="furniture"][data-scene-id="chairNW"]');
let furnitureSelection=await page.evaluate(()=>window.SimWorldEditor.getSession());
assert.deepEqual(furnitureSelection.selection,{kind:'entity',type:'furniture',id:'chairNW'});
assert.equal(furnitureSelection.selectedFurnitureId,'chairNW');
assert.equal(furnitureSelection.selectedTool,'floor','selecting a scene entity must not silently change the active authoring tool');
await page.click('[data-tool="furniture"]');
await page.click('[data-cell="3,4"]');
snapshot=await page.evaluate(()=>({session:window.SimWorldEditor.getSession(),document:window.SimWorldEditor.getDocument()}));
assert.equal(snapshot.session.dirty,true);
assert.deepEqual(snapshot.document.furniture.chairNW.footprint,[{x:3,y:4,z:0}]);
assert.deepEqual(snapshot.document.furniture.chairNW.slots[0].position,{x:3,y:4,z:0});
assert.deepEqual(snapshot.document.entities.containers.mealTray.position,{x:5,y:2,z:0},'furniture placement must not auto-move separately authored entities');

await page.click('[data-entity-type="resident"][data-entity-id="orange"]');
snapshot=await page.evaluate(()=>({session:window.SimWorldEditor.getSession(),selectionText:document.querySelector('#selectionSummary')?.textContent||''}));
assert.deepEqual(snapshot.session.selection,{kind:'entity',type:'resident',id:'orange'},'map marker selection must share the scene-list selection owner');
assert.match(snapshot.selectionText,/橘子/);

await page.click('[data-tool="opening"]');
await page.click('[data-cell="2,2"]');
snapshot=await page.evaluate(()=>({session:window.SimWorldEditor.getSession(),document:window.SimWorldEditor.getDocument(),topology:window.SimWorldEditor.getDerivedTopology()}));
assert.equal(snapshot.document.map.layers.find(layer=>layer.z===0).cells['2,2'].terrain,'doorway');
assert.equal(snapshot.topology.cells['2,2'].structuralOpen,true,'Editor opening must derive structural openness without authored walkability flags');
assert.equal(snapshot.topology.cells['2,2'].open,false,'existing fixed foodPantry must still block this opening by concrete geometry');
assert.deepEqual(snapshot.topology.cells['2,2'].blockedBy,['container:foodPantry']);
assert.equal(snapshot.session.validation.ok,true);

await page.screenshot({path:`${outDir}/desktop-editor.png`,fullPage:true});

await page.setViewportSize({width:390,height:844});
await page.waitForTimeout(100);
const mobile=await page.evaluate(()=>({
  width:innerWidth,
  docWidth:document.documentElement.scrollWidth,
  bodyWidth:document.body.scrollWidth,
  mapScroll:getComputedStyle(document.querySelector('.map-scroll')).overflowX,
  session:window.SimWorldEditor.getSession()
}));
assert.ok(mobile.docWidth<=mobile.width+1,`mobile document overflow: ${mobile.docWidth}>${mobile.width}`);
assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);
assert.ok(['auto','scroll'].includes(mobile.mapScroll),'map should scroll internally on narrow screens');
assert.equal(mobile.session.validation.ok,true);
await page.screenshot({path:`${outDir}/mobile-editor.png`,fullPage:true});

assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
await browser.close();
console.log('browser world authoring editor QA: ok');