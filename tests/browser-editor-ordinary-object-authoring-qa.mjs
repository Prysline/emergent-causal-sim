import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-editor-ordinary-object-authoring-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
const consoleErrors=[],pageErrors=[];
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
page.on('pageerror',error=>pageErrors.push(String(error)));

await page.goto('http://127.0.0.1:4173/editor.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimWorldEditor?.getSession&&window.SimEditorOrdinaryObjectAuthoring?.VERSION);
assert.equal(await page.evaluate(()=>window.SimEditorOrdinaryObjectAuthoring.VERSION),'editor-ordinary-object-authoring-v1');
assert.equal(await page.locator('#ordinaryObjectCatalog [data-object-template-id="readable-book"]').count(),1,'ordinary object palette must expose the readable-book template');

await page.evaluate(()=>{
  const doc=window.SimWorldEditor.getDocument();
  doc.entities.objects={};
  window.SimWorldEditor.loadDocument(doc);
});
await page.waitForFunction(()=>document.querySelectorAll('[data-editor-ordinary-object-id]').length===0);
assert.equal((await page.evaluate(()=>window.SimWorldEditor.getSession())).dirty,false,'test document load must establish a clean editor baseline');

await page.click('#ordinaryObjectCatalog [data-object-template-id="readable-book"]');
assert.match(await page.locator('#ordinaryObjectOperation').textContent(),/地圖/);
await page.click('[data-cell="5,2"]');
await page.waitForSelector('[data-ordinary-support-kind="furniture"][data-ordinary-support-id="diningTable"]');
assert.match(await page.locator('#ordinaryObjectOperation').textContent(),/地面|家具/,'support-bearing placement must require an explicit support choice');
await page.click('[data-ordinary-support-kind="furniture"][data-ordinary-support-id="diningTable"]');
await page.waitForFunction(()=>!!window.SimWorldEditor.getDocument().entities?.objects?.['readable-book-1']);

let snapshot=await page.evaluate(()=>{
  const doc=window.SimWorldEditor.getDocument();
  const object=doc.entities.objects['readable-book-1'];
  const runtime=window.SimWorldInitializer.createInitialState(doc,{seed:20261009});
  const serialized=window.SimWorldAuthoring.serializeAuthoring(doc);
  const parsed=window.SimWorldAuthoring.parseAuthoringJSON(serialized);
  return {
    object,
    roundTrip:parsed.entities.objects['readable-book-1'],
    runtimeObject:runtime.objects?.['readable-book-1']||null,
    dirty:window.SimWorldEditor.getSession().dirty,
    validation:window.SimWorldEditor.getSession().validation,
    markerCount:document.querySelectorAll('[data-editor-ordinary-object-id="readable-book-1"]').length,
    sceneCount:document.querySelectorAll('[data-ordinary-object-scene-id="readable-book-1"]').length,
    inspector:document.querySelector('#selectionSummary')?.innerText||''
  };
});
assert.equal(snapshot.object.supportId,'diningTable');
assert.deepEqual(snapshot.object.position,{x:5,y:2,z:0});
assert.deepEqual(snapshot.roundTrip,snapshot.object,'export/import serialization must retain canonical ordinary object fields');
assert.ok(snapshot.runtimeObject,'the same authored object must compile into Preview/runtime canonical state');
assert.equal(snapshot.dirty,true);
assert.equal(snapshot.validation.ok,true);
assert.equal(snapshot.markerCount,1,'created ordinary object must be visible on the Editor map');
assert.equal(snapshot.sceneCount,1,'created ordinary object must be visible in the Editor scene list');
assert.match(snapshot.inspector,/一般物件/);
assert.match(snapshot.inspector,/diningTable/);

await page.click('[data-ordinary-object-action="move"]');
await page.click('[data-cell="2,4"]');
await page.waitForFunction(()=>window.SimWorldEditor.getDocument().entities.objects['readable-book-1']?.position?.x===2);
snapshot=await page.evaluate(()=>({
  object:window.SimWorldEditor.getDocument().entities.objects['readable-book-1'],
  validation:window.SimWorldEditor.getSession().validation
}));
assert.deepEqual(snapshot.object.position,{x:2,y:4,z:0});
assert.equal(snapshot.object.supportId,undefined,'floor placement must remove the furniture support relation');
assert.equal(snapshot.validation.ok,true);

await page.click('[data-ordinary-object-action="move"]');
await page.click('[data-cell="5,2"]');
await page.waitForSelector('[data-ordinary-support-kind="furniture"][data-ordinary-support-id="diningTable"]');
await page.click('[data-ordinary-support-kind="furniture"][data-ordinary-support-id="diningTable"]');
await page.waitForFunction(()=>window.SimWorldEditor.getDocument().entities.objects['readable-book-1']?.supportId==='diningTable');

const invalid=await page.evaluate(()=>window.SimEditorOrdinaryObjectAuthoring.createOrdinaryObjectFromTemplate(window.SimWorldEditor.getDocument(),{
  templateId:'not-a-template',target:{x:2,y:4,z:0},supportChoice:{kind:'floor'}
}));
assert.equal(invalid.ok,false);
assert.equal(invalid.issues[0].code,'ordinary_object_template_unknown');

await page.click('[data-ordinary-object-action="remove"]');
await page.waitForFunction(()=>!window.SimWorldEditor.getDocument().entities.objects['readable-book-1']);
snapshot=await page.evaluate(()=>({
  exists:!!window.SimWorldEditor.getDocument().entities.objects['readable-book-1'],
  markerCount:document.querySelectorAll('[data-editor-ordinary-object-id="readable-book-1"]').length,
  sceneCount:document.querySelectorAll('[data-ordinary-object-scene-id="readable-book-1"]').length,
  validation:window.SimWorldEditor.getSession().validation
}));
assert.equal(snapshot.exists,false);
assert.equal(snapshot.markerCount,0);
assert.equal(snapshot.sceneCount,0);
assert.equal(snapshot.validation.ok,true,'remove must leave the canonical authored document valid');

await page.screenshot({path:`${outDir}/ordinary-object-authoring.png`,fullPage:true});
assert.deepEqual(consoleErrors,[],'Editor ordinary-object flow must not emit console errors');
assert.deepEqual(pageErrors,[],'Editor ordinary-object flow must not emit page errors');
await browser.close();
console.log('browser ordinary object authoring QA passed');
