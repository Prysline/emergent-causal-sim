(() => {
  const Base=window.SimFurnitureDefinitions;
  if(!Base?.DEFINITIONS||!Base?.resolveDefinitionInstance)throw new Error('furniture-visual-properties.js requires furniture-definitions.js.');

  const VISUAL_OPACITY_VERSION='furniture-visual-opacity-v1';
  const VISUAL_OPACITY_BY_DEFINITION=Object.freeze({
    'cabinet-tall':Object.freeze({body:'opaque'})
  });
  const clone=value=>JSON.parse(JSON.stringify(value));

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
    return value;
  }

  function assertVisualOpacity(definition){
    for(const solid of definition?.spatial?.solids||[]){
      if(solid.visualOpacity!==undefined&&solid.visualOpacity!=='opaque'){
        throw new Error('Furniture Definition '+String(definition?.id)+' solid '+String(solid?.key)+' has unsupported visualOpacity '+String(solid.visualOpacity)+'.');
      }
    }
  }

  function decorateDefinition(definition){
    if(!definition)return null;
    const out=clone(definition),metadata=VISUAL_OPACITY_BY_DEFINITION[out.id]||{};
    const solids=out.spatial?.solids||[];
    for(const [solidKey,opacity] of Object.entries(metadata)){
      if(opacity!=='opaque')throw new Error('Unsupported canonical Furniture visual opacity: '+String(opacity)+'.');
      const solid=solids.find(candidate=>candidate?.key===solidKey);
      if(!solid)throw new Error('Furniture visual opacity metadata references missing solid '+out.id+':'+solidKey+'.');
      solid.visualOpacity=opacity;
    }
    assertVisualOpacity(out);
    return deepFreeze(out);
  }

  const DEFINITIONS=deepFreeze(Object.fromEntries(Object.entries(Base.DEFINITIONS).map(([key,definition])=>[key,decorateDefinition(definition)])));

  function getDefinition(definitionId){return DEFINITIONS[definitionId]||null;}
  function listDefinitions(){return Object.values(DEFINITIONS);}

  function propagateVisualOpacity(resolved,definition){
    const out=clone(resolved),sourceByKey=new Map((definition?.spatial?.solids||[]).map(solid=>[solid.key,solid]));
    for(const solid of out.spatial?.solids||[]){
      const opacity=sourceByKey.get(solid.key)?.visualOpacity;
      if(opacity!==undefined)solid.visualOpacity=opacity;
    }
    return out;
  }

  function resolveDefinitionInstance(definition,instance){
    assertVisualOpacity(definition);
    return propagateVisualOpacity(Base.resolveDefinitionInstance(definition,instance),definition);
  }

  function resolveInstance(instance){
    const definition=getDefinition(instance?.definitionId);
    if(!definition){
      const error=new RangeError('Unknown Furniture Definition: '+String(instance?.definitionId));
      error.code='furniture_definition_missing';
      throw error;
    }
    return resolveDefinitionInstance(definition,instance);
  }

  window.SimFurnitureDefinitions=Object.freeze({
    ...Base,
    VISUAL_OPACITY_VERSION,
    DEFINITIONS,
    getDefinition,
    listDefinitions,
    resolveDefinitionInstance,
    resolveInstance
  });
})();
