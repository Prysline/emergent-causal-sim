import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir='artifacts/v1113-browser';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const results=[],consoleErrors=[],pageErrors=[];
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
page.on('pageerror',e=>pageErrors.push(String(e)));
const check=(name,pass,details='')=>results.push({name,pass:!!pass,details:String(details)});

await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForSelector('#map .map-entity');
check('v11.11.3 runtime visible',(await page.locator('h1').innerText()).includes('v11.11.3'));

await page.evaluate(()=>{
  const E=window.SimEngine,SP=window.SimSpatial,st=E.getState(),a=st.agents.orange;
  st.map.tiles['6,2'].surface.contents.water=12;
  a.position=SP.normalizeNode(st,{x:5,y:2},'floor');
  a.contacts.paws={};
  a.action={intent:'wander',phase:'move',started:st.tick,wait:0,targetTile:SP.normalizeNode(st,{x:5,y:2},'diningTable:surface'),oneShot:true};
});
for(let i=0;i<4;i++)await page.locator('#step').click();
let state=await page.evaluate(()=>{const a=SimEngine.getState().agents.orange;return {surface:a.position.surfaceId,x:a.position.x,y:a.position.y};});
check('same XY floor to tabletop really traverses',state.surface==='diningTable:surface'&&state.x===5&&state.y===2,JSON.stringify(state));

await page.evaluate(()=>{
  const E=window.SimEngine,SP=window.SimSpatial,st=E.getState(),a=st.agents.orange;
  a.position=SP.normalizeNode(st,{x:5,y:2},'diningTable:surface');
  a.contacts.paws={};
  a.action={intent:'wander',phase:'move',started:st.tick,wait:0,targetTile:SP.normalizeNode(st,{x:6,y:2},'diningTable:surface'),oneShot:true};
});
for(let i=0;i<3;i++)await page.locator('#step').click();
state=await page.evaluate(()=>{const st=SimEngine.getState(),a=st.agents.orange;return {surface:a.position.surfaceId,x:a.position.x,y:a.position.y,paw:a.contacts.paws.water||0,floor:st.map.tiles['6,2'].surface.contents.water||0,tileContacts:st.events.filter(e=>e.data?.action==='tileContact').length};});
check('tabletop movement ignores wet floor below',state.surface==='diningTable:surface'&&state.x===6&&state.y===2&&state.paw===0&&state.floor===12&&state.tileContacts===0,JSON.stringify(state));

await page.locator('#map [data-entity="agent:orange"]').click();
await page.waitForTimeout(80);
const inspector=await page.locator('#inspector').innerText();
check('Inspector shows tabletop after movement',inspector.includes('diningTable:surface')&&inspector.includes('餐桌桌面'));
await page.screenshot({path:`${outDir}/desktop-tabletop.png`,fullPage:false});

await page.evaluate(()=>{
  const E=window.SimEngine,SP=window.SimSpatial,st=E.getState(),a=st.agents.orange;
  a.position=SP.normalizeNode(st,{x:7,y:2},'floor');
  a.contacts.paws={};
  a.action={intent:'wander',phase:'move',started:st.tick,wait:0,targetTile:SP.normalizeNode(st,{x:6,y:2},'floor'),oneShot:true};
});
for(let i=0;i<3;i++)await page.locator('#step').click();
state=await page.evaluate(()=>{const st=SimEngine.getState(),a=st.agents.orange;return {surface:a.position.surfaceId,paw:a.contacts.paws.water||0,floor:st.map.tiles['6,2'].surface.contents.water||0,tileContacts:st.events.filter(e=>e.data?.action==='tileContact').length};});
check('real floor traversal still contacts liquid',state.surface==='floor'&&state.paw>0&&state.floor<12&&state.tileContacts>0,JSON.stringify(state));

await page.setViewportSize({width:390,height:844});
await page.reload({waitUntil:'networkidle'});
const mobile=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
check('mobile has no horizontal overflow',mobile.scroll<=mobile.width,JSON.stringify(mobile));
check('no page errors',pageErrors.length===0,pageErrors.join('\n'));
check('no console errors',consoleErrors.length===0,consoleErrors.join('\n'));
const passed=results.filter(r=>r.pass).length,failed=results.length-passed;
const report={passed,failed,results,consoleErrors,pageErrors};
fs.writeFileSync(`${outDir}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
await browser.close();
if(failed)process.exit(1);
