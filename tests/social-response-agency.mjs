import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
const files=[
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js',
  'systems/action/state.js','systems/intent/state.js','systems/social/state.js',
  'systems/memory/state.js','systems/appraisal/state.js','systems/affect/state.js',
  'engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','systems/intent/replanning.js','systems/intent/deliberation.js',
  'systems/memory/runtime.js','systems/appraisal/runtime.js','systems/appraisal/animal-social-response.js','systems/affect/runtime.js','systems/social/animal-response.js',
  'validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js','validation/rules/interruption.js','validation/rules/deliberation.js','validation/rules/memory-episodic.js','validation/rules/appraisal.js','validation/rules/affect.js','validation/rules/social-response.js'
];
loadRuntimeProfile(files);

const E=globalThis.SimEngine,V=globalThis.SimValidator,SP=globalThis.SimSpatial;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const memoryFor=(agentId,eventId)=>E.getState().agents[agentId].episodicMemories.find(m=>m.sourceEventId===eventId);
const eventsForOffer=offerId=>E.getState().events.filter(e=>e.data?.responseToBid===offerId||e.data?.petOfferId===offerId);

function armDirectPet(social,seed=11321){
  E.reset(seed);const st=E.getState(),human=st.agents.zhou,cat=st.agents.orange,bystander=st.agents.zhen;
  human.position={x:5,y:5};cat.position={x:5,y:6};bystander.position={x:7,y:5};
  Object.assign(human.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:65});
  Object.assign(cat.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,groomingNeed:20,social});
  human.action={kind:'petAnimal',phase:'interact',targetAgent:cat.id,started:st.tick,wait:0};
  E.ensureIntentForAction?.(st,human);
  assert.equal(SP.isAtInteraction(st,human,{kind:'agent',id:cat.id},'social'),true,'fixture must begin in social range');
  return st;
}

function latestAction(action){return E.getState().events.find(e=>e.data?.action===action);}

// Response score is deterministic and produces three legible bands from the same animal with only social need changed.
E.reset(11320);let st=E.getState(),cat=st.agents.orange;
cat.needs.social=5;assert.equal(E.petResponseFor(cat),'avoid');
cat.needs.social=45;assert.equal(E.petResponseFor(cat),'tolerate');
cat.needs.social=90;assert.equal(E.petResponseFor(cat),'accept');
const baselineScore=E.petResponseScore(cat),neutralAffect=JSON.parse(JSON.stringify(cat.affect));
cat.affect={valence:-1,activation:1,frustration:1,lastUpdatedTick:0,lastDecayTick:0,source:null};
assert.equal(E.petResponseScore(cat),baselineScore,'v11.13.2a must not let current Affect enter pet response scoring');
cat.affect=neutralAffect;
noIssues('deterministic response bands');

// High social need: human intent becomes an observable petOffer, animal accepts, then and only then petAnimal succeeds.
st=armDirectPet(90,21321);E.tick();st=E.getState();
assert.equal(st.version,'11.25.0-furniture-traversal-geometry');
const acceptOffer=latestAction('petOffer'),acceptResponse=latestAction('acceptPet');
assert.ok(acceptOffer?.data?.socialBid,'high-social case must create observable petOffer');
assert.equal(acceptOffer.data.bidKind,'petOffer');
assert.equal(acceptOffer.data.bidFrom,'zhou');assert.equal(acceptOffer.data.bidTo,'orange');
assert.ok(acceptResponse,'high-social animal should accept in the focused fixture');
assert.equal(acceptResponse.data.responseToBid,acceptOffer.id);
const acceptPet=st.events.find(e=>e.data?.action==='petAnimal'&&e.data?.petOfferId===acceptOffer.id);
assert.ok(acceptPet,'accept must produce exactly one successful petAnimal');
assert.equal(acceptPet.data.petResponse,'accept');
assert.equal(eventsForOffer(acceptOffer.id).filter(e=>e.data?.action==='petAnimal').length,1);
assert.equal(st.agents.zhou.action,null,'initiator action should complete after response');
noIssues('accept flow');

