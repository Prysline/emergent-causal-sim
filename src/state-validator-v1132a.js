(() => {
  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.SOCIAL_RESPONSE_SCHEMA_VERSION)return;
  const baseValidate=V.validateState;
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
  const RESPONSE_ACTION={acceptPet:'accept',toleratePet:'tolerate',avoidPet:'avoid'};

  function validateState(st){
    const base=baseValidate(st),issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    const responseByOffer=new Map(),petByOffer=new Map();

    for(const a of Object.values(st?.agents||{})){
      for(const key of ['petResponseDecision','petOfferDecision','petResponseScore'])if(own(a,key))add('pet_response_private_cache_forbidden',`${a.name} 不應保存 ${key}；撫摸回應第一版需即時計算。`,{agentId:a.id,field:key});
    }

    for(const e of Object.values(st?.causes||{})){
      const d=e?.data||{};
      if(d.action==='petOffer'){
        if(d.socialBid!==true||d.bidKind!=='petOffer')add('pet_offer_bid_invalid',`petOffer ${e.id} 必須是 bidKind=petOffer 的 Social Bid。`,{eventId:e.id});
        if(d.actor!==d.bidFrom||d.target!==d.bidTo)add('pet_offer_direction_mismatch',`petOffer ${e.id} 的 actor/target 必須與 bidFrom/bidTo 一致。`,{eventId:e.id});
        if(st.agents?.[d.actor]?.kind!=='human'||st.agents?.[d.target]?.kind!=='cat')add('pet_offer_species_invalid',`petOffer ${e.id} 必須由 human 指向 cat。`,{eventId:e.id,actor:d.actor,target:d.target});
        if(d.perceivedByTarget!==true)add('pet_offer_perception_invalid',`petOffer ${e.id} 只應在 awake cat 實際可感知時建立。`,{eventId:e.id});
      }
      if(RESPONSE_ACTION[d.action]){
        const expected=RESPONSE_ACTION[d.action],offer=E.bidEvent?.(st,d.responseToBid);
        if(d.petResponse!==expected)add('pet_response_label_mismatch',`事件 ${e.id} 的 ${d.action} 與 petResponse=${d.petResponse} 不一致。`,{eventId:e.id});
        if(!offer||offer.data?.bidKind!=='petOffer')add('pet_response_offer_missing',`事件 ${e.id} 必須回應有效的 petOffer。`,{eventId:e.id,bidId:d.responseToBid});
        else if(offer.data.bidFrom!==d.target||offer.data.bidTo!==d.actor)add('pet_response_direction_mismatch',`事件 ${e.id} 的 cat response 方向與 petOffer 不一致。`,{eventId:e.id,bidId:offer.id});
        if(d.responseToBid){
          const list=responseByOffer.get(d.responseToBid)||[];list.push(e);responseByOffer.set(d.responseToBid,list);
        }
        for(const key of ['responseScore','socialNeed','socialTrait','affect','relationship'])if(own(d,key))add('pet_response_private_payload_leak',`事件 ${e.id} 不應洩漏 responder-private ${key}。`,{eventId:e.id,field:key});
      }
      if(d.action==='petCat'&&d.petOfferId){
        const offer=E.bidEvent?.(st,d.petOfferId);
        if(!offer||offer.data?.bidKind!=='petOffer')add('pet_success_offer_missing',`petCat ${e.id} 引用的 petOffer ${d.petOfferId} 不存在。`,{eventId:e.id,petOfferId:d.petOfferId});
        else if(offer.data.bidFrom!==d.actor||offer.data.bidTo!==d.target)add('pet_success_direction_mismatch',`petCat ${e.id} 的 actor/target 與 petOffer 不一致。`,{eventId:e.id,petOfferId:d.petOfferId});
        if(!['accept','tolerate'].includes(d.petResponse))add('pet_success_response_invalid',`petCat ${e.id} 只能由 accept/tolerate response 產生。`,{eventId:e.id,petResponse:d.petResponse});
        const list=petByOffer.get(d.petOfferId)||[];list.push(e);petByOffer.set(d.petOfferId,list);
      }
    }

    for(const [offerId,responses] of responseByOffer){
      if(responses.length!==1)add('pet_offer_response_count_invalid',`petOffer ${offerId} 應只有一個 immediate cat response。`,{bidId:offerId,count:responses.length});
      const response=responses[0],pets=petByOffer.get(offerId)||[];
      if(response?.data?.petResponse==='avoid'&&pets.length)add('pet_avoid_success_conflict',`petOffer ${offerId} 已被 avoid，不可同時產生成功 petCat。`,{bidId:offerId,petCount:pets.length});
      if(['accept','tolerate'].includes(response?.data?.petResponse)&&pets.length!==1)add('pet_accept_success_missing',`petOffer ${offerId} 的 ${response.data.petResponse} response 應對應一個成功 petCat。`,{bidId:offerId,petCount:pets.length});
    }

    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }

  V.validateState=validateState;
})();
