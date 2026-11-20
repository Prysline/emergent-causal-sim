(() => {
  const Base=window.SimWorldAuthoring;
  if(Base?.VERSION!=='world-authoring-v20')throw new Error('Movable Object containment authoring requires World Authoring v20.');
  const VERSION='world-authoring-v21',clone=Base.cloneAuthoring;
  function baseDocument(source){const out=clone(source||{});out.authoringSchema=Base.VERSION;return out;}
  function validateAuthoring(source){
    const base=Base.validateAuthoring(baseDocument(source)),errors=[...base.errors];
    if(source?.authoringSchema!==VERSION)errors.push({code:'authoring_schema_unsupported',path:'authoringSchema',message:'Expected '+VERSION});
    return {ok:errors.length===0,errors};
  }
  function assertValidAuthoring(source){
    const result=validateAuthoring(source);
    if(result.ok)return source;
    const error=new Error(result.errors.map(item=>item.path+': '+item.message).join('\n'));
    error.code='world_authoring_invalid';error.issues=result.errors;throw error;
  }
  function canonicalizeAuthoring(source){
    assertValidAuthoring(source);
    const out=Base.canonicalizeAuthoring(baseDocument(source));out.authoringSchema=VERSION;return out;
  }
  const seed=clone(Base.DEFAULT_WORLD_AUTHORING);seed.authoringSchema=VERSION;
  const DEFAULT_WORLD_AUTHORING=Object.freeze(canonicalizeAuthoring(seed));
  function serializeAuthoring(source){return JSON.stringify(canonicalizeAuthoring(source),null,2)+'\n';}
  function parseAuthoringJSON(value){
    let parsed;try{parsed=JSON.parse(String(value));}
    catch(error){const failure=new Error('Invalid authoring JSON: '+error.message);failure.code='world_authoring_json_invalid';throw failure;}
    return canonicalizeAuthoring(parsed);
  }
  window.SimWorldAuthoring={...Base,VERSION,DEFAULT_WORLD_AUTHORING,validateAuthoring,assertValidAuthoring,canonicalizeAuthoring,serializeAuthoring,parseAuthoringJSON,semanticFingerprint:source=>JSON.stringify(canonicalizeAuthoring(source))};
})();
