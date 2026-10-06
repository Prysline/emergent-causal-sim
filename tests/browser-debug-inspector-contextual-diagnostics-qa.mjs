import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const CURRENT_VERSION='11.48.0-carrying-replanning';
const DEBUG_VERSION='11.48.0-debug-inspector-contextual-diagnostics';
const outDir='artifacts/browser-debug-inspector-contextual-diagnostics-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function installConflictFixture(){
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(version=>window.SimUI?.DEBUG_INSPECTOR_DIAGNOSTICS_VERSION===version,DEBUG_VERSION);
  await page.evaluate(()=>{
    const E=window.SimEngine,SP=window.SimSpatial,SC=window.SimSleepConflict,st=E.getState(),requester=st.agents.zhen,occupant=st.agents.orange;
    const slot=SP.getSlot(st,'bed:left');
    st.usageAssignments=[...(st.usageAssignments||[]).filter(x=>x?.id!=='qa-zhen-sleep-left'),{id:'qa-zhen-sleep-left',principal:{kind:'agent',id:'zhen'},activity:'sleep',target:{kind:'slot',id:'bed:left'}}];
    occupant.offMap=false;occupant.position={...slot.position};occupant.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};occupant.needs.sleepNeed=80;occupant.action={kind:'sleep',phase:'sleeping',sleepTicks:0,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0};occupant.activeIntent=null;E.ensureIntentForAction(st,occupant);
    const approach=SP.slotApproachNodes(st,slot,requester,'walk')[0];requester.offMap=false;requester.position={...approach};requester.posture={kind:'standing',slotId:null,furnitureId:null};requester.needs.sleepNeed=90;requester.action=E.buildAction(requester,{id:'sleep'});E.ensureIntentForAction(st,requester);
    E.adoptDecisionEvidence(st,requester,requester.action,{source:{type:'qa',tick:st.tick,intentKind:'sleep'},contributors:E.decisionContributorsForAction(requester,'sleep'),utility:E.baseUtilityForAction(requester,'sleep')});
    const conflict=SC.selfSleepAssociations(st,requester).find(x=>x.slot.id==='bed:left');if(!conflict)throw new Error('QA fixture failed to form preferred Slot association');
    const evaluation=SC.conflictCandidates(st,requester,conflict);
    E.captureConflictResolutionEvidence(st,requester,requester.action,{preferredSlot:{kind:'slot',id:'bed:left'},associationReasons:conflict.reasons,observation:evaluation.observation,candidates:evaluation.candidates.map(c=>({kind:c.kind,score:c.score,target:c.target||null,targetAgent:c.targetAgent||null,targetPlacement:c.targetPlacement||null,cooperative:c.cooperative===true,cooperationEvidence:c.cooperationEvidence||null,contributors:c.contributors||[]})),selectedResolution:'wait',contributors:evaluation.candidates.find(c=>c.kind==='wait')?.contributors||[]});
    requester.action.phase='conflictWait';requester.action.preferredConflictSlotId='bed:left';requester.action.conflictWaitSource='sleepSlotOccupancy';requester.action.conflictWaitStartedTick=st.tick;requester.action.conflictWaitUntilTick=st.tick+1;
    document.querySelector('[data-entity="agent:zhen"]')?.click();
  });
  await page.waitForSelector('[data-v1140-resident-root]');
  await page.click('[data-v1140-mode="debug"]');
  await page.waitForFunction(()=>document.querySelector('[data-v1140-debug-view]')?.hidden===false);
  await page.waitForSelector('[data-debug-inspector-nav]');
  await page.waitForSelector('[data-debug-sleep-conflict]');
}
async function snapshot(){
  return page.evaluate(()=>{
    const debug=document.querySelector('[data-v1140-debug-view]'),diag=debug?.querySelector('[data-debug-sleep-conflict]'),nav=debug?.querySelector('[data-debug-inspector-nav]');
    return {
      version:window.SimEngine.getState().version,debugVersion:window.SimUI.DEBUG_INSPECTOR_DIAGNOSTICS_VERSION,
      views:[...(nav?.querySelectorAll('[data-debug-inspector-view]')||[])].map(b=>({id:b.dataset.debugInspectorView,active:b.classList.contains('active')})),
      diagnosticText:diag?.innerText||'',debugText:debug?.innerText||'',
      visibleSections:[...(debug?.querySelectorAll(':scope > .inspect-section')||[])].filter(x=>!x.hidden).map(x=>x.dataset.debugDomain||''),
      hiddenSections:[...(debug?.querySelectorAll(':scope > .inspect-section')||[])].filter(x=>x.hidden).map(x=>x.dataset.debugDomain||''),
      documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,navWidth:nav?.clientWidth||0,navScrollWidth:nav?.scrollWidth||0,
      validator:window.SimValidator.validateState(window.SimEngine.getState())
    };
  });
}

