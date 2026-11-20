(() => {
  // Single Food mass contract shared by current Authoring and legacy-baseline test profiles.
  const VERSION='food-v1-f0',INTAKE_GRAMS_PER_TICK=50,HUNGER_RELIEF_PER_GRAM=.08;
  const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const positiveGrams=value=>Number.isSafeInteger(value)&&value>0;
  const hasMeal=object=>!!object&&Object.prototype.hasOwnProperty.call(object,'meal');
  function validMeal(object){
    if(!hasMeal(object)||!record(object.meal))return false;
    const meal=object.meal;
    return positiveGrams(meal.edibleMassGrams)&&positiveGrams(meal.standardServingMassGrams)
      &&Object.keys(meal).every(key=>['edibleMassGrams','standardServingMassGrams'].includes(key))
      &&object.canEatFrom===true&&object.portable!==true&&object.resourceContainer!==true
      &&object.contents===undefined&&object.containedBy===undefined&&!!object.position
      &&['reach','supportReach'].includes(object.interactions?.eatFrom?.mode);
  }
  function assertMeal(object){
    if(!validMeal(object))throw new Error('Invalid Food F0 Meal Object: '+String(object?.id||'?'));
    return object;
  }
  function remainingGrams(object){return hasMeal(object)?assertMeal(object).meal.edibleMassGrams:0;}
  function servingsFromMass(object){return remainingGrams(object)/object.meal.standardServingMassGrams;}
  function targetIntakeGrams(hunger,object){
    assertMeal(object);
    if(!Number.isFinite(hunger))throw new Error('Meal intake target requires a finite Hunger value.');
    return Math.min(object.meal.standardServingMassGrams,Math.ceil(Math.max(0,hunger)/HUNGER_RELIEF_PER_GRAM));
  }
  function hungerReliefForGrams(grams){
    if(!Number.isSafeInteger(grams)||grams<0)throw new Error('Hunger relief requires non-negative integer grams.');
    return grams*HUNGER_RELIEF_PER_GRAM;
  }
  function consumeMeal(st,objectId,requestedGrams){
    if(!Number.isSafeInteger(requestedGrams)||requestedGrams<=0)throw new Error('Meal consumption requires positive integer grams.');
    const object=st?.objects?.[objectId];
    if(!object||!hasMeal(object))return {actualIntakeGrams:0,remainingGrams:0,retired:false};
    assertMeal(object);
    const actualIntakeGrams=Math.min(requestedGrams,object.meal.edibleMassGrams);
    object.meal.edibleMassGrams-=actualIntakeGrams;
    const remainingGrams=object.meal.edibleMassGrams,retired=remainingGrams===0;
    if(retired)delete st.objects[objectId];
    return {actualIntakeGrams,remainingGrams,retired};
  }

  window.SimFood=Object.freeze({VERSION,INTAKE_GRAMS_PER_TICK,HUNGER_RELIEF_PER_GRAM,hasMeal,validMeal,assertMeal,remainingGrams,servingsFromMass,targetIntakeGrams,hungerReliefForGrams,consumeMeal});
})();
