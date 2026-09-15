import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
const files=[
  'world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','spatial-v1114.js',
  'action-schema-v1120.js','intent-schema-v1121.js','social-bid-schema-v1122.js','interruption-schema-v1123.js','deliberation-schema-v1124.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','social-response-schema-v1132a.js','memory-retention-schema-v1133.js','human-social-response-schema-v1133a.js','memory-deliberation-schema-v1134.js','social-outcome-memory-schema-v1135.js','presentation-schema-v1140.js',
  'engine.js','engine-spatial-v1114.js','action-runtime-v1120.js','intent-runtime-v1121.js','social-bid-runtime-v1122.js','intent-runtime-v1123.js','intent-runtime-v1124.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','appraisal-human-social-response-v1133a.js','affect-runtime-v1132.js','social-response-runtime-v1132a.js','memory-retention-runtime-v1133.js','human-social-response-runtime-v1133a.js','memory-deliberation-runtime-v1134.js','social-outcome-memory-runtime-v1135.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js','state-validator-v1133.js','state-validator-v1133a.js','state-validator-v1134.js','state-validator-v1135.js'
];
for(const file of files)vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});

const E=globalThis.SimEngine,W=globalThis.SimWorld,V=globalThis.SimValidator;
E.reset(11400);
let st=E.getState();
assert.equal(W.PRESENTATION_SCHEMA_VERSION,'11.14.0-player-resident-view-debug-inspector');
assert.equal(st.version,'11.14.0-player-resident-view-debug-inspector');

const forbiddenState=['residentView','playerSummary','debugInspectorMode','presentationState','playerFacingState'];
const forbiddenAgent=['residentView','playerSummary','moodLabel','relationshipLabel','debugMode','presentation'];
for(const key of forbiddenState)assert.equal(Object.prototype.hasOwnProperty.call(st,key),false,`state persisted presentation field ${key}`);
for(const a of Object.values(st.agents))for(const key of forbiddenAgent)assert.equal(Object.prototype.hasOwnProperty.call(a,key),false,`${a.id} persisted presentation field ${key}`);
assert.equal(V.validateState(st).issueCount,0);

for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  assert.equal(st.version,'11.14.0-player-resident-view-debug-inspector');
  for(const key of forbiddenState)assert.equal(Object.prototype.hasOwnProperty.call(st,key),false,`tick ${i+1}: state persisted ${key}`);
  for(const a of Object.values(st.agents))for(const key of forbiddenAgent)assert.equal(Object.prototype.hasOwnProperty.call(a,key),false,`tick ${i+1}: ${a.id} persisted ${key}`);
  if(i%25===0){const v=V.validateState(st);assert.equal(v.issueCount,0,`tick ${i+1}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);}
}
assert.equal(V.validateState(st).issueCount,0);
console.log('v11.14.0 presentation observability regression: ok');
