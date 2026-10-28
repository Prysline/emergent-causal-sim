(() => {
  const Base=window.SimWorldAuthoring,T=window.SimCharacterTraits;
  if(Base?.VERSION!=='world-authoring-v18'||T?.VERSION!=='character-traits-v1')throw new Error('Character Traits authoring requires World Authoring v18 and Traits v1.');
  const VERSION='world-authoring-v19',clone=Base.cloneAuthoring;
  function baseDoc(source){const out=clone(source);out.authoringSchema=Base.VERSION;return out;}
  function validateAuthoring(source){
    const errors=[...Base.validateAuthoring(baseDoc(source)).errors];
    if(source?.authoringSchema!==VERSION)errors.push({code:'authoring_schema_unsupported',path:'authoringSchema',message:'Expected '+VERSION});
    for(const [id,resident] of Object.entries(source?.residents||{}))errors.push(...T.validateTraits(resident?.traits,{path:'residents.'+id+'.traits'}).errors);
    return {ok:errors.length===0,errors};
  }
  function assertValidAuthoring(source){
    const report=validateAuthoring(source);if(report.ok)return source;
    const error=new Error(report.errors.map(e=>e.path+': '+e.message).join('\n'));error.code='world_authoring_invalid';error.issues=report.errors;throw error;
  }
  function canonicalizeAuthoring(source){
    assertValidAuthoring(source);const out=Base.canonicalizeAuthoring(baseDoc(source));out.authoringSchema=VERSION;return out;
  }
  const seed=clone(Base.DEFAULT_WORLD_AUTHORING);seed.authoringSchema=VERSION;
  const DEFAULT_WORLD_AUTHORING=Object.freeze(canonicalizeAuthoring(seed));
  function serializeAuthoring(source){return JSON.stringify(canonicalizeAuthoring(source),null,2)+'\n';}
  function parseAuthoringJSON(text){let parsed;try{parsed=JSON.parse(String(text));}catch(e){const err=new Error('Invalid authoring JSON: '+e.message);err.code='world_authoring_json_invalid';throw err;}return canonicalizeAuthoring(parsed);}
  window.SimWorldAuthoring={...Base,VERSION,CHARACTER_TRAITS_VERSION:T.VERSION,DEFAULT_WORLD_AUTHORING,
    validateAuthoring,assertValidAuthoring,canonicalizeAuthoring,serializeAuthoring,parseAuthoringJSON,
    semanticFingerprint:source=>JSON.stringify(canonicalizeAuthoring(source))};
})();
