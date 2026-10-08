import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','systems/locomotion.js','engine.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,L=globalThis.SimLocomotion;
const VERSION='11.50.1-prone-transition-burden';
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');

E.reset(20261008);
const st=E.getState(),human=st.agents.zhen;
st.agents.zhou.offMap=true;
st.agents.orange.offMap=true;
human.position={...floor(st,5,2)};
human.posture={kind:'standing',slotId:null,furnitureId:null};
human.locomotion={mode:null,phase:'idle'};
human.action=null;
human.held=null;

assert.equal(st.version,VERSION);
assert.equal(L.VERSION,VERSION);
assert.ok(st.furniture.diningTable,'regression must use the current default dining table');
for(const id of ['chairNW','chairNE','chairSW','chairSE'])assert.ok(st.furniture[id],`regression must keep current dining chair ${id}`);
assert.deepEqual(st.containers.cupB.position,{x:6,y:3,z:0},'regression must use the current cupB placement across the table');

const pickup=SP.bestInteractionPositionResult(st,human,{kind:'object',id:'cupB'},'pickup');
assert.ok(pickup,'cupB must remain reachable through canonical interaction geometry');
const route=SP.planRoute(st,human,pickup.position,{mode:'auto',objective:'traversalCost'});
assert.ok(route?.path?.length>1,'pickup winner must have an executable route from the table-side start');
assert.ok(route.steps.length>0);
assert.ok(route.steps.every(step=>step.mode==='walk'),'small dining-table/chair detour must beat dropping prone for a short shortcut');
assert.equal(route.traversalCost,pickup.traversalCost,'interaction winner and execution route must consume the same canonical traversal cost');

console.log('v11.50.1 default dining-table prone shortcut calibration regression: ok');
