import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const errors=[];

async function seedMemory(page){
  await page.waitForFunction(()=>window.SimEngine?.MEMORY_SCHEMA_VERSION==='11.13.0-episodic-memory-foundation');
  await page.evaluate(()=>{
    const E=window.SimEngine,st=E.reset(13130);
    st.agents.zhou.position={x:5,y:5};
    st.agents.orange.position={x:5,y:6};
    st.agents.zhen.position={x:1,y:1};
    E.addEvent('瀏覽器測試：老周灑出了一些水。','warn',[],{actor:'zhou',action:'spill',resource:'water',amount:3,position:'5,5'});
    document.querySelector('#step')?.click();
  });
  await page.waitForFunction(()=>window.SimEngine.getState().agents.zhou.episodicMemories.length>0);
}
async function openAgent(page,id){
  await page.locator(`.map-entity.agent-${id}`).evaluate(el=>el.click());
  await page.waitForSelector('[data-v1130-memory]');
}

// Desktop Inspector smoke.
{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',e=>errors.push(`desktop pageerror: ${e.message}`));
  page.on('console',m=>{if(m.type()==='error')errors.push(`desktop console: ${m.text()}`);});
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'networkidle'});
  await seedMemory(page);
  const boundary=await page.evaluate(()=>({zhou:window.SimEngine.getState().agents.zhou.episodicMemories.length,orange:window.SimEngine.getState().agents.orange.episodicMemories.length,zhen:window.SimEngine.getState().agents.zhen.episodicMemories.length}));
  assert.ok(boundary.zhou>=1,'actor memory missing');
  assert.ok(boundary.orange>=1,'nearby observer memory missing');
  assert.equal(boundary.zhen,0,'far observer should not get spill memory');
  await openAgent(page,'zhou');
  const memoryText=await page.locator('[data-v1130-memory]').innerText();
  assert.match(memoryText,/近期情節記憶/);
  assert.match(memoryText,/Hot memory/);
  assert.match(memoryText,/spill/);
  assert.match(memoryText,/64/);
  await page.screenshot({path:'artifacts/v1130-desktop.png',fullPage:true});
  await page.close();
}

// 390px mobile Inspector + overflow smoke.
{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',e=>errors.push(`mobile pageerror: ${e.message}`));
  page.on('console',m=>{if(m.type()==='error')errors.push(`mobile console: ${m.text()}`);});
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'networkidle'});
  await seedMemory(page);
  await openAgent(page,'zhou');
  assert.ok(await page.locator('.view-panel[data-view="inspector"]').evaluate(el=>el.classList.contains('mobile-active')),'Inspector should open on mobile');
  const dims=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth}));
  assert.ok(dims.scrollWidth<=dims.innerWidth+1,`mobile horizontal overflow: ${dims.scrollWidth} > ${dims.innerWidth}`);
  const memoryText=await page.locator('[data-v1130-memory]').innerText();
  assert.match(memoryText,/spill/);
  await page.screenshot({path:'artifacts/v1130-mobile.png',fullPage:true});
  await page.close();
}

assert.deepEqual(errors,[],errors.join('\n'));
await browser.close();
console.log('v11.13.0 browser QA: desktop + 390px mobile passed');
