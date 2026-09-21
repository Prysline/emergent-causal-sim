import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js','spatial-observability.js','spatial-contact.js','spatial-floor-effects.js','spatial-surface-environment.js','systems/action/state.js','systems/intent/state.js','systems/social/state.js','engine.js','runtime-hook-pipeline.js','spatial-runtime-effects.js','systems/action/runtime.js','systems/intent/runtime.js','systems/social/bid.js','validation/registry.js','validation/rules/spatial-node.js','validation/rules/spatial-environment.js','validation/rules/action-canonical-type.js','validation/rules/intent-active.js','validation/rules/social-bid.js']);

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,`${label}: ${v.issues.map(x=>x.code+': '+x.message).join(' | ')}`);};
const latestBid=()=>E.getState().events.find(e=>e.data?.socialBid===true);
const responseFor=bidId=>E.getState().events.find(e=>e.data?.responseToBid===bidId);
const waitEndFor=bidId=>E.getState().events.find(e=>e.data?.action==='socialWaitEnded'&&e.data?.bidId===bidId);

E.reset(20260911);
let st=E.getState();
assert.equal(st.version,'11.22.2-editor-furniture-definitions');
assert.equal(E.SOCIAL_BID_SCHEMA_VERSION,'11.12.2-social-bid-lifecycle');
assert.ok(E.listDecisionOptionProviders().some(x=>x.id==='socialBid.respond-animal-affection'),'Social Bid responder option provider must be registered');
for(const a of Object.values(st.agents)){
  assert.deepEqual(a.observedSocialBids,[]);
  assert.equal(Object.prototype.hasOwnProperty.call(a,'pendingInteraction'),false,'legacy pendingInteraction must not persist after reset');
}
noIssues('reset');

// Real seekHuman interaction becomes an immutable world Bid. Requester waiting is private;
// responder observation is a local reference; no pendingInteraction compatibility state is created.
E.reset(20260911);
st=E.getState();
const cat=st.agents.orange,human=st.agents.zhou;
cat.position={x:2,y:6};human.position={x:2,y:6};
cat.needs.hunger=5;cat.needs.thirst=5;cat.needs.fatigue=20;cat.needs.sleepNeed=10;cat.needs.social=90;cat.needs.groomingNeed=100;
human.needs.hunger=5;human.needs.thirst=5;human.needs.fatigue=60;human.needs.sleepNeed=10;human.needs.social=5;
human.action={kind:'rest',phase:'resting',started:st.tick,wait:0,restTicks:0,targetFatigue:0,restTarget:{kind:'standing',position:{...human.position},quality:.18,posture:'standing'}};
cat.action={kind:'seekHuman',phase:'interact',started:st.tick,wait:0,targetAgent:'zhou'};
E.reconcileIntents(st);
E.tick();
st=E.getState();
const bid=latestBid();
assert.ok(bid,'seekHuman should create a Social Bid world event');
assert.equal(bid.data.bidId,bid.id);
assert.equal(bid.data.bidKind,'animalAffection');
assert.equal(bid.data.bidFrom,'orange');
assert.equal(bid.data.bidTo,'zhou');
assert.equal(cat.activeIntent?.kind,'awaitResponse','requester should privately wait after making the Bid');
assert.equal(cat.activeIntent?.source?.bidId,bid.id);
assert.equal(cat.action,null,'private waiting should not persist as a concrete Action between ticks');
assert.ok(human.observedSocialBids.some(x=>x.bidId===bid.id),'target should retain a bounded local observation reference');
assert.equal(Object.prototype.hasOwnProperty.call(human,'pendingInteraction'),false,'legacy compatibility state must be removed after tick');
assert.equal(st.events.some(e=>e.data?.action==='catRequestExpired'),false,'legacy fake expiry event must not leak through');
noIssues('world Bid + private requester waiting');

// The responder may become free later and form its own response Intent. Moving the responder away here
// is an explicit world-state change; it does not modify the requester private waiting state.
human.action=null;human.activeIntent=null;human.position={x:10,y:6};
const requesterPos={...cat.position};
const responseChoices=E.socialBidDecisionOptions(st,human);
assert.equal(responseChoices.length,1,'observed animal Bid should produce one responder candidate');
assert.equal(responseChoices[0].id,'petAnimal');
assert.equal(responseChoices[0].targetAgent,'orange');
assert.equal(responseChoices[0].socialBidId,bid.id);
E.tick();
st=E.getState();
assert.equal(human.activeIntent?.kind,'respondSocialBid','idle responder should be able to form a local response Intent from its observed Bid');
assert.equal(human.activeIntent?.source?.bidId,bid.id);
assert.equal(human.action?.kind,'petAnimal');
assert.equal(human.action?.targetAgent,'orange');
assert.equal(st.thoughts?.zhou?.pick?.socialBidId,bid.id,'core chooser should preserve Social Bid provenance on the chosen candidate');
assert.equal(Object.prototype.hasOwnProperty.call(human,'pendingInteraction'),false);
assert.equal(cat.activeIntent?.kind,'awaitResponse');
noIssues('delayed responder Intent');

// Requester patience ends independently while the responder is still travelling. Timeout must not move the requester
// and must not remotely cancel the responder private Intent.
const patienceUntil=cat.activeIntent.patienceUntilTick;
while(E.getState().tick<patienceUntil)E.tick();
st=E.getState();
assert.equal(cat.activeIntent,null,'requester should stop waiting at its own private patience deadline');
assert.deepEqual(cat.position,requesterPos,'stopping private waiting must not fabricate movement');
const timeout=waitEndFor(bid.id);
assert.ok(timeout,'private waiting end should be observable for debugging');
assert.equal(timeout.data.visibility,'private');
assert.equal(timeout.data.owner,'orange');
assert.ok(!timeout.text.includes('走開'),'timeout narrative must not claim movement that did not occur');
assert.equal(human.activeIntent?.kind,'respondSocialBid','requester timeout must not remotely delete responder Intent');
assert.equal(human.activeIntent?.source?.bidId,bid.id);
noIssues('independent requester timeout');

