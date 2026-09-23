import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js','engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js']);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const table=(st,x,y)=>SP.normalizeNode(st,{x,y},'diningTable:surface');

E.reset(20260911);
let st=E.getState();
assert.equal(st.version,'11.28.0-furniture-local-geometry');
assert.equal(E.VERSION,'11.28.0-furniture-local-geometry');
assert.equal(SP.SPATIAL_ENVIRONMENT_VERSION,'11.11.4-surface-liquid-foundation');

// B architecture: one API, existing floor storage remains the actual source of truth.
const floorNode=floor(st,3,3),floorEnv=SP.environmentAt(st,floorNode),floorTile=SP.tileByPos(st,floorNode);
assert.equal(floorEnv.contents,floorTile.surface.contents,'floor environment API must resolve to existing tile storage, not duplicate it');
SP.putEnvironmentResource(st,floorNode,'water',7);
assert.equal(floorTile.surface.contents.water,7);
assert.equal(SP.takeEnvironmentResource(st,floorNode,'water',2),2);
assert.equal(floorTile.surface.contents.water,5);

// Furniture Surface liquid is stored per Surface Cell / Spatial Node.
const tableA=table(st,5,2),tableB=table(st,6,2),envA=SP.environmentAt(st,tableA),envB=SP.environmentAt(st,tableB);
assert.notEqual(envA.contents,envB.contents,'different Surface Cells need independent environment storage');
SP.putEnvironmentResource(st,tableA,'water',8);
assert.equal(SP.environmentResourceAmount(st,tableA,'water'),8);
assert.equal(SP.environmentResourceAmount(st,tableB,'water'),0,'neighboring tabletop cell must remain dry');
assert.equal(SP.takeEnvironmentResource(st,tableA,'water',3),3,'cleanup/remove API should remove from the addressed node only');
assert.equal(SP.environmentResourceAmount(st,tableA,'water'),5);
const ep=SP.environmentEndpointId(st,tableA);
assert.equal(SP.environmentFromEndpointId(st,ep).contents,envA.contents,'environment endpoint must resolve back to the same storage');

// effectNode is derived, not persistent: cross-Surface object interaction resolves to the target Surface.
const zhen=st.agents.zhen;
zhen.position={...floor(st,4,3)};
let effect=SP.resolveEffectNode(st,{actor:zhen,target:{kind:'object',id:'alcoholBottle'},affordance:'fill'});
assert.ok(SP.nodeSame(st,effect,table(st,5,3)),'tabletop bottle fill should resolve effect to its tabletop node');
zhen.position={...floor(st,5,5)};
effect=SP.resolveEffectNode(st,{actor:zhen,target:{kind:'source',id:'tap'},affordance:'fill'});
assert.ok(SP.nodeSame(st,effect,floor(st,5,5)),'ported source should resolve effect to the occupied interaction port node');
assert.equal(Object.prototype.hasOwnProperty.call(zhen.action||{},'effectNode'),false,'effectNode must not become persistent action truth');

// A real failed pour must move the spill from the legacy projected floor endpoint to the derived effectNode.
let spillEvent=null,spillState=null;
for(let seed=1;seed<=200&&!spillEvent;seed++){
  E.reset(seed);st=E.getState();
  const a=st.agents.zhen,cup=st.containers.cupA;
  a.position={...floor(st,4,3)};a.status.intoxication=100;a.needs.fatigue=100;a.traits.careful=0;
  a.held='cupA';delete cup.supportId;cup.position={...a.position};cup.contents={};
  a.action={kind:'drinkAlcohol',phase:'fill',started:st.tick,wait:0,container:'cupA',sourceObject:'alcoholBottle',sourceKind:'object',resource:'alcohol'};
  E.tick();
  spillEvent=st.events.find(e=>e.data?.actor==='zhen'&&e.data?.action==='spill'&&e.data?.resource==='alcohol');
  if(spillEvent)spillState=st;
}
assert.ok(spillEvent,'deterministic seed sweep should find a failed pour');
st=spillState;
assert.equal(spillEvent.data.effectNode,'room1|diningTable:surface|5,3');
assert.equal(spillEvent.data.position,spillEvent.data.effectNode,'structured spill position should be the derived effectNode');
assert.ok(SP.environmentResourceAmount(st,table(st,5,3),'alcohol')>0,'failed tabletop pour should create tabletop liquid');
assert.equal(SP.environmentResourceAmount(st,floor(st,4,3),'alcohol'),0,'legacy actor-floor spill must be removed after routing');
assert.equal(SP.environmentFromEndpointId(st,spillEvent.data.spillEndpoint).node.surfaceId,'diningTable:surface');

// Entering the same wet tabletop node causes real Surface contact; floor below remains unrelated.
E.reset(20260911);st=E.getState();
const orange=st.agents.orange,wetTable=table(st,5,2),floorBelow=floor(st,5,2);
SP.putEnvironmentResource(st,wetTable,'water',10);
const floorBefore=SP.environmentResourceAmount(st,floorBelow,'water');
orange.position={...floor(st,4,2)};orange.contacts.paws={};
orange.action={kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...wetTable},oneShot:true};
for(let i=0;i<4&&orange.action;i++)E.tick();
assert.equal(orange.position.surfaceId,'diningTable:surface');
assert.ok((orange.contacts.paws.water||0)>0,'cat entering wet tabletop node should contact and pick up liquid');
assert.ok(SP.environmentResourceAmount(st,wetTable,'water')<10,'surface contact should consume the picked-up amount from that Surface Cell');
assert.equal(SP.environmentResourceAmount(st,floorBelow,'water'),floorBefore,'tabletop contact must not touch projected floor storage');
const contactEvent=st.events.find(e=>e.data?.actor==='orange'&&e.data?.action==='surfaceContact');
assert.ok(contactEvent,'surface contact should be observable as structured event data');
assert.equal(contactEvent.data.position,'room1|diningTable:surface|5,2');

let validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join('\n'));
E.reset(20260911);
for(let i=0;i<500;i++)E.tick();
validation=V.validateState(E.getState());
assert.equal(validation.issueCount,0,validation.issues.slice(0,8).map(x=>x.message).join('\n'));
console.log('v11.11.4 spatial environment + Surface liquid + effectNode foundation passed');
