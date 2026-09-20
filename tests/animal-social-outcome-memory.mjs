import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const files=[
  'world-authoring.js','world-initializer.js','world.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'systems/memory/state.js','systems/appraisal/state.js','systems/affect/state.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/appraisal/animal-social-response.js','systems/appraisal/human-social-response.js','systems/affect/runtime.js','systems/social/animal-response.js','systems/memory/retention.js','systems/social/human-response.js','systems/memory/deliberation.js','systems/memory/social-outcome.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js','validation/rules/social-response.js','validation/rules/memory-retention.js','validation/rules/human-social-response.js','validation/rules/memory-deliberation.js','validation/rules/social-outcome-memory.js'
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
