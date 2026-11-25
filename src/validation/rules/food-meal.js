(() => {
  const V=window.SimValidator,F=window.SimFood;
  if(!V?.registerValidationLayer||!F?.validMeal)throw new Error('Food F0 validation requires Validator registry and Food contract.');
  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const [id,object] of Object.entries(st?.objects||{})){
      if(!F.hasMeal(object))continue;
      if(object.resourceContainer===true||object.contents!==undefined)add('food_meal_double_inventory','Meal cannot also use Resource contents.',{objectId:id});
      if(!F.validMeal(object))add('food_meal_invalid','Meal must have valid grams, unique placement and eatFrom affordance.',{objectId:id});
      else if(object.containedBy&&!F.servingPlateForMeal(st,object)&&!F.cookingContainerForMeal(st,object))
        add('food_meal_plate_invalid','Contained Meal requires an explicitly exposed ordinary Object plate or eligible ordinary cookware.',{objectId:id,plateId:object.containedBy});
    }
    for(const agent of Object.values(st?.agents||{})){
      const action=agent.action;if(action?.kind!=='eat'||!['toMeal','toMealSeat','sitMeal','eatingMeal','toMealDish','takeMealDish','toMealServe','serveMeal','toMealDining','placeMealDish'].includes(action.phase))continue;
      if(!action.foodSource||!Number.isSafeInteger(action.targetMassGrams)||action.targetMassGrams<0||!Number.isSafeInteger(action.consumedMassGrams)||action.consumedMassGrams<0||action.consumedMassGrams>action.targetMassGrams){
        add('food_meal_action_invalid','Meal Action requires one target and bounded Action-local realized intake.',{agentId:agent.id});
      }
    }
    return {...base,issues,issueCount:issues.length,ok:issues.length===0};
  }
  V.registerValidationLayer('food.meal',validateLayer,275);
})();
