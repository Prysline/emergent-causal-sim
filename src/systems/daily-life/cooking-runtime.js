(() => {
  const E=window.SimEngine,C=window.SimFoodCooking,P=window.SimPerception,SP=window.SimSpatial;
  if(!E?.registerDecisionOptionProvider||C?.VERSION!=='food-cooking-v3-object-storage-volume'||!P?.classifyObjectPointVisualAvailability||!P?.lacksVisualPoseEnvelopeForSupportedLocomotion||!SP?.bestInteractionPositionResult)throw new Error('Cooking runtime requires canonical Engine, Food, Perception and Spatial contracts.');
  function candidate(st,a,ingredient,station,pot){
    const context=C.eligible(st,ingredient.id,station.id,{potId:pot.id});
    if(!context||context.location!=='exposed')return null;
    for(const key of ['object:'+ingredient.id,'object:'+pot.id,'furniture:'+station.id]){
      if(st.reservations?.[key]&&st.reservations[key]!==a.id)return null;
    }
    const visible=P.classifyObjectPointVisualAvailability(st,a,ingredient);
    const potVisible=P.classifyObjectPointVisualAvailability(st,a,pot);
    if(visible?.visualAvailable!==true||potVisible?.visualAvailable!==true)return null;
    const target=SP.bestInteractionPositionResult(st,a,{kind:'furniture',id:station.id},'default');
    const pickup=SP.bestInteractionPositionResult(st,a,{kind:'object',id:ingredient.id},'pickup');
    const receive=SP.bestInteractionPositionResult(st,a,{kind:'object',id:pot.id},'receive');
    if(![target,pickup,receive].every(result=>Number.isFinite(result?.traversalCost)))return null;
    const score=Math.max(0,24+Math.min(80,Number(a.needs?.hunger)||0)*.65-Math.min(18,target.traversalCost*1.8));
    return {id:'cookMeal',ingredientId:ingredient.id,stationId:station.id,potId:pot.id,
      observed:{ingredientId:ingredient.id,potId:pot.id,sourceId:context.sourceId,observedTick:st.tick},
      score,why:['已觀察到完整食材、合法容器與可到達的料理設備','從合法支撐表面拿取食材、搬至指定容器並完成單批料理'],
      decisionContributors:[
        {kind:'observation',key:'ingredientVisualAvailability',role:'evidence',objectId:ingredient.id,observedTick:st.tick},
        {kind:'observation',key:'cookwareVisualAvailability',role:'evidence',objectId:pot.id,observedTick:st.tick},
        {kind:'need',key:'hunger',role:'motivation',value:Number(a.needs?.hunger)||0},
        {kind:'spatial',key:'cookingStationTraversalCost',role:'cost',value:target.traversalCost}
      ]};
  }
  function decisionOptionFor(st,a){
    if(a?.kind!=='human'||a.offMap||a.held)return null;
    if(P.lacksVisualPoseEnvelopeForSupportedLocomotion(a))return null;
    const stations=Object.values(st?.furniture||{}).filter(f=>f.cookingStation===true).sort((a,b)=>a.id.localeCompare(b.id));
    const ingredients=Object.values(st?.objects||{}).filter(o=>window.SimIngredient.hasIngredient(o))
      .sort((a,b)=>a.id.localeCompare(b.id));
    const options=[];
    for(const station of stations)for(const ingredient of ingredients)for(const pot of C.potsOnStation(st,station.id)){
      const pick=candidate(st,a,ingredient,station,pot);if(pick)options.push(pick);
    }
    options.sort((a,b)=>b.score-a.score||a.stationId.localeCompare(b.stationId)||a.ingredientId.localeCompare(b.ingredientId)||a.potId.localeCompare(b.potId));
    return options[0]||null;
  }
  E.registerDecisionOptionProvider('food.cooking',decisionOptionFor,490);
  E.registerActionLabelResolver('food.cooking',(st,a)=>a.action?.kind==='cookMeal'?'料理・'+(a.action.phase==='cooking'?'持續加熱中':a.action.phase==='toPot'?'將食材放入鍋具':'準備料理'):null,490);
  E.EMERGENCY_PREEMPTIBLE?.add('cookMeal');
  E.COOKING_VERSION=C.VERSION;
  E.cookingDecisionOption=decisionOptionFor;
})();
