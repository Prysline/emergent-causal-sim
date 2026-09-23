import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','systems/physical.js','spatial-passage.js','engine.js','validation/registry.js','validation/rules/spatial-node.js']);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const table=(st,x,y)=>SP.normalizeNode(st,{x,y},'diningTable:surface');

E.reset(20260911);
const st=E.getState(),orange=st.agents.orange,zhen=st.agents.zhen;
assert.equal(st.version,'11.28.0-furniture-local-geometry');
assert.equal(SP.VERSION,'11.28.0-furniture-local-geometry');
assert.equal(st.furniture.diningTable.spatial.surface.id,'diningTable:surface');

assert.equal(SP.nodeWalkable(st,floor(st,5,2),orange),true,'橘子可在餐桌下方 floor 通行');
assert.equal(SP.nodeWalkable(st,floor(st,5,2),zhen),true,'partial table geometry leaves a Human-sized standing region in the coarse floor node');
assert.equal(SP.nodeWalkable(st,table(st,5,2),orange),true,'橘子可站上餐桌桌面');
assert.equal(SP.nodeWalkable(st,table(st,5,2),zhen),true,'人類能力上也可爬上餐桌');

orange.position={...floor(st,5,1)};
let catPath=SP.astar(st,orange.position,table(st,5,2),orange.id);
assert.ok(catPath.length>=2,'橘子應有 floor → tabletop 路徑');
assert.equal(catPath.at(-1).surfaceId,'diningTable:surface');
assert.ok(catPath.some(p=>p.surfaceId==='diningTable:surface'),'橘子路徑必須真的進入 tabletop surface');

zhen.position={...floor(st,5,1)};
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

zhen.position={...floor(st,5,1)};
assert.equal(SP.isAtInteraction(st,zhen,tray,'eatFrom'),true,'成人站在實際可容納身體的相鄰桌邊可直接接觸桌面食物');
zhen.position={...floor(st,7,4)};
assert.equal(SP.isAtInteraction(st,zhen,tray,'eatFrom'),false,'成人不能隔著整張桌子直接吃遠端 mealTray');

const humanTrayGeometry=SP.interactionGeometry(st,tray,zhen,'eatFrom');
assert.ok(humanTrayGeometry.positions.some(p=>SP.nodeSame(st,p,floor(st,5,1))),'human eatFrom 應保留合法相鄰 floor → tabletop contact');
assert.ok(!humanTrayGeometry.positions.some(p=>SP.nodeSame(st,p,floor(st,7,4))),'human eatFrom 不得回到遠端 floor');

orange.position={...floor(st,5,2)};
zhen.position={...table(st,5,2)};
assert.equal(SP.nodeOccupantsAt(st,orange.position).length,1,'同 XY 不同 surface 不應被算成同一 Spatial Node 擁擠');
assert.equal(SP.nodeOccupantsAt(st,zhen.position).length,1,'tabletop crowding 應獨立於 floor');
let validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join('\n'));
assert.equal(validation.crowdingNodes.length,0,'floor/tabletop 同 XY 不應形成 node crowding');

// Slot-bound agents keep the coarse furniture anchor but are not ordinary floor occupants.
const bedLeft=SP.getSlot(st,'bed:left');
zhen.position={...bedLeft.position};
zhen.posture={kind:'lying',slotId:bedLeft.id,furnitureId:'bed'};
assert.equal(SP.nodeWalkable(st,zhen.position,zhen),false,'bed anchor floor itself remains physically blocked for Human walk');
assert.equal(SP.nodeOccupantsAt(st,zhen.position).includes(zhen),false,'slot-bound body must not count as a floor-node occupant');
validation=V.validateState(st);
assert.equal(validation.issues.some(issue=>issue.code==='agent_on_untraversable_node'&&issue.agentId==='zhen'),false,'slot-bound Agent must not be rejected for occupying furniture body geometry');

// Slot egress candidates must exclude ordinary floor occupants.
const bedLeftEgress=SP.slotEgressNodes(st,bedLeft,zhen,'walk');
assert.ok(bedLeftEgress.length>0,'bed:left must expose at least one legal egress when its outside floor is free');
const blockedEgress={...bedLeftEgress[0]};
zhou.position={...blockedEgress};
zhou.posture={kind:'standing',slotId:null,furnitureId:null};
assert.equal(SP.slotEgressNodes(st,bedLeft,zhen,'walk').some(node=>SP.nodeSame(st,node,blockedEgress)),false,'slot egress must not select a floor node occupied by another ordinary Agent');
zhou.position={x:7,y:4,z:0};


E.reset(20260911);
for(let i=0;i<500;i++)E.tick();
validation=V.validateState(E.getState());
assert.equal(validation.issueCount,0,validation.issues.slice(0,8).map(x=>x.message).join('\n'));
console.log('v11.11 spatial traversal + contact contract passed');