try{
  await installConflictFixture();
  let desktop=await snapshot();
  assert.equal(desktop.version,CURRENT_VERSION);
  assert.equal(desktop.debugVersion,DEBUG_VERSION);
  assert.deepEqual(desktop.views.map(x=>x.id),['overview','decision','execution','world','perception','social','all']);
  assert.equal(desktop.views.find(x=>x.active)?.id,'all');
  assert.match(desktop.diagnosticText,/Preferred Slot\s+bed:left/);
  assert.match(desktop.diagnosticText,/Canonical current occupant\s+橘子・orange/);
  assert.match(desktop.diagnosticText,/Historical \/ adopted evidence/);
  assert.match(desktop.diagnosticText,/Current-derived probe/);
  assert.match(desktop.diagnosticText,/Adopted resolution\s+wait/);
  assert.match(desktop.diagnosticText,/conflictWaitSource\s+sleepSlotOccupancy/);
  assert.match(desktop.diagnosticText,/carryOccupant/,'current probe must expose carry candidate or its rejection row');
  assert.equal(desktop.hiddenSections.length,0,'default All view must preserve the complete existing Debug Inspector');
  assert.equal(desktop.validator.issueCount,0,`desktop validator: ${desktop.validator.issues.map(x=>x.code).join(', ')}`);

  await page.click('[data-debug-inspector-view="decision"]');
  desktop=await snapshot();
  assert.equal(desktop.views.find(x=>x.active)?.id,'decision');
  assert.ok(desktop.visibleSections.includes('decision'),'Decision view must expose decision sections');
  assert.ok(!desktop.visibleSections.includes('execution'),'Decision view must hide execution-only sections');
  assert.match(desktop.debugText,/Sleep preferred Slot conflict/,'contextual diagnostic must remain prioritized in Decision view');

  await page.click('[data-debug-inspector-view="execution"]');
  desktop=await snapshot();
  assert.equal(desktop.views.find(x=>x.active)?.id,'execution');
  assert.ok(desktop.visibleSections.includes('execution'),'Execution view must expose Physical / Locomotion diagnostics');
  assert.ok(desktop.visibleSections.includes('decision'),'active contextual domain diagnostic must remain visible outside its category');

  await page.click('[data-debug-inspector-view="all"]');
  desktop=await snapshot();
  assert.equal(desktop.hiddenSections.length,0,'All view must preserve every Debug Inspector section');

  await page.setViewportSize({width:390,height:844});
  await page.click('[data-debug-inspector-view="decision"]');
  const mobile=await snapshot();
  assert.ok(mobile.documentWidth<=mobile.viewportWidth,'mobile Debug Inspector must not overflow the document viewport');
  assert.ok(mobile.navScrollWidth>=mobile.navWidth,'mobile category toolbar may scroll internally without widening the page');
  assert.match(mobile.diagnosticText,/Current-derived probe/);
  await page.screenshot({path:`${outDir}/mobile-debug-inspector.png`,fullPage:true});
  assert.deepEqual(consoleErrors,[],'browser console errors');
  assert.deepEqual(pageErrors,[],'browser page errors');
  console.log('browser-debug-inspector-contextual-diagnostics-qa: ok');
}finally{
  await browser.close();
}
