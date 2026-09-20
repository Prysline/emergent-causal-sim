import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','engine.js','state-validator.js','state-validator-v111.js']){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const table=(st,x,y)=>SP.normalizeNode(st,{x,y},'diningTable:surface');
const hasNode=(st,list,node)=>list.some(p=>SP.nodeSame(st,p,node));
const noIssues=(label)=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.message).join(' | ')}`);};

E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
  assert.equal(st.version,'11.22.0-spatial-z-identity');
  assert.equal(E.VERSION,'11.22.0-spatial-z-identity');
  assert.equal(SP.CONTACT_VERSION,'11.11.2-supported-contact-audit');

  const tray=st.containers.mealTray,plateA=st.containers.plateA,plateB=st.containers.plateB,cupA=st.containers.cupA,cupB=st.containers.cupB,bottle=st.containers.alcoholBottle;
  for(const affordance of ['serve','eatFrom','deposit','receive'])assert.equal(tray.interactions[affordance]?.mode,'reach',`mealTray ${affordance} 必須使用物件局部 reach`);
  for(const plate of [plateA,plateB])for(const affordance of ['pickup','eatFrom'])assert.equal(plate.interactions[affordance]?.mode,'reach',`${plate.id} ${affordance} 必須使用物件局部 reach`);
  for(const drink of [cupA,cupB,bottle])for(const affordance of ['pickup','drinkFrom','fill'])assert.equal(drink.interactions[affordance]?.mode,'reach',`${drink.id} ${affordance} 必須使用物件局部 reach`);

  human.position={...floor(st,7,2)};
  for(const affordance of ['pickup','drinkFrom','fill']){
    const g=SP.interactionGeometry(st,{kind:'object',id:'cupA'},human,affordance);
    assert.equal(g.mode,'reach');
    assert.ok(hasNode(st,g.positions,floor(st,7,2)),`cupA ${affordance} 應允許相鄰桌邊 floor 接觸`);
    assert.ok(!hasNode(st,g.positions,floor(st,4,2)),`cupA ${affordance} 不得使用整張餐桌 perimeter`);
  }

  cat.position={...floor(st,7,2)};
  assert.equal(SP.isAtInteraction(st,cat,{kind:'object',id:'cupA'},'drinkFrom'),false,'貓站在 floor 不可直接喝高桌面杯子');
  cat.position={...table(st,6,2)};
  assert.equal(SP.isAtInteraction(st,cat,{kind:'object',id:'cupA'},'drinkFrom'),true,'貓上桌後可喝桌面杯子');

  human.position={...floor(st,4,2)};
  for(const affordance of ['serve','deposit','receive']){
    const g=SP.interactionGeometry(st,{kind:'object',id:'mealTray'},human,affordance);
    assert.equal(g.mode,'reach');
    assert.ok(hasNode(st,g.positions,floor(st,4,2)),`mealTray ${affordance} 應允許物件相鄰桌邊 contact`);
    assert.ok(!hasNode(st,g.positions,floor(st,7,2)),`mealTray ${affordance} 不得隔整張桌子操作`);
  }

  const platePickup=SP.interactionGeometry(st,{kind:'object',id:'plateB'},human,'pickup');
  assert.ok(hasNode(st,platePickup.positions,floor(st,7,3)),'plateB pickup 應允許右側相鄰桌邊');
  assert.ok(hasNode(st,platePickup.positions,floor(st,6,4)),'plateB pickup 應允許下側相鄰桌邊');
  assert.ok(!hasNode(st,platePickup.positions,floor(st,4,3)),'plateB pickup 不得從餐桌另一側遠取');
  noIssues('geometry contract');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,tray=st.containers.mealTray;
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  a.needs.hunger=60;
  const before=tray.contents.food;
  a.action={kind:'eat',phase:'prepare',started:st.tick,wait:0};
  for(let i=0;i<70&&a.action;i++){E.tick();noIssues(`serving meal ${i}`);}
  assert.equal(a.action,null,'局部 pickup / serve contact 下用餐流程仍應完成');
  assert.ok((tray.contents.food||0)<before,'盛盤流程應真的從 mealTray 取走食物');
  assert.ok(st.events.some(e=>e.data?.action==='serveFood'),'應留下 serveFood 事件');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,cupA=st.containers.cupA,cupB=st.containers.cupB,bottle=st.containers.alcoholBottle;
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  cupA.contents={};cupB.contents={};bottle.contents={alcohol:120};
  a.position={...floor(st,7,3)};
  a.needs.thirst=82;
  a.action={kind:'drinkAlcohol',phase:'chooseVessel',resource:'alcohol',started:st.tick,wait:0};
  for(let i=0;i<60&&a.action;i++){E.tick();noIssues(`tabletop bottle fill ${i}`);}
  assert.equal(a.action,null,'拿杯子並從桌面酒瓶裝酒的流程應完成');
  assert.ok(st.events.some(e=>e.data?.action==='pour'&&e.data?.from==='alcoholBottle'),'裝酒必須實際從酒瓶發生 pour');
  assert.ok(st.events.some(e=>e.data?.action==='drinkAlcohol'),'最後必須真的飲用酒');
  assert.ok((bottle.contents.alcohol||0)<120,'酒瓶內容量應因局部 fill contact 而減少');
}

E.reset(20260911);
{
  const st=E.getState(),a=st.agents.zhen,tray=st.containers.mealTray,pantry=st.containers.foodPantry,basket=st.containers.basket;
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  tray.contents.food=0;basket.contents={};basket.position={x:3,y:2,spaceId:'room1',surfaceId:'floor'};
  const before=pantry.contents.food;
  a.action={kind:'restockContainer',phase:'toCarrier',destinationId:tray.id,sourceId:pantry.id,sourceKind:'object',resource:'food',strategy:'logisticsContainer',carrierId:basket.id,started:st.tick,wait:0};
  for(let i=0;i<70&&a.action;i++){E.tick();noIssues(`mealTray local deposit ${i}`);}
  assert.equal(a.action,null,'mealTray local deposit / receive contact 下室內補貨仍應完成');
  assert.ok((tray.contents.food||0)>0,'物流籃應把食物卸到 mealTray');
  assert.ok((pantry.contents.food||0)<before,'食物櫃內容量應減少');
  assert.equal(basket.contents.food||0,0,'卸貨後物流籃應為空');
}

console.log('v11.11.2 supported object contact audit passed');
