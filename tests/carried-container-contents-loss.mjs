import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,R=globalThis.SimResources,SP=globalThis.SimSpatial,L=globalThis.SimLocomotion;
const APP_VERSION='11.39.0-carried-contents-loss';
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const near=(actual,expected,eps=1e-9,msg='')=>assert.ok(Math.abs(actual-expected)<=eps,`${msg} expected ${expected}, got ${actual}`);
const eventsFor=(st,containerId)=>st.events.filter(e=>e.data?.container===containerId&&(e.data?.action==='spill'||e.data?.action==='contentsDrop'));
const armWander=(st,a,goal)=>{const intent={id:`intent:${a.id}:${st.tick}:execution-contents-loss-test`,kind:'explore',createdTick:st.tick,lifecycle:'actionBound',source:{type:'emergency',reason:'execution-contents-loss-test-fixture'}};a.activeIntent=intent;a.action={kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...goal},oneShot:true,intentId:intent.id};};

assert.equal(E.VERSION,APP_VERSION);
assert.equal(R.VERSION,APP_VERSION);

E.reset(13900);
{
  const st=E.getState(),cup=st.containers.cupA,bottle=st.containers.alcoholBottle;
  cup.contents={water:35};
  const high=cup.handling.contentRetention.tilt.highRiskExposure;
  const facts=R.contentsLossExecutionFactsForContainer(st,cup,{tilt:high,impact:0,oscillation:0});
  near(facts.retentionSeverity,.8,1e-12,'highRiskExposure raw retention severity');
  near(facts.amountSeverity,.28*Math.sqrt(.8),1e-12,'C2 amountSeverity');
  near(facts.fillModifier,1,1e-12,'full Container fill modifier');
  near(facts.lossFraction,.28*Math.sqrt(.8),1e-12,'C2 full-Container loss fraction');
  near(facts.occurrenceProbability,.8,1e-12,'occurrence must remain objective HandlingRisk');

  cup.contents={water:17.5};
  const half=R.contentsLossExecutionFactsForContainer(st,cup,{tilt:high,impact:0,oscillation:0});
  near(half.fillRatio,.5);
  near(half.fillModifier,.75);
  near(half.lossFraction,.28*Math.sqrt(.8)*.75);

  bottle.contents={alcohol:120};
  const sealed=R.contentsLossExecutionFactsForContainer(st,bottle,{tilt:1e12,impact:1e12,oscillation:1e12});
  assert.equal(sealed.occurrenceProbability,0,'sealed normal movement must remain structurally impossible for contents loss');
  assert.equal(sealed.lossFraction,0,'zero-probability consequence must not expose a realizable loss fraction');
}

function resetLowPassage(){
  E.reset(13901);
  const st=E.getState(),a=st.agents.zhen,cup=st.containers.cupA;
  for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
  for(const tile of Object.values(st.map.tiles||{})){tile.terrain='wall';tile.walkable=false;tile.furnitureIds=[];tile.surface={contents:{}};}
  for(const [x,y] of [[1,1],[2,1],[3,1]]){const tile=st.map.tiles[`${x},${y}`];tile.terrain='floor';tile.walkable=true;tile.furnitureIds=[];}
  st.furniture={testPassageCover:{id:'testPassageCover',name:'測試通道上蓋',footprint:[{x:2,y:1}],displayAt:{x:2,y:1},slots:[],spatial:{solids:[{key:'roof',layerZ:0,bounds:{x:2,y:1,z:.95,width:1,depth:1,height:.05}}]}}};
  st.map.passageConstraints={};
  const start=floor(st,1,1),mid=floor(st,2,1),goal=floor(st,3,1);
  st.map.passageConstraints[SP.passageConstraintKey(st,start,mid)]={clearanceWidth:.8};
  st.map.passageConstraints[SP.passageConstraintKey(st,mid,goal)]={clearanceWidth:.8};
  a.position={...start};a.posture={kind:'standing',slotId:null,furnitureId:null};a.locomotion={mode:null,phase:'idle'};a.traits.careful=0;
  a.held=cup.id;delete cup.supportId;cup.contents={water:35};
  armWander(st,a,goal);
  return {st,a,cup,start,mid,goal};
}