// Mid social need: tolerate is distinct from active acceptance but still permits a weaker successful pet.
st=armDirectPet(45,31321);const preCatSocial=st.agents.orange.needs.social;E.tick();st=E.getState();
const tolerateOffer=latestAction('petOffer'),tolerateResponse=latestAction('toleratePet');
assert.ok(tolerateOffer&&tolerateResponse,'mid-social case should tolerate in the focused fixture');
const toleratePet=st.events.find(e=>e.data?.action==='petAnimal'&&e.data?.petOfferId===tolerateOffer.id);
assert.ok(toleratePet);assert.equal(toleratePet.data.petResponse,'tolerate');
assert.ok(preCatSocial-st.agents.orange.needs.social<10,'tolerate should give less animal social relief than active acceptance');
noIssues('tolerate flow');

// Low social need: animal visibly avoids the hand, no successful pet occurs, and appraisal/Affect stay Agent-private.
st=armDirectPet(5,41321);const humanBefore={...st.agents.zhou.affect},catBefore={...st.agents.orange.affect};E.tick();st=E.getState();
const avoidOffer=latestAction('petOffer'),avoidResponse=latestAction('avoidPet');
assert.ok(avoidOffer&&avoidResponse,'low-social case should create a stable avoid outcome');
assert.equal(avoidResponse.data.responseToBid,avoidOffer.id);
assert.equal(st.events.some(e=>e.data?.action==='petAnimal'&&e.data?.petOfferId===avoidOffer.id),false,'avoid must be mutually exclusive with successful petAnimal');
assert.equal(st.agents.orange.position.x,5);assert.equal(st.agents.orange.position.y,6,'avoid wording must not fake movement');
const humanMemory=memoryFor('zhou',avoidResponse.id),catMemory=memoryFor('orange',avoidResponse.id);
assert.equal(humanMemory?.appraisal?.ruleId,'avoidPet-v1');assert.ok(humanMemory.appraisal.goalCongruence<0,'declined human should form negative audited appraisal');
assert.equal(catMemory?.appraisal?.ruleId,'avoidPet-v1');assert.ok(catMemory.appraisal.goalCongruence>0,'animal avoiding unwanted contact should form positive boundary-congruent appraisal');
assert.ok(st.agents.zhou.affect.valence<humanBefore.valence,'human negative appraisal should lower current valence');
assert.ok(st.agents.zhou.affect.frustration>humanBefore.frustration,'human negative appraisal should raise frustration');
assert.ok(st.agents.orange.affect.valence>catBefore.valence,'animal may get short-lived positive affect from successfully avoiding unwanted contact');
for(const key of ['responseScore','socialNeed','socialTrait','affect','relationship'])assert.equal(Object.prototype.hasOwnProperty.call(avoidResponse.data,key),false,`world event must not leak ${key}`);
noIssues('avoid flow with appraisal/affect');

// Animal response remains independent of Affect even after an actual Affect source exists.
const responseBeforeAffectMutation=E.petResponseFor(st.agents.orange),validSource=JSON.parse(JSON.stringify(st.agents.orange.affect.source));
st.agents.orange.affect={valence:-1,activation:1,frustration:1,lastUpdatedTick:st.tick,lastDecayTick:st.tick,source:validSource};
assert.equal(E.petResponseFor(st.agents.orange),responseBeforeAffectMutation,'Affect-to-response influence belongs to a later deliberation slice');
noIssues('affect remains decision inert');

