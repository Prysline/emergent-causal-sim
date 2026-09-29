import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','engine.js','validation/registry.js','validation/rules/spatial-node.js'
]);

const A=globalThis.SimWorldAuthoring;
const I=globalThis.SimWorldInitializer;
const W=globalThis.SimWorld;
const SP=globalThis.SimSpatial;
const clone=value=>JSON.parse(JSON.stringify(value));
const floorCell=()=>({terrain:'floor',material:'wood'});
const hasKey=(report,key)=>report.reachabilityByResident?.resident?.reachableKeys.includes(key)===true;
const floor=(st,x,y,z=0)=>SP.normalizeNode(st,{x,y,z},'floor');

function authoredFixture({kind='human',cells=['1,1','2,1'],boundaries={},doors={},passageConstraints={},furniture={}}={}){
  const authored=clone(A.DEFAULT_WORLD_AUTHORING);
  authored.map.layers=[{z:0,cells:Object.fromEntries(cells.map(id=>[id,floorCell()])),boundaries:clone(boundaries)}];
  authored.furniture=clone(furniture);
  authored.entities={containers:{},sources:{}};
  authored.doors=clone(doors);
  authored.exits={};
  authored.structures={};
  if(Object.keys(passageConstraints).length)authored.compatibility={passageConstraints:clone(passageConstraints)};
  else delete authored.compatibility;
  const resident=clone(A.DEFAULT_WORLD_AUTHORING.residents.zhen);
  resident.id='resident';
  resident.name='Resident';
  resident.kind=kind;
  resident.initial={placement:{mode:'exact',node:{x:1,y:1,z:0}},posture:{kind:'standing'}};
  authored.residents={resident};
  const schema=A.validateAuthoring(authored);
  assert.equal(schema.ok,true,schema.errors?.map(issue=>issue.code+':'+issue.path).join(' | '));
  return authored;
}

function runtime(authoring){
  return W.createInitialStateFromAuthoring(authoring,20260929);
}

{
  const authored=authoredFixture({cells:['1,1','2,1','1,2','2,2']});
  const report=I.analyzeRuntimeCompatibility(authored);
  assert.equal(report.ok,true);
  assert.equal(report.reachabilityByResident.resident.kind,'human');
  assert.equal(report.reachabilityByResident.resident.mode,'walk');
  assert.equal(hasKey(report,'2,2'),true,'Initializer default-walk reachability must consume legal diagonal HorizontalConnections');
  const st=runtime(authored),resident=st.agents.resident;
  const route=SP.planRoute(st,resident,floor(st,2,2),{mode:'walk',objective:'pathDistance'});
  assert.ok(Math.abs(route.pathDistance-Math.SQRT2)<1e-9,'Runtime must use the same legal open diagonal');
}

{
  const boundaries={
    'v:2,1':{kind:'opening',material:'wood'},
    'h:1,2':{kind:'opening',material:'wood'}
  };
  const doors={
    east:{id:'east',name:'East test door',boundary:{z:0,id:'v:2,1'},state:'closed'},
    south:{id:'south',name:'South test door',boundary:{z:0,id:'h:1,2'},state:'closed'}
  };
  const authored=authoredFixture({cells:['1,1','2,1','1,2','2,2'],boundaries,doors});
  const report=I.analyzeRuntimeCompatibility(authored);
  assert.equal(hasKey(report,'2,2'),false,'closed Door corner must conservatively block Initializer reachability');
  const st=runtime(authored),resident=st.agents.resident;
  assert.equal(SP.planRoute(st,resident,floor(st,2,2),{mode:'walk',objective:'pathDistance'}).pathDistance,Infinity,'Runtime must block the same closed Door corner');
}

{
  const boundaries={'v:2,1':{kind:'opening',material:'wood',clearanceWidth:.30,clearanceHeight:2}};
  const humanDoc=authoredFixture({kind:'human',boundaries});
  const catDoc=authoredFixture({kind:'cat',boundaries});
  const humanReport=I.analyzeRuntimeCompatibility(humanDoc),catReport=I.analyzeRuntimeCompatibility(catDoc);
  assert.equal(hasKey(humanReport,'2,1'),false,'Human default walk envelope must fail the narrow authored passage');
  assert.equal(hasKey(catReport,'2,1'),true,'Cat default walk envelope must fit the same narrow authored passage');
  const humanState=runtime(humanDoc),catState=runtime(catDoc);
  const humanFrom=floor(humanState,1,1),humanTo=floor(humanState,2,1);
  console.log('initializer-horizontal-debug',JSON.stringify({
    physical:globalThis.SimPhysical?.getMovementEnvelope?.(humanState.agents.resident,'walk')||null,
    boundary:humanState.map.boundaries?.['0|v:2,1']||null,
    passage:SP.getPassageProfile?.(humanState,humanFrom,humanTo)||null,
    feasibility:SP.traversalFeasibility?.(humanState,humanState.agents.resident,humanFrom,humanTo)||null
  }));
  assert.equal(SP.planRoute(humanState,humanState.agents.resident,humanTo,{mode:'walk',objective:'pathDistance'}).pathDistance,Infinity);
  assert.equal(SP.planRoute(catState,catState.agents.resident,floor(catState,2,1),{mode:'walk',objective:'pathDistance'}).pathDistance,1);
}

{
  const furniture={stool:{id:'stool',definitionId:'stool-basic',origin:{x:2,y:1,z:0},orientation:'south'}};
  const humanDoc=authoredFixture({kind:'human',furniture});
  const catDoc=authoredFixture({kind:'cat',furniture});
  const humanReport=I.analyzeRuntimeCompatibility(humanDoc),catReport=I.analyzeRuntimeCompatibility(catDoc);
  assert.equal(hasKey(humanReport,'2,1'),false,'Initializer endpoint fit must reject Human default walk envelope in stool residual floor');
  assert.equal(hasKey(catReport,'2,1'),true,'Initializer endpoint fit must accept Cat default walk envelope in the same partial-tile geometry');
  const humanState=runtime(humanDoc),catState=runtime(catDoc);
  assert.equal(SP.planRoute(humanState,humanState.agents.resident,floor(humanState,2,1),{mode:'walk',objective:'pathDistance'}).pathDistance,Infinity);
  assert.equal(SP.planRoute(catState,catState.agents.resident,floor(catState,2,1),{mode:'walk',objective:'pathDistance'}).pathDistance,1);
}

console.log('initializer horizontal resident reachability parity: ok');
