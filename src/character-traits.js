(() => {
  const VERSION='character-traits-v1';
  // Canonical authored traits stay sparse. Defaults are only applied at read time.
  const DEFINITIONS=Object.freeze({
    alcoholLike:{type:'unit',defaultValue:0},social:{type:'unit',defaultValue:0},careful:{type:'unit',defaultValue:.55},
    animalAffinity:{type:'unit',defaultValue:0},curious:{type:'unit',defaultValue:0},
    exertionSensitivity:{type:'multiplier',defaultValue:1},recoveryRate:{type:'multiplier',defaultValue:1},
    sleepRecoveryRate:{type:'multiplier',defaultValue:1},circadianPattern:{type:'circadian',defaultValue:null},
    circadianPhaseOffsetMinutes:{type:'finite',defaultValue:0}
  });
  const PATTERNS=Object.freeze(['diurnal','nocturnal','crepuscular']);
  const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  function problem(key,value,path){
    const spec=DEFINITIONS[key],issue=(code,message)=>({code,path,message});
    if(!spec)return issue('character_trait_unknown','Unknown Character Trait: '+key);
    if(spec.type==='circadian')return PATTERNS.includes(value)?null:issue('character_trait_value_invalid','Invalid circadian pattern.');
    if(typeof value!=='number'||!Number.isFinite(value))return issue('character_trait_value_invalid','Trait value must be a finite number.');
    if(spec.type==='unit'&&(value<0||value>1))return issue('character_trait_value_invalid','Unit trait must be between 0 and 1.');
    if(spec.type==='multiplier'&&value<0)return issue('character_trait_value_invalid','Multiplier must not be negative.');
    return null;
  }
  function validateTraits(traits,{path='traits'}={}){
    if(traits===undefined)return {ok:true,errors:[]};
    if(!isRecord(traits))return {ok:false,errors:[{code:'character_traits_invalid',path,message:'Traits must be an object.'}]};
    const errors=[];
    for(const [key,value] of Object.entries(traits)){const e=problem(key,value,path+'.'+key);if(e)errors.push(e);}
    return {ok:errors.length===0,errors};
  }
  function assertValidTraits(traits,options){
    const report=validateTraits(traits,options);
    if(!report.ok){const error=new Error(report.errors.map(e=>e.path+': '+e.message).join('\n'));error.code='character_traits_invalid';error.issues=report.errors;throw error;}
    return traits;
  }
  function value(agent,key){
    const spec=DEFINITIONS[key];if(!spec)throw new Error('Unknown Character Trait: '+key);
    if(agent?.traits===undefined)return spec.defaultValue;
    if(!isRecord(agent.traits))throw new Error('Traits must be an object.');
    if(!Object.prototype.hasOwnProperty.call(agent.traits,key))return spec.defaultValue;
    const val=agent.traits[key],e=problem(key,val,'traits.'+key);
    if(e){const error=new Error(e.message+' ('+e.path+')');error.code=e.code;throw error;}
    return val;
  }
  window.SimCharacterTraits=Object.freeze({VERSION,DEFINITIONS:Object.freeze(Object.fromEntries(Object.entries(DEFINITIONS).map(([k,v])=>[k,Object.freeze(v)]))),PATTERNS,validateTraits,assertValidTraits,value});
})();
