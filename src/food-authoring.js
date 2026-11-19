(() => {
  const Base=window.SimWorldAuthoring;
  if(Base?.VERSION!=='world-authoring-v19')throw new Error('Food F0 authoring requires World Authoring v19.');
  const VERSION='world-authoring-v20',FOOD_VERSION='food-v1-f0';
  const INTAKE_GRAMS_PER_TICK=50,HUNGER_RELIEF_PER_GRAM=.08;
  const clone=Base.cloneAuthoring;
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
  function baseDocument(source){
    const doc=clone(source||{});
    doc.authoringSchema=Base.VERSION;
    return doc;
  }
  function validateAuthoring(source){
    const base=Base.validateAuthoring(baseDocument(source)),errors=[...base.errors];
    if(source?.authoringSchema!==VERSION)errors.push({code:'authoring_schema_unsupported',path:'authoringSchema',message:'Expected '+VERSION});
    for(const [id,object] of Object.entries(source?.entities?.objects||{})){
      if(!hasMeal(object))continue;
      if(!validMeal(object))errors.push({code:'food_meal_invalid',path:'entities.objects.'+id+'.meal',message:'Meal requires positive integer edible grams / standard serving grams, eatFrom affordance, exposed Object placement, and no parallel Resource inventory.'});
    }
    return {ok:errors.length===0,errors};
  }
  function assertValidAuthoring(source){
    const report=validateAuthoring(source);if(report.ok)return source;
    const err=new Error(report.errors.map(issue=>issue.path+': '+issue.message).join('\n'));
    err.code='world_authoring_invalid';err.issues=report.errors;throw err;
  }
  function canonicalizeAuthoring(source){
    assertValidAuthoring(source);
    const doc=Base.canonicalizeAuthoring(baseDocument(source));doc.authoringSchema=VERSION;return doc;
  }
  const seed=clone(Base.DEFAULT_WORLD_AUTHORING);
  seed.authoringSchema=VERSION;
  seed.entities.objects.readyMealF0={
    id:'readyMealF0',name:'現成餐點',icon:'🍛',canEatFrom:true,portable:false,
    position:{x:5,y:2,z:0},supportId:'diningTable',interactions:{eatFrom:{mode:'supportReach'}},
    meal:{edibleMassGrams:300,standardServingMassGrams:300}
  };
  const DEFAULT_WORLD_AUTHORING=Object.freeze(canonicalizeAuthoring(seed));
  function serializeAuthoring(source){return JSON.stringify(canonicalizeAuthoring(source),null,2)+'\n';}
  function parseAuthoringJSON(text){
    let value;try{value=JSON.parse(String(text));}
    catch(error){const e=new Error('Invalid authoring JSON: '+error.message);e.code='world_authoring_json_invalid';throw e;}
    return canonicalizeAuthoring(value);
  }
  window.SimFood=Object.freeze({VERSION:FOOD_VERSION,INTAKE_GRAMS_PER_TICK,HUNGER_RELIEF_PER_GRAM,hasMeal,validMeal,assertMeal,remainingGrams,servingsFromMass,targetIntakeGrams,hungerReliefForGrams,consumeMeal});
  window.SimWorldAuthoring={...Base,VERSION,DEFAULT_WORLD_AUTHORING,FOOD_VERSION,
    validateAuthoring,assertValidAuthoring,canonicalizeAuthoring,serializeAuthoring,parseAuthoringJSON,
    semanticFingerprint:source=>JSON.stringify(canonicalizeAuthoring(source))};
})();
