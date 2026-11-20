(() => {
  const Base=window.SimWorldAuthoring,F=window.SimFood;
  if(Base?.VERSION!=='world-authoring-v19'||F?.VERSION!=='food-v1-f0')throw new Error('Food F0 authoring requires World Authoring v19 and the canonical Food v1 F0 contract.');
  const VERSION='world-authoring-v20',clone=Base.cloneAuthoring;
  const hasMeal=F.hasMeal,validMeal=F.validMeal;
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

  window.SimWorldAuthoring={...Base,VERSION,DEFAULT_WORLD_AUTHORING,FOOD_VERSION:F.VERSION,
    validateAuthoring,assertValidAuthoring,canonicalizeAuthoring,serializeAuthoring,parseAuthoringJSON,
    semanticFingerprint:source=>JSON.stringify(canonicalizeAuthoring(source))};
})();
