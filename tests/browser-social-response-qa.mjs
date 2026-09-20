import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-social-response-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function runScenario(scenario){
  await page.goto(`http://127.0.0.1:4173/?scenario=${scenario}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine?.SOCIAL_RESPONSE_SCHEMA_VERSION==='11.13.2a-social-response-agency');
  await page.click('#step');
  await page.waitForFunction(()=>window.SimEngine.getState().events.some(e=>e.data?.action==='petOffer'));
  await page.evaluate(()=>document.querySelector('[data-entity="agent:orange"]')?.click());
  await page.waitForSelector('[data-v1140-resident-root]');
  await page.click('[data-v1140-mode="debug"]');
  await page.waitForSelector('[data-v1132-affect]');
  return page.evaluate(()=>{
    const E=window.SimEngine,st=E.getState(),offer=st.events.find(e=>e.data?.action==='petOffer');
    const response=st.events.find(e=>e.data?.responseToBid===offer?.id&&['acceptPet','toleratePet','avoidPet'].includes(e.data?.action));
    const pet=st.events.find(e=>e.data?.action==='petAnimal'&&e.data?.petOfferId===offer?.id);
    const orange=st.agents.orange,zhou=st.agents.zhou;
    return {
      version:st.version,socialResponseVersion:E.SOCIAL_RESPONSE_SCHEMA_VERSION,offerId:offer?.id??null,responseAction:response?.data?.action??null,response:response?.data?.petResponse??null,petId:pet?.id??null,
      orangeSocial:orange.needs.social,orangeAffect:{...orange.affect},zhouAffect:{...zhou.affect},
      validator:window.SimValidator.validateState(st),scenarioValue:document.getElementById('socialScenario')?.value??null,
      inspectorText:document.getElementById('inspector')?.innerText??'',affectVisible:!!document.querySelector('[data-v1132-affect]')?.getClientRects().length,
      width:innerWidth,docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      inspectorActive:document.querySelector('[data-view="inspector"]')?.classList.contains('mobile-active')??false,
      navActive:document.querySelector('.mobile-nav [data-tab="inspector"]')?.classList.contains('active')??false
    };
  });
}

assert.ok((await page.goto('http://127.0.0.1:4173/?scenario=pet-accept',{waitUntil:'domcontentloaded'})).ok());
assert.ok((await page.title()).includes('因果湧現模擬器'));
const desktop=await runScenario('pet-accept');
assert.equal(desktop.socialResponseVersion,'11.13.2a-social-response-agency');
assert.equal(desktop.scenarioValue,'pet-accept');
assert.ok(desktop.offerId,'desktop accept: missing petOffer');
assert.equal(desktop.responseAction,'acceptPet');
assert.equal(desktop.response,'accept');
assert.ok(desktop.petId,'desktop accept: successful petAnimal missing');
assert.ok(desktop.orangeAffect.valence>0,'desktop accept: Orange should receive positive short-lived Affect');
assert.equal(desktop.validator.issueCount,0,`desktop validator: ${desktop.validator.issues.map(x=>x.code).join(', ')}`);
assert.equal(desktop.affectVisible,true,'desktop: Current Affect inspector section should be visible');
assert.ok(desktop.inspectorText.includes('Current Affect'));
assert.ok(desktop.inspectorText.includes('Pet responder：base'),'desktop Debug should expose derived animal responder score decomposition');
assert.ok(desktop.inspectorText.includes('Relationship'),'desktop Debug should identify the Relationship contribution');
assert.ok(desktop.docWidth<=desktop.width+1,`desktop document overflow: ${desktop.docWidth}>${desktop.width}`);
assert.ok(desktop.bodyWidth<=desktop.width+1,`desktop body overflow: ${desktop.bodyWidth}>${desktop.width}`);
await page.screenshot({path:`${outDir}/desktop-accept.png`,fullPage:true});

await page.setViewportSize({width:390,height:844});
const mobile=await runScenario('pet-avoid');
assert.equal(mobile.socialResponseVersion,'11.13.2a-social-response-agency');
assert.equal(mobile.scenarioValue,'pet-avoid');
assert.ok(mobile.offerId,'mobile avoid: missing petOffer');
assert.equal(mobile.responseAction,'avoidPet');
assert.equal(mobile.response,'avoid');
assert.equal(mobile.petId,null,'mobile avoid: avoid must not also create successful petAnimal');
assert.ok(mobile.zhouAffect.valence<0,'mobile avoid: declined human should receive negative short-lived Affect');
assert.ok(mobile.zhouAffect.frustration>0,'mobile avoid: declined human should receive frustration');
assert.equal(mobile.validator.issueCount,0,`mobile validator: ${mobile.validator.issues.map(x=>x.code).join(', ')}`);
assert.equal(mobile.inspectorActive,true,'mobile Agent selection should open Inspector');
assert.equal(mobile.navActive,true,'mobile Inspector nav should be active');
assert.ok(mobile.inspectorText.includes('Pet responder：base'),'mobile Debug should retain responder score decomposition');
assert.ok(mobile.docWidth<=mobile.width+1,`mobile document overflow: ${mobile.docWidth}>${mobile.width}`);
assert.ok(mobile.bodyWidth<=mobile.width+1,`mobile body overflow: ${mobile.bodyWidth}>${mobile.width}`);
await page.screenshot({path:`${outDir}/mobile-avoid.png`,fullPage:true});

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,desktop:{...desktop,inspectorText:undefined},mobile:{...mobile,inspectorText:undefined},pageErrors,consoleErrors},null,2));
console.log('social response browser QA: 2/2 pass');
await browser.close();
