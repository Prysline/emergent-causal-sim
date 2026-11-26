(() => {
  // Fully edible Meal mass is the sole quantity truth, including when served into a plate.
  const VERSION='food-v4-contained-meal',INTAKE_GRAMS_PER_TICK=50,HUNGER_RELIEF_PER_GRAM=.08;
  const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const positiveGrams=value=>Number.isSafeInteger(value)&&value>0;
  const hasMeal=object=>!!object&&Object.prototype.hasOwnProperty.call(object,'meal');
  function isServingPlate(plate){
    const storage=plate?.objectStorage;
    return !!plate&&plate.cookingEligible!==true&&plate.objectContainment===true&&plate.resourceContainer!==true
      &&plate.portable===true&&plate.canEatFrom===true&&plate.contents===undefined
      &&['reach','supportReach'].includes(plate.interactions?.eatFrom?.mode)
      &&!!storage&&window.SimObjectStorageVolume.positive(storage.capacityCubicMeters);
  }
  // Containment capability and explicit exposure are separate. A cookware tag
  // alone does not expose arbitrary contents or turn a pot into a serving plate.
  function isCookingMealContainer(pot){
    return !!pot&&pot.cookingEligible===true&&pot.objectContainment===true&&pot.portable===true&&pot.resourceContainer!==true&&pot.contents===undefined&&window.SimObjectStorageVolume.positive(pot.objectStorage?.capacityCubicMeters);
  }
  function cookingContainerForMeal(st,meal){
    const pot=meal?.containedBy&&st?.objects?.[meal.containedBy];
    return validMeal(meal)&&isCookingMealContainer(pot)?pot:null;
  }
  function exposedMealContainer(st,meal){
    const pot=cookingContainerForMeal(st,meal);
    return servingPlateForMeal(st,meal)||(pot&&pot.canEatFrom===true&&['reach','supportReach'].includes(pot.interactions?.eatFrom?.mode)?pot:null);
  }
  function isServingSource(st,meal){
    return validMeal(meal)&&(!meal.containedBy||!!(cookingContainerForMeal(st,meal)&&exposedMealContainer(st,meal)));
  }
  function validMeal(object){
    if(!hasMeal(object)||!record(object.meal))return false;
    const meal=object.meal,contained=object.containedBy!==undefined;
    return positiveGrams(meal.edibleMassGrams)&&positiveGrams(meal.standardServingMassGrams)
      &&window.SimObjectStorageVolume.positive(meal.densityKgPerM3)
      &&Object.keys(meal).every(key=>['edibleMassGrams','standardServingMassGrams','densityKgPerM3'].includes(key))
      &&object.canEatFrom===true&&object.portable!==true&&object.resourceContainer!==true
      &&object.objectContainment!==true&&object.contents===undefined&&object.handling?.massKg===undefined&&object.physicalVolumeCubicMeters===undefined
      &&['reach','supportReach'].includes(object.interactions?.eatFrom?.mode)
      &&(contained?(typeof object.containedBy==='string'&&!!object.containedBy
        &&object.position===undefined&&object.supportId===undefined):!!object.position);
  }
  function assertMeal(object){
    if(!validMeal(object))throw new Error('Invalid Food Meal Object: '+String(object?.id||'?'));
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
  // Child-side containedBy owns placement. Visibility/interaction consumers separately
  // require real exposure and canonical geometry; this never reveals arbitrary cargo.
  function servingPlateForMeal(st,object){
    if(!object?.containedBy||!validMeal(object))return null;
    const plate=st?.objects?.[object.containedBy];
    return isServingPlate(plate)?plate:null;
  }
  function serveMeal(st,sourceId,plateId,requestedGrams,newMealId){
    if(!positiveGrams(requestedGrams))throw new Error('Meal serving requires positive integer grams.');
    const source=st?.objects?.[sourceId],plate=st?.objects?.[plateId];
    if(!isServingSource(st,source)||!isServingPlate(plate)||sourceId===plateId)
      return {served:false,reason:'invalid-source-or-plate'};
    const O=window.SimObjectHandling;
    if(!O?.objectStorageStatus||!O?.cargoMassKg)throw new Error('Meal serving requires canonical Object storage.');
    const sourcePot=cookingContainerForMeal(st,source);
    if(sourcePot&&!O.objectStorageStatus(st,sourcePot).withinCapacity)return {served:false,reason:'source-volume-capacity'};
    const storage=O.objectStorageStatus(st,plate);
    if(!storage.withinCapacity||storage.count!==0)
      return {served:false,reason:'plate-not-empty-or-capacity'};
    const availableByVolume=Math.max(0,Math.floor(storage.freeVolumeCubicMeters*source.meal.densityKgPerM3*1000+1e-8));
    const actualGrams=Math.min(requestedGrams,source.meal.edibleMassGrams,availableByVolume);
    if(actualGrams<=0)return {served:false,reason:'plate-volume-capacity'};
    const full=actualGrams===source.meal.edibleMassGrams;
    if(!full&&(typeof newMealId!=='string'||!newMealId||st.objects[newMealId]))
      return {served:false,reason:'served-meal-id-conflict'};
    if(full){
      delete source.position;
      delete source.supportId;
      source.containedBy=plateId;
      assertMeal(source);
    }else{
      const portion={...source,id:newMealId,meal:{...source.meal,edibleMassGrams:actualGrams},containedBy:plateId};
      delete portion.position;
      delete portion.supportId;
      assertMeal(portion);
      source.meal.edibleMassGrams-=actualGrams;
      st.objects[newMealId]=portion;
    }
    const servedMealId=full?sourceId:newMealId;
    if(!O.objectStorageStatus(st,plate).withinCapacity)throw new Error('Meal serving violated canonical Object capacity.');
    return {served:true,sourceId,plateId,servedMealId,actualGrams,remainingSourceGrams:full?0:source.meal.edibleMassGrams,full};
  }
  function consumeMeal(st,objectId,requestedGrams){
    if(!positiveGrams(requestedGrams))throw new Error('Meal consumption requires positive integer grams.');
    const object=st?.objects?.[objectId];
    if(!object||!hasMeal(object))return {actualIntakeGrams:0,remainingGrams:0,retired:false};
    assertMeal(object);
    const actualIntakeGrams=Math.min(requestedGrams,object.meal.edibleMassGrams);
    object.meal.edibleMassGrams-=actualIntakeGrams;
    const remainingGrams=object.meal.edibleMassGrams,retired=remainingGrams===0;
    if(retired)delete st.objects[objectId];
    return {actualIntakeGrams,remainingGrams,retired};
  }

  window.SimFood=Object.freeze({VERSION,INTAKE_GRAMS_PER_TICK,HUNGER_RELIEF_PER_GRAM,
    hasMeal,validMeal,assertMeal,remainingGrams,servingsFromMass,targetIntakeGrams,
    hungerReliefForGrams,isServingPlate,servingPlateForMeal,isCookingMealContainer,cookingContainerForMeal,exposedMealContainer,isServingSource,serveMeal,consumeMeal});
})();
