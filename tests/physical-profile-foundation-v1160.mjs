import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of [
  'world.js','spatial.js','spatial-v111.js','spatial-observability.js',
  'physical-schema-v1160.js','physical-runtime-v1160.js','engine.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1160.js'
])vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});

const CURRENT_VERSION='11.16.0-physical-profile-foundation';
const E=globalThis.SimEngine,SP=globalThis.SimSpatial,P=globalThis.SimPhysical,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');

E.reset(11600);
const st=E.getState(),zhen=st.agents.zhen,zhou=st.agents.zhou,orange=st.agents.orange;
assert.equal(st.version,CURRENT_VERSION);
assert.equal(globalThis.SimWorld.PHYSICAL_SCHEMA_VERSION,CURRENT_VERSION);
assert.equal(P.VERSION,CURRENT_VERSION);

for(const a of [zhen,zhou,orange]){
  assert.ok(a.physical,'every Agent must own authoritative physical state');
  assert.ok(a.physical.mass>0&&a.physical.volume>0);
  assert.ok(a.physical.bodyGeometry.height>0&&a.physical.bodyGeometry.width>0&&a.physical.bodyGeometry.length>0);
  assert.equal(a.physical.locomotionCapabilities.standing,true);
  assert.equal(Object.prototype.hasOwnProperty.call(a.physical,'movementEnvelope'),false,'MovementEnvelope must remain derived');
  const envelope=P.getMovementEnvelope(a,'standing');
  assert.ok(envelope&&envelope.clearanceHeight>0&&envelope.clearanceWidth>0&&envelope.clearanceLength>0);
  assert.equal(P.requiredClearance(a,'standing'),envelope.clearanceHeight);
}

assert.equal(P.requiredClearance(zhen,'standing'),1.65,'default Human clearance must preserve v11.11 behavior');
assert.equal(P.requiredClearance(orange,'standing'),.32,'default Cat clearance must preserve v11.11 behavior');
assert.equal(SP.nodeWalkable(st,floor(st,5,2),orange),true,'default Cat still fits below dining table');
assert.equal(SP.nodeWalkable(st,floor(st,5,2),zhen),false,'default Human still does not fit below dining table');

const oldZhenHeight=zhen.physical.bodyGeometry.height;
zhen.physical.bodyGeometry.height=.60;
assert.equal(P.requiredClearance(zhen,'standing'),.60,'clearance must derive from the individual Agent physical profile');
assert.equal(SP.nodeWalkable(st,floor(st,5,2),zhen),true,'a Human individual whose standing envelope fits must no longer be blocked by kind-level hardcoding');
zhen.physical.bodyGeometry.height=oldZhenHeight;
assert.equal(SP.nodeWalkable(st,floor(st,5,2),zhen),false,'restoring individual geometry restores default feasibility');

zhou.physical.locomotionProfiles.standing={...zhou.physical.locomotionProfiles.standing,clearanceHeight:.68};
assert.equal(P.requiredClearance(zhou,'standing'),.68,'locomotion profile may provide an explicit absolute envelope override');
assert.equal(SP.nodeWalkable(st,floor(st,5,2),zhou),true,'Spatial must consume the canonical MovementEnvelope override');

const obs=SP.agentObservation(st,'orange');
assert.equal(obs.requiredClearance,.32,'Spatial observability must report canonical Physical clearance');

let validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join('\n'));
orange.physical.bodyGeometry.width=0;
validation=V.validateState(st);
assert.ok(validation.issues.some(x=>x.code==='physical_geometry_invalid'&&x.agentId==='orange'),'validator must reject invalid authoritative geometry');
orange.physical.bodyGeometry.width=.18;
orange.physical.movementEnvelope={clearanceHeight:.32};
validation=V.validateState(st);
assert.ok(validation.issues.some(x=>x.code==='physical_derived_envelope_persisted'&&x.agentId==='orange'),'validator must reject persistent derived envelope mirrors');
delete orange.physical.movementEnvelope;
assert.equal(V.validateState(st).issueCount,0);

E.reset(11600);
for(let i=0;i<500;i++)E.tick();
validation=V.validateState(E.getState());
assert.equal(validation.issueCount,0,validation.issues.slice(0,8).map(x=>x.message).join('\n'));
console.log('v11.16.0 Physical Profile foundation contract passed');
