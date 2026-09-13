import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir='artifacts/contact-playtest';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[],pageErrors=[],results=[];
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
page.on('pageerror',err=>pageErrors.push(String(err)));
const check=(name,pass,details='')=>results.push({name,pass:!!pass,details:String(details??'')});

try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.SimEngine&&window.SimSpatial&&window.SimValidator);

  const runtime=await page.evaluate(()=>SimEngine.getState().version);
  check('runtime version',runtime==='11.11.2-supported-contact-audit',runtime);
  check('page title',await page.title().then(x=>x.includes('v11.11.2')),await page.title());

  const geometry=await page.evaluate(()=>{
    const E=SimEngine,SP=SimSpatial;
    E.reset(20260911);const st=E.getState(),h=st.agents.zhen,c=st.agents.orange;
    const floor=(x,y)=>SP.normalizeNode(st,{x,y},'floor'),table=(x,y)=>SP.normalizeNode(st,{x,y},'diningTable:surface');
    const has=(list,node)=>list.some(p=>SP.nodeSame(st,p,node));
    h.position={...floor(7,2)};
    const cup={};for(const affordance of ['pickup','drinkFrom','fill']){const g=SP.interactionGeometry(st,{kind:'object',id:'cupA'},h,affordance);cup[affordance]={mode:g.mode,local:has(g.positions,floor(7,2)),remote:has(g.positions,floor(4,2))};}
    h.position={...floor(4,2)};
    const tray={};for(const affordance of ['serve','deposit','receive']){const g=SP.interactionGeometry(st,{kind:'object',id:'mealTray'},h,affordance);tray[affordance]={mode:g.mode,local:has(g.positions,floor(4,2)),remote:has(g.positions,floor(7,2))};}
    c.position={...floor(7,2)};const catFloor=SP.isAtInteraction(st,c,{kind:'object',id:'cupA'},'drinkFrom');
    c.position={...table(6,2)};const catTable=SP.isAtInteraction(st,c,{kind:'object',id:'cupA'},'drinkFrom');
    return {cup,tray,catFloor,catTable};
  });
  for(const [affordance,x] of Object.entries(geometry.cup))check(`cupA ${affordance} local reach`,x.mode==='reach'&&x.local&&!x.remote,JSON.stringify(x));
  for(const [affordance,x] of Object.entries(geometry.tray))check(`mealTray ${affordance} local reach`,x.mode==='reach'&&x.local&&!x.remote,JSON.stringify(x));
  check('cat floor cannot drink tabletop cup',geometry.catFloor===false,String(geometry.catFloor));
  check('cat tabletop can drink cup',geometry.catTable===true,String(geometry.catTable));

  const flows=await page.evaluate(()=>{
    const E=SimEngine,V=SimValidator,SP=SimSpatial;
    const run=(limit)=>{for(let i=0;i<limit&&E.getState().agents.zhen.action;i++)E.tick();};
    const valid=()=>V.validateState(E.getState()).issueCount;

    E.reset(20260911);let st=E.getState(),a=st.agents.zhen;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;a.needs.hunger=60;const foodBefore=st.containers.mealTray.contents.food;a.action={intent:'eat',phase:'prepare',started:st.tick,wait:0};run(70);const meal={done:a.action===null,served:st.events.some(e=>e.data?.action==='serveFood'),foodBefore,foodAfter:st.containers.mealTray.contents.food,issues:valid()};

    E.reset(20260911);st=E.getState();a=st.agents.zhen;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;st.containers.cupA.contents={};st.containers.cupB.contents={};st.containers.alcoholBottle.contents={alcohol:120};a.position={...SP.normalizeNode(st,{x:7,y:3},'floor')};a.needs.thirst=82;a.action={intent:'drinkAlcohol',phase:'chooseVessel',resource:'alcohol',started:st.tick,wait:0};run(60);const drink={done:a.action===null,poured:st.events.some(e=>e.data?.action==='pour'&&e.data?.from==='alcoholBottle'),drank:st.events.some(e=>e.data?.action==='drinkAlcohol'),bottle:st.containers.alcoholBottle.contents.alcohol||0,issues:valid()};

    E.reset(20260911);st=E.getState();a=st.agents.zhen;st.agents.zhou.offMap=true;st.agents.orange.offMap=true;const tray=st.containers.mealTray,pantry=st.containers.foodPantry,basket=st.containers.basket;tray.contents.food=0;basket.contents={};basket.position={...SP.normalizeNode(st,{x:3,y:2},'floor')};const pantryBefore=pantry.contents.food;a.action={intent:'restockContainer',phase:'toCarrier',destinationId:tray.id,sourceId:pantry.id,sourceKind:'object',resource:'food',strategy:'logisticsContainer',carrierId:basket.id,started:st.tick,wait:0};run(70);const restock={done:a.action===null,tray:tray.contents.food||0,pantryBefore,pantryAfter:pantry.contents.food||0,basket:basket.contents.food||0,issues:valid()};
    return {meal,drink,restock};
  });
  check('serving flow completes',flows.meal.done&&flows.meal.served&&flows.meal.foodAfter<flows.meal.foodBefore&&flows.meal.issues===0,JSON.stringify(flows.meal));
  check('tabletop bottle fill flow completes',flows.drink.done&&flows.drink.poured&&flows.drink.drank&&flows.drink.bottle<120&&flows.drink.issues===0,JSON.stringify(flows.drink));
  check('mealTray local restock completes',flows.restock.done&&flows.restock.tray>0&&flows.restock.pantryAfter<flows.restock.pantryBefore&&flows.restock.basket===0&&flows.restock.issues===0,JSON.stringify(flows.restock));

  await page.evaluate(()=>SimEngine.reset(20260911));
  await page.locator('#map [data-entity="container:cupA"]').click();
  await page.waitForFunction(()=>document.querySelector('#inspector')?.textContent?.includes('Spatial Node'));
  const cupInspector=await page.locator('#inspector').innerText();
  check('cup Inspector shows tabletop Spatial Node',cupInspector.includes('餐桌桌面')&&cupInspector.includes('cupA'),cupInspector.slice(0,260));
  await page.screenshot({path:`${outDir}/01-cup-tabletop-inspector.png`,fullPage:true});

  await page.locator('#map [data-entity="container:mealTray"]').click();
  const trayInspector=await page.locator('#inspector').innerText();
  check('mealTray Inspector shows tabletop Spatial Node',trayInspector.includes('餐桌桌面')&&trayInspector.includes('mealTray'),trayInspector.slice(0,260));
  await page.screenshot({path:`${outDir}/02-mealtray-tabletop-inspector.png`,fullPage:true});

  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-tab="map"]').click();
  await page.locator('#map [data-entity="container:cupA"]').click();
  await page.waitForFunction(()=>document.querySelector('.view-panel[data-view="inspector"]')?.classList.contains('mobile-active'));
  const overflow=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  check('mobile Inspector has no horizontal overflow',overflow.scroll<=overflow.width,JSON.stringify(overflow));
  await page.screenshot({path:`${outDir}/03-mobile-cup-inspector.png`,fullPage:true});

  check('no page errors',pageErrors.length===0,pageErrors.join('\n'));
  check('no console errors',consoleErrors.length===0,consoleErrors.join('\n'));
}finally{
  await browser.close();
}

const report={generatedAt:new Date().toISOString(),passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results,consoleErrors,pageErrors};
fs.writeFileSync(`${outDir}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(report.failed)process.exit(1);
