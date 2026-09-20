import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of [
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js',
  'spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'presentation-schema-v1140.js','physical-schema-v1160.js','physical-runtime-v1160.js',
  'spatial-passage.js','locomotion-schema-v1190.js','locomotion-runtime-v1190.js',
  'crowding-runtime-v1200.js','spatial/finalize.js'
]){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}

const A=globalThis.SimWorldAuthoring,W=globalThis.SimWorld,SP=globalThis.SimSpatial,C=globalThis.SimCrowding;
const layered=A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
layered.map.layers.push({
  z:1,
  cells:{
    '8,4':{terrain:'floor',material:'wood'},
    '9,4':{terrain:'floor',material:'wood'}
  }
});
layered.residents.orange.initial.placement={mode:'exact',node:{x:8,y:4,z:1}};
layered.residents.orange.initial.posture={kind:'standing'};

const compatibility=globalThis.SimWorldInitializer.analyzeRuntimeCompatibility(layered);
assert.equal(compatibility.ok,true,compatibility.hardErrors.map(x=>x.code+': '+x.message).join(' | '));

const st=W.createInitialStateFromAuthoring(layered,20260911);

assert.equal(SP.SPATIAL_IDENTITY_VERSION,'11.22.0-spatial-z-identity');
assert.deepEqual(st.map.zLevels,[0,1]);
assert.ok(st.map.tiles['8,4'],'z=0 keeps the legacy compatible tile key');
assert.ok(st.map.tiles['8,4,1'],'non-zero z must have its own flattened tile key');
assert.notEqual(st.map.tiles['8,4'],st.map.tiles['8,4,1']);
assert.equal(st.map.tiles['8,4'].z,0);
assert.equal(st.map.tiles['8,4,1'].z,1);

const z0={x:8,y:4,z:0},z1={x:8,y:4,z:1},z1East={x:9,y:4,z:1};
assert.equal(SP.key(z0),'8,4');
assert.equal(SP.key(z1),'8,4,1');
assert.equal(SP.same(z0,z1),false);
assert.equal(SP.manhattan(z0,z1),1);

const node0=SP.normalizeNode(st,z0,'floor'),node1=SP.normalizeNode(st,z1,'floor');
assert.notEqual(SP.nodeKey(st,node0),SP.nodeKey(st,node1));
assert.equal(SP.nodeSame(st,node0,node1),false);
assert.notEqual(node0.spaceId,node1.spaceId,'room derivation must remain layer-local');

const zhen=st.agents.zhen,orange=st.agents.orange;
zhen.position={...node0};
orange.position={...node1};
st.agents.zhou.offMap=true;

assert.equal(SP.nodeOccupantsAt(st,node0).length,1,'same XY upper resident must not count on z=0');
assert.equal(SP.nodeOccupantsAt(st,node1).length,1,'same XY lower resident must not count on z=1');
assert.equal(SP.isAtInteraction(st,zhen,{kind:'agent',id:orange.id},'social'),false,'same XY different Z is not direct contact');

const sameLayerRoute=SP.planRoute(st,orange,z1East,{mode:'walk',objective:'pathDistance'});
assert.equal(sameLayerRoute.pathDistance,1,'horizontal routing within z=1 must remain executable');
assert.equal(SP.zOf(sameLayerRoute.path.at(-1)),1);

const crossLayerRoute=SP.planRoute(st,zhen,z1,{mode:'walk',objective:'pathDistance'});
assert.equal(crossLayerRoute.path.length,0,'Slice E must not invent a vertical traversal edge');
assert.equal(crossLayerRoute.pathDistance,Infinity);

assert.ok(SP.getPassageProfile(st,z1,z1East),'same-z horizontal edge still has a PassageProfile');
assert.equal(SP.getPassageProfile(st,z0,{x:9,y:4,z:1}),null,'different-z planar neighbors are not a passage edge');

const crowd=C.getCrowdingProfile(st,zhen,z0,{x:9,y:4,z:0},'walk');
assert.equal(crowd.occupantCount,0,'crowding must ignore an agent at same XY on another z');

const env0=SP.environmentEndpointId(st,z0),env1=SP.environmentEndpointId(st,z1);
assert.notEqual(env0,env1,'surface environment endpoint identity must include z');
SP.putEnvironmentResource(st,z1,'water',5);
assert.equal(SP.environmentResourceAmount(st,z1,'water'),5);
assert.equal(SP.environmentResourceAmount(st,z0,'water'),0,'same XY floor contents on different z must not collide');

assert.deepEqual(st.agents.orange.position,{x:8,y:4,z:1,spaceId:node1.spaceId,surfaceId:'floor'});
assert.equal(SP.zOf(st.agents.zhen.position),0);

console.log('spatial z identity regression: ok');
