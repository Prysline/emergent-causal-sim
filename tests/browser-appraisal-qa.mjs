import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const outDir='artifacts/browser-appraisal-qa';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[];const pageErrors=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));

async function seedPetScenario(){
  await page.evaluate(()=>{
    const E=window.SimEngine;E.reset(1311);const st=E.getState();
    st.agents.zhou.position={x:5,y:5};
    st.agents.orange.position={x:5,y:6};
    st.agents.zhen.position={x:7,y:5};
    st.agents.orange.needs.social=90;
    E.addEvent('老周摸了橘子。','normal',[],{actor:'zhou',target:'orange',action:'petCat',position:'5,6',debugSecret:'browser-hidden'});
    document.querySelector('[data-entity="agent:orange"]')?.click();
  });
  await page.waitForSelector('[data-v1131-appraisal]');
}

await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.APPRAISAL_SCHEMA_VERSION==='11.13.1-event-appraisal');
assert.ok((await page.title()).includes('v11.13.1'));
await seedPetScenario();
let appraisal=await page.locator('[data-v1131-appraisal]').innerText();
assert.match(appraisal,/事件主觀評估/);
assert.match(appraisal,/petCat-v1/);
assert.match(appraisal,/目標一致/);
assert.match(appraisal,/Agency 他者・老周/);
assert.match(appraisal,/need:social=90%/);
assert.doesNotMatch(appraisal,/browser-hidden/);
let memory=await page.locator('[data-v1130-memory]').innerText();
assert.match(memory,/petCat/);
await page.screenshot({path:`${outDir}/desktop.png`,fullPage:true});

await page.setViewportSize({width:390,height:844});
await page.reload({waitUntil:'networkidle'});
await page.waitForFunction(()=>window.SimEngine?.APPRAISAL_SCHEMA_VERSION==='11.13.1-event-appraisal');
await seedPetScenario();
appraisal=await page.locator('[data-v1131-appraisal]').innerText();
assert.match(appraisal,/petCat-v1/);
const mobileState=await page.evaluate(()=>({
  width:innerWidth,
  docWidth:document.documentElement.scrollWidth,
  bodyWidth:document.body.scrollWidth,
  inspectorActive:document.querySelector('[data-view="inspector"]')?.classList.contains('mobile-active'),
  navActive:document.querySelector('.mobile-nav [data-tab="inspector"]')?.classList.contains('active'),
  appraisalVisible:!!document.querySelector('[data-v1131-appraisal]')?.getClientRects().length
}));
assert.equal(mobileState.inspectorActive,true,'mobile Agent selection should open Inspector');
assert.equal(mobileState.navActive,true,'mobile Inspector nav should be active');
assert.equal(mobileState.appraisalVisible,true,'appraisal section should be visible on mobile');
assert.ok(mobileState.docWidth<=mobileState.width+1,`document overflow: ${mobileState.docWidth}>${mobileState.width}`);
assert.ok(mobileState.bodyWidth<=mobileState.width+1,`body overflow: ${mobileState.bodyWidth}>${mobileState.width}`);
await page.screenshot({path:`${outDir}/mobile.png`,fullPage:true});

assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
assert.deepEqual(consoleErrors,[],`console errors: ${consoleErrors.join(' | ')}`);
fs.writeFileSync(`${outDir}/result.json`,JSON.stringify({ok:true,mobileState,pageErrors,consoleErrors},null,2));
console.log('v11.13.1 browser appraisal QA: 2/2 pass');
await browser.close();
