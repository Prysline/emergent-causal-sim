(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;
  if(!E||!W?.SOCIAL_RESPONSE_SCHEMA_VERSION||!SP)return;
  const VERSION=W.SOCIAL_RESPONSE_SCHEMA_VERSION||'11.13.2a-social-response-agency';
  const PET_RESPONSE_THRESHOLDS=Object.freeze({avoidMax:.38,acceptMin:.62});
  const PET_RELATIONSHIP_RESPONSE_CAP=.18;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=v=>Math.round(v*1000)/1000;
  const actionKind=a=>E.actionKind?E.actionKind(a?.action):a?.action?.kind||null;
  const counterpartId=counterpart=>typeof counterpart==='string'?counterpart:counterpart?.id||null;

  function petBaseResponseScore(animal){const social=clamp((Number(animal?.needs?.social)||0)/100,0,1),rawTrait=Number(animal?.traits?.social),sociability=clamp(Number.isFinite(rawTrait)?rawTrait:.5,0,1);return round(social*.72+sociability*.28);}
  function petRelationshipResponseDelta(animal,human){const id=counterpartId(human);if(!id)return 0;const signal=Number(E.relationshipSignal?.(animal,id))||0;return round(clamp(signal*PET_RELATIONSHIP_RESPONSE_CAP,-PET_RELATIONSHIP_RESPONSE_CAP,PET_RELATIONSHIP_RESPONSE_CAP));}
  function petResponseEvaluation(animal,human=null){const baseScore=petBaseResponseScore(animal),relationshipResponseDelta=petRelationshipResponseDelta(animal,human),finalScore=round(clamp(baseScore+relationshipResponseDelta,0,1));const response=finalScore<PET_RESPONSE_THRESHOLDS.avoidMax?'avoid':finalScore>=PET_RESPONSE_THRESHOLDS.acceptMin?'accept':'tolerate';return {baseScore,relationshipResponseDelta,finalScore,response};}
  function petResponseScore(animal,human=null){return petResponseEvaluation(animal,human).finalScore;}
  function petResponseFor(animal,human=null){return petResponseEvaluation(animal,human).response;}
  function originBidForHuman(st,human,animal){const intent=human?.activeIntent;if(intent?.kind!=='respondSocialBid'||intent.source?.type!=='socialBid')return null;const bid=E.bidEvent?.(st,intent.source.bidId);if(!bid||bid.data?.bidFrom!==animal?.id||bid.data?.bidTo!==human.id)return null;return bid.id;}
  function capturePendingPetOffers(st){
    const out=[];
    for(const human of Object.values(st?.agents||{})){
      const action=human.action,animal=action?.targetAgent&&st.agents?.[action.targetAgent];
      if(human.kind!=='human'||!action||actionKind(human)!=='petAnimal'||action.phase!=='interact')continue;
      if(!animal||!E.canPetAnimal?.(human,animal)||E.isSleeping?.(animal))continue;
      if(!SP.isAtInteraction(st,human,{kind:'agent',id:animal.id},'social'))continue;
      out.push({humanId:human.id,animalId:animal.id,action,originBidId:originBidForHuman(st,human,animal)});action.phase='petOfferPending';
    }
    return out;
  }
  function addPetOffer(st,human,animal,originBidId){
    const data={actor:human.id,target:animal.id,action:'petOffer',position:E.positionRef?.(human.position)||`${human.position.x},${human.position.y}`,socialBid:true,bidKind:'petOffer',interactionKind:'pet',expectsResponse:true,bidFrom:human.id,bidTo:animal.id,perceivedByTarget:true};
    const causes=[];if(originBidId){data.responseToBid=originBidId;causes.push(originBidId);}
    const id=E.addEvent(`${human.name}走近${animal.name}，伸手示意想摸摸牠。`,'normal',causes,data),event=st.causes?.[id];if(event?.data)event.data.bidId=id;return id;
  }
  function settleOriginBid(st,human,animal,originBidId){if(!originBidId)return;human.observedSocialBids=(human.observedSocialBids||[]).filter(ref=>ref.bidId!==originBidId);if(animal.activeIntent?.kind==='awaitResponse'&&animal.activeIntent.source?.bidId===originBidId)animal.activeIntent=null;}
  function addAnimalResponse(st,human,animal,offerId,response){
    const action=response==='accept'?'acceptPet':response==='tolerate'?'toleratePet':'avoidPet';
    const text=response==='accept'?`${animal.name}沒有避開，反而主動把身體湊向${human.name}想摸牠的手。`:response==='tolerate'?`${animal.name}沒有迎上去，也沒有避開，留在原地讓${human.name}摸。`:`${animal.name}把身體側開，避開了${human.name}想摸牠的手。`;
    return E.addEvent(text,response==='avoid'?'normal':'good',[offerId],{actor:animal.id,target:human.id,action,responseToBid:offerId,petResponse:response,position:E.positionRef?.(animal.position)||`${animal.position.x},${animal.position.y}`});
  }
  function applySuccessfulPet(st,human,animal,offerId,responseId,response){
    const id=E.addEvent(`${human.name}蹲下來，輕輕摸了摸${animal.name}。`,'good',[offerId,responseId],{actor:human.id,target:animal.id,action:'petAnimal',petOfferId:offerId,petResponse:response,position:E.positionRef?.(human.position)||`${human.position.x},${human.position.y}`,stimulusIntensity:18,stimulusKind:'touch'});
    const humanRelief=response==='accept'?7:5,animalRelief=response==='accept'?10:3,comfort=response==='accept'?3:.5;human.needs.social=clamp((Number(human.needs?.social)||0)-humanRelief,0,100);animal.needs.social=clamp((Number(animal.needs?.social)||0)-animalRelief,0,100);animal.wellbeing.comfort=clamp((Number(animal.wellbeing?.comfort)||0)+comfort,0,100);return id;
  }
  function resolvePendingPetOffer(st,record){
    const human=st.agents?.[record.humanId],animal=st.agents?.[record.animalId];
    if(!human||!animal||human.action!==record.action||actionKind(human)!=='petAnimal'||human.action.phase!=='petOfferPending')return false;
    if(animal.offMap||!E.canPetAnimal?.(human,animal)){human.action.phase='move';return false;}if(E.isSleeping?.(animal)){human.action.phase='interact';return false;}if(!SP.isAtInteraction(st,human,{kind:'agent',id:animal.id},'social')){human.action.phase='move';return false;}
    const offerId=addPetOffer(st,human,animal,record.originBidId);settleOriginBid(st,human,animal,record.originBidId);const response=petResponseFor(animal,human),responseId=addAnimalResponse(st,human,animal,offerId,response);if(response!=='avoid')applySuccessfulPet(st,human,animal,offerId,responseId,response);human.action=null;E.reconcileIntents?.(st);return true;
  }
  function preparePetResponseScenario(mode='pet-avoid',seed=11320){
    const st=E.reset(seed),human=st.agents?.zhou,animal=st.agents?.orange,bystander=st.agents?.zhen;if(!human||!animal)return st;
    human.position={x:5,y:5};animal.position={x:5,y:6};if(bystander)bystander.position={x:7,y:5};human.offMap=false;animal.offMap=false;
    Object.assign(human.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:65});Object.assign(animal.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,groomingNeed:20,social:mode==='pet-accept'?90:mode==='pet-tolerate'?45:5});
    human.action={kind:'petAnimal',phase:'interact',targetAgent:animal.id,started:st.tick,wait:0};E.ensureIntentForAction?.(st,human);return st;
  }
  function settlePendingOffers(st,pending){for(const record of pending||[])resolvePendingPetOffer(st,record);}

  if(!E.registerRuntimeHook)throw new Error('systems/social/animal-response.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','socialResponse.capture-pet-offers',(ctx)=>{ctx.locals.socialResponseV1132a=capturePendingPetOffers(E.getState());},400);
  E.registerRuntimeHook('afterTick','socialResponse.resolve-pet-offers',(ctx)=>settlePendingOffers(E.getState(),ctx.locals.socialResponseV1132a),600);

  Object.assign(E,{SOCIAL_RESPONSE_SCHEMA_VERSION:VERSION,PET_RESPONSE_THRESHOLDS,PET_RELATIONSHIP_RESPONSE_CAP,petBaseResponseScore,petRelationshipResponseDelta,petResponseEvaluation,petResponseScore,petResponseFor,preparePetResponseScenario});
})();
