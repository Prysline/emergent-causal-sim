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
assert.equal(desktop.version,'11.13.3a-human-social-response');
assert.equal(desktop.controls.exists,true,'desktop: sticky turn controls missing');
assert.equal(desktop.controls.position,'sticky','desktop: turn controls must stay sticky');
assert.deepEqual(desktop.controls.buttons,['play','step','step10','reset']);
await page.click('#step');
desktop=await snapshot();
assert.ok(desktop.actionText.includes('剛回應老周的聊天邀請・簡短回覆'),`desktop: responder recent-response state missing: ${desktop.actionText}`);
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
assert.equal(mobile.mobileSummary.visible,true,'mobile: agent summary should be visible below map');
assert.equal(mobile.mobileSummary.rows.length,3,'mobile: expected three agent status rows');
for(const name of ['老周','阿真','橘子'])assert.ok(mobile.mobileSummary.rows.some(r=>r.text.includes(name)),`mobile: missing ${name} status row`);
await page.click('#step');
mobile=await snapshot();
const requesterRow=mobile.mobileSummary.rows.find(r=>r.entity==='agent:zhou');
assert.ok(requesterRow?.text.includes('等待阿真回應聊天邀請'),`mobile: requester waiting state missing: ${requesterRow?.text}`);
assert.ok(requesterRow?.text.includes('餓 ')&&requesterRow.text.includes('渴 ')&&requesterRow.text.includes('社 '),'mobile: compact need values missing');
assert.equal(mobile.validator.issueCount,0,`mobile validator: ${mobile.validator.issues.map(x=>x.code).join(', ')}`);
assert.ok(mobile.docWidth<=mobile.width+1,`mobile document overflow: ${mobile.docWidth}>${mobile.width}`);
assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);
await page.screenshot({path:`${outDir}/mobile-map-agent-summary.png`,fullPage:true});

await openScenario('talk-brief');
await page.click('#step');
const mobileBrief=await snapshot();
const responderRow=mobileBrief.mobileSummary.rows.find(r=>r.entity==='agent:zhen');
assert.ok(responderRow?.text.includes('剛回應老周的聊天邀請・簡短回覆'),`mobile: responder recent-response state missing: ${responderRow?.text}`);
assert.ok(mobileBrief.timelineText.includes('簡短回應'),'mobile summary timeline should expose responder event');
assert.ok(mobileBrief.docWidth<=mobileBrief.width+1,`mobile brief document overflow: ${mobileBrief.docWidth}>${mobileBrief.width}`);
await page.screenshot({path:`${outDir}/mobile-brief-response.png`,fullPage:true});

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,desktop,mobile,mobileBrief,pageErrors,consoleErrors},null,2));
console.log('observability controls browser QA: 3/3 pass');
await browser.close();
