(() => {
  // One deliberately bounded recipe; no generic recipe engine or second Food inventory.
  const I=window.SimIngredient,F=window.SimFood,O=window.SimObjectHandling,SP=window.SimSpatial;
  if(I?.VERSION!=='food-ingredient-v1'||F?.VERSION!=='food-v1-f0'||!O?.objectStorageStatus||!SP?.objectPosition)throw new Error('Cooking requires Ingredient v1 and the canonical Meal F0 contract.');
  const VERSION='food-cooking-f1b2-pot-loading',RECIPE_ID='ingredient-A-equimass',REQUIRED_TICKS=4;
  function onStationFootprint(station,position){
    return !!position&&station?.footprint?.some(p=>p.x===position.x&&p.y===position.y&&(p.z||0)===(position.z||0));
  }
  function potOnStation(st,stationId){
    return Object.values(st?.objects||{}).filter(item=>item?.cookingPot===true
      &&item.portable===true&&item.objectContainment===true&&item.supportId===stationId
      &&!item.containedBy&&!!item.position&&!Object.values(st.agents||{}).some(agent=>agent.held===item.id))
      .sort((a,b)=>a.id.localeCompare(b.id))[0]||null;
  }
  // The Ingredient is either exposed on the stove, carried by this Action's actor,
  // or physically inside the same supported pot. This is not a second cargo ledger.
  function eligible(st,ingredientId,stationId,{actorId=null}={}){
    const ingredient=st?.objects?.[ingredientId],station=st?.furniture?.[stationId];
    if(!ingredient||!station||station.cookingStation!==true||station.supportsObjects!==true)return null;
    if(!I.validIngredient(ingredient)||ingredient.ingredient.typeId!=='A')return null;
    const pot=potOnStation(st,stationId);
    if(!pot||!onStationFootprint(station,pot.position))return null;
    const storage=O.objectStorageStatus(st,pot);
    if(!storage.withinCapacity)return null;
    const holder=SP.holderOf(st,ingredient.id),inPot=ingredient.containedBy===pot.id;
    const exposed=!holder&&!ingredient.containedBy&&ingredient.supportId===stationId
      &&onStationFootprint(station,ingredient.position);
    const carried=holder?.id===actorId&&!!actorId&&!ingredient.containedBy&&!ingredient.supportId;
    if(!exposed&&!carried&&!inPot)return null;
    if(inPot){
      if(holder||storage.count!==1||storage.items[0].id!==ingredient.id)return null;
    }else{
      if(storage.count!==0||!O.objectStorageLegality(st,pot.id,ingredient.id))return null;
    }
    return {ingredient,station,pot,location:inPot?'loaded':carried?'carried':'exposed',
      inputMassGrams:I.massGrams(ingredient)};
  }
  function complete(st,agent,action,emitEvent){
    if(!st||!agent||action?.kind!=='cookMeal'||action.phase!=='cooking'||action.progressTicks!==REQUIRED_TICKS||typeof emitEvent!=='function')return {completed:false,reason:'invalid-context'};
    if(agent.action!==action||st.reservations?.['object:'+action.ingredientId]!==agent.id||st.reservations?.['object:'+action.potId]!==agent.id||st.reservations?.['furniture:'+action.stationId]!==agent.id||!window.SimSpatial?.isAtInteraction?.(st,agent,{kind:'furniture',id:action.stationId},'default'))return {completed:false,reason:'execution-not-authorized'};
    const context=eligible(st,action.ingredientId,action.stationId,{actorId:agent.id});
    if(!context||context.location!=='loaded')return {completed:false,reason:'ingredient-not-in-pot'};
    const load=st.causes?.[action.loadEventId];
    if(!load||load.data?.action!=='cookMeal'||load.data?.phase!=='loadPot'||load.data?.actor!==agent.id
      ||load.data?.ingredientId!==action.ingredientId||load.data?.potId!==action.potId)return {completed:false,reason:'missing-load-provenance'};
    if(action.potId!==context.pot.id)return {completed:false,reason:'pot-changed'};
    const {ingredient,station,pot,inputMassGrams}=context;
    const mealId='cooked:'+ingredient.id+':'+st.tick;
    if(st.objects[mealId])return {completed:false,reason:'meal-id-conflict'};
    const mealMassGrams=inputMassGrams,processOutflowMassGrams=0;
    if(inputMassGrams!==mealMassGrams+processOutflowMassGrams)throw new Error('Cooking material balance violated.');
    const meal={
      id:mealId,name:'料理餐點',icon:'🍲',portable:false,canEatFrom:true,
      position:{...pot.position},supportId:station.id,
      interactions:{eatFrom:{mode:'supportReach'}},
      meal:{edibleMassGrams:mealMassGrams,standardServingMassGrams:mealMassGrams}
    };
    F.assertMeal(meal);
    // The sole material mutation happens after all executable preconditions pass.
    delete st.objects[ingredient.id];
    st.objects[mealId]=meal;
    const eventId=emitEvent(agent.name+'將完整食材料理成餐點。','good',[action.loadEventId],{
      actor:agent.id,action:'cookMeal',phase:'complete',recipeId:RECIPE_ID,
      stationId:station.id,potId:pot.id,ingredientId:ingredient.id,mealId,
      ingredientTypeId:ingredient.ingredient.typeId,inputMassGrams,mealMassGrams,
      processOutflowMassGrams,unit:'g',position:station.displayAt,
      entities:['object:'+ingredient.id,'object:'+mealId,'object:'+pot.id,'furniture:'+station.id]
    });
    meal.producedByEventId=eventId;
    return {completed:true,mealId,ingredientId:ingredient.id,eventId,inputMassGrams,mealMassGrams,processOutflowMassGrams};
  }
  window.SimFoodCooking=Object.freeze({VERSION,RECIPE_ID,REQUIRED_TICKS,potOnStation,eligible,complete});
})();
