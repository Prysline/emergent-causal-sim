import { test, expect } from '@playwright/test';

const BASE='http://127.0.0.1:4173';

async function collectErrors(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(`console: ${msg.text()}`);});
  return errors;
}

async function selectAgent(page,id='zhou'){
  const agent=page.locator(`[data-entity="agent:${id}"]`).first();
  await expect(agent).toBeVisible();
  await agent.evaluate(el=>el.click());
}

test('desktop inspector exposes derived reconsideration without runtime errors',async({page})=>{
  const errors=await collectErrors(page);
  await page.setViewportSize({width:1280,height:800});
  await page.goto(BASE,{waitUntil:'networkidle'});
  await expect(page).toHaveTitle(/v11\.12\.4/);
  await selectAgent(page,'zhou');
  const inspector=page.locator('#inspector');
  await expect(inspector).toContainText('Active Intent');
  await expect(inspector).toContainText('Soft reconsideration');
  await expect(inspector).toContainText('承諾成本');
  await expect(inspector).toContainText('最佳挑戰');
  await expect(inspector).toContainText('切換門檻');
  await page.locator('#step10').click();
  await expect(page.locator('#tickLabel')).toContainText('Tick 10');
  await page.screenshot({path:'artifacts/v1124-desktop.png',fullPage:true});
  expect(errors,errors.join('\n')).toEqual([]);
});

test('mobile inspector remains readable with no horizontal overflow',async({page})=>{
  const errors=await collectErrors(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto(BASE,{waitUntil:'networkidle'});
  await selectAgent(page,'zhou');
  await page.locator('[data-tab="inspector"]').click();
  await expect(page.locator('#inspector')).toContainText('Soft reconsideration');
  const overflow=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth}));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth+1);
  await page.screenshot({path:'artifacts/v1124-mobile.png',fullPage:true});
  expect(errors,errors.join('\n')).toEqual([]);
});
