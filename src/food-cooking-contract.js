(() => {
  // One deliberately bounded recipe; no generic recipe engine or second Food inventory.
  const I=window.SimIngredient,F=window.SimFood;
  if(I?.VERSION!=='food-ingredient-v1'||F?.VERSION!=='food-v1-f0')throw new Error('Cooking requires Ingredient v1 and the canonical Meal F0 contract.');
  const VERSION='food-cooking-f1b1',RECIPE_ID='ingredient-A-equimass',REQUIRED_TICKS=4;
  function potOnStation(st,stationId){
    return Object.values(st?.objects||{}).filter(item=>item?.cookingPot===true
      &&item.portable===true&&item.supportId===stationId&&!item.containedBy&&!!item.position
      &&!Object.values(st.agents||{}).some(agent=>agent.held===item.id))
      .sort((a,b)=>a.id.localeCompare(b.id))[0]||null;
  }
  function eligible(st,ingredientId,stationId){
    const ingredient=st?.objects?.[ingredientId],station=st?.furniture?.[stationId];
    if(!ingredient||!station||station.cookingStation!==true||station.supportsObjects!==true)return null;
    if(!I.validIngredient(ingredient)||ingredient.ingredient.typeId!=='A'
      ||ingredient.supportId!==stationId||!ingredient.position||ingredient.containedBy!==undefined)return null;
    if(!station.footprint?.some(p=>p.x===ingredient.position.x&&p.y===ingredient.position.y&&(p.z||0)===(ingredient.position.z||0)))return null;
    if(Object.values(st.agents||{}).some(agent=>agent.held===ingredient.id))return null;
    const pot=potOnStation(st,stationId);
    if(!pot||!station.footprint.some(p=>p.x===pot.position.x&&p.y===pot.position.y&&(p.z||0)===(pot.position.z||0)))return null;
    return {ingredient,station,pot,inputMassGrams:I.massGrams(ingredient)};
  }
  function complete(st,agent,action,emitEvent){
    if(!st||!agent||action?.kind!=='cookMeal'||action.progressTicks!==REQUIRED_TICKS||typeof emitEvent!=='function')return {completed:false,reason:'invalid-context'};
    if(agent.action!==action||st.reservations?.['object:'+action.ingredientId]!==agent.id||st.reservations?.['object:'+action.potId]!==agent.id||st.reservations?.['furniture:'+action.stationId]!==agent.id||!window.SimSpatial?.isAtInteraction?.(st,agent,{kind:'furniture',id:action.stationId},'default'))return {completed:false,reason:'execution-not-authorized'};
    const context=eligible(st,action.ingredientId,action.stationId);
    if(!context)return {completed:false,reason:'inputs-unavailable'};
    if(action.potId!==context.pot.id)return {completed:false,reason:'pot-changed'};
    const {ingredient,station,pot,inputMassGrams}=context;
    const mealId='cooked:'+ingredient.id+':'+st.tick;
    if(st.objects[mealId])return {completed:false,reason:'meal-id-conflict'};
    const mealMassGrams=inputMassGrams,processOutflowMassGrams=0;
    if(inputMassGrams!==mealMassGrams+processOutflowMassGrams)throw new Error('Cooking material balance violated.');
    const meal={
      id:mealId,name:'料理餐點',icon:'🍲',portable:false,canEatFrom:true,
      position:{...ingredient.position},supportId:station.id,
      interactions:{eatFrom:{mode:'supportReach'}},
      meal:{edibleMassGrams:mealMassGrams,standardServingMassGrams:mealMassGrams}
    };
    F.assertMeal(meal);
    // The sole material mutation happens after all executable preconditions pass.
    delete st.objects[ingredient.id];
    st.objects[mealId]=meal;
    const eventId=emitEvent(agent.name+'將完整食材料理成餐點。','good',[],{
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