const originalExposure=L.handlingExposureForEdge;
L.handlingExposureForEdge=()=>({tilt:1e12,impact:1e12,oscillation:1e12});
try{
  {
    const {st,a,cup,start,mid}=resetLowPassage(),before=cup.contents.water;
    E.tick();
    assert.ok(SP.nodeSame(st,a.position,start),'posture transition tick must not commit edge');
    assert.equal(cup.contents.water,before,'transition tick must not evaluate contents loss');
    assert.equal(eventsFor(st,cup.id).length,0);

    E.tick();
    assert.ok(SP.nodeSame(st,a.position,start),'first multi-tick movement tick must remain in progress');
    assert.equal(cup.contents.water,before,'intermediate movement tick must not evaluate contents loss');
    assert.equal(eventsFor(st,cup.id).length,0);

    const facts=R.contentsLossExecutionFactsForContainer(st,cup,{tilt:1e12,impact:1e12,oscillation:1e12}),expected=before*facts.lossFraction;
    E.tick();
    assert.ok(SP.nodeSame(st,a.position,mid),'contents loss must run only after completed-edge position commit');
    const moved=before-(cup.contents.water||0),env=SP.environmentResourceAmount(st,mid,'water');
    near(moved,expected,1e-8,'deterministic C2 amount');
    near(env,moved,1e-8,'Container -> Environment transfer must conserve exact amount');
    const spills=eventsFor(st,cup.id);
    assert.equal(spills.length,1,'one completed edge occurrence must create one liquid consequence event');
    const spill=spills[0];
    assert.equal(spill.data.action,'spill');
    assert.equal(spill.data.to,SP.environmentEndpointId(st,mid));
    assert.equal(spill.data.effectNode,SP.nodeKey(st,mid));
    assert.equal(spill.data.completedEdge.to,SP.nodeKey(st,mid));
    assert.deepEqual(spill.data.handlingExposure,{tilt:1e12,impact:1e12,oscillation:1e12});
    near(spill.data.amount,moved,1e-8);
  }

  {
    E.reset(13902);
    const st=E.getState(),a=st.agents.zhen,plate=st.containers.plateA;
    for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
    const surface=st.furniture.diningTable.spatial.surfaces.find(x=>x.id==='diningTable:surface');
    const top=SP.normalizeNode(st,surface.cells[0],surface.id),start=floor(st,5,1),under=floor(st,top.x,top.y);
    a.position={...start};a.posture={kind:'standing',slotId:null,furnitureId:null};a.locomotion={mode:null,phase:'idle'};a.traits.careful=0;
    a.held=plate.id;delete plate.supportId;plate.contents={food:6,water:6};
    const facts=R.contentsLossExecutionFactsForContainer(st,plate,{tilt:1e12,impact:1e12,oscillation:1e12}),expectedEach=6*facts.lossFraction;
    armWander(st,a,top);
    const originalExecute=L.executeSurfaceManeuver;
    L.executeSurfaceManeuver=(agent,maneuver)=>{st.rngState=0;return originalExecute(agent,maneuver);};
    try{E.tick();}finally{L.executeSurfaceManeuver=originalExecute;}
    assert.ok(SP.nodeSame(st,a.position,top),'Surface edge must complete before consequence transfer');
    near(6-(plate.contents.water||0),expectedEach,1e-8);
    near(6-(plate.contents.food||0),expectedEach,1e-8);
    const surfaceWater=SP.environmentResourceAmount(st,top,'water'),feetWater=a.contacts?.feet?.water||0;
    near(surfaceWater+feetWater,expectedEach,1e-8,'same-tick Surface contact may move spill onward, but total realized water must remain conserved');
    near(SP.environmentResourceAmount(st,top,'food'),expectedEach,1e-8,'solid loss remains on the Surface effectNode');
    assert.equal(SP.environmentResourceAmount(st,under,'water'),0,'Surface effectNode must not collapse to same-XY floor');
    assert.equal(SP.environmentResourceAmount(st,under,'food'),0,'solid loss must use same Surface effectNode');
    const events=eventsFor(st,plate.id);
    assert.equal(events.length,2,'one container-level occurrence may realize every nonzero resource without extra RNG');
    assert.deepEqual(events.map(e=>e.data.action).sort(),['contentsDrop','spill']);
    for(const event of events){
      near(event.data.lossFraction,facts.lossFraction,1e-12);
      near(event.data.amount,expectedEach,1e-8,'canonical consequence event records the exact Container -> Environment transfer amount before later contact effects');
      assert.equal(event.data.to,SP.environmentEndpointId(st,top));
      assert.equal(event.data.effectNode,SP.nodeKey(st,top));
    }
  }

  {
    let trial=null;
    for(let seed=13903;seed<14003&&!trial;seed++){
      E.reset(seed);
      const st=E.getState(),a=st.agents.zhen,cup=st.containers.cupA;
      for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
      const surface=st.furniture.diningTable.spatial.surfaces.find(x=>x.id==='diningTable:surface');
      const top=SP.normalizeNode(st,surface.cells[0],surface.id),start=floor(st,5,1),under=floor(st,top.x,top.y);
      a.position={...start};a.posture={kind:'standing',slotId:null,furnitureId:null};a.locomotion={mode:null,phase:'idle'};a.traits.careful=0;
      a.held=cup.id;delete cup.supportId;cup.contents={water:35};
      SP.putEnvironmentResource(st,under,'water',100);
      armWander(st,a,top);
      E.tick();
      const slip=st.events.find(event=>event.data?.action==='tileSlip'&&event.data?.actor===a.id);
      if(slip)trial={st,a,cup,top,under,slip};
    }
    assert.ok(trial,'deterministic seed sweep must find a wet-floor tileSlip trial');
    const {st,cup,top,under,slip}=trial,spills=eventsFor(st,cup.id);
    assert.equal(spills.length,1,'legacy on-enter carried spill must suppress normal same-edge handling consequence');
    assert.ok(spills[0].causeIds.includes(slip.id),'legacy spill must preserve canonical tileSlip cause linkage');
    assert.equal(spills[0].data.completedEdge,undefined,'surviving event must be legacy hazard, not second normal-handling event');
    assert.ok(SP.environmentResourceAmount(st,under,'water')>100,'legacy hazard keeps current floor transfer behavior');
    assert.equal(SP.environmentResourceAmount(st,top,'water'),0,'normal Surface consequence must not run after legacy carried-content loss');
  }
}finally{
  L.handlingExposureForEdge=originalExposure;
}

console.log('Carried Container execution contents-loss regression: ok');
