import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir='artifacts/v1114-browser';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const results=[],consoleErrors=[],pageErrors=[];
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
page.on('pageerror',e=>pageErrors.push(String(e)));
const check=(name,pass,details='')=>results.push({name,pass:!!pass,details:String(details)});

await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForSelector('#map .map-entity');
check('v11.11.4 runtime visible',(await page.locator('h1').innerText()).includes('v11.11.4'));

await page.evaluate(()=>{
  const E=window.SimEngine,SP=window.SimSpatial,st=E.getState();
  SP.putEnvironmentResource(st,SP.normalizeNode(st,{x:5,y:2},'diningTable:surface'),'water',6);
});
await page.locator('.spatial-furniture-handle[data-furniture-id="diningTable"]').click();
await page.waitForTimeout(100);
let inspector=await page.locator('#inspector').innerText();
check('Furniture Inspector exposes Surface Environment',inspector.includes('Surface Environment')&&inspector.includes('(5, 2)')&&inspector.includes('水 6'),inspector.slice(0,900));
await page.screenshot({path:`${outDir}/table-surface-environment.png`,fullPage:false});

await page.evaluate(()=>{
  const E=window.SimEngine,SP=window.SimSpatial,st=E.getState(),a=st.agents.orange;
  a.position=SP.normalizeNode(st,{x:4,y:2},'floor');a.contacts.paws={};
  a.action={intent:'wander',phase:'move',started:st.tick,wait:0,targetTile:SP.normalizeNode(st,{x:5,y:2},'diningTable:surface'),oneShot:true};
});
for(let i=0;i<4;i++)await page.locator('#step').click();
const contact=await page.evaluate(()=>{
  const E=window.SimEngine,SP=window.SimSpatial,st=E.getState(),a=st.agents.orange,n=SP.nodeForAgent(st,a);
  return {surface:n.surfaceId,x:n.x,y:n.y,paws:a.contacts.paws.water||0,tableWater:SP.environmentResourceAmount(st,n,'water'),floorWater:SP.environmentResourceAmount(st,SP.normalizeNode(st,{x:5,y:2},'floor'),'water'),event:st.events.find(e=>e.data?.actor==='orange'&&e.data?.action==='surfaceContact')?.data||null};
});
check('wet tabletop contact occurs on same Surface Cell',contact.surface==='diningTable:surface'&&contact.x===5&&contact.y===2&&contact.paws>0&&contact.tableWater<6&&contact.floorWater===0&&contact.event?.position==='room1|diningTable:surface|5,2',JSON.stringify(contact));
await page.locator('[data-entity="agent:orange"]').click();
await page.waitForTimeout(100);
inspector=await page.locator('#inspector').innerText();
check('Agent Inspector shows current Spatial Environment',inspector.includes('Spatial Environment')&&inspector.includes('diningTable:surface')&&inspector.includes('液體總量'),inspector.slice(0,900));
await page.screenshot({path:`${outDir}/orange-wet-tabletop.png`,fullPage:false});

const spill=await page.evaluate(()=>{
  const E=window.SimEngine,SP=window.SimSpatial;
  const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor'),table=(st,x,y)=>SP.normalizeNode(st,{x,y},'diningTable:surface');
  for(let seed=1;seed<=200;seed++){
    E.reset(seed);const st=E.getState(),a=st.agents.zhen,cup=st.containers.cupA;
    a.position=floor(st,4,3);a.status.intoxication=100;a.needs.fatigue=100;a.traits.careful=0;
    a.held='cupA';delete cup.supportId;cup.position={...a.position};cup.contents={};
    a.action={intent:'drinkAlcohol',phase:'fill',started:st.tick,wait:0,container:'cupA',sourceObject:'alcoholBottle',sourceKind:'object',resource:'alcohol'};
    E.tick();const ev=st.events.find(e=>e.data?.actor==='zhen'&&e.data?.action==='spill'&&e.data?.resource==='alcohol');
    if(ev)return {seed,effectNode:ev.data.effectNode,endpoint:ev.data.spillEndpoint,table:SP.environmentResourceAmount(st,table(st,5,3),'alcohol'),floor:SP.environmentResourceAmount(st,floor(st,4,3),'alcohol')};
  }
  return null;
});
check('failed cross-Surface pour routes spill to effectNode',spill&&spill.effectNode==='room1|diningTable:surface|5,3'&&spill.table>0&&spill.floor===0,JSON.stringify(spill));

await page.setViewportSize({width:390,height:844});
await page.reload({waitUntil:'networkidle'});
const mobile=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('h1')?.innerText||''}));
check('mobile has no horizontal overflow',mobile.scroll<=mobile.width,JSON.stringify(mobile));
check('mobile still shows v11.11.4',mobile.title.includes('v11.11.4'),mobile.title);
check('no page errors',pageErrors.length===0,pageErrors.join('\n'));
check('no console errors',consoleErrors.length===0,consoleErrors.join('\n'));

const passed=results.filter(r=>r.pass).length,failed=results.length-passed;
const report={passed,failed,results,consoleErrors,pageErrors};
fs.writeFileSync(`${outDir}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
await browser.close();
if(failed)process.exit(1);
