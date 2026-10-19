(() => {
  const Base=window.SimWorldAuthoring;
  if(!Base?.validateAuthoring||Base.VERSION!=='world-authoring-v17')throw new Error('Tidying authoring requires World Authoring v17.');
  const VERSION='world-authoring-v18',clone=Base.cloneAuthoring;
  const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  function baseDocument(value){
    const out=clone(value);
    out.authoringSchema=Base.VERSION;
    delete out.objectStorageAssignments;
    for(const resident of Object.values(out.residents||{}))if(resident?.initial)delete resident.initial.knownObjectStorageAssignmentIds;
    return out;
  }
  function validateAuthoring(value){
    const base=Base.validateAuthoring(baseDocument(value)),errors=[...base.errors];
    if(value?.authoringSchema!==VERSION)errors.push({code:'authoring_schema_unsupported',path:'authoringSchema',message:'Expected '+VERSION+'.'});
    const assignments=value?.objectStorageAssignments;
    if(assignments!==undefined&&!Array.isArray(assignments))errors.push({code:'object_storage_assignments_invalid',path:'objectStorageAssignments',message:'Storage assignments must be an array.'});
    const ids=new Set(),objects=new Set();
    for(const [index,item] of (Array.isArray(assignments)?assignments:[]).entries()){
      const path='objectStorageAssignments['+index+']';
      if(!record(item)){errors.push({code:'object_storage_assignment_invalid',path,message:'Assignment must be an object.'});continue;}
      if(typeof item.id!=='string'||!item.id.trim()||ids.has(item.id))errors.push({code:'object_storage_assignment_id_invalid',path:path+'.id',message:'Assignment id must be unique and nonempty.'});
      else ids.add(item.id);
      if(typeof item.objectId!=='string'||!value.entities?.objects?.[item.objectId]||objects.has(item.objectId))errors.push({code:'object_storage_object_invalid',path:path+'.objectId',message:'Object must exist and have at most one storage assignment.'});
      else objects.add(item.objectId);
      if(item.mode!=='contain'||item.target?.kind!=='furniture'||typeof item.target.id!=='string')errors.push({code:'object_storage_target_invalid',path:path+'.target',message:'Only a fixed Furniture containment target is supported.'});
      else {
        const furniture=value.furniture?.[item.target.id];
        if(!furniture||Base.resolveFurnitureInstance(furniture)?.objectContainment!==true)errors.push({code:'object_storage_containment_unavailable',path:path+'.target',message:'Target must resolve to containment-capable Furniture.'});
      }
      if(Object.keys(item).some(key=>!['id','objectId','target','mode'].includes(key)))errors.push({code:'object_storage_field_unsupported',path,message:'Unsupported storage assignment field.'});
    }
    for(const [id,resident] of Object.entries(value?.residents||{})){
      const refs=resident?.initial?.knownObjectStorageAssignmentIds,path='residents.'+id+'.initial.knownObjectStorageAssignmentIds';
      if(refs===undefined)continue;
      if(!Array.isArray(refs)||refs.some(ref=>typeof ref!=='string'||!ids.has(ref))||new Set(refs).size!==refs.length)errors.push({code:'object_storage_known_refs_invalid',path,message:'Known storage refs must be unique and resolve to World assignments.'});
    }
    return {ok:errors.length===0,errors};
  }
  function assertValidAuthoring(value){const report=validateAuthoring(value);if(report.ok)return value;const err=new Error(report.errors.map(e=>e.path+': '+e.message).join('\n'));err.code='world_authoring_invalid';err.issues=report.errors;throw err;}
  function canonicalizeAuthoring(value){
    assertValidAuthoring(value);
    const source=clone(value),out=Base.canonicalizeAuthoring(baseDocument(value));
    out.authoringSchema=VERSION;
    out.objectStorageAssignments=clone(source.objectStorageAssignments||[]).sort((a,b)=>a.id.localeCompare(b.id));
    for(const [id,resident] of Object.entries(out.residents||{})){
      const refs=source.residents?.[id]?.initial?.knownObjectStorageAssignmentIds;
      if(refs!==undefined)resident.initial.knownObjectStorageAssignmentIds=[...refs].sort();
    }
    return out;
  }
  const defaultWorld=clone(Base.DEFAULT_WORLD_AUTHORING);
  defaultWorld.authoringSchema=VERSION;
  defaultWorld.objectStorageAssignments=[];
  const DEFAULT_WORLD_AUTHORING=Object.freeze(canonicalizeAuthoring(defaultWorld));
  function serializeAuthoring(value){return JSON.stringify(canonicalizeAuthoring(value),null,2)+'\n';}
  function parseAuthoringJSON(text){let value;try{value=JSON.parse(String(text));}catch(error){const wrapped=new Error('Invalid authoring JSON: '+error.message);wrapped.code='world_authoring_json_invalid';throw wrapped;}return canonicalizeAuthoring(value);}
  window.SimWorldAuthoring={...Base,VERSION,DEFAULT_WORLD_AUTHORING,validateAuthoring,assertValidAuthoring,canonicalizeAuthoring,serializeAuthoring,parseAuthoringJSON,semanticFingerprint:value=>JSON.stringify(canonicalizeAuthoring(value))};
})();
