(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;
  if(!E||!W?.SOCIAL_RESPONSE_SCHEMA_VERSION||!SP)return;
  const VERSION=W.SOCIAL_RESPONSE_SCHEMA_VERSION||'11.13.2a-social-response-agency';
  const PET_RESPONSE_THRESHOLDS=Object.freeze({avoidMax:.38,acceptMin:.62});
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const round=v=>Math.round(v*1000)/1000;
  const actionKind=a=>E.actionKind?E.actionKind(a?.action):a?.action?.kind||null;

  function petResponseScore(cat){const social=clamp((Number(cat?.needs?.social)||0)/100,0,1),rawTrait=Number(cat?.traits?.social),sociability=clamp(Number.isFinite(rawTrait)?rawTrait:.5,0,1);return round(social*.72+sociability*.28);}
  function petResponseFor(cat){const score=petResponseScore(cat);if(score<PET_RESPONSE_THRESHOLDS.avoidMax)return 'avoid';if(score>=PET_RESPONSE_THRESHOLDS.acceptMin)return 'accept';return 'tolerate';}
  function originBidForHuman(st,human,cat){const intent=human?.activeIntent;if(intent?.kind!=='respondSocialBid'||intent.source?.type!=='socialBid')return null;const bid=E.bidEvent?.(st,intent.source.bidId);if(!bid||bid.data?.bidFrom!==cat?.id||bid.data?.bidTo!==human.id)return null;return bid.id;}
  function capturePendingPetOffers(st){
    const out=[];
    for(const human of Object.values(st?.agents||{})){
      const action=human.action,cat=action?.targetAgent&&st.agents?.[action.targetAgent];
      if(human.kind!=='human'||!action||actionKind(human)!=='petCat'||action.phase!=='interact')continue;
      if(!cat||cat.kind!=='cat'||cat.offMap||E.isSleeping?.(cat))continue;
      if(!SP.isAtInteraction(st,human,{kind:'agent',id:cat.id},'social'))continue;
      out.push({humanId:human.id,catId:cat.id,action,originBidId:originBidForHuman(st,human,cat)});action.phase='petOfferPending';
    }
    return out;
  }
  function addPetOffer(st,human,cat,originBidId){
    const data={actor:human.id,target:cat.id,action:'petOffer',position:E.positionRef?.(human.position)||`${human.position.x},${human.position.y}`,socialBid:true,bidKind:'petOffer',interactionKind:'pet',expectsResponse:true,bidFrom:human.id,bidTo:cat.id,perceivedByTarget:true};
    const causes=[];if(originBidId){data.responseToBid=originBidId;causes.push(originBidId);}
    const id=E.addEvent(`${human.name}走近${cat.name}，伸手示意想摸摸牠。`,'normal',causes,data),event=st.causes?.[id];if(event?.data)event.data.bidId=id;return id;
  }
  function settleOriginBid(st,human,cat,originBidId){if(!originBidId)return;human.observedSocialBids=(human.observedSocialBids||[]).filter(ref=>ref.bidId!==originBidId);if(cat.activeIntent?.kind==='awaitResponse'&&cat.activeIntent.source?.bidId===originBidId)cat.activeIntent=null;}
  function addCatResponse(st,human,cat,offerId,response){
    const action=response==='accept'?'acceptPet':response==='tolerate'?'toleratePet':'avoidPet';
    const text=response==='accept'?`${cat.name}沒有避開，反而主動把身體湊向${human.name}想摸牠的手。`:response==='tolerate'?`${cat.name}沒有迎上去，也沒有避開，留在原地讓${human.name}摸。`:`${cat.name}把身體側開，避開了${human.name}想摸牠的手。`;
    return E.addEvent(text,response==='avoid'?'normal':'good',[offerId],{actor:cat.id,target:human.id,action,responseToBid:offerId,petResponse:response,position:E.positionRef?.(cat.position)||`${cat.position.x},${cat.position.y}`});
  }
  function applySuccessfulPet(st,human,cat,offerId,responseId,response){
    const id=E.addEvent(`${human.name}蹲下來，輕輕摸了摸${cat.name}。`,'good',[offerId,responseId],{actor:human.id,target:cat.id,action:'petCat',petOfferId:offerId,petResponse:response,position:E.positionRef?.(human.position)||`${human.position.x},${human.position.y}`,stimulusIntensity:18,stimulusKind:'touch'});
    const humanRelief=response==='accept'?7:5,catRelief=response==='accept'?10:3,comfort=response==='accept'?3:.5;human.needs.social=clamp((Number(human.needs?.social)||0)-humanRelief,0,100);cat.needs.social=clamp((Number(cat.needs?.social)||0)-catRelief,0,100);cat.wellbeing.comfort=clamp((Number(cat.wellbeing?.comfort)||0)+comfort,0,100);return id;
  }
  function resolvePendingPetOffer(st,record){
    const human=st.agents?.[record.humanId],cat=st.agents?.[record.catId];
    if(!human||!cat||human.action!==record.action||actionKind(human)!=='petCat'||human.action.phase!=='petOfferPending')return false;
    if(cat.offMap){human.action.phase='move';return false;}if(E.isSleeping?.(cat)){human.action.phase='interact';return false;}if(!SP.isAtInteraction(st,human,{kind:'agent',id:cat.id},'social')){human.action.phase='move';return false;}
    const offerId=addPetOffer(st,human,cat,record.originBidId);settleOriginBid(st,human,cat,record.originBidId);const response=petResponseFor(cat),responseId=addCatResponse(st,human,cat,offerId,response);if(response!=='avoid')applySuccessfulPet(st,human,cat,offerId,responseId,response);human.action=null;E.reconcileIntents?.(st);return true;
  }
  function preparePetResponseScenario(mode='pet-avoid',seed=11320){
    const st=E.reset(seed),human=st.agents?.zhou,cat=st.agents?.orange,bystander=st.agents?.zhen;if(!human||!cat)return st;
    human.position={x:5,y:5};cat.position={x:5,y:6};if(bystander)bystander.position={x:7,y:5};human.offMap=false;cat.offMap=false;
    Object.assign(human.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,social:65});Object.assign(cat.needs,{hunger:18,thirst:18,fatigue:18,sleepNeed:18,groomingNeed:20,social:mode==='pet-accept'?90:mode==='pet-tolerate'?45:5});
    human.action={kind:'petCat',phase:'interact',targetAgent:cat.id,started:st.tick,wait:0};E.ensureIntentForAction?.(st,human);return st;
  }
  function settlePendingOffers(st,pending){for(const record of pending||[])resolvePendingPetOffer(st,record);}

  if(E.registerRuntimeHook){
    E.registerRuntimeHook('beforeTick','socialResponse.capture-pet-offers',(ctx)=>{ctx.locals.socialResponseV1132a=capturePendingPetOffers(E.getState());},400);
    E.registerRuntimeHook('afterTick','socialResponse.resolve-pet-offers',(ctx)=>settlePendingOffers(E.getState(),ctx.locals.socialResponseV1132a),600);
  }else{
    const baseTick=E.tick,baseReset=E.reset;
    E.tick=(...args)=>{const before=E.getState(),pending=capturePendingPetOffers(before),result=baseTick(...args),after=E.getState();settlePendingOffers(after,pending);return result;};
    E.reset=(...args)=>baseReset(...args);
  }

  Object.assign(E,{SOCIAL_RESPONSE_SCHEMA_VERSION:VERSION,PET_RESPONSE_THRESHOLDS,petResponseScore,petResponseFor,preparePetResponseScenario});
  try{const scenario=typeof location!=='undefined'?new URLSearchParams(location.search||'').get('scenario'):null;if(['pet-accept','pet-tolerate','pet-avoid'].includes(scenario))preparePetResponseScenario(scenario);}catch{}
})();
