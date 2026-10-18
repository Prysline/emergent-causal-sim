import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-furniture-passage-yielding-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
const consoleErrors=[],pageErrors=[];
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
page.on('pageerror',error=>pageErrors.push(String(error)));

await page.goto('http://127.0.0.1:4173/editor.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimWorldEditor?.getSession&&window.SimEditorFurniturePassageYieldingAuthoring?.VERSION);
assert.equal(await page.evaluate(()=>window.SimWorldAuthoring.DEFAULT_WORLD_AUTHORING.authoringSchema===window.SimWorldAuthoring.VERSION),true,'Consumer must follow canonical current World Authoring generation');
await page.click('[data-scene-type="furniture"][data-scene-id="chairNW"]');
await page.waitForSelector('[data-furniture-passage-yielding-editor]');
assert.equal(await page.locator('[data-passage-yielding-enabled]').isChecked(),false);
await page.locator('[data-passage-yielding-enabled]').check();
await page.waitForFunction(()=>window.SimWorldEditor.getDocument().furniture.chairNW.passageYielding===true);
const authored=await page.evaluate(()=>{
  const doc=window.SimWorldEditor.getDocument(),chair=doc.furniture.chairNW,contract=window.SimWorldAuthoring.resolveFurniturePassageYieldingContract(chair);
  const roundTrip=window.SimWorldAuthoring.parseAuthoringJSON(window.SimWorldAuthoring.serializeAuthoring(doc));
  return {dirty:window.SimWorldEditor.getSession().dirty,contract,roundTripContract:window.SimWorldAuthoring.resolveFurniturePassageYieldingContract(roundTrip.furniture.chairNW),text:document.querySelector('[data-furniture-passage-yielding-editor]')?.innerText||''};
});
assert.equal(authored.dirty,true);
assert.deepEqual(authored.contract.parkedPlacement,{origin:{x:5,y:2,z:0},orientation:'east'},'Editor default must derive one fixed facing-forward parked placement from authored home');
assert.deepEqual(authored.roundTripContract,authored.contract,'Passage Yielding authoring must survive canonical export/import');
assert.match(authored.text,/固定 parked/);
await page.screenshot({path:`${outDir}/editor-passage-yielding.png`,fullPage:true});

await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.getState&&window.SimFurniturePassageYielding?.applyRuntimeFurniturePlacement&&window.SimUI?.isStarted?.());
const moved=await page.evaluate(()=>{
  const st=window.SimEngine.getState(),chair=st.furniture.chairNW;
  chair.definitionId='chair-basic';chair.origin={x:4,y:2,z:0};chair.passageYielding={version:'furniture-passage-yielding-authoring-v1',homePlacement:{origin:{x:4,y:2,z:0},orientation:'east'},parkedPlacement:{origin:{x:3,y:2,z:0},orientation:'east'},source:'explicit'};
  const before={old:[...(st.map.tiles['4,2']?.furnitureIds||[])],next:[...(st.map.tiles['3,2']?.furnitureIds||[])]};
  const result=window.SimFurniturePassageYielding.applyRuntimeFurniturePlacement(st,'chairNW',chair.passageYielding.parkedPlacement);
  return {ok:result.ok,reason:result.reason||null,origin:st.furniture.chairNW.origin,displayAt:st.furniture.chairNW.displayAt,before,after:{old:[...(st.map.tiles['4,2']?.furnitureIds||[])],next:[...(st.map.tiles['3,2']?.furnitureIds||[])]}};
});
assert.equal(moved.ok,true,moved.reason||'runtime Furniture placement must succeed');
assert.deepEqual(moved.origin,{x:3,y:2,z:0});
assert.equal(moved.after.old.includes('chairNW'),false);
assert.equal(moved.after.next.includes('chairNW'),true);
await page.click('#step');
await page.waitForFunction(()=>window.SimEngine.getState().tick>=1);
const rendered=await page.evaluate(()=>({
  old:!!document.querySelector('.sim-tile[data-tile="4,2"] .furniture-footprint[data-entity="furniture:chairNW"]'),
  next:!!document.querySelector('.sim-tile[data-tile="3,2"] .furniture-footprint[data-entity="furniture:chairNW"]')
}));
assert.equal(rendered.old,false,'runtime Map must not leave Furniture rendering at old placement');
assert.equal(rendered.next,true,'runtime Map must project Furniture at new canonical placement');
await page.screenshot({path:`${outDir}/runtime-passage-yielding-move.png`,fullPage:true});

assert.deepEqual(consoleErrors,[],'Furniture Passage Yielding browser flow must not emit console errors');
assert.deepEqual(pageErrors,[],'Furniture Passage Yielding browser flow must not emit page errors');
await browser.close();
console.log('browser furniture passage yielding QA passed');
