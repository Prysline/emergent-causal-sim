import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir='artifacts/map-readability-playtest';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const results=[],consoleErrors=[],pageErrors=[];
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
page.on('pageerror',e=>pageErrors.push(String(e)));
const check=(name,pass,details='')=>results.push({name,pass:!!pass,details:String(details)});

await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForSelector('#map .map-entity');
await page.waitForTimeout(150);

check('map guidance is concise',(await page.locator('[data-view="map"] .panel-head small').innerText()).includes('選取實體後'));
const marks=await page.locator('#map .spatial-node-mark').allTextContents();
check('tabletop objects do not carry persistent 上 badges',!marks.includes('上'),JSON.stringify(marks));
check('initial map has no unnecessary spatial badges',marks.length===0,marks.length);
const surfaceCells=await page.locator('#map .furniture-footprint.spatial-traversable-surface').count();
check('tabletop surface is represented by grouped furniture cells',surfaceCells===4,surfaceCells);
const tableStyle=await page.locator('#map .furniture-footprint.spatial-traversable-surface').first().evaluate(el=>({background:getComputedStyle(el).backgroundColor,boxShadow:getComputedStyle(el).boxShadow}));
check('surface group has visual treatment',tableStyle.background!=='rgba(0, 0, 0, 0)'&&tableStyle.boxShadow!=='none',JSON.stringify(tableStyle));
const handleOpacity=Number(await page.locator('#map .spatial-furniture-handle').first().evaluate(el=>getComputedStyle(el).opacity));
check('furniture inspection handle is subdued',handleOpacity<=0.6,handleOpacity);

await page.locator('[data-entity="container:cupA"]').click();
await page.waitForTimeout(80);
const inspector=await page.locator('#inspector').innerText();
check('Inspector retains full tabletop Spatial Node',inspector.includes('餐桌桌面')&&inspector.includes('diningTable:surface'),inspector.slice(0,380));
await page.screenshot({path:`${outDir}/01-desktop-map.png`,fullPage:false});

await page.setViewportSize({width:390,height:844});
await page.reload({waitUntil:'networkidle'});
await page.waitForSelector('#map .map-entity');
await page.waitForTimeout(120);
const mobile=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
check('mobile has no horizontal overflow',mobile.scroll<=mobile.width,JSON.stringify(mobile));
check('mobile also has no persistent 上 badges',!(await page.locator('#map .spatial-node-mark').allTextContents()).includes('上'));
await page.screenshot({path:`${outDir}/02-mobile-map.png`,fullPage:false});

check('no page errors',pageErrors.length===0,pageErrors.join('\n'));
check('no console errors',consoleErrors.length===0,consoleErrors.join('\n'));
const passed=results.filter(r=>r.pass).length,failed=results.length-passed;
const report={generatedAt:new Date().toISOString(),passed,failed,results,consoleErrors,pageErrors};
fs.writeFileSync(`${outDir}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
await browser.close();
if(failed)process.exit(1);