// An existing animal→human Social Bid can be answered by a nested human petOffer without collapsing private waiting truth.
E.reset(46321);st=E.getState();
{
  const human=st.agents.zhou,requestingCat=st.agents.orange,bystander=st.agents.zhen;
  human.position={x:5,y:5};requestingCat.position={x:5,y:6};bystander.position={x:7,y:5};
  Object.assign(human.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:65});
  Object.assign(requestingCat.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,groomingNeed:20,social:90});
  const originalBidId=E.addEvent(`${requestingCat.name}主動找${human.name}撒嬌。`,'good',[],{
    actor:requestingCat.id,target:human.id,action:'seekHuman',position:E.positionRef?.(requestingCat.position)||'5,6',
    socialBid:true,bidKind:'animalAffection',bidFrom:requestingCat.id,bidTo:human.id,perceivedByTarget:true
  });
  st.causes[originalBidId].data.bidId=originalBidId;
  E.addObservedBid(st,human,st.causes[originalBidId],st.tick);
  requestingCat.activeIntent={
    id:`intent:${requestingCat.id}:${st.tick}:awaitResponse:${originalBidId}`,
    kind:'awaitResponse',createdTick:st.tick,lifecycle:'open',source:{type:'socialBid',bidId:originalBidId},patienceUntilTick:st.tick+3
  };
  human.action={kind:'petAnimal',phase:'interact',targetAgent:requestingCat.id,started:st.tick,wait:0};
  human.activeIntent={
    id:`intent:${human.id}:${st.tick}:respondSocialBid:${originalBidId}`,
    kind:'respondSocialBid',createdTick:st.tick,lifecycle:'actionBound',source:{type:'socialBid',bidId:originalBidId,observedTick:st.tick}
  };
  human.action.intentId=human.activeIntent.id;
  E.tick();st=E.getState();
  const nestedOffer=st.events.find(e=>e.data?.action==='petOffer'&&e.data?.responseToBid===originalBidId);
  assert.ok(nestedOffer,'human reply should become a petOffer that also responds to the original animal bid');
  const nestedResponse=st.events.find(e=>e.data?.responseToBid===nestedOffer.id&&['acceptPet','toleratePet','avoidPet'].includes(e.data?.action));
  assert.ok(nestedResponse,'animal should respond to the nested petOffer');
  assert.ok(st.events.some(e=>e.data?.action==='petAnimal'&&e.data?.petOfferId===nestedOffer.id),'high-social animal should let the nested reply complete as petAnimal');
  assert.equal((st.agents.zhou.observedSocialBids||[]).some(r=>r.bidId===originalBidId),false,'human local observed original bid ref should settle');
  assert.notEqual(st.agents.orange.activeIntent?.source?.bidId,originalBidId,'animal requester wait should settle locally once observable response arrives');
  assert.notEqual(st.agents.zhou.activeIntent?.source?.bidId,originalBidId,'human responder intent should complete');
  noIssues('nested bid response flow');
}

// Sleeping animals stay on the existing touch-stimulus path rather than receiving a conscious accept/tolerate/avoid response.
E.reset(51321);st=E.getState();
{
  const human=st.agents.zhou,sleepingCat=st.agents.orange,slot=SP.getSlot(st,'sofa:left');
  st.agents.zhen.offMap=true;
  human.position={...slot.position};
  sleepingCat.position={...slot.position};sleepingCat.needs.sleepNeed=100;
  sleepingCat.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};
  sleepingCat.action={kind:'sleep',phase:'sleeping',sleepTicks:0,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}},started:st.tick,wait:0};
  E.ensureIntentForAction?.(st,sleepingCat);
  human.action={kind:'petAnimal',phase:'interact',targetAgent:sleepingCat.id,started:st.tick,wait:0};
  E.ensureIntentForAction?.(st,human);
  E.tick();st=E.getState();
  assert.equal(st.events.some(e=>e.data?.action==='petOffer'),false,'sleeping animal must not receive conscious petOffer response flow');
  assert.ok(st.events.some(e=>e.data?.action==='petAnimal'),'existing sleeping-animal touch action should still occur');
  assert.ok(st.events.some(e=>e.data?.action==='sleepDisturbance'&&e.data?.target==='orange'),'existing sleep stimulus result should remain observable');
  noIssues('sleeping animal compatibility');
}

// Long-run bounded integration remains validator-clean and never persists private response caches.
E.reset(61321);
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const a of Object.values(st.agents)){
    assert.equal(Object.prototype.hasOwnProperty.call(a,'petResponseDecision'),false);
    assert.equal(Object.prototype.hasOwnProperty.call(a,'petResponseScore'),false);
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.13.2a social response agency regression: ok');
