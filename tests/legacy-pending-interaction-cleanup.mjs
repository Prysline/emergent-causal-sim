import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

for(const path of [
  'src/world.js',
  'src/social-bid-schema-v1122.js',
  'src/memory-deliberation-runtime-v1134.js',
  'src/ui.js'
]){
  assert.equal(source(path).includes('pendingInteraction'),false,`${path} must not retain legacy pendingInteraction ownership or consumer reads`);
}

globalThis.window=globalThis;
for(const file of [
  'world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js',
  'action-schema-v1120.js','intent-schema-v1121.js','social-bid-schema-v1122.js',
  'engine.js','engine-spatial-v1114.js','action-runtime-v1120.js','intent-runtime-v1121.js','social-bid-runtime-v1122.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js'
]){
  vm.runInThisContext(source(`src/${file}`),{filename:file});
}

const E=globalThis.SimEngine,V=globalThis.SimValidator;
E.reset(20260911);
let st=E.getState();
for(const a of Object.values(st.agents)){
  assert.equal(Object.prototype.hasOwnProperty.call(a,'pendingInteraction'),false,`${a.name} must not receive legacy pendingInteraction from base or schema normalization`);
}
assert.equal(V.validateState(st).issueCount,0,'clean reset must remain validator-clean');

st.agents.zhen.pendingInteraction={type:'cat_request',from:'orange'};
let validation=V.validateState(st);
assert.ok(validation.issues.some(x=>x.code==='legacy_pending_interaction_persistent'),'validator must keep the negative invariant against reintroducing pendingInteraction');
delete st.agents.zhen.pendingInteraction;
validation=V.validateState(st);
assert.equal(validation.issueCount,0,'removing injected legacy state must restore a clean validation result');

console.log('Legacy pendingInteraction cleanup regression: ok');
