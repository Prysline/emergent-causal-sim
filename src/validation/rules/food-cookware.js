(() => {
  const V=window.SimValidator,K=window.SimFoodCookwareEligibility;
  if(!V?.registerValidationLayer||K?.VERSION!=='food-cookware-eligibility-v1')throw new Error('Cookware runtime validation requires registry and cookware eligibility.');
  function validateLayer(st,base){
    const issues=[...base.issues];
    for(const [id,object] of Object.entries(st?.objects||{})){
      const problem=K.issue(object);
      if(problem)issues.push({code:problem.code,message:problem.message,objectId:id});
    }
    return {...base,issues,issueCount:issues.length,ok:issues.length===0};
  }
  V.registerValidationLayer('food.cookware',validateLayer,277);
})();
