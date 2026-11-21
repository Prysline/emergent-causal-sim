(() => {
  const Base=window.SimWorldAuthoring,K=window.SimFoodCookwareEligibility;
  if(Base?.VERSION!=='world-authoring-v22'||K?.VERSION!=='food-cookware-eligibility-v1')throw new Error('Cooking authoring requires World Authoring v22 and canonical cookware eligibility.');
  const VERSION='world-authoring-v24',clone=Base.cloneAuthoring;
  function baseDocument(source){const out=clone(source||{});out.authoringSchema=Base.VERSION;return out;}
  function validateAuthoring(source){
    const base=Base.validateAuthoring(baseDocument(source)),errors=[...base.errors];
    if(source?.authoringSchema!==VERSION)errors.push({code:'authoring_schema_unsupported',path:'authoringSchema',message:'Expected '+VERSION});
    for(const [id,object] of Object.entries(source?.entities?.objects||{})){
      const problem=K.issue(object);
      if(problem)errors.push({code:problem.code,path:'entities.objects.'+id+'.'+problem.field,message:problem.message});
    }
    return {ok:errors.length===0,errors};
  }
  function assertValidAuthoring(source){
    const report=validateAuthoring(source);if(report.ok)return source;
    const error=new Error(report.errors.map(issue=>issue.path+': '+issue.message).join('\n'));
    error.code='world_authoring_invalid';error.issues=report.errors;throw error;
  }
  function canonicalizeAuthoring(source){
    assertValidAuthoring(source);
    const doc=Base.canonicalizeAuthoring(baseDocument(source));doc.authoringSchema=VERSION;return doc;
  }
  const seed=clone(Base.DEFAULT_WORLD_AUTHORING);seed.authoringSchema=VERSION;
  const DEFAULT_WORLD_AUTHORING=Object.freeze(canonicalizeAuthoring(seed));
  function serializeAuthoring(source){return JSON.stringify(canonicalizeAuthoring(source),null,2)+'\n';}
  function parseAuthoringJSON(value){
    let parsed;try{parsed=JSON.parse(String(value));}
    catch(error){const e=new Error('Invalid authoring JSON: '+error.message);e.code='world_authoring_json_invalid';throw e;}
    return canonicalizeAuthoring(parsed);
  }
  window.SimWorldAuthoring={...Base,VERSION,DEFAULT_WORLD_AUTHORING,
    validateAuthoring,assertValidAuthoring,canonicalizeAuthoring,serializeAuthoring,parseAuthoringJSON,
    semanticFingerprint:source=>JSON.stringify(canonicalizeAuthoring(source))};
})();
