import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const CURRENT_VERSION='11.48.1-sleep-perception-approach';
const DEBUG_VERSION='11.48.1-debug-inspector-sleep-perception-approach';
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
async function clickView(id){
  await page.evaluate(id=>{
    const debug=[...document.querySelectorAll('[data-v1140-debug-view]')].find(node=>node.hidden===false);
    const button=debug?.querySelector(`[data-debug-inspector-view="${id}"]`);
    if(!button)throw new Error(`Missing Debug Inspector view button: ${id}`);
    button.click();
  },id);
}
async function snapshot(){
  return page.evaluate(()=>{
    const debug=[...document.querySelectorAll('[data-v1140-debug-view]')].find(node=>node.hidden===false),diag=debug?.querySelector('[data-debug-sleep-conflict]'),nav=debug?.querySelector('[data-debug-inspector-nav]'),modeBar=debug?.closest('[data-v1140-resident-root]')?.querySelector(':scope > .resident-mode-toggle');
    const direct=[...(debug?.children||[])],navIndex=direct.indexOf(nav),sections=direct.map((node,index)=>({node,index})).filter(x=>x.node.classList?.contains('inspect-section'));
    const overviewBeforeNav=sections.filter(x=>x.index<navIndex&&x.node.dataset.debugDomain==='overview').length;
    const nonOverviewBeforeNav=sections.filter(x=>x.index<navIndex&&x.node.dataset.debugDomain!=='overview').length;
    const firstNonOverviewIndex=sections.find(x=>x.node.dataset.debugDomain!=='overview')?.index??-1;
    const navStyle=nav?getComputedStyle(nav):null,modeStyle=modeBar?getComputedStyle(modeBar):null,contextKv=diag?.querySelector(':scope > .kv'),contextKvStyle=contextKv?getComputedStyle(contextKv):null;
    return {
      version:window.SimEngine.getState().version,debugVersion:window.SimUI.DEBUG_INSPECTOR_DIAGNOSTICS_VERSION,
      views:[...(nav?.querySelectorAll('[data-debug-inspector-view]')||[])].map(b=>({id:b.dataset.debugInspectorView,active:b.classList.contains('active')})),
      diagnosticText:diag?.innerText||'',debugText:debug?.innerText||'',
      visibleSections:[...(debug?.querySelectorAll(':scope > .inspect-section')||[])].filter(x=>!x.hidden).map(x=>x.dataset.debugDomain||''),
      hiddenSections:[...(debug?.querySelectorAll(':scope > .inspect-section')||[])].filter(x=>x.hidden).map(x=>x.dataset.debugDomain||''),
      documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,navWidth:nav?.clientWidth||0,navScrollWidth:nav?.scrollWidth||0,
      navIndex,overviewBeforeNav,nonOverviewBeforeNav,firstNonOverviewIndex,
      navPosition:navStyle?.position||'',navTop:Number.parseFloat(navStyle?.top)||0,navScrollbarWidth:navStyle?.scrollbarWidth||'',
      modePosition:modeStyle?.position||'',modeTop:Number.parseFloat(modeStyle?.top)||0,modeHeight:modeBar?.getBoundingClientRect().height||0,
      contextKvColumns:contextKvStyle?.gridTemplateColumns||'',diagWidth:diag?.clientWidth||0,diagScrollWidth:diag?.scrollWidth||0,
      structuredDetails:diag?.querySelectorAll('details.debug-structured').length||0,openStructuredDetails:diag?.querySelectorAll('details.debug-structured[open]').length||0,
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
  assert.ok(desktop.overviewBeforeNav>0,'shared Overview sections must remain above the category navigation');
  assert.equal(desktop.nonOverviewBeforeNav,0,'category navigation must appear before the first domain-specific section');
  assert.ok(desktop.navIndex<desktop.firstNonOverviewIndex,'category navigation must sit between shared Overview content and domain-specific content');
  assert.equal(desktop.modePosition,'sticky','Resident / Debug mode toggle must remain the first sticky layer');
  assert.equal(desktop.navPosition,'sticky','Debug category navigation must be the second sticky layer');
  assert.ok(desktop.navTop>=desktop.modeHeight,'Debug category navigation sticky offset must clear the mode toggle');
  assert.match(desktop.diagnosticText,/Preferred Slot\s+bed:left/);
  assert.match(desktop.diagnosticText,/Canonical current occupant \(Debug World\)\s+橘子・orange/);
  assert.match(desktop.diagnosticText,/Historical \/ adopted evidence/);
  assert.match(desktop.diagnosticText,/Current-derived probe/);
  assert.match(desktop.diagnosticText,/Adopted resolution\s+wait/);
  assert.match(desktop.diagnosticText,/conflictWaitSource\s+sleepSlotOccupancy/);
  assert.match(desktop.diagnosticText,/carryOccupant/,'current probe must expose carry candidate or its rejection row');
  assert.ok(desktop.structuredDetails>=4,'large structured Debug values must be available through collapsible details');
  assert.equal(desktop.openStructuredDetails,0,'raw structured Debug values should be collapsed by default');
  assert.equal(desktop.hiddenSections.length,0,'default All view must preserve the complete existing Debug Inspector');
  assert.equal(desktop.validator.issueCount,0,`desktop validator: ${desktop.validator.issues.map(x=>x.code).join(', ')}`);

  await clickView('decision');
  desktop=await snapshot();
  assert.equal(desktop.views.find(x=>x.active)?.id,'decision');
  assert.ok(desktop.visibleSections.includes('decision'),'Decision view must expose decision sections');
  assert.ok(!desktop.visibleSections.includes('execution'),'Decision view must hide execution-only sections');
  assert.match(desktop.debugText,/Sleep preferred Slot approach \/ conflict/,'contextual diagnostic must remain prioritized in Decision view');

  await clickView('execution');
  desktop=await snapshot();
  assert.equal(desktop.views.find(x=>x.active)?.id,'execution');
  assert.ok(desktop.visibleSections.includes('execution'),'Execution view must expose Physical / Locomotion diagnostics');
  assert.ok(desktop.visibleSections.includes('decision'),'active contextual domain diagnostic must remain visible outside its category');

  await clickView('all');
  desktop=await snapshot();
  assert.equal(desktop.hiddenSections.length,0,'All view must preserve every Debug Inspector section');

  await page.setViewportSize({width:390,height:844});
  await installConflictFixture();
  await clickView('decision');
  const mobile=await snapshot();
  assert.ok(mobile.documentWidth<=mobile.viewportWidth,'mobile Debug Inspector must not overflow the document viewport');
  assert.ok(mobile.diagScrollWidth<=mobile.diagWidth,'mobile contextual diagnostic must not overflow its own card');
  assert.ok(mobile.navScrollWidth>=mobile.navWidth,'mobile category toolbar may scroll internally without widening the page');
  assert.equal(mobile.navScrollbarWidth,'none','mobile category toolbar must hide the native horizontal scrollbar');
  assert.equal(mobile.modePosition,'sticky');
  assert.equal(mobile.navPosition,'sticky');
  assert.ok(mobile.navTop>=mobile.modeHeight,'mobile category toolbar must stick below Resident / Debug controls');
  assert.equal(mobile.contextKvColumns.trim().split(/\s+/).length,1,'mobile contextual diagnostic key/value rows must use one column');
  assert.match(mobile.diagnosticText,/Current-derived probe/);
  await page.screenshot({path:`${outDir}/mobile-debug-inspector.png`,fullPage:true});
  assert.deepEqual(consoleErrors,[],'browser console errors');
  assert.deepEqual(pageErrors,[],'browser page errors');
  console.log('browser-debug-inspector-contextual-diagnostics-qa: ok');
}finally{
  await browser.close();
}