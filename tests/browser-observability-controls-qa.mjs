import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-observability-controls-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:600}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function openScenario(scenario){
  await page.goto(`http://127.0.0.1:4173/?scenario=${scenario}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.UI_OBSERVABILITY_CONTROLS_VERSION==='11.13.3a-observability-controls');
}
async function snapshot(){
  return page.evaluate(()=>{
    const E=window.SimEngine,st=E.getState(),controls=document.querySelector('.turn-controls'),summary=document.getElementById('mobileAgentSummary');
    return {
      tick:st.tick,
      version:st.version,
      patchVersion:E.UI_OBSERVABILITY_CONTROLS_VERSION,
      actionText:document.getElementById('actions')?.innerText??'',
      timelineText:document.getElementById('timeline')?.innerText??'',
      presentationOwnership:{actionLabel:E.actionLabel===E.CORE_ACTION_LABEL,resolvers:E.listActionLabelResolvers?.()||[]},
      recentEvents:st.events.slice(0,12).map(e=>({action:e.data?.action||null,tick:e.tick,text:e.text})),
      controls:{
        exists:!!controls,
        position:controls?getComputedStyle(controls).position:null,
        top:controls?controls.getBoundingClientRect().top:null,
        buttons:controls?[...controls.querySelectorAll('button')].map(b=>b.id):[]
      },
      mobileSummary:{
        visible:!!summary&&getComputedStyle(summary).display!=='none',
        rows:summary?[...summary.querySelectorAll('.mobile-agent-row')].map(row=>({entity:row.dataset.entity,text:row.innerText})):[]
      },
      validator:window.SimValidator.validateState(st),
      width:innerWidth,docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth
    };
  });
}

await openScenario('talk-brief');
let desktop=await snapshot();
assert.equal(desktop.patchVersion,'11.13.3a-observability-controls');
assert.equal(desktop.controls.exists,true,'desktop: sticky turn controls missing');
assert.equal(desktop.controls.position,'sticky','desktop: turn controls must stay sticky');
assert.deepEqual(desktop.controls.buttons,['play','step','step10','reset']);
assert.equal(desktop.presentationOwnership.actionLabel,true,'desktop: UI must not replace core actionLabel');
assert.ok(desktop.presentationOwnership.resolvers.some(x=>x.id==='uiObservability.social-status'),'desktop: social presentation resolver missing');
await page.click('#step');
desktop=await snapshot();
assert.ok(desktop.actionText.includes('剛回應老周的聊天邀請・簡短回覆'),`desktop: responder recent-response state missing: ${desktop.actionText}`);
const briefEvent=desktop.recentEvents.find(e=>e.action==='briefTalkReply');
assert.ok(briefEvent,'desktop: canonical brief response event missing');
assert.equal(briefEvent.tick,desktop.tick,'desktop: brief response event should carry canonical creation tick');
assert.equal(briefEvent.text,'阿真簡短回應了老周的聊天邀請，但沒有繼續聊天。','desktop: simulation runtime must own final canonical talk response text');
assert.ok(desktop.timelineText.includes('聊天邀請'),'desktop summary timeline should expose talkOffer');
assert.ok(desktop.timelineText.includes('簡短回應'),'desktop summary timeline should expose brief responder event');
assert.equal(desktop.validator.issueCount,0,`desktop validator: ${desktop.validator.issues.map(x=>x.code).join(', ')}`);
await page.evaluate(()=>scrollTo(0,450));
await page.waitForTimeout(100);
const sticky=await page.evaluate(()=>({scrollY,top:document.querySelector('.turn-controls')?.getBoundingClientRect().top??null,tick:window.SimEngine.getState().tick}));
assert.ok(sticky.scrollY>0,'desktop: test page did not scroll');
assert.ok(sticky.top>=-1&&sticky.top<=1.5,`desktop: sticky controls left viewport top (${sticky.top})`);
await page.click('#step');
const afterStickyClick=await page.evaluate(()=>window.SimEngine.getState().tick);
assert.equal(afterStickyClick,sticky.tick+1,'desktop: sticky single-step button should remain operable after scroll');
await page.screenshot({path:`${outDir}/desktop-sticky-response.png`,fullPage:true});

await page.setViewportSize({width:390,height:844});
await openScenario('talk-no-response');
let mobile=await snapshot();
assert.equal(mobile.controls.exists,true,'mobile: turn controls missing');
assert.equal(mobile.controls.position,'sticky','mobile: turn controls must use sticky positioning');
assert.equal(mobile.mobileSummary.visible,true,'mobile: agent summary should be visible below map');
assert.equal(mobile.mobileSummary.rows.length,3,'mobile: expected three agent status rows');
for(const name of ['老周','阿真','橘子'])assert.ok(mobile.mobileSummary.rows.some(r=>r.text.includes(name)),`mobile: missing ${name} status row`);
await page.click('#step');
mobile=await snapshot();
const requesterRow=mobile.mobileSummary.rows.find(r=>r.entity==='agent:zhou');
assert.ok(requesterRow?.text.includes('等待阿真對「聊天」作出回應'),`mobile: requester waiting state missing: ${requesterRow?.text}`);
assert.ok(requesterRow?.text.includes('餓 ')&&requesterRow.text.includes('渴 ')&&requesterRow.text.includes('社 '),'mobile: compact need values missing');
assert.equal(mobile.validator.issueCount,0,`mobile validator: ${mobile.validator.issues.map(x=>x.code).join(', ')}`);
assert.ok(mobile.docWidth<=mobile.width+1,`mobile document overflow: ${mobile.docWidth}>${mobile.width}`);
assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);

await page.evaluate(()=>{
  const spacer=document.createElement('div');
  spacer.id='mobileStickyQaSpacer';
  spacer.style.height='1200px';
  document.querySelector('.shell')?.appendChild(spacer);
  scrollTo(0,500);
});
await page.waitForTimeout(100);
const mobileSticky=await page.evaluate(()=>({
  scrollY,
  top:document.querySelector('.turn-controls')?.getBoundingClientRect().top??null,
  tick:window.SimEngine.getState().tick,
  htmlOverflowX:getComputedStyle(document.documentElement).overflowX,
  bodyOverflowX:getComputedStyle(document.body).overflowX
}));
assert.ok(mobileSticky.scrollY>0,'mobile: test page did not scroll');
assert.ok(mobileSticky.top>=-1&&mobileSticky.top<=1.5,`mobile: sticky controls left viewport top (${mobileSticky.top})`);
assert.equal(mobileSticky.htmlOverflowX,'clip','mobile: root horizontal clipping should not create a scroll container');
assert.equal(mobileSticky.bodyOverflowX,'clip','mobile: body horizontal clipping should not create a scroll container');
await page.click('#step');
const afterMobileStickyClick=await page.evaluate(()=>window.SimEngine.getState().tick);
assert.equal(afterMobileStickyClick,mobileSticky.tick+1,'mobile: sticky single-step button should remain operable after scroll');
await page.screenshot({path:`${outDir}/mobile-sticky-agent-summary.png`,fullPage:true});

await openScenario('talk-brief');
await page.click('#step');
const mobileBrief=await snapshot();
const responderRow=mobileBrief.mobileSummary.rows.find(r=>r.entity==='agent:zhen');
assert.ok(responderRow?.text.includes('剛回應老周的聊天邀請・簡短回覆'),`mobile: responder recent-response state missing: ${responderRow?.text}`);
assert.ok(mobileBrief.timelineText.includes('簡短回應'),'mobile summary timeline should expose responder event');
assert.ok(mobileBrief.docWidth<=mobileBrief.width+1,`mobile brief document overflow: ${mobileBrief.docWidth}>${mobileBrief.width}`);
await page.screenshot({path:`${outDir}/mobile-brief-response.png`,fullPage:true});

await openScenario('talk-brief');
await page.evaluate(()=>{
  const E=window.SimEngine,st=E.getState(),cat=st.agents.orange,target=st.agents.zhou;
  const bidId=E.addEvent('橘子測試親近互動。','normal',[],{
    actor:cat.id,target:target.id,action:'seekHuman',socialBid:true,bidKind:'catAffection',interactionKind:'socialAffection',expectsResponse:true,
    bidFrom:cat.id,bidTo:target.id,perceivedByTarget:true,position:E.positionRef?.(cat.position)||null
  });
  st.causes[bidId].data.bidId=bidId;
  cat.action=null;
  cat.activeIntent={id:'qa-cat-wait',kind:'awaitResponse',createdTick:st.tick,lifecycle:'open',source:{type:'socialBid',bidId},patienceUntilTick:st.tick+99};
  window.dispatchEvent(new Event('resize'));
});
await page.waitForTimeout(50);
const animalWait=await snapshot();
const catRow=animalWait.mobileSummary.rows.find(r=>r.entity==='agent:orange');
assert.ok(catRow?.text.includes('等待老周對「親近互動」作出回應'),`mobile: animal interaction wait label missing: ${catRow?.text}`);
assert.ok(!catRow?.text.includes('聊天邀請'),`mobile: animal wait label must not be mislabeled as chat: ${catRow?.text}`);

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,desktop,mobile,mobileSticky,mobileBrief,animalWait,pageErrors,consoleErrors},null,2));
console.log('observability controls browser QA: desktop/mobile sticky + interaction labels pass');
await browser.close();
