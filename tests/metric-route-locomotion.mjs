import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','systems/locomotion.js','engine.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,L=globalThis.SimLocomotion;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const approx=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-9,`${message}: expected ${expected}, got ${actual}`);

function resetOpenGrid(){
  E.reset(23000);
  const st=E.getState(),human=st.agents.zhen;
  for(const tile of Object.values(st.map.tiles||{})){
    tile.terrain='wall';tile.walkable=false;tile.furnitureIds=[];tile.surface={contents:{}};
  }
  for(let y=1;y<=3;y++)for(let x=1;x<=3;x++){
    const tile=st.map.tiles[x+','+y];tile.terrain='floor';tile.walkable=true;tile.furnitureIds=[];tile.surface={contents:{}};
  }
  st.furniture={};st.map.boundaries={};st.doors={};st.map.passageConstraints={};
  for(const c of Object.values(st.containers||{}))if(c.position)c.position={x:7,y:4};
  for(const source of Object.values(st.sources||{}))if(source.position)source.position={x:7,y:4};
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  human.position=floor(st,1,1);human.action=null;
  human.posture={kind:'standing',slotId:null,furnitureId:null};
  human.locomotion={mode:null,phase:'idle'};
  return {st,human,start:floor(st,1,1),middle:floor(st,2,2),goal:floor(st,3,3)};
}

assert.equal(SP.ROUTE_SEMANTICS_VERSION,'11.30.0-metric-route');
assert.equal(SP.VERSION,'11.30.0-metric-route-locomotion');
assert.equal(L.VERSION,'11.30.0-distance-timing');

{
  const {st,human,start,middle,goal}=resetOpenGrid();
  const oneDiagonal=SP.planRoute(st,human,middle,{mode:'auto',objective:'pathDistance'});
  approx(oneDiagonal.pathDistance,Math.SQRT2,'single diagonal pathDistance must use meters');
  assert.equal(oneDiagonal.stepCount,1);
  approx(oneDiagonal.traversalCost,Math.SQRT2,'dry walk traversal burden must scale per meter');
  assert.equal(oneDiagonal.travelTime,2,'single diagonal walk requires two discrete movement ticks');

  const timing1=L.movementTiming(human,'walk',Math.SQRT2,0);
  assert.equal(timing1.movementTicks,2);
  approx(timing1.movementCreditAfter,2-Math.SQRT2,'first diagonal must retain fractional movement credit');
  const timing2=L.movementTiming(human,'walk',Math.SQRT2,timing1.movementCreditAfter);
  assert.equal(timing2.movementTicks,1,'second diagonal must consume the previous fractional credit');

  const plan=SP.planRoute(st,human,goal,{mode:'auto',objective:'traversalCost'});
  approx(plan.pathDistance,2*Math.SQRT2,'two diagonal route must sum metric distance');
  assert.equal(plan.stepCount,2);
  approx(plan.traversalCost,2*Math.SQRT2,'two diagonal route must sum per-meter burden');
  assert.equal(plan.travelTime,3,'two consecutive diagonal walk edges must complete in three ticks, not four');
  assert.deepEqual(plan.steps.map(step=>[step.from.x,step.from.y,step.to.x,step.to.y]),[[1,1,2,2],[2,2,3,3]]);
  assert.equal(plan.steps[0].moveTicks,2);
  assert.equal(plan.steps[1].moveTicks,1);

  human.action={kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...goal},oneShot:true};
  E.tick();
  assert.ok(SP.nodeSame(E.getState(),human.position,start),'first diagonal tick must remain in progress');
  E.tick();
  assert.ok(SP.nodeSame(E.getState(),human.position,middle),'second tick must complete the first diagonal');
  assert.ok(Number(human.action?.locomotionCredit)>0,'completed first diagonal must keep action-scoped fractional credit');
  E.tick();
  assert.ok(SP.nodeSame(E.getState(),human.position,goal),'third tick must complete the second diagonal using carried credit');
  assert.equal(human.action?.locomotionCredit,undefined,'arrival must clear action-scoped movement credit');
}

{
  const {st,human,start,middle}=resetOpenGrid();
  st.map.boundaries['0|v:2,1']={id:'v:2,1',kind:'wall'};
  const passage=SP.getPassageProfile(st,start,middle);
  assert.equal(passage.status,'blocked');
  const plan=SP.planRoute(st,human,middle,{mode:'auto',objective:'pathDistance'});
  assert.equal(plan.stepCount,2,'blocked diagonal corner must fall back to a legal two-step cardinal route');
  assert.equal(plan.path.some((node,index)=>index>0&&index<plan.path.length-1&&node.x!==start.x&&node.y!==start.y),false,'blocked diagonal must not appear in the selected route');
  assert.equal(plan.pathDistance,2);
}

console.log('8-direction Slice 3 metric Route + Locomotion execution contract: ok');
