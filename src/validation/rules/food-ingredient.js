(() => {
  const V=window.SimValidator,I=window.SimIngredient;
  if(!V?.registerValidationLayer||I?.VERSION!=='food-ingredient-v1')throw new Error('Ingredient runtime validation requires registry and Ingredient v1.');
  function validateLayer(st,base){
    const issues=[...base.issues];
    for(const [id,object] of Object.entries(st?.objects||{})){
      if(I.hasIngredient(object)&&!I.validIngredient(object)){
        issues.push({code:'food_ingredient_invalid',message:'Ingredient requires canonical positive gram-precise Object mass, stable type and effective density, without duplicate Resource or Meal inventory.',objectId:id});
      }
    }
    return {...base,issues,issueCount:issues.length,ok:issues.length===0};
  }
  V.registerValidationLayer('food.ingredient',validateLayer,276);
})();
