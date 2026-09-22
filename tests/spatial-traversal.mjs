import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','engine.js','validation/registry.js','validation/rules/spatial-node.js']);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const table=(st,x,y)=>SP.normalizeNode(st,{x,y},'diningTable:surface');

E.reset(20260911);
const st=E.getState(),orange=st.agents.orange,zhen=st.agents.zhen;
assert.equal(st.version,'11.27.1-resident-private-badge');
assert.equal(SP.VERSION,'11.26.0-vertical-structure-traversal');
assert.equal(st.furniture.diningTable.spatial.surface.id,'diningTable:surface');

assert.equal(SP.nodeWalkable(st,floor(st,5,2),orange),true,'橘子可在餐桌下方 floor 通行');
assert.equal(SP.nodeWalkable(st,floor(st,5,2),zhen),false,'站立人類不可穿過餐桌下低淨空 floor');
assert.equal(SP.nodeWalkable(st,table(st,5,2),orange),true,'橘子可站上餐桌桌面');
assert.equal(SP.nodeWalkable(st,table(st,5,2),zhen),true,'人類能力上也可爬上餐桌');

orange.position={...floor(st,4,2)};
let catPath=SP.astar(st,orange.position,table(st,5,2),orange.id);
assert.ok(catPath.length>=2,'橘子應有 floor → tabletop 路徑');
assert.equal(catPath.at(-1).surfaceId,'diningTable:surface');
assert.ok(catPath.some(p=>p.surfaceId==='diningTable:surface'),'橘子路徑必須真的進入 tabletop surface');

zhen.position={...floor(st,4,2)};
const humanPath=SP.astar(st,zhen.position,table(st,5,2),zhen.id);
assert.ok(humanPath.length>=2,'人類仍應能爬上餐桌');
assert.ok(SP.pathCost(st,zhen,table(st,5,2))>SP.pathCost(st,orange,table(st,5,2)),'人類爬桌成本應高於貓');

const tray={kind:'object',id:'mealTray'};
orange.position={...floor(st,5,2)};
assert.equal(SP.isAtInteraction(st,orange,tray,'eatFrom'),false,'橘子在同 XY 的桌下 floor 不能吃到桌面食物');
orange.position={...floor(st,4,2)};
assert.equal(SP.isAtInteraction(st,orange,tray,'eatFrom'),false,'橘子站在桌邊 floor 仍不能直接吃高桌面食物');
orange.position={...table(st,5,2)};
assert.equal(SP.isAtInteraction(st,orange,tray,'eatFrom'),true,'橘子上桌後可直接吃桌面食物');

zhen.position={...floor(st,4,2)};
assert.equal(SP.isAtInteraction(st,zhen,tray,'eatFrom'),true,'成人站在相鄰桌邊可直接接觸桌面食物');
zhen.position={...floor(st,7,2)};
assert.equal(SP.isAtInteraction(st,zhen,tray,'eatFrom'),false,'成人不能隔著整張桌子直接吃遠端 mealTray');

const humanTrayGeometry=SP.interactionGeometry(st,tray,zhen,'eatFrom');
assert.ok(humanTrayGeometry.positions.some(p=>SP.nodeSame(st,p,floor(st,4,2))),'human eatFrom 應保留相鄰 floor → tabletop contact');
assert.ok(!humanTrayGeometry.positions.some(p=>SP.nodeSame(st,p,floor(st,7,2))),'human eatFrom 不得回到整張 support perimeter');

orange.position={...floor(st,5,2)};
zhen.position={...table(st,5,2)};
assert.equal(SP.nodeOccupantsAt(st,orange.position).length,1,'同 XY 不同 surface 不應被算成同一 Spatial Node 擁擠');
assert.equal(SP.nodeOccupantsAt(st,zhen.position).length,1,'tabletop crowding 應獨立於 floor');
let validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join('\n'));
assert.equal(validation.crowdingNodes.length,0,'floor/tabletop 同 XY 不應形成 node crowding');

E.reset(20260911);
for(let i=0;i<500;i++)E.tick();
validation=V.validateState(E.getState());
assert.equal(validation.issueCount,0,validation.issues.slice(0,8).map(x=>x.message).join('\n'));
console.log('v11.11 spatial traversal + contact contract passed');
