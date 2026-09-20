(() => {
  const A=window.SimWorldAuthoring,I=window.SimWorldInitializer;
  if(!A?.DEFAULT_WORLD_AUTHORING||!I?.createInitialState)throw new Error('World authoring and initializer must load before world.js.');
  const WORLD_SCHEMA_VERSION='11.10-sleep-social-stimulus';
  const WIDTH=A.DEFAULT_WORLD_AUTHORING.map.width,HEIGHT=A.DEFAULT_WORLD_AUTHORING.map.height;
  const SUPPLY_TRIGGER=70;
  const RESOURCE_TYPES={
    food:{id:'food',name:'食物',icon:'🍲',phase:'solid',edible:true,hungerRelief:[18,30],evaporation:0,loadPerUnit:.035},
    water:{id:'water',name:'水',icon:'💧',phase:'liquid',drinkable:true,thirstRelief:[18,31],evaporation:.07,loadPerUnit:.025},
    alcohol:{id:'alcohol',name:'酒',icon:'🍺',phase:'liquid',drinkable:true,thirstRelief:[8,17],intoxicationFactor:1.35,evaporation:.11,loadPerUnit:.025}
  };
  const SPECIES_PROFILES={
    human:{socialClass:'person',circadianPattern:'diurnal',sleepNeedGainPerTick:.17,sleepNeedRecoveryPerTick:.24,minSleepTicks:10,maxSleepTicks:330,minimumSleepNeed:28,sleepOpportunityThreshold:55,naturalWakeSleepNeed:22,noiseWakeThreshold:30},
    cat:{socialClass:'animal',interactionAffordances:{pet:true},circadianPattern:'crepuscular',sleepNeedGainPerTick:.20,sleepNeedRecoveryPerTick:.32,minSleepTicks:6,maxSleepTicks:180,minimumSleepNeed:24,sleepOpportunityThreshold:52,naturalWakeSleepNeed:26,noiseWakeThreshold:26}
  };
  const ZH={
    hunger:'飢餓',thirst:'口渴',fatigue:'疲勞',sleepNeed:'睡眠需求',social:'社交需求',comfort:'舒適',safety:'安全感',groomingNeed:'理毛需求',
    eat:'吃東西',drinkWater:'喝水',drinkAlcohol:'喝酒',restockContainer:'補充資源',rest:'休息',sleep:'睡眠',talk:'找人聊天',petAnimal:'摸動物',seekHuman:'找人撒嬌',cleanFloor:'清理地面',groom:'舔毛清潔',wander:'閒晃',externalSupply:'外出補給',
    intoxication:'醉酒',coordination:'動作協調',normal:'正常'
  };
  const DATA_ZH={seed:'隨機種子',exertion:'活動量',fatigueCost:'疲勞成本',recovery:'疲勞恢復',recoveryRate:'恢復倍率',restEfficiency:'休息效率',sleepEfficiency:'睡眠效率',sleepNeed:'睡眠需求',sleepNeedRecovery:'睡眠需求恢復',circadianPattern:'日夜節律',circadianBias:'時段睡眠偏向',sleepPropensity:'睡眠傾向',wakeReason:'醒來原因',wakeChance:'互動喚醒機率',wakeRoll:'互動喚醒擲骰',stimulusIntensity:'刺激強度',stimulusKind:'刺激類型',action:'行動',amount:'數量',status:'狀態',value:'數值',successChance:'成功率',roll:'擲骰結果',reason:'原因',intoxication:'醉酒程度',coordination:'動作協調',transfer:'資源轉移',difficulty:'動作基準',environmentRisk:'環境風險',failRisk:'失敗風險',resource:'資源',from:'來源',to:'去向',container:'容器',carrier:'物流容器',source:'補給來源',position:'位置',target:'目標',noise:'噪音',phase:'階段',room:'房間',load:'負重',entities:'關聯實體'};

  const INITIAL_STATE_PHASES=Object.freeze(['schema','finalize']);
  const initialStateInitializers=new Map(INITIAL_STATE_PHASES.map(phase=>[phase,[]]));
  let initialStateRegistrationSeq=0,finalizedInitialStateManifest=null;

  function phaseEntries(phase){
    const entries=initialStateInitializers.get(phase);
    if(!entries)throw new Error(`Unknown initial-state phase: ${phase}`);
    return entries;
  }
  function registerInitialStateInitializer(id,handler,order=0,phase='schema'){
    if(finalizedInitialStateManifest)throw new Error(`Initial-state registry is finalized; cannot register ${id}.`);
    if(!id||typeof id!=='string')throw new Error('Initial-state initializer id must be a non-empty string');
    if(typeof handler!=='function')throw new Error(`Initial-state initializer ${id} must be a function`);
    if(INITIAL_STATE_PHASES.some(name=>phaseEntries(name).some(entry=>entry.id===id)))throw new Error(`Duplicate initial-state initializer: ${id}`);
    const entries=phaseEntries(phase);
    entries.push({id,handler,order:Number.isFinite(order)?order:0,seq:initialStateRegistrationSeq++});
    entries.sort((a,b)=>a.order-b.order||a.seq-b.seq||a.id.localeCompare(b.id));
    return handler;
  }
  function registerInitialStateFinalizer(id,handler,order=0){
    return registerInitialStateInitializer(id,handler,order,'finalize');
  }
  function listInitialStateInitializers(phase='schema'){
    return phaseEntries(phase).map(({id,order})=>({id,order}));
  }
  function currentInitialStateManifest(){
    return Object.fromEntries(INITIAL_STATE_PHASES.map(phase=>[phase,listInitialStateInitializers(phase)]));
  }
  function assertInitialStateManifest(expected){
    if(!expected||typeof expected!=='object')throw new Error('Expected initial-state manifest must be an object.');
    for(const phase of INITIAL_STATE_PHASES){
      const wanted=expected[phase];
      if(!Array.isArray(wanted))throw new Error(`Expected initial-state manifest must define phase ${phase}.`);
      const actual=listInitialStateInitializers(phase);
      if(JSON.stringify(actual)!==JSON.stringify(wanted))throw new Error(`Initial-state manifest mismatch for ${phase}; expected=${JSON.stringify(wanted)}, actual=${JSON.stringify(actual)}.`);
    }
    return currentInitialStateManifest();
  }
  function finalizeInitialStateRegistry(expected){
    if(finalizedInitialStateManifest)throw new Error('Initial-state registry is already finalized.');
    assertInitialStateManifest(expected);
    finalizedInitialStateManifest=Object.freeze(Object.fromEntries(INITIAL_STATE_PHASES.map(phase=>[phase,Object.freeze(expected[phase].map(entry=>Object.freeze({...entry}))) ])));
    return currentInitialStateManifest();
  }
  function runInitialStateInitializers(st,ctx={}){
    for(const phase of INITIAL_STATE_PHASES){
      for(const entry of phaseEntries(phase))entry.handler(st,{...ctx,phase});
    }
    return st;
  }

  function createInitialStateFromAuthoring(authoring,seed=20260911){
    const n=(Number(seed)>>>0)||20260911;
    const canonical=A.canonicalizeAuthoring(A.cloneAuthoring(authoring));
    A.assertValidAuthoring(canonical);
    I.assertRuntimeCompatibleAuthoring(canonical);
    const st=I.createInitialState(canonical,{seed:n,version:WORLD_SCHEMA_VERSION,supplyTrigger:SUPPLY_TRIGGER});
    return runInitialStateInitializers(st,{seed:n});
  }

  function createInitialState(seed=20260911){
    return createInitialStateFromAuthoring(A.DEFAULT_WORLD_AUTHORING,seed);
  }

  window.SimWorld={
    WORLD_SCHEMA_VERSION,WIDTH,HEIGHT,RESOURCE_TYPES,SPECIES_PROFILES,ZH,DATA_ZH,createInitialState,createInitialStateFromAuthoring,
    INITIAL_STATE_PIPELINE_VERSION:'initial-state-pipeline-2',INITIAL_STATE_PHASES,
    registerInitialStateInitializer,registerInitialStateFinalizer,runInitialStateInitializers,listInitialStateInitializers,
    currentInitialStateManifest,assertInitialStateManifest,finalizeInitialStateRegistry,
    isInitialStateRegistryFinalized:()=>!!finalizedInitialStateManifest
  };
})();