// The requester can remain nearby doing something else; the already-formed responder Intent may still complete later.
cat.needs.fatigue=70;
cat.action={kind:'rest',phase:'resting',started:st.tick,wait:0,restTicks:0,targetFatigue:0,restTarget:{kind:'standing',position:{...cat.position},quality:.18,posture:'standing'}};
E.reconcileIntents(st);
let response=null;
for(let i=0;i<30&&!response;i++){E.tick();response=responseFor(bid.id);}
assert.ok(response,'responder should be able to complete a late physical response after requester stopped waiting');
assert.equal(response.data.actor,'zhou');
assert.equal(response.data.target,'orange');
assert.equal(response.data.responseToBid,bid.id);
assert.equal(cat.activeIntent?.kind==='awaitResponse',false,'late response must not resurrect requester waiting');
assert.equal(human.observedSocialBids.some(x=>x.bidId===bid.id),false,'completed response should release the responder local Bid reference');
noIssues('late physical response');

// Same-tick race: an actual response on the requester deadline wins before private timeout settlement.
E.reset(41);
st=E.getState();
const raceCat=st.agents.orange,raceHuman=st.agents.zhou;
raceCat.position={x:4,y:6};raceHuman.position={x:4,y:6};
const raceBidId=E.addEvent('橘子發出一次測試用社交邀請。','good',[],{actor:'orange',target:'zhou',action:'seekHuman',socialBid:true,bidKind:'animalAffection',bidFrom:'orange',bidTo:'zhou',perceivedByTarget:true});
const raceBid=st.causes[raceBidId];raceBid.data.bidId=raceBidId;
raceCat.activeIntent={id:`intent:orange:0:awaitResponse:${raceBidId}`,kind:'awaitResponse',createdTick:0,lifecycle:'open',source:{type:'socialBid',bidId:raceBidId},patienceUntilTick:1};
raceHuman.observedSocialBids=[{bidId:raceBidId,observedTick:0,expiresTick:6}];
raceHuman.activeIntent={id:`intent:zhou:0:respondSocialBid:${raceBidId}`,kind:'respondSocialBid',createdTick:0,lifecycle:'actionBound',source:{type:'socialBid',bidId:raceBidId,observedTick:0}};
raceHuman.action={kind:'petAnimal',phase:'interact',started:0,wait:0,targetAgent:'orange',intentId:raceHuman.activeIntent.id};

noIssues('race setup');
E.tick();
st=E.getState();
assert.ok(responseFor(raceBidId),'physical response should occur on the deadline tick');
assert.equal(waitEndFor(raceBidId),undefined,'same-tick physical response must settle before requester timeout');
assert.equal(raceCat.activeIntent,null);
noIssues('same-tick response before timeout');

// Responder option remains a normal candidate: urgent core needs may still win instead of forcing a response.
E.reset(31415);
st=E.getState();
const competingHuman=st.agents.zhou,competingCat=st.agents.orange;
competingHuman.position={x:4,y:6};competingCat.position={x:4,y:6};
const competingBidId=E.addEvent('橘子發出一次測試用社交邀請。','good',[],{actor:'orange',target:'zhou',action:'seekHuman',socialBid:true,bidKind:'animalAffection',interactionKind:'socialAffection',expectsResponse:true,bidFrom:'orange',bidTo:'zhou',perceivedByTarget:true});
st.causes[competingBidId].data.bidId=competingBidId;
competingHuman.observedSocialBids=[{bidId:competingBidId,observedTick:st.tick,expiresTick:st.tick+6}];
competingHuman.action=null;competingHuman.activeIntent=null;competingHuman.needs.hunger=0;competingHuman.needs.thirst=100;competingHuman.needs.fatigue=0;competingHuman.needs.sleepNeed=0;competingHuman.needs.social=0;
E.tick();
st=E.getState();
assert.equal(st.agents.zhou.action?.kind,'drinkWater','urgent thirst should be able to beat the Social Bid response candidate');
assert.notEqual(st.agents.zhou.activeIntent?.kind,'respondSocialBid','Social Bid provider must not force responder policy');
assert.ok(st.agents.zhou.observedSocialBids.some(x=>x.bidId===competingBidId),'unselected observed Bid should remain available within its bounded lifetime');
noIssues('responder candidate competes with urgent core need');

// Long-run integration keeps active Social Bid state bounded and never restores shared pending request truth.
E.reset(77);
for(let i=0;i<500;i++){
  E.tick();st=E.getState();
  for(const a of Object.values(st.agents)){
    assert.equal(Object.prototype.hasOwnProperty.call(a,'pendingInteraction'),false,`${a.name} leaked pendingInteraction at tick ${st.tick}`);
    assert.ok(a.observedSocialBids.length<=8,`${a.name} observed Social Bid hot state grew unexpectedly at tick ${st.tick}`);
    if(a.activeIntent?.kind==='awaitResponse')assert.equal(a.activeIntent.lifecycle,'open');
    if(a.activeIntent?.kind==='respondSocialBid'){
      assert.equal(a.action?.kind,'petAnimal');
      assert.equal(a.action?.intentId,a.activeIntent.id);
    }
  }
  noIssues(`tick ${i+1}`);
}

console.log('v11.12.2 Social Bid / private waiting lifecycle regression: ok');
