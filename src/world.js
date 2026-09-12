(() => {
  const WIDTH=12,HEIGHT=8;
  const RESOURCE_TYPES={
    food:{id:'food',name:'食物',icon:'🍲',phase:'solid',edible:true,hungerRelief:[18,30],evaporation:0},
    water:{id:'water',name:'水',icon:'💧',phase:'liquid',drinkable:true,thirstRelief:[18,31],evaporation:.07},
    alcohol:{id:'alcohol',name:'酒',icon:'🍺',phase:'liquid',drinkable:true,thirstRelief:[8,17],intoxicationFactor:1.35,evaporation:.11}
  };
  const ZH={
    hunger:'飢餓',thirst:'口渴',fatigue:'疲勞',social:'社交需求',comfort:'舒適',safety:'安全感',groomingNeed:'理毛需求',
    eat:'吃東西',drinkWater:'喝水',drinkAlcohol:'喝酒',refillFood:'補充現成食物',refillWater:'補充水桶',rest:'休息',talk:'找人聊天',petCat:'摸橘子',seekHuman:'找人撒嬌',cleanFloor:'清理地面',groom:'舔毛清潔',wander:'閒晃',supplyFood:'外出補給',
    intoxication:'醉酒',coordination:'動作協調',normal:'正常'
  };
  const DATA_ZH={seed:'隨機種子',exertion:'活動量',fatigueCost:'疲勞成本',recovery:'疲勞恢復',recoveryRate:'恢復倍率',restEfficiency:'休息效率',action:'行動',amount:'數量',status:'狀態',value:'數值',successChance:'成功率',roll:'擲骰結果',reason:'原因',intoxication:'醉酒程度',coordination:'動作協調',transfer:'資源轉移',difficulty:'動作基準',environmentRisk:'環境風險',failRisk:'失敗風險',resource:'資源',from:'來源',to:'去向',container:'容器',source:'補給來源',position:'位置',target:'目標',noise:'噪音',phase:'階段',room:'房間'};

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
        {id:'sofa:left',label:'左側',position:{x:9,y:2},canRest:true,canSleep:true,restQuality:.82,allowKinds:['human','cat']},
        {id:'sofa:right',label:'右側',position:{x:10,y:2},canRest:true,canSleep:true,restQuality:.82,allowKinds:['human','cat']}
      ]},
    frontDoor:{id:'frontDoor',name:'大門',icon:'🚪',kind:'door',blocksMovement:true,value:18,
      footprint:[{x:0,y:6}],displayAt:{x:0,y:6},slots:[{id:'frontDoor:inside',label:'門內',position:{x:1,y:6},canExit:true,allowKinds:['human','cat']}]}
  };

  const OBJECT_START={
    foodPantry:{x:2,y:2},mealTray:{x:5,y:2},cupA:{x:6,y:2},cupB:{x:6,y:3},alcoholBottle:{x:5,y:3},waterBucket:{x:5,y:5},tap:{x:6,y:5}
  };
  const AGENT_START={zhen:{x:9,y:3},zhou:{x:7,y:3},orange:{x:2,y:6}};

  const clone=o=>JSON.parse(JSON.stringify(o));
  const key=(x,y)=>`${x},${y}`;
  function buildTiles(){
    const tiles={};
    for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
      const boundary=x===0||y===0||x===WIDTH-1||y===HEIGHT-1;
      const door=x===0&&y===6;
      tiles[key(x,y)]={
        id:key(x,y),x,y,terrain:door?'doorway':boundary?'wall':'floor',material:boundary&&!door?'stone':'wood',
        walkable:!boundary,staticBlockedBy:null,surface:{contents:{}},roomId:null
      };
    }
    return tiles;
  }
  function normalizeFurniture(){
    const furniture=clone(FURNITURE_DEFS);
    for(const f of Object.values(furniture))for(const slot of f.slots||[]){slot.furnitureId=f.id;}
    return furniture;
  }

  function createInitialState(seed=20260911){
    const n=(Number(seed)>>>0)||20260911;
    const state={
      version:'11.0-refactor',tick:0,day:1,minute:12*60,seed:n,rngState:n,
      map:{width:WIDTH,height:HEIGHT,tiles:buildTiles(),rooms:{},roomRevision:0},
      furniture:normalizeFurniture(),activityAreas:{},reservations:{},noiseEvents:[],endpointCauses:{},
      supply:{trigger:70,workerId:null,trips:0,totalProduced:0},
      containers:{
        mealTray:{id:'mealTray',name:'現成食物',icon:'🍲',capacity:100,preferredResource:'food',contents:{food:68},portable:false,access:1,position:{...OBJECT_START.mealTray},supportId:'diningTable'},
        foodPantry:{id:'foodPantry',name:'食物櫃',icon:'🧺',capacity:200,preferredResource:'food',contents:{food:140},portable:false,access:1,position:{...OBJECT_START.foodPantry}},
        waterBucket:{id:'waterBucket',name:'水桶',icon:'💧',capacity:100,preferredResource:'water',contents:{water:72},portable:false,access:1,position:{...OBJECT_START.waterBucket}},
        cupA:{id:'cupA',name:'白色杯子',icon:'🥛',capacity:35,contents:{alcohol:20},portable:true,canDrinkFrom:true,drinkPreference:.95,position:{...OBJECT_START.cupA},supportId:'diningTable'},
        cupB:{id:'cupB',name:'藍色杯子',icon:'🥛',capacity:35,contents:{},portable:true,canDrinkFrom:true,drinkPreference:.95,position:{...OBJECT_START.cupB},supportId:'diningTable'},
        alcoholBottle:{id:'alcoholBottle',name:'酒瓶',icon:'🍾',capacity:160,preferredResource:'alcohol',contents:{alcohol:120},portable:true,canDrinkFrom:true,drinkPreference:.28,position:{...OBJECT_START.alcoholBottle},supportId:'diningTable'}
      },
      sources:{tap:{id:'tap',name:'水龍頭',icon:'🚰',resource:'water',infinite:true,position:{...OBJECT_START.tap}}},
      agents:{
        zhen:{id:'zhen',name:'阿真',kind:'human',position:{...AGENT_START.zhen},needs:{hunger:34,thirst:29,fatigue:41,social:38},wellbeing:{comfort:58,safety:80},status:{intoxication:0},contacts:{hands:{},feet:{}},causes:{intoxication:null,contacts:{hands:{},feet:{}}},traits:{alcoholLike:.25,social:.55,careful:.82,animalAffinity:.72,exertionSensitivity:.95,recoveryRate:1.05},metrics:{exertionToday:0,lastExertion:null},held:null,carrying:null,pendingInteraction:null,posture:{kind:'standing',slotId:null,furnitureId:null},action:null,offMap:false},
        zhou:{id:'zhou',name:'老周',kind:'human',position:{...AGENT_START.zhou},needs:{hunger:31,thirst:62,fatigue:46,social:24},wellbeing:{comfort:55,safety:80},status:{intoxication:0},contacts:{hands:{},feet:{}},causes:{intoxication:null,contacts:{hands:{},feet:{}}},traits:{alcoholLike:.72,social:.32,careful:.48,animalAffinity:.46,exertionSensitivity:1.05,recoveryRate:.95},metrics:{exertionToday:0,lastExertion:null},held:null,carrying:null,pendingInteraction:null,posture:{kind:'standing',slotId:null,furnitureId:null},action:null,offMap:false},
        orange:{id:'orange',name:'橘子',kind:'cat',position:{...AGENT_START.orange},needs:{hunger:26,thirst:22,fatigue:30,social:28,groomingNeed:75},wellbeing:{comfort:70,safety:82},status:{intoxication:0},contacts:{paws:{}},causes:{intoxication:null,contacts:{paws:{}}},traits:{curious:.7,careful:.62,social:.78,exertionSensitivity:.90,recoveryRate:1.10},metrics:{exertionToday:0,lastExertion:null},held:null,carrying:null,pendingInteraction:null,posture:{kind:'standing',slotId:null,furnitureId:null},action:null,offMap:false}
      },
      events:[],causes:{},thoughts:{},debug:{}
    };

    for(const f of Object.values(state.furniture)){
      for(const p of f.footprint||[]){
        const t=state.map.tiles[key(p.x,p.y)];if(!t)continue;
        t.furnitureIds??=[];t.furnitureIds.push(f.id);
        if(f.blocksMovement){t.walkable=false;t.staticBlockedBy=`furniture:${f.id}`;}
      }
    }
    for(const [id,p] of Object.entries(OBJECT_START)){
      if(id==='mealTray'||id==='cupA'||id==='cupB'||id==='alcoholBottle')continue;
      const obj=state.containers[id]||state.sources[id];
      if(obj?.portable===false||state.sources[id]){
        const t=state.map.tiles[key(p.x,p.y)];if(t){t.walkable=false;t.staticBlockedBy=id;}
      }
    }
    return state;
  }

  window.SimWorld={WIDTH,HEIGHT,RESOURCE_TYPES,ZH,DATA_ZH,FURNITURE_DEFS,OBJECT_START,AGENT_START,createInitialState};
})();