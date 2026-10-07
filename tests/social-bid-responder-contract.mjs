import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,V=globalThis.SimValidator;
const APP_VERSION='11.49.0-agent-facing-foundation';

const noIssues=label=>{const v=V.validateState(E.getState());assert.equal(v.issueCount,0,label+': '+v.issues.map(x=>x.code+': '+x.message).join(' | '));};

E.reset(14701);
let st=E.getState(),requester=st.agents.zhen,responder=st.agents.zhou;
assert.equal(st.version,APP_VERSION);
const contracts=E.listSocialBidResponseContracts();
for(const kind of ['animalAffection','sleepSlotYield','sleepSlotDriveAway','carryCooperation'])assert.ok(contracts.some(x=>x.bidKind===kind),'missing '+kind+' responder contract');
assert.ok(contracts.filter(x=>x.bidKind!=='animalAffection').length>=3,'generic responder registry must have multiple non-pet consumers');
assert.throws(()=>E.registerSocialBidResponseContract('carryCooperation',{}),/Duplicate Social Bid response contract/,'duplicate contracts must fail explicitly');

requester.offMap=false;responder.offMap=false;requester.position={x:5,y:5};responder.position={x:5,y:6};requester.action=null;requester.activeIntent=null;responder.action=null;responder.activeIntent=null;
const targetPlacement={kind:'floor',position:{x:6,y:6,z:0,spaceId:'home',surfaceId:'floor'}};
const bidId=E.addEvent('cooperation test bid','normal',[],{actor:requester.id,target:responder.id,action:'carryCooperationRequest',socialBid:true,bidKind:'carryCooperation',interactionKind:'carryCooperation',expectsResponse:true,bidFrom:requester.id,bidTo:responder.id,perceivedByTarget:true,conflictContext:'sleepSlotConflict',slot:'bed:left',targetPlacement});
st.causes[bidId].data.bidId=bidId;
const bid=E.bidEvent(st,bidId);assert.ok(bid);
assert.ok(E.observedBidRefs(st,responder).some(ref=>ref.bidId===bidId),'generic Social listener must create responder-private observation');
requester.activeIntent=E.createAwaitResponseIntent(st,requester,bid,{context:'sleepSlotConflict'});
const response=E.emitSocialBidResponse(st,responder,bid,'accept',{action:'acceptCarryCooperation',text:'accepted',data:{targetPlacement}});
assert.ok(response);assert.equal(response.data.actor,responder.id);assert.equal(response.data.target,requester.id);assert.equal(response.data.responseToBid,bidId);assert.equal(response.data.bidKind,'carryCooperation');assert.equal(response.data.responseKind,'accepted');assert.equal(response.data.perceivedByTarget,true);
assert.equal(requester.activeIntent?.kind,'awaitResponse','responder response must not directly rewrite requester-private wait');
assert.equal(Object.keys(st.agentCarries||{}).length,0,'accept response must not directly establish carry');
assert.equal(Object.hasOwn(bid.data,'cooperative'),false,'bid must not persist shared cooperation truth');
assert.equal(Object.hasOwn(bid.data,'accepted'),false,'bid must not persist shared accepted truth');
assert.ok(E.requesterResponseEvent(st,requester,bidId),'requester may consume only actually observed response provenance');
noIssues('generic accepted response');

response.data.responseKind='maybe';
let validation=V.validateState(st);assert.ok(validation.issues.some(x=>x.code==='social_bid_response_kind_invalid'&&x.eventId===response.id),'unknown canonical responseKind must fail validation');
response.data.responseKind='accepted';
delete response.data.responseKind;
validation=V.validateState(st);assert.ok(validation.issues.some(x=>x.code==='social_bid_response_kind_invalid'&&x.eventId===response.id),'missing canonical responseKind must fail validation');
response.data.responseKind='accepted';
noIssues('restored canonical response kind');

const unknownId=E.addEvent('unknown bid','normal',[],{actor:requester.id,target:responder.id,action:'unknownBid',socialBid:true,bidKind:'unknownContract',expectsResponse:true,bidFrom:requester.id,bidTo:responder.id,perceivedByTarget:false});st.causes[unknownId].data.bidId=unknownId;
validation=V.validateState(st);assert.ok(validation.issues.some(x=>x.code==='social_bid_response_contract_missing'&&x.eventId===unknownId),'unknown expectsResponse bid must fail validation instead of falling back');
delete st.causes[unknownId];st.events=st.events.filter(e=>e.id!==unknownId);

E.reset(14702);st=E.getState();requester=st.agents.zhen;responder=st.agents.zhou;requester.position={x:5,y:5};responder.position={x:5,y:6};
const delayedBidId=E.addEvent('delay bid','normal',[],{actor:requester.id,target:responder.id,action:'sleepSlotYieldRequest',socialBid:true,bidKind:'sleepSlotYield',interactionKind:'requestYield',expectsResponse:true,bidFrom:requester.id,bidTo:responder.id,perceivedByTarget:true,slot:'bed:left'});st.causes[delayedBidId].data.bidId=delayedBidId;
const delayed=E.emitSocialBidResponse(st,responder,E.bidEvent(st,delayedBidId),'delay',{action:'delaySleepSlotYield',text:'delayed'});assert.equal(delayed.data.responseKind,'delayed');assert.equal(delayed.data.responseToBid,delayedBidId);
noIssues('generic delayed response');

console.log('social-bid-responder-contract: ok');
