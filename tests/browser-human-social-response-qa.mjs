import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-human-social-response-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function openScenario(scenario){
  await page.goto(`http://127.0.0.1:4173/?scenario=${scenario}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION==='11.13.3a-human-social-response');
  return page.evaluate(()=>({
    version:window.SimEngine.getState().version,
    scenarioValue:document.getElementById('socialScenario')?.value??null
  }));
}
async function step(){await page.click('#step');}
async function snapshot(){
  return page.evaluate(()=>{
    const E=window.SimEngine,st=E.getState();
    const offer=st.events.find(e=>e.data?.action==='talkOffer');
    const response=st.events.find(e=>e.data?.responseToBid===offer?.id&&['acceptTalk','briefTalkReply','declineTalk'].includes(e.data?.action));
    const talk=st.events.find(e=>e.data?.action==='talk'&&e.data?.talkOfferId===offer?.id);
    const timeout=st.events.find(e=>e.data?.action==='socialWaitEnded'&&e.data?.bidId===offer?.id);
    return {
      version:st.version,humanSocialVersion:E.HUMAN_SOCIAL_RESPONSE_SCHEMA_VERSION,
      offerId:offer?.id??null,
      responseId:response?.id??null,responseAction:response?.data?.action??null,responseToBid:response?.data?.responseToBid??null,
      talkId:talk?.id??null,talkOfferId:talk?.data?.talkOfferId??null,talkResponseEventId:talk?.data?.talkResponseEventId??null,
      timeout:timeout?{id:timeout.id,visibility:timeout.data?.visibility??null,bidKind:timeout.data?.bidKind??null,responderContextObserved:timeout.data?.responderContextObserved??null,observedResponderActionKind:timeout.data?.observedResponderActionKind??null}:null,
      validator:window.SimValidator.validateState(st),scenarioValue:document.getElementById('socialScenario')?.value??null,
      timelineText:document.getElementById('timeline')?.innerText??'',
      width:innerWidth,docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      pageTitle:document.title
    };
  });
}

const opened=await openScenario('talk-engage');
assert.equal(opened.version,'11.13.3a-human-social-response');
assert.equal(opened.scenarioValue,'talk-engage');
assert.ok((await page.title()).includes('Human Social Response Agency'));
await step();let desktop=await snapshot();
fs.writeFileSync(`${outDir}/desktop-state.json`,JSON.stringify(desktop,null,2));
await page.screenshot({path:`${outDir}/desktop-engage.png`,fullPage:true});
assert.ok(desktop.offerId,'desktop engage: talkOffer missing after first step');
assert.equal(desktop.responseAction,'acceptTalk','desktop engage: idle high-social responder should accept after observing offer');
assert.equal(desktop.responseToBid,desktop.offerId,'desktop engage: responder outcome must point back to talkOffer');
assert.ok(desktop.talkId,'desktop engage: accepted offer must produce full talk');
assert.equal(desktop.talkOfferId,desktop.offerId,'desktop engage: full talk must preserve originating talkOffer');
assert.equal(desktop.talkResponseEventId,desktop.responseId,'desktop engage: full talk must preserve the explicit responder event');
assert.equal(desktop.validator.issueCount,0,`desktop validator: ${desktop.validator.issues.map(x=>x.code).join(', ')}`);
assert.ok(desktop.timelineText.includes('開口示意想聊幾句'),'desktop timeline should expose the talk offer');
assert.ok(desktop.docWidth<=desktop.width+1,`desktop document overflow: ${desktop.docWidth}>${desktop.width}`);
assert.ok(desktop.bodyWidth<=desktop.width+1,`desktop body overflow: ${desktop.bodyWidth}>${desktop.width}`);

await page.setViewportSize({width:390,height:844});
await openScenario('talk-no-response');
await step();
let mobile=await snapshot();
assert.ok(mobile.offerId,'mobile no-response: talkOffer missing');
for(let i=0;i<6&&!mobile.timeout;i++){await step();mobile=await snapshot();}
fs.writeFileSync(`${outDir}/mobile-state.json`,JSON.stringify(mobile,null,2));
await page.screenshot({path:`${outDir}/mobile-no-response.png`,fullPage:true});
assert.ok(mobile.timeout,'mobile no-response: requester timeout missing');
assert.equal(mobile.responseAction,null,'mobile no-response: ambiguous absence must not become accept/brief/decline');
assert.equal(mobile.talkId,null,'mobile no-response: no full talk should occur');
assert.equal(mobile.timeout.visibility,'private');
assert.equal(mobile.timeout.bidKind,'talkOffer');
assert.equal(mobile.validator.issueCount,0,`mobile validator: ${mobile.validator.issues.map(x=>x.code).join(', ')}`);
assert.ok(mobile.timelineText.includes('沒有得到立即回應'),'mobile timeline should describe only the lack of immediate response');
assert.ok(!mobile.timelineText.includes('故意無視'),'mobile timeline must not infer intentional ignoring');
assert.ok(mobile.docWidth<=mobile.width+1,`mobile document overflow: ${mobile.docWidth}>${mobile.width}`);
assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,desktop:{...desktop,timelineText:undefined},mobile:{...mobile,timelineText:undefined},pageErrors,consoleErrors},null,2));
console.log('human social response browser QA: 2/2 pass');
await browser.close();
