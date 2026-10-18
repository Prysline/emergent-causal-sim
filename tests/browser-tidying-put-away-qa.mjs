import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));
await page.goto('http://127.0.0.1:4173/editor.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEditorPreviewBridge?.storePreview&&window.SimWorldAuthoring?.VERSION==='world-authoring-v18');
const preview=await page.evaluate(()=>{
  const A=window.SimWorldAuthoring,doc=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
  doc.furniture.bookshelfA={id:'bookshelfA',definitionId:'bookshelf-basic',origin:{x:2,y:4,z:0},orientation:'south'};
  doc.objectStorageAssignments=[{id:'storage:bookA',objectId:'bookA',target:{kind:'furniture',id:'bookshelfA'},mode:'contain'}];
  doc.residents.zhen.initial.knownObjectStorageAssignmentIds=['storage:bookA'];
  doc.residents.zhen.initial.placement={mode:'exact',node:{x:5,y:4,z:0}};
  doc.residents.zhen.initial.facing='north';
  const roundtrip=A.parseAuthoringJSON(A.serializeAuthoring(doc));
  const result=window.SimEditorPreviewBridge.storePreview(roundtrip);
  return {ok:result.ok,stage:result.stage,issues:result.issues,assignments:roundtrip.objectStorageAssignments};
});
assert.equal(preview.ok,true,JSON.stringify(preview));
assert.equal(preview.assignments.length,1);
await page.goto('http://127.0.0.1:4173/index.html?preview=editor',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.getState&&window.SimUI?.isStarted?.());
const initialized=await page.evaluate(()=>{
  const st=window.SimEngine.getState();
  return {preview:window.SimEditorPreviewBridge.getActivePreview().ok,known:st.agents.zhen.knownObjectStorageAssignmentIds,canonical:st.objectStorageAssignments,location:window.SimSpatial.objectLocationState(st,'bookA')};
});
assert.equal(initialized.preview,true);
assert.deepEqual(initialized.known,['storage:bookA']);
assert.equal(initialized.canonical[0]?.id,'storage:bookA');
assert.equal(initialized.location,'supported');
const result=await page.evaluate(()=>{
  const E=window.SimEngine,st=E.getState();
  for(const agent of Object.values(st.agents))Object.assign(agent.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0,social:0,groomingNeed:0});
  const step=document.getElementById('step');
  for(let i=0;i<200&&st.objects.bookA.containedBy!=='bookshelfA';i++)step.click();
  return {containedBy:st.objects.bookA.containedBy,held:st.agents.zhen.held,events:st.events.filter(e=>e.data?.action==='putAwayObject').map(e=>e.data),tick:st.tick};
});
assert.equal(result.containedBy,'bookshelfA','Real Preview UI step lifecycle must autonomously put away book');
assert.equal(result.held,null);
assert.ok(result.events.some(e=>e.storageAssignmentId==='storage:bookA'));
const projection=await page.evaluate(()=>({contained:window.SimEngine.getState().objects.bookA.containedBy,markers:[...document.querySelectorAll('[data-entity="object:bookA"]')].filter(el=>el.offsetParent!==null).length}));
assert.equal(projection.contained,'bookshelfA');
assert.equal(projection.markers,0,'Contained Object should not retain an independent visible Map marker');
assert.deepEqual(pageErrors,[],'Browser must not log uncaught errors');
await browser.close();
console.log('Browser Tidying / Put-away v1 preview QA passed');
