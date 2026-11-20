(() => {
  const E=window.SimEngine,C=window.SimFoodCooking,P=window.SimPerception,SP=window.SimSpatial;
  if(!E?.registerDecisionOptionProvider||C?.VERSION!=='food-cooking-f1b2-pot-loading'||!P?.classifyObjectPointVisualAvailability||!SP?.bestInteractionPositionResult)throw new Error('Cooking runtime requires canonical Engine, Food, Perception and Spatial contracts.');
  function candidate(st,a,ingredient,station){
    const context=C.eligible(st,ingredient.id,station.id);
    if(!context||context.location!=='exposed')return null;
    if(st.reservations?.['object:'+ingredient.id]&&st.reservations['object:'+ingredient.id]!==a.id)return null;
    if(st.reservations?.['object:'+context.pot.id]&&st.reservations['object:'+context.pot.id]!==a.id)return null;
    const visible=P.classifyObjectPointVisualAvailability(st,a,ingredient);
    const potVisible=P.classifyObjectPointVisualAvailability(st,a,context.pot);
    if(visible?.visualAvailable!==true||potVisible?.visualAvailable!==true)return null;
    const target=SP.bestInteractionPositionResult(st,a,{kind:'furniture',id:station.id},'default');
    if(!Number.isFinite(target?.traversalCost))return null;
    const score=Math.max(0,24+Math.min(80,Number(a.needs?.hunger)||0)*.65-Math.min(18,target.traversalCost*1.8));
    return {id:'cookMeal',ingredientId:ingredient.id,stationId:station.id,potId:context.pot.id,
      observed:{ingredientId:ingredient.id,potId:context.pot.id,observedTick:st.tick},
      score,why:['已觀察到料理材料、空鍋與可到達的瓦斯爐','拿取完整食材、放入真實鍋具並在完成時轉換為餐點'],
      decisionContributors:[
        {kind:'observation',key:'ingredientVisualAvailability',role:'evidence',objectId:ingredient.id,observedTick:st.tick},
        {kind:'observation',key:'cookingPotVisualAvailability',role:'evidence',objectId:context.pot.id,observedTick:st.tick},
        {kind:'need',key:'hunger',role:'motivation',value:Number(a.needs?.hunger)||0},
        {kind:'spatial',key:'cookingStationTraversalCost',role:'cost',value:target.traversalCost}
      ]};
  }
  function decisionOptionFor(st,a){
    if(a?.kind!=='human'||a.offMap||a.held)return null;
    const stations=Object.values(st?.furniture||{}).filter(f=>f.cookingStation===true).sort((a,b)=>a.id.localeCompare(b.id));
    const ingredients=Object.values(st?.objects||{}).filter(o=>window.SimIngredient.hasIngredient(o))
      .sort((a,b)=>a.id.localeCompare(b.id));
    const options=[];
    for(const station of stations)for(const ingredient of ingredients){
      const pick=candidate(st,a,ingredient,station);if(pick)options.push(pick);
    }
    options.sort((a,b)=>b.score-a.score||a.ingredientId.localeCompare(b.ingredientId));
    return options[0]||null;
  }
  E.registerDecisionOptionProvider('food.cooking',decisionOptionFor,490);
  E.registerActionLabelResolver('food.cooking',(st,a)=>a.action?.kind==='cookMeal'?'料理・'+(a.action.phase==='cooking'?'持續加熱中':a.action.phase==='toPot'?'將食材放入鍋具':'準備料理'):null,490);
  E.EMERGENCY_PREEMPTIBLE?.add('cookMeal');
  E.COOKING_VERSION=C.VERSION;
  E.cookingDecisionOption=decisionOptionFor;
})();
