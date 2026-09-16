(() => {
  const VERSION='11.10-sleep-social-stimulus';
  const WIDTH=12,HEIGHT=8;
  const RESOURCE_TYPES={
    food:{id:'food',name:'食物',icon:'🍲',phase:'solid',edible:true,hungerRelief:[18,30],evaporation:0,loadPerUnit:.035},
    water:{id:'water',name:'水',icon:'💧',phase:'liquid',drinkable:true,thirstRelief:[18,31],evaporation:.07,loadPerUnit:.025},
    alcohol:{id:'alcohol',name:'酒',icon:'🍺',phase:'liquid',drinkable:true,thirstRelief:[8,17],intoxicationFactor:1.35,evaporation:.11,loadPerUnit:.025}
  };
  const SPECIES_PROFILES={
    human:{circadianPattern:'diurnal',sleepNeedGainPerTick:.17,sleepNeedRecoveryPerTick:.24,minSleepTicks:10,maxSleepTicks:330,minimumSleepNeed:28,sleepOpportunityThreshold:55,naturalWakeSleepNeed:22,noiseWakeThreshold:30},
    cat:{circadianPattern:'crepuscular',sleepNeedGainPerTick:.20,sleepNeedRecoveryPerTick:.32,minSleepTicks:6,maxSleepTicks:180,minimumSleepNeed:24,sleepOpportunityThreshold:52,naturalWakeSleepNeed:26,noiseWakeThreshold:26}
  };
  const ZH={
    hunger:'飢餓',thirst:'口渴',fatigue:'疲勞',sleepNeed:'睡眠需求',social:'社交需求',comfort:'舒適',safety:'安全感',groomingNeed:'理毛需求',
    eat:'吃東西',drinkWater:'喝水',drinkAlcohol:'喝酒',restockContainer:'補充資源',rest:'休息',sleep:'睡眠',talk:'找人聊天',petCat:'摸貓',seekHuman:'找人撒嬌',cleanFloor:'清理地面',groom:'舔毛清潔',wander:'閒晃',externalSupply:'外出補給',
    intoxication:'醉酒',coordination:'動作協調',normal:'正常'
  };
  const DATA_ZH={seed:'隨機種子',exertion:'活動量',fatigueCost:'疲勞成本',recovery:'疲勞恢復',recoveryRate:'恢復倍率',restEfficiency:'休息效率',sleepEfficiency:'睡眠效率',sleepNeed:'睡眠需求',sleepNeedRecovery:'睡眠需求恢復',circadianPattern:'日夜節律',circadianBias:'時段睡眠偏向',sleepPropensity:'睡眠傾向',wakeReason:'醒來原因',wakeChance:'互動喚醒機率',wakeRoll:'互動喚醒擲骰',stimulusIntensity:'刺激強度',stimulusKind:'刺激類型',action:'行動',amount:'數量',status:'狀態',value:'數值',successChance:'成功率',roll:'擲骰結果',reason:'原因',intoxication:'醉酒程度',coordination:'動作協調',transfer:'資源轉移',difficulty:'動作基準',environmentRisk:'環境風險',failRisk:'失敗風險',resource:'資源',from:'來源',to:'去向',container:'容器',carrier:'物流容器',source:'補給來源',position:'位置',target:'目標',noise:'噪音',phase:'階段',room:'房間',load:'負重',entities:'關聯實體'};

  const FURNITURE_DEFS={
    diningTable:{id:'diningTable',name:'餐桌',icon:'▰',kind:'table',blocksMovement:true,supportsObjects:true,value:30,
      footprint:[{x:5,y:2},{x:6,y:2},{x:5,y:3},{x:6,y:3}],displayAt:{x:5,y:2},slots:[]},
    chairNW:{id:'chairNW',name:'餐椅 A',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
      footprint:[{x:4,y:2}],displayAt:{x:4,y:2},slots:[{id:'chairNW:seat',label:'座位',position:{x:4,y:2},canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
    chairNE:{id:'chairNE',name:'餐椅 B',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
      footprint:[{x:7,y:2}],displayAt:{x:7,y:2},slots:[{id:'chairNE:seat',label:'座位',position:{x:7,y:2},canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
    chairSW:{id:'chairSW',name:'餐椅 C',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
      footprint:[{x:4,y:3}],displayAt:{x:4,y:3},slots:[{id:'chairSW:seat',label:'座位',position:{x:4,y:3},canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
    chairSE:{id:'chairSE',name:'餐椅 D',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
      footprint:[{x:7,y:3}],displayAt:{x:7,y:3},slots:[{id:'chairSE:seat',label:'座位',position:{x:7,y:3},canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
    sofa:{id:'sofa',name:'沙發',icon:'🛋️',kind:'sofa',blocksMovement:false,value:35,
      footprint:[{x:9,y:2},{x:10,y:2}],displayAt:{x:9,y:2},slots:[
        {id:'sofa:left',label:'左側',position:{x:9,y:2},canRest:true,canSleep:true,restQuality:.82,sleepQuality:.62,allowKinds:['human','cat']},
        {id:'sofa:right',label:'右側',position:{x:10,y:2},canRest:true,canSleep:true,restQuality:.82,sleepQuality:.62,allowKinds:['human','cat']}
      ]},
    bed:{id:'bed',name:'雙人床',icon:'🛏️',kind:'bed',blocksMovement:false,value:55,
      footprint:[{x:9,y:5},{x:10,y:5}],displayAt:{x:9,y:5},slots:[
        {id:'bed:left',label:'左側',position:{x:9,y:5},canRest:true,canSleep:true,restQuality:.98,sleepQuality:1,restPosture:'lying',allowKinds:['human']},
        {id:'bed:right',label:'右側',position:{x:10,y:5},canRest:true,canSleep:true,restQuality:.98,sleepQuality:1,restPosture:'lying',allowKinds:['human']}
      ]},
    frontDoor:{id:'frontDoor',name:'大門',icon:'🚪',kind:'door',blocksMovement:true,value:18,
      footprint:[{x:0,y:6}],displayAt:{x:0,y:6},slots:[{id:'frontDoor:inside',label:'門內',position:{x:1,y:6},canExit:true,allowKinds:['human','cat']}]}
  };

  const OBJECT_START={foodPantry:{x:2,y:2},basket:{x:3,y:2},mealTray:{x:5,y:2},plateA:{x:5,y:2},plateB:{x:6,y:3},cupA:{x:6,y:2},cupB:{x:6,y:3},alcoholBottle:{x:5,y:3},waterBucket:{x:5,y:5},tap:{x:6,y:5}};
  const AGENT_START={zhen:{x:9,y:3},zhou:{x:7,y:3},orange:{x:2,y:6}};
  const clone=o=>JSON.parse(JSON.stringify(o));
  const key=(x,y)=>`${x},${y}`;

  function buildTiles(){
    const tiles={};
    for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
      const boundary=x===0||y===0||x===WIDTH-1||y===HEIGHT-1,door=x===0&&y===6;
      tiles[key(x,y)]={id:key(x,y),x,y,terrain:door?'doorway':boundary?'wall':'floor',material:boundary&&!door?'stone':'wood',walkable:!boundary,surface:{contents:{}},roomId:null,furnitureIds:[]};
    }
    return tiles;
  }
  function normalizeFurniture(){const furniture=clone(FURNITURE_DEFS);for(const f of Object.values(furniture))for(const slot of f.slots||[])slot.furnitureId=f.id;return furniture;}
  function roleList(...roles){return roles.flat().filter(Boolean);}

  function createInitialState(seed=20260911){
    const n=(Number(seed)>>>0)||20260911;
    const state={
      version:VERSION,tick:0,day:1,minute:12*60,seed:n,rngState:n,
      map:{width:WIDTH,height:HEIGHT,tiles:buildTiles(),rooms:{},roomRevision:0},
      furniture:normalizeFurniture(),activityAreas:{},reservations:{},noiseEvents:[],endpointCauses:{},
      supply:{trigger:70,trips:0,totalProduced:0},
      containers:{
        mealTray:{id:'mealTray',name:'現成食物',icon:'🍲',roles:roleList('readyFood'),capacity:100,emptyLoad:2.5,preferredResource:'food',contents:{food:68},portable:false,canEatFrom:true,access:1,position:{...OBJECT_START.mealTray},supportId:'diningTable',restock:{resource:'food',low:18,strategy:'logisticsContainer',sourceRole:'foodReserve'},interactions:{serve:{mode:'supportReach'},eatFrom:{mode:'reach'}}},
        plateA:{id:'plateA',name:'餐盤 A',icon:'🍽️',roles:roleList('servingDish'),capacity:12,emptyLoad:.35,contents:{},portable:true,servingDish:true,canEatFrom:true,position:{...OBJECT_START.plateA},supportId:'diningTable',interactions:{eatFrom:{mode:'reach'}}},
        plateB:{id:'plateB',name:'餐盤 B',icon:'🍽️',roles:roleList('servingDish'),capacity:12,emptyLoad:.35,contents:{},portable:true,servingDish:true,canEatFrom:true,position:{...OBJECT_START.plateB},supportId:'diningTable',interactions:{eatFrom:{mode:'reach'}}},
        foodPantry:{id:'foodPantry',name:'食物櫃',icon:'🗄️',roles:roleList('foodReserve','externalSupplyDestination'),capacity:200,emptyLoad:8,preferredResource:'food',contents:{food:140},portable:false,access:1,position:{...OBJECT_START.foodPantry}},
        basket:{id:'basket',name:'搬運籃',icon:'🧺',roles:roleList('logisticsContainer'),capacity:55,emptyLoad:.8,contents:{},portable:true,transportResources:['food'],position:{...OBJECT_START.basket},interactions:{pickup:{mode:'occupy'},receive:{mode:'reach'},deposit:{mode:'reach'}}},
        waterBucket:{id:'waterBucket',name:'水桶',icon:'💧',roles:roleList('waterReserve','refillable','drinkSource'),capacity:100,emptyLoad:1.3,preferredResource:'water',contents:{water:72},portable:true,canDrinkFrom:true,drinkPreference:.12,access:1,position:{...OBJECT_START.waterBucket},restock:{resource:'water',low:24,strategy:'carryContainer',sourceRole:'resourceSource'},interactions:{pickup:{mode:'occupy'},drinkFrom:{mode:'reach'}}},
        cupA:{id:'cupA',name:'白色杯子',icon:'🥛',roles:roleList('drinkVessel'),capacity:35,emptyLoad:.25,contents:{alcohol:20},portable:true,canDrinkFrom:true,drinkPreference:.95,position:{...OBJECT_START.cupA},supportId:'diningTable'},
        cupB:{id:'cupB',name:'藍色杯子',icon:'🥛',roles:roleList('drinkVessel'),capacity:35,emptyLoad:.25,contents:{},portable:true,canDrinkFrom:true,drinkPreference:.95,position:{...OBJECT_START.cupB},supportId:'diningTable'},
        alcoholBottle:{id:'alcoholBottle',name:'酒瓶',icon:'🍾',roles:roleList('drinkSource'),capacity:160,emptyLoad:.65,preferredResource:'alcohol',contents:{alcohol:120},portable:true,canDrinkFrom:true,drinkPreference:.28,position:{...OBJECT_START.alcoholBottle},supportId:'diningTable'}
      },
      sources:{
        tap:{id:'tap',name:'水龍頭',icon:'🚰',roles:roleList('resourceSource'),resource:'water',infinite:true,position:{...OBJECT_START.tap},interactions:{fill:{mode:'port'}},interactionPorts:[{id:'tap:west',label:'水龍頭左側',position:{x:5,y:5},edge:'east',affordances:['fill']}]}
      },
      agents:{
        zhen:{id:'zhen',name:'阿真',kind:'human',position:{...AGENT_START.zhen},needs:{hunger:34,thirst:29,fatigue:41,sleepNeed:34,social:38},wellbeing:{comfort:58,safety:80},status:{intoxication:0},contacts:{hands:{},feet:{}},causes:{intoxication:null,contacts:{hands:{},feet:{}}},traits:{alcoholLike:.25,social:.55,careful:.82,animalAffinity:.72,exertionSensitivity:.95,recoveryRate:1.05},metrics:{exertionToday:0,lastExertion:null},held:null,posture:{kind:'standing',slotId:null,furnitureId:null},action:null,offMap:false},
        zhou:{id:'zhou',name:'老周',kind:'human',position:{...AGENT_START.zhou},needs:{hunger:31,thirst:62,fatigue:46,sleepNeed:40,social:24},wellbeing:{comfort:55,safety:80},status:{intoxication:0},contacts:{hands:{},feet:{}},causes:{intoxication:null,contacts:{hands:{},feet:{}}},traits:{alcoholLike:.72,social:.32,careful:.48,animalAffinity:.46,exertionSensitivity:1.05,recoveryRate:.95},metrics:{exertionToday:0,lastExertion:null},held:null,posture:{kind:'standing',slotId:null,furnitureId:null},action:null,offMap:false},
        orange:{id:'orange',name:'橘子',kind:'cat',position:{...AGENT_START.orange},needs:{hunger:26,thirst:22,fatigue:30,sleepNeed:44,social:28,groomingNeed:75},wellbeing:{comfort:70,safety:82},status:{intoxication:0},contacts:{paws:{}},causes:{intoxication:null,contacts:{paws:{}}},traits:{curious:.7,careful:.62,social:.78,exertionSensitivity:.90,recoveryRate:1.10},metrics:{exertionToday:0,lastExertion:null},held:null,posture:{kind:'standing',slotId:null,furnitureId:null},action:null,offMap:false}
      },
      events:[],causes:{},thoughts:{}
    };
    for(const f of Object.values(state.furniture))for(const p of f.footprint||[]){const t=state.map.tiles[key(p.x,p.y)];if(t&&!t.furnitureIds.includes(f.id))t.furnitureIds.push(f.id);}
    return state;
  }

  window.SimWorld={VERSION,WIDTH,HEIGHT,RESOURCE_TYPES,SPECIES_PROFILES,ZH,DATA_ZH,FURNITURE_DEFS,OBJECT_START,AGENT_START,createInitialState};
})();