(() => {
  const Base=window.SimWorldAuthoring,D=window.SimFurnitureDefinitions;
  if(!Base?.VERSION||!Base?.cloneAuthoring||!Base?.resolveFurnitureInstance||!Base?.validateAuthoring||!Base?.canonicalizeAuthoring)throw new Error('furniture-passage-yielding-authoring.js requires world-authoring.js.');
  if(!D?.getDefinition)throw new Error('furniture-passage-yielding-authoring.js requires furniture-definitions.js.');

  const BASE_VERSION=Base.VERSION;
  const VERSION='world-authoring-v17';
  const PASSAGE_YIELDING_VERSION='furniture-passage-yielding-authoring-v1';
  const CARDINAL_DELTA=Object.freeze({north:Object.freeze({x:0,y:-1}),east:Object.freeze({x:1,y:0}),south:Object.freeze({x:0,y:1}),west:Object.freeze({x:-1,y:0})});
  const clone=value=>Base.cloneAuthoring(value);
  const isRecord=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const integerPlacement=placement=>isRecord(placement)&&isRecord(placement.origin)&&Number.isInteger(placement.origin.x)&&Number.isInteger(placement.origin.y)&&Number.isInteger(placement.origin.z)&&typeof placement.orientation==='string';
  const samePlacement=(left,right)=>!!left&&!!right&&left.origin.x===right.origin.x&&left.origin.y===right.origin.y&&left.origin.z===right.origin.z&&left.orientation===right.orientation;

  function baseFurnitureInstance(instance){
    const out=clone(instance||{});
    delete out.passageYielding;
    delete out.parkedPlacement;
    return out;
  }
  function projectedBaseDocument(authoring){
    const out=clone(authoring||{});
    out.authoringSchema=BASE_VERSION;
    for(const [id,instance] of Object.entries(out.furniture||{}))out.furniture[id]=baseFurnitureInstance(instance);
    return out;
  }
  function defaultParkedPlacement(instance){
    const definition=D.getDefinition(instance?.definitionId),delta=CARDINAL_DELTA[instance?.orientation];
    if(definition?.orientationSemantics!=='facing'||!delta||!isRecord(instance?.origin))return null;
    return {origin:{x:instance.origin.x+delta.x,y:instance.origin.y+delta.y,z:instance.origin.z},orientation:instance.orientation};
  }
  function resolveFurniturePassageYieldingContract(instance){
    if(instance?.passageYielding!==true)return null;
    const homePlacement={origin:clone(instance.origin),orientation:instance.orientation};
    const parkedPlacement=instance.parkedPlacement?clone(instance.parkedPlacement):defaultParkedPlacement(instance);
    if(!parkedPlacement)return null;
    return {
      version:PASSAGE_YIELDING_VERSION,
      homePlacement,
      parkedPlacement,
      source:instance.parkedPlacement?'explicit':'facing-default'
    };
  }
  function validatePassageContract(instance,path){
    const errors=[];
    const push=(code,message,data={})=>errors.push({code,path,message,...data});
    if(instance?.passageYielding!==undefined&&typeof instance.passageYielding!=='boolean')push('authoring_furniture_passage_yielding_invalid','passageYielding must be boolean.');
    if(instance?.parkedPlacement!==undefined&&instance?.passageYielding!==true)push('authoring_furniture_parked_without_capability','parkedPlacement requires passageYielding=true.');
    if(instance?.passageYielding!==true)return errors;
    const home={origin:instance.origin,orientation:instance.orientation};
    const parked=instance.parkedPlacement||defaultParkedPlacement(instance);
    if(!parked){push('authoring_furniture_parked_default_unavailable','Passage Yielding requires explicit parkedPlacement or a facing Furniture definition.');return errors;}
    if(!integerPlacement(parked)){push('authoring_furniture_parked_placement_invalid','parkedPlacement requires integer origin x/y/z and orientation.');return errors;}
    const allowed=new Set(['origin','orientation']);for(const key of Object.keys(parked))if(!allowed.has(key))push('authoring_furniture_parked_field_unsupported',`Unsupported parkedPlacement field ${key}.`,{field:key});
    if(parked.orientation!==home.orientation)push('authoring_furniture_parked_rotation_unsupported','Passage Yielding v1 keeps Furniture orientation unchanged.');
    const dx=parked.origin.x-home.origin.x,dy=parked.origin.y-home.origin.y,dz=parked.origin.z-home.origin.z;
    if(dz!==0||Math.abs(dx)+Math.abs(dy)!==1)push('authoring_furniture_parked_displacement_invalid','Passage Yielding v1 requires same-layer cardinal 1-cell parked displacement.',{dx,dy,dz});
    return errors;
  }
  function validateAuthoring(authoring){
    const base=Base.validateAuthoring(projectedBaseDocument(authoring));
    const errors=[...(base.errors||[])];
    if(authoring?.authoringSchema!==VERSION){
      const index=errors.findIndex(issue=>issue.code==='authoring_schema_unsupported');if(index>=0)errors.splice(index,1);
      errors.unshift({code:'authoring_schema_unsupported',path:'authoringSchema',message:`Expected ${VERSION}; received ${String(authoring?.authoringSchema)}.`});
    }else{
      const index=errors.findIndex(issue=>issue.code==='authoring_schema_unsupported');if(index>=0)errors.splice(index,1);
    }
    for(const [id,instance] of Object.entries(authoring?.furniture||{}))errors.push(...validatePassageContract(instance,`furniture.${id}`));
    return {ok:errors.length===0,errors};
  }
  function assertValidAuthoring(authoring){
    const report=validateAuthoring(authoring);if(report.ok)return authoring;
    const error=new Error(report.errors.map(issue=>`${issue.path}: ${issue.message}`).join('\n'));error.code='world_authoring_invalid';error.issues=report.errors;throw error;
  }
  function canonicalizeAuthoring(authoring){
    assertValidAuthoring(authoring);
    const source=clone(authoring),base=Base.canonicalizeAuthoring(projectedBaseDocument(authoring));
    base.authoringSchema=VERSION;
    for(const [id,instance] of Object.entries(base.furniture||{})){
      const authored=source.furniture?.[id];
      if(authored?.passageYielding===true){
        instance.passageYielding=true;
        if(authored.parkedPlacement)instance.parkedPlacement=clone(authored.parkedPlacement);
      }
    }
    return base;
  }
  function semanticFingerprint(authoring){return JSON.stringify(canonicalizeAuthoring(authoring));}
  function serializeAuthoring(authoring){return JSON.stringify(canonicalizeAuthoring(authoring),null,2)+'\n';}
  function parseAuthoringJSON(text){let parsed;try{parsed=JSON.parse(String(text));}catch(error){const wrapped=new Error('Invalid authoring JSON: '+error.message);wrapped.code='world_authoring_json_invalid';throw wrapped;}assertValidAuthoring(parsed);return canonicalizeAuthoring(parsed);}
  function resolveFurnitureInstance(instance){
    const resolved=Base.resolveFurnitureInstance(baseFurnitureInstance(instance)),contract=resolveFurniturePassageYieldingContract(instance);
    if(contract){resolved.definitionId=instance.definitionId;resolved.origin=clone(instance.origin);resolved.passageYielding=contract;}
    return resolved;
  }
  function resolvedFurnitureMap(authoring){const out={};for(const [id,instance] of Object.entries(authoring?.furniture||{})){try{out[id]=resolveFurnitureInstance(instance);}catch{}}return out;}
  function deriveHorizontalTopology(authoring,options){return Base.deriveHorizontalTopology(projectedBaseDocument(authoring),options);}
  function deriveStructureConnections(authoring){return Base.deriveStructureConnections(projectedBaseDocument(authoring));}
  function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);return value;}
  const defaultDocument=clone(Base.DEFAULT_WORLD_AUTHORING);defaultDocument.authoringSchema=VERSION;

  window.SimWorldAuthoring={...Base,
    VERSION,
    PASSAGE_YIELDING_AUTHORING_VERSION:PASSAGE_YIELDING_VERSION,
    DEFAULT_WORLD_AUTHORING:deepFreeze(canonicalizeAuthoring(defaultDocument)),
    resolveFurniturePassageYieldingContract,
    resolveFurnitureInstance,
    resolvedFurnitureMap,
    deriveHorizontalTopology,
    deriveStructureConnections,
    validateAuthoring,
    assertValidAuthoring,
    canonicalizeAuthoring,
    semanticFingerprint,
    serializeAuthoring,
    parseAuthoringJSON,
    sameFurniturePassagePlacement:samePlacement
  };
})();