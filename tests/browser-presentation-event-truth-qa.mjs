import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const outDir='artifacts/browser-presentation-event-truth-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

await page.goto('http://127.0.0.1:4173/?scenario=talk-brief',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimRelease?.VERSION==='11.49.0-agent-facing-foundation');
await page.click('#step');

let snap=await page.evaluate(()=>{
  const st=window.SimEngine.getState(),offer=st.events.find(e=>e.data?.action==='talkOffer');
  return {
    release:window.SimRelease.VERSION,
    label:document.getElementById('releaseLabel')?.textContent?.trim()||'',
    offer:offer?{id:offer.id,text:offer.text,data:{action:offer.data?.action,bidKind:offer.data?.bidKind,interactionKind:offer.data?.interactionKind,socialBid:offer.data?.socialBid}}:null,
    timeline:document.getElementById('timeline')?.innerText||''
  };
});
assert.equal(snap.release,'11.49.0-agent-facing-foundation');
assert.equal(snap.label,'v11.49.0');
assert.ok(snap.offer,'production talkOffer missing');
assert.equal(snap.offer.text,'老周向阿真發出聊天邀請。');
assert.deepEqual(snap.offer.data,{action:'talkOffer',bidKind:'talkOffer',interactionKind:'talk',socialBid:true});
assert.ok(snap.timeline.includes('老周向阿真發出聊天邀請。'),'structured talkOffer must appear in summary');

const truthProbe=await page.evaluate(()=>{
  const E=window.SimEngine,st=E.getState(),offer=st.events.find(e=>e.data?.action==='talkOffer');
  offer.text='中性結構化邀請測試';
  const trapId=E.addEvent('聊天摸摸睡覺吃東西灑水外出回到放進。','normal',[],{actor:'zhou',action:'presentationKeywordTrap'});
  document.querySelector('[data-logmode="full"]')?.click();
  document.querySelector('[data-logmode="summary"]')?.click();
  return {
    timeline:document.getElementById('timeline')?.innerText||'',
    offerId:offer.id,
    trapId
  };
});
assert.ok(truthProbe.timeline.includes('中性結構化邀請測試'),'summary membership must follow structured talkOffer action even when readable text has no legacy keyword');
assert.ok(!truthProbe.timeline.includes('聊天摸摸睡覺吃東西灑水外出回到放進。'),'keyword-only readable text must not create summary semantics');

await page.evaluate(()=>{
  const E=window.SimEngine;
  const noWakeCause=E.addEvent('摘要測試：老周試著引起橘子的注意。','normal',[],{actor:'zhou',target:'orange',action:'attentionStimulus',interactionPurpose:'gainAttention',stimulusKind:'sound',stimulusIntensity:0});
  E.addEvent('摘要測試：橘子沒有因這次刺激醒來。','normal',[noWakeCause],{actor:'zhou',target:'orange',action:'sleepDisturbance',stimulusKind:'sound',stimulusIntensity:0,wakeChance:0,wakeRoll:50});
  const wakeCause=E.addEvent('摘要測試：老周再次試著引起橘子的注意。','normal',[],{actor:'zhou',target:'orange',action:'attentionStimulus',interactionPurpose:'gainAttention',stimulusKind:'sound',stimulusIntensity:24});
  E.addEvent('摘要測試：橘子被老周的刺激喚醒。','normal',[wakeCause],{actor:'orange',action:'sleepWake',wakeReason:'被老周的引起注意互動驚動而醒來',sleepTicks:4,sleepNeed:48,fatigue:0});
  document.querySelector('[data-logmode="full"]')?.click();
  document.querySelector('[data-logmode="summary"]')?.click();
});
await page.waitForFunction(()=>{
  const text=document.getElementById('timeline')?.innerText||'';
  return text.includes('摘要測試：老周試著引起橘子的注意。')&&text.includes('摘要測試：橘子沒有因這次刺激醒來。')&&text.includes('摘要測試：老周再次試著引起橘子的注意。')&&text.includes('摘要測試：橘子被老周的刺激喚醒。');
});
const causalSummary=await page.locator('#timeline').innerText();
assert.ok(causalSummary.includes('摘要測試：老周試著引起橘子的注意。'),'no-wake summary consequence must retain its direct attention cause');
assert.ok(causalSummary.includes('摘要測試：橘子沒有因這次刺激醒來。'),'no-wake summary consequence must remain visible');
assert.ok(causalSummary.includes('摘要測試：老周再次試著引起橘子的注意。'),'wake summary consequence must retain its direct attention cause');
assert.ok(causalSummary.includes('摘要測試：橘子被老周的刺激喚醒。'),'attention-caused sleepWake must become summary-visible');
assert.equal(await page.evaluate(()=>window.SimUI?.TIMELINE_CAUSAL_SUMMARY_VERSION),'timeline-causal-summary-v1');

await page.screenshot({path:`${outDir}/presentation-event-truth.png`,fullPage:true});
assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);

await browser.close();
console.log('browser presentation event truth QA: ok');