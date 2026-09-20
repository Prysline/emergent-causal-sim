import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const files=[
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','social-bid-schema-v1122.js',
  'memory-schema-v1130.js','appraisal-schema-v1131.js','affect-schema-v1132.js','social-response-schema-v1132a.js','memory-retention-schema-v1133.js','human-social-response-schema-v1133a.js','memory-deliberation-schema-v1134.js','social-outcome-memory-schema-v1135.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','social-bid-runtime-v1122.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'memory-runtime-v1130.js','appraisal-runtime-v1131.js','appraisal-social-response-v1132a.js','appraisal-human-social-response-v1133a.js','affect-runtime-v1132.js','social-response-runtime-v1132a.js','memory-retention-runtime-v1133.js','human-social-response-runtime-v1133a.js','memory-deliberation-runtime-v1134.js','social-outcome-memory-runtime-v1135.js',
  'state-validator.js','state-validator-v111.js','state-validator-v1114.js','state-validator-v1120.js','state-validator-v1121.js','state-validator-v1122.js','state-validator-v1123.js','state-validator-v1124.js','state-validator-v1130.js','state-validator-v1131.js','state-validator-v1132.js','state-validator-v1132a.js','state-validator-v1133.js','state-validator-v1133a.js','state-validator-v1134.js','state-validator-v1135.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};

E.reset(11401);
let st=E.getState(),cat=st.agents.orange,human=st.agents.zhou;
cat.position={x:5,y:5};human.position={x:5,y:6};cat.offMap=false;human.offMap=false;
cat.action=null;cat.activeIntent=null;cat.episodicMemories=[];
Object.assign(cat.needs,{hunger:10,thirst:10,fatigue:10,sleepNeed:10,social:85});

const bidId=E.addEvent('橘子主動靠近老周，想和他親近。','normal',[],{
  actor:cat.id,target:human.id,action:'seekHuman',
  socialBid:true,bidKind:'catAffection',interactionKind:'socialAffection',expectsResponse:true,
  bidFrom:cat.id,bidTo:human.id,perceivedByTarget:true,position:E.positionRef(cat.position)
});
st.causes[bidId].data.bidId=bidId;
const waitId=E.addEvent('橘子等了一會兒，沒有得到立即回應，便不再等了。','normal',[bidId],{
  actor:cat.id,action:'socialWaitEnded',bidId,bidKind:'catAffection',interactionKind:'socialAffection',
  visibility:'private',owner:cat.id,responderContextObserved:true,
  observedResponderActionKind:null,observedResponderPosture:'standing'
});
const memory=E.rememberRequesterSocialOutcome(st,st.causes[waitId]);
assert.ok(memory,'animal requester no-response should form privateSocialOutcome memory');
assert.equal(memory.episodeKind,'privateSocialOutcome');
assert.equal(memory.experienced.kind,'socialNoResponse');
assert.equal(memory.experienced.bidKind,'catAffection');
assert.equal(memory.experienced.interactionKind,'socialAffection');
assert.equal(memory.experienced.counterpartId,human.id);
assert.equal(memory.experienced.contextKind,'observedIdle');
assert.equal(memory.appraisal.agency.kind,'unknown','absence of response must not infer responder intent');
assert.ok(E.targetAssociation(st,cat,human.id).memoryUtilityDelta<0,'animal private outcome should feed the existing target-aware deliberation bridge');
assert.equal(st.events.some(e=>e.data?.responseToBid===bidId),false,'no-response must remain absence of responder response event');
assert.equal(st.events.some(e=>['ignoreTalk','ignoredBy','disliked','rejectedBy'].includes(e.data?.action)),false,'no-response must not create inferred rejection facts');
noIssues('animal social no-response');

E.reset(11402);st=E.getState();cat=st.agents.orange;human=st.agents.zhou;
const signalId=E.addEvent('non-response signal','normal',[],{
  actor:cat.id,target:human.id,action:'seekHuman',socialBid:true,bidKind:'testSignal',interactionKind:'socialAffection',expectsResponse:false,
  bidFrom:cat.id,bidTo:human.id,perceivedByTarget:true
});
st.causes[signalId].data.bidId=signalId;
const signalWaitId=E.addEvent('wait','normal',[signalId],{
  actor:cat.id,action:'socialWaitEnded',bidId:signalId,visibility:'private',owner:cat.id,responderContextObserved:false
});
assert.equal(E.rememberRequesterSocialOutcome(st,st.causes[signalWaitId]),null,'a social signal that explicitly does not expect a response must not create no-response memory');
noIssues('non-response signal exclusion');

console.log('generic animal requester social outcome memory regression: ok');
