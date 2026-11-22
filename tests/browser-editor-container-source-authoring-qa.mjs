import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-editor-container-source-authoring-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
const consoleErrors=[],pageErrors=[];
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
page.on('pageerror',error=>pageErrors.push(String(error)));

await page.goto('http://127.0.0.1:4173/editor.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimWorldEditor?.getSession&&window.SimEditorContainerSourceAuthoring?.VERSION);
assert.equal(await page.evaluate(()=>window.SimEditorContainerSourceAuthoring.VERSION),'editor-container-source-authoring-v3');
assert.equal(await page.locator('#containerPresetCatalog [data-container-preset-id="white-cup"]').count(),1);
assert.equal(await page.locator('#containerPresetCatalog [data-container-preset-id^="legacy-resource-"]').count(),0,'retired Food Resource recipes must not appear in Editor');
const retiredPresets=await page.evaluate(()=>{
  const P=window.SimEditorContainerSourceAuthoring,A=window.SimWorldAuthoring;
  const doc=window.SimWorldEditor.getDocument(),before=A.semanticFingerprint(doc);
  const blocked=['legacy-resource-ready-food','legacy-resource-plate','legacy-resource-food-pantry','legacy-resource-basket'].map(id=>({id,visible:!!P.getContainerPreset(id),result:P.createContainerFromPreset(doc,{presetId:id,target:{x:11,y:5,z:0}})}));
  return {blocked,unchanged:A.semanticFingerprint(doc)===before};
});
assert.equal(retiredPresets.unchanged,true,'retired Food create API must not mutate Editor World');
for(const item of retiredPresets.blocked){
  assert.equal(item.visible,false,'retired Food preset must not be exposed through public catalog API');
  assert.equal(item.result.ok,false);
  assert.equal(item.result.issues[0].code,'container_preset_unknown');
}
assert.equal(await page.locator('#sourcePresetCatalog [data-source-preset-id="tap"]').count(),1);
assert.equal(await page.evaluate(()=>document.querySelector('[data-sidebar-section="add"]')?.contains(document.getElementById('containerPresetCatalog'))),true);
assert.equal(await page.evaluate(()=>document.querySelector('[data-sidebar-section="add"]')?.contains(document.getElementById('sourcePresetCatalog'))),true);

await page.click('#containerPresetCatalog [data-container-preset-id="white-cup"]');
assert.match(await page.locator('#containerSourceOperation').textContent(),/下一次點擊地圖/);
await page.click('[data-cell="2,5"]');
await page.waitForFunction(()=>!!window.SimWorldEditor.getDocument().entities?.objects?.['cupWhite-1']);
let snapshot=await page.evaluate(()=>({
  value:window.SimWorldEditor.getDocument().entities.objects['cupWhite-1'],
  dirty:window.SimWorldEditor.getSession().dirty,
  selected:window.SimWorldEditor.getSession().selection,
  actionText:document.querySelector('#selectionActions')?.innerText||'',
  sceneCount:document.querySelectorAll('[data-scene-type="object"][data-scene-id="cupWhite-1"]').length
}));
assert.deepEqual(snapshot.value.contents,{},'new cup preset must start empty');
assert.equal(snapshot.dirty,true);
assert.equal(snapshot.selected.type,'object');
assert.match(snapshot.actionText,/移除物件/);
assert.equal(snapshot.sceneCount,1);

await page.click('#containerPresetCatalog [data-container-preset-id="white-cup"]');
await page.click('[data-cell="11,5"]');
await page.waitForSelector('[data-container-source-support="furniture"][data-support-id="diningTable"]');
await page.click('[data-container-source-support="furniture"][data-support-id="diningTable"]');
await page.waitForFunction(()=>!!window.SimWorldEditor.getDocument().entities?.objects?.['cupWhite-2']);
snapshot=await page.evaluate(()=>window.SimWorldEditor.getDocument().entities.objects['cupWhite-2']);
assert.deepEqual(snapshot.contents,{},'new supported cup must not create Resource Food contents');
assert.equal(snapshot.supportId,'diningTable');

await page.click('#sourcePresetCatalog [data-source-preset-id="tap"]');
await page.click('[data-cell="4,5"]');
await page.waitForFunction(()=>!!window.SimWorldEditor.getDocument().entities?.sources?.['tap-1']);
snapshot=await page.evaluate(()=>({
  source:window.SimWorldEditor.getDocument().entities.sources['tap-1'],
  portMarkers:document.querySelectorAll('[data-interaction-port-source-id="tap-1"]').length,
  actionText:document.querySelector('#selectionActions')?.innerText||''
}));
assert.equal(snapshot.source.resource,'water');
assert.equal(snapshot.source.infinite,true);
assert.deepEqual(snapshot.source.interactionPorts[0].position,{x:3,y:5,z:0});
assert.equal(snapshot.portMarkers,1);
assert.match(snapshot.actionText,/移除資源源頭/);

await page.click('[data-editor-action="move-object"]');
await page.click('[data-cell="5,4"]');
await page.waitForFunction(()=>window.SimWorldEditor.getDocument().entities.sources['tap-1']?.position?.x===5&&window.SimWorldEditor.getDocument().entities.sources['tap-1']?.position?.y===4);
snapshot=await page.evaluate(()=>window.SimWorldEditor.getDocument().entities.sources['tap-1']);
assert.deepEqual(snapshot.position,{x:5,y:4,z:0});
assert.deepEqual(snapshot.interactionPorts[0].position,{x:4,y:4,z:0},'Source move must keep the canonical port offset by translating both');

const parity=await page.evaluate(()=>{
  const doc=window.SimWorldEditor.getDocument();
  const runtime=window.SimWorldInitializer.createInitialState(doc,{seed:20261010,version:'test'});
  const roundTrip=window.SimWorldAuthoring.parseAuthoringJSON(window.SimWorldAuthoring.serializeAuthoring(doc));
  return {
    runtimeCup:runtime.objects['cupWhite-1'],
    runtimeTap:runtime.sources['tap-1'],
    roundTripCup:roundTrip.entities.objects['cupWhite-1'],
    roundTripTap:roundTrip.entities.sources['tap-1'],
    validation:window.SimWorldEditor.getSession().validation
  };
});
assert.deepEqual(parity.runtimeCup.contents,{});
assert.equal(parity.runtimeTap.resource,'water');
assert.deepEqual(parity.runtimeTap.interactionPorts[0].position,{x:4,y:4});
assert.deepEqual(parity.roundTripCup.contents,{});
assert.equal(parity.roundTripTap.infinite,true);
assert.equal(parity.validation.ok,true);

await page.click('[data-container-source-action="remove"]');
await page.waitForFunction(()=>!window.SimWorldEditor.getDocument().entities.sources['tap-1']);
assert.equal(await page.locator('[data-interaction-port-source-id="tap-1"]').count(),0);

await page.click('[data-scene-type="object"][data-scene-id="cupWhite-2"]');
await page.waitForSelector('[data-editor-action="delete-object"]');
await page.click('[data-editor-action="delete-object"]');
await page.waitForFunction(()=>!window.SimWorldEditor.getDocument().entities.objects['cupWhite-2']);

await page.screenshot({path:`${outDir}/container-source-authoring.png`,fullPage:true});
assert.deepEqual(consoleErrors,[],'Container / Source authoring flow must not emit console errors');
assert.deepEqual(pageErrors,[],'Container / Source authoring flow must not emit page errors');
await browser.close();
console.log('browser container/source preset authoring QA passed');
