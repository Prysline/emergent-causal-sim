(() => {
  const VERSION='furniture-definitions-v2';
  const local=(x,y,z=0)=>({x,y,z});
  const clone=value=>JSON.parse(JSON.stringify(value));
  const isRecord=value=>!!value&&typeof value==='object'&&!Array.isArray(value);

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
    return value;
  }

  const DEFINITIONS={
    'dining-table':{
      id:'dining-table',
      name:'餐桌',
      icon:'▰',
      kind:'table',
      blocksMovement:true,
      supportsObjects:true,
      footprint:[local(0,0),local(1,0),local(0,1),local(1,1)],
      displayOffset:local(0,0),
      slots:[],
      spatial:{under:{clearance:.72,cover:'overhead'}},
      compatibility:{roomValueContribution:30}
    },
    'chair-basic':{
      id:'chair-basic',
      name:'餐椅',
      icon:'🪑',
      kind:'chair',
      blocksMovement:false,
      footprint:[local(0,0)],
      displayOffset:local(0,0),
      slots:[
        {key:'seat',label:'座位',offset:local(0,0),canRest:true,allowKinds:['human'],activitySuitability:{rest:.48}}
      ],
      compatibility:{roomValueContribution:10}
    },
    'sofa-basic':{
      id:'sofa-basic',
      name:'沙發',
      icon:'🛋️',
      kind:'sofa',
      blocksMovement:false,
      footprint:[local(0,0),local(1,0)],
      displayOffset:local(0,0),
      slots:[
        {key:'left',label:'左側',offset:local(0,0),canRest:true,canSleep:true,allowKinds:['human','cat'],activitySuitability:{rest:.82,sleep:.62}},
        {key:'right',label:'右側',offset:local(1,0),canRest:true,canSleep:true,allowKinds:['human','cat'],activitySuitability:{rest:.82,sleep:.62}}
      ],
      compatibility:{roomValueContribution:35}
    },
    'double-bed':{
      id:'double-bed',
      name:'雙人床',
      icon:'🛏️',
      kind:'bed',
      blocksMovement:false,
      footprint:[local(0,0),local(1,0)],
      displayOffset:local(0,0),
      slots:[
        {key:'left',label:'左側',offset:local(0,0),canRest:true,canSleep:true,restPosture:'lying',allowKinds:['human'],activitySuitability:{rest:.98,sleep:1}},
        {key:'right',label:'右側',offset:local(1,0),canRest:true,canSleep:true,restPosture:'lying',allowKinds:['human'],activitySuitability:{rest:.98,sleep:1}}
      ],
      compatibility:{roomValueContribution:55}
    }
  };

  function assertLocalPosition(position,path){
    if(!isRecord(position)||!Number.isInteger(position.x)||!Number.isInteger(position.y)||!Number.isInteger(position.z)){
      throw new Error(path+' must contain integer x / y / z local coordinates.');
    }
  }

  function assertDefinition(definition,key){
    if(!isRecord(definition)||definition.id!==key)throw new Error('Furniture Definition id mismatch: '+key);
    if(typeof definition.name!=='string'||!definition.name)throw new Error('Furniture Definition '+key+' requires name.');
    if(typeof definition.kind!=='string'||!definition.kind)throw new Error('Furniture Definition '+key+' requires kind.');
    if(!Array.isArray(definition.footprint)||!definition.footprint.length)throw new Error('Furniture Definition '+key+' requires footprint.');
    definition.footprint.forEach((position,index)=>assertLocalPosition(position,key+'.footprint['+index+']'));
    assertLocalPosition(definition.displayOffset,key+'.displayOffset');
    if(definition.slots!==undefined&&!Array.isArray(definition.slots))throw new Error('Furniture Definition '+key+' slots must be an array.');
    const keys=new Set();
    for(let index=0;index<(definition.slots||[]).length;index++){
      const slot=definition.slots[index];
      if(!isRecord(slot)||typeof slot.key!=='string'||!slot.key||slot.key.includes(':'))throw new Error('Furniture Definition '+key+' has invalid slot key.');
      if(keys.has(slot.key))throw new Error('Furniture Definition '+key+' duplicates slot key '+slot.key+'.');
      keys.add(slot.key);
      assertLocalPosition(slot.offset,key+'.slots['+index+'].offset');
      for(const activity of ['rest','sleep']){
        const value=slot.activitySuitability?.[activity];
        if(value!==undefined&&(!Number.isFinite(value)||value<0))throw new Error('Furniture Definition '+key+' has invalid '+activity+' suitability.');
      }
    }
    const roomValue=definition.compatibility?.roomValueContribution;
    if(roomValue!==undefined&&!Number.isFinite(roomValue))throw new Error('Furniture Definition '+key+' has invalid compatibility room value.');
  }

  for(const [key,definition] of Object.entries(DEFINITIONS))assertDefinition(definition,key);
  deepFreeze(DEFINITIONS);

  const add=(origin,offset)=>({x:origin.x+offset.x,y:origin.y+offset.y,z:origin.z+offset.z});

  function getDefinition(definitionId){
    return DEFINITIONS[definitionId]||null;
  }

  function listDefinitions(){
    return Object.values(DEFINITIONS);
  }

  function resolveInstance(instance){
    if(!isRecord(instance)||typeof instance.id!=='string'||!instance.id)throw new Error('Furniture Instance requires id.');
    const definition=getDefinition(instance.definitionId);
    if(!definition){
      const error=new RangeError('Unknown Furniture Definition: '+String(instance.definitionId));
      error.code='furniture_definition_missing';
      throw error;
    }
    const origin=instance.origin;
    if(!isRecord(origin)||!Number.isInteger(origin.x)||!Number.isInteger(origin.y)||!Number.isInteger(origin.z)){
      const error=new TypeError('Furniture Instance '+instance.id+' requires integer origin x / y / z.');
      error.code='furniture_instance_origin_invalid';
      throw error;
    }
    const resolved={
      id:instance.id,
      name:instance.name||definition.name,
      icon:definition.icon,
      kind:definition.kind,
      blocksMovement:definition.blocksMovement===true,
      footprint:definition.footprint.map(offset=>add(origin,offset)),
      displayAt:add(origin,definition.displayOffset),
      slots:(definition.slots||[]).map(slot=>{
        const out={
          id:instance.id+':'+slot.key,
          label:slot.label||slot.key,
          position:add(origin,slot.offset)
        };
        if(slot.canRest===true)out.canRest=true;
        if(slot.canSleep===true)out.canSleep=true;
        if(slot.restPosture)out.restPosture=slot.restPosture;
        if(Array.isArray(slot.allowKinds))out.allowKinds=clone(slot.allowKinds);
        if(Number.isFinite(slot.activitySuitability?.rest))out.restQuality=slot.activitySuitability.rest;
        if(Number.isFinite(slot.activitySuitability?.sleep))out.sleepQuality=slot.activitySuitability.sleep;
        return out;
      })
    };
    if(definition.supportsObjects===true)resolved.supportsObjects=true;
    if(definition.spatial)resolved.spatial=clone(definition.spatial);
    const roomValue=definition.compatibility?.roomValueContribution;
    if(Number.isFinite(roomValue))resolved.value=roomValue;
    return resolved;
  }

  window.SimFurnitureDefinitions=Object.freeze({
    VERSION,
    DEFINITIONS,
    getDefinition,
    listDefinitions,
    resolveInstance
  });
})();