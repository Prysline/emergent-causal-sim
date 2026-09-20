import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','engine.js','state-validator.js','state-validator-v111.js']);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const table=(st,x,y)=>SP.normalizeNode(st,{x,y},'diningTable:surface');

E.reset(20260911);
let st=E.getState(),orange=st.agents.orange;
assert.equal(st.version,'11.22.0-spatial-z-identity');
assert.equal(E.VERSION,'11.22.0-spatial-z-identity');
assert.equal(SP.ENVIRONMENT_VERSION,'11.11.3-node-aware-floor-effects');

const under=SP.tileByPos(st,{x:6,y:2});
under.surface.contents.water=12;
const floorNode=floor(st,6,2),tableNode=table(st,6,2);
assert.ok(SP.floorSlipRiskAt(st,floorNode)>0,'wet floor should still have slip risk');
assert.equal(SP.floorSlipRiskAt(st,tableNode),0,'tabletop must not inherit slip risk from floor below');
assert.equal(SP.floorLiquidAmountAtNode(st,tableNode),0,'tabletop node must not report floor liquid');
assert.ok(SP.comfortAt(st,tableNode)>SP.comfortAt(st,floorNode),'floor wetness must not lower tabletop local comfort');

orange.position={...floor(st,5,2)};
orange.contacts.paws={};
orange.action={kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...table(st,5,2)},oneShot:true};
for(let i=0;i<8&&orange.action;i++)E.tick();
assert.equal(orange.action,null,'same-XY floor→tabletop move should finish');
assert.equal(orange.position.surfaceId,'diningTable:surface','same XY must not short-circuit Surface transition');
assert.equal(orange.position.x,5);assert.equal(orange.position.y,2);

orange.position={...table(st,5,2)};
orange.contacts.paws={};
const wetBefore=under.surface.contents.water;
orange.action={kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...table(st,6,2)},oneShot:true};
for(let i=0;i<4&&orange.action;i++)E.tick();
assert.equal(orange.position.surfaceId,'diningTable:surface');
assert.equal(orange.position.x,6);assert.equal(orange.position.y,2);
assert.equal(orange.contacts.paws.water||0,0,'tabletop movement must not touch floor liquid below');
assert.equal(under.surface.contents.water,wetBefore,'tabletop movement must not consume floor liquid below');
assert.ok(!st.events.some(e=>e.data?.action==='tileContact'&&e.data?.position==='6,2'),'tabletop move must not emit floor tileContact');

orange.position={...floor(st,7,2)};
orange.contacts.paws={};
orange.action={kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...floor(st,6,2)},oneShot:true};
for(let i=0;i<4&&orange.action;i++)E.tick();
assert.equal(orange.position.surfaceId,'floor');
assert.ok((orange.contacts.paws.water||0)>0,'actual floor traversal must still pick up liquid');
assert.ok(under.surface.contents.water<wetBefore,'actual floor contact must reduce floor liquid');

E.reset(20260911);st=E.getState();orange=st.agents.orange;
st.containers.cupA.contents={water:10};
orange.position={...table(st,6,2)};
orange.action={kind:'drinkWater',phase:'move',started:st.tick,wait:0,targetObject:'cupA',resource:'water'};
for(let i=0;i<4&&orange.action;i++)E.tick();
const drinkEvent=st.events.find(e=>e.data?.actor==='orange'&&e.data?.action==='drinkWater');
assert.ok(drinkEvent,'tabletop drink should emit event');
assert.equal(drinkEvent.data.position,'room1|diningTable:surface|6,2','event position must retain Surface identity');

let validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join('\n'));
E.reset(20260911);
for(let i=0;i<500;i++)E.tick();
validation=V.validateState(E.getState());
assert.equal(validation.issueCount,0,validation.issues.slice(0,8).map(x=>x.message).join('\n'));
console.log('v11.11.3 node-aware floor effects + movement arrival passed');
