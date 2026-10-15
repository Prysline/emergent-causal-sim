import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-standing-responsibility-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
const consoleErrors=[],pageErrors=[];
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
page.on('pageerror',error=>pageErrors.push(String(error)));

await page.goto('http://127.0.0.1:4173/editor.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimWorldEditor?.getSession&&window.SimEditorStandingResponsibilityAuthoring?.VERSION);
assert.equal(await page.evaluate(()=>window.SimWorldAuthoring.VERSION),'world-authoring-v16');
assert.equal(await page.evaluate(()=>window.SimEditorStandingResponsibilityAuthoring.VERSION),'editor-standing-responsibility-authoring-v1');
await page.click('[data-scene-type="resident"][data-scene-id="zhen"]');
await page.waitForSelector('[data-standing-responsibility-editor]');
assert.equal(await page.locator('[data-standing-responsibility-resource="food"]').isChecked(),true,'default authored assignee must show food responsibility');
assert.equal(await page.locator('[data-standing-responsibility-resource="water"]').isChecked(),false);
await page.locator('[data-standing-responsibility-resource="water"]').check();
await page.waitForFunction(()=>window.SimWorldEditor.getDocument().resourceResponsibilityAssignments.some(item=>item.id==='responsibility:zhen:restock:water'));
const editorSnapshot=await page.evaluate(()=>{
  const doc=window.SimWorldEditor.getDocument();
  const serialized=window.SimWorldAuthoring.serializeAuthoring(doc);
  const runtime=window.SimWorldInitializer.createInitialState(window.SimWorldAuthoring.parseAuthoringJSON(serialized),{seed:20001,version:'qa'});
  return {
    dirty:window.SimWorldEditor.getSession().dirty,
    assignmentIds:doc.resourceResponsibilityAssignments.map(item=>item.id).sort(),
    known:runtime.agents.zhen.knownResponsibilityAssignmentIds.slice().sort(),
    canonical:runtime.resourceResponsibilityAssignments.map(item=>item.id).sort(),
    editorText:document.querySelector('[data-standing-responsibility-editor]')?.innerText||''
  };
});
assert.equal(editorSnapshot.dirty,true,'responsibility authoring must mark Editor dirty');
assert.deepEqual(editorSnapshot.assignmentIds,['responsibility:zhen:restock:food','responsibility:zhen:restock:water']);
assert.deepEqual(editorSnapshot.known,editorSnapshot.assignmentIds,'Editor export → initializer must derive assignee private known refs');
assert.deepEqual(editorSnapshot.canonical,editorSnapshot.assignmentIds,'runtime must preserve canonical World assignments once');
assert.match(editorSnapshot.editorText,/長期責任/);
await page.screenshot({path:`${outDir}/editor-standing-responsibility.png`,fullPage:true});

await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.getState&&window.SimStandingResponsibility?.VERSION);
await page.evaluate(()=>document.querySelector('[data-entity="agent:zhen"]')?.click());
await page.waitForSelector('[data-standing-responsibility-resident]');
const residentText=await page.locator('[data-standing-responsibility-resident]').innerText();
assert.match(residentText,/長期責任/);
assert.match(residentText,/補充 食物/,'Resident View must project only known durable responsibility');
await page.click('[data-v1140-mode="debug"]');
await page.waitForSelector('[data-standing-responsibility-debug]');
const debugText=await page.locator('[data-standing-responsibility-debug]').innerText();
assert.match(debugText,/responsibility:zhen:restock:food/);
assert.match(debugText,/canonical linked/,'Debug Inspector must expose known-ref → canonical linkage');
await page.screenshot({path:`${outDir}/resident-debug-standing-responsibility.png`,fullPage:true});

assert.deepEqual(consoleErrors,[],'Standing Responsibility browser flow must not emit console errors');
assert.deepEqual(pageErrors,[],'Standing Responsibility browser flow must not emit page errors');
await browser.close();
console.log('browser standing responsibility QA passed');
