(() => {
  // Ingredient mass lives ONLY in Object.handling.massKg. No second current Food quantity.
  const VERSION='food-ingredient-v1',S=window.SimObjectStorageVolume;
  if(S?.VERSION!=='object-storage-volume-v1')throw new Error('Ingredient requires canonical physical-volume calculator.');
  const TYPES=Object.freeze({
    A:Object.freeze({id:'A',name:'食材 A',defaultMassGrams:300,defaultDensityKgPerM3:1000})
  });
  const isRecord=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const positiveGrams=value=>Number.isSafeInteger(value)&&value>0;
  const positiveDensity=value=>Number.isFinite(value)&&value>0;
  function ingredientType(typeId){
    if(typeof typeId!=='string'||!Object.prototype.hasOwnProperty.call(TYPES,typeId))throw new Error('Unknown Ingredient Type: '+String(typeId));
    return TYPES[typeId];
  }
  const hasIngredient=object=>!!object&&Object.prototype.hasOwnProperty.call(object,'ingredient');
  function massGrams(object){
    const kg=object?.handling?.massKg;
    if(!Number.isFinite(kg)||kg<=0)throw new Error('Ingredient requires positive canonical Object handling.massKg.');
    const grams=kg*1000,whole=Math.round(grams);
    if(!positiveGrams(whole)||Math.abs(grams-whole)>1e-7)throw new Error('Ingredient physical mass must be positive integer grams.');
    return whole;
  }
  function validIngredient(object){
    if(!hasIngredient(object)||!isRecord(object.ingredient))return false;
    const i=object.ingredient;
    if(typeof i.typeId!=='string'||!Object.prototype.hasOwnProperty.call(TYPES,i.typeId)||!positiveDensity(i.densityKgPerM3))return false;
    if(Object.keys(i).some(key=>!['typeId','densityKgPerM3'].includes(key)))return false;
    if(object.portable!==true||object.resourceContainer===true||object.objectContainment===true||object.meal!==undefined||object.contents!==undefined||object.canEatFrom===true)return false;
    const g=object.handling?.carryGeometry;
    if(!isRecord(g)||!['width','height','length'].every(k=>Number.isFinite(g[k])&&g[k]>0)||!Number.isInteger(object.handling.handsRequired)||object.handling.handsRequired<1)return false;
    try{massGrams(object);return true;}catch{return false;}
  }
  function assertIngredient(object){
    if(!validIngredient(object))throw new Error('Invalid Ingredient Object: '+String(object?.id||'?'));
    return object;
  }
  function volumeCubicMeters(object){
    assertIngredient(object);
    return S.physicalVolumeCubicMeters(object);
  }
  function createIngredientObject({id,typeId,massGrams:overrideMassGrams,densityKgPerM3:overrideDensity,position,containedBy,supportId}={}){
    if(typeof id!=='string'||!id.trim())throw new Error('Ingredient Object requires a nonempty id.');
    const type=ingredientType(typeId);
    const grams=overrideMassGrams===undefined?type.defaultMassGrams:overrideMassGrams;
    const density=overrideDensity===undefined?type.defaultDensityKgPerM3:overrideDensity;
    if(!positiveGrams(grams)||!positiveDensity(density))throw new Error('Ingredient requires positive integer grams and positive finite density.');
    if((containedBy===undefined&&position===undefined)||(containedBy!==undefined&&(position!==undefined||supportId!==undefined)))throw new Error('Ingredient requires exactly one valid canonical location relation.');
    if(containedBy!==undefined&&(typeof containedBy!=='string'||!containedBy.trim()))throw new Error('Ingredient containedBy must be a nonempty Object or Furniture id.');
    const object={
      id,name:type.name,icon:'🥔',portable:true,
      handling:{carryGeometry:{width:.12,height:.12,length:.12},handsRequired:1,massKg:grams/1000},
      ingredient:{typeId,densityKgPerM3:density}
    };
    if(position!==undefined)object.position={...position};
    if(supportId!==undefined)object.supportId=supportId;
    if(containedBy!==undefined)object.containedBy=containedBy;
    assertIngredient(object);
    return object;
  }
  window.SimIngredient=Object.freeze({
    VERSION,TYPES,ingredientType,hasIngredient,validIngredient,assertIngredient,massGrams,volumeCubicMeters,createIngredientObject
  });
})();
