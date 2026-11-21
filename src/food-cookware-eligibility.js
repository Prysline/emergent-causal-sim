(() => {
  const VERSION='food-cookware-eligibility-v1';
  const hasOwn=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
  function issue(object){
    if(!object||typeof object!=='object'||Array.isArray(object))return null;
    if(hasOwn(object,'cookingPot'))return {code:'food_cookware_legacy_flag',field:'cookingPot',message:'Legacy cookingPot is not supported; use cookingEligible.'};
    if(hasOwn(object,'cookingEligible')&&typeof object.cookingEligible!=='boolean')return {code:'food_cookware_eligibility_type',field:'cookingEligible',message:'Object cookingEligible must be boolean.'};
    if(object.cookingEligible===true&&object.resourceContainer===true)return {code:'food_cookware_resource_conflict',field:'cookingEligible',message:'Resource Container cannot be an eligible ordinary Cooking Object.'};
    return null;
  }
  function cookingEligible(object){
    const problem=issue(object);
    if(problem)throw new Error(problem.code+': '+problem.message+' Object '+String(object?.id||'?'));
    return object?.cookingEligible===true;
  }
  window.SimFoodCookwareEligibility=Object.freeze({VERSION,issue,cookingEligible});
})();
