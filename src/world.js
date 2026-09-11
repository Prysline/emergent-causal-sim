(() => {
  const RESOURCE_TYPES = {
    food:{id:'food',name:'食物',icon:'🍲',phase:'solid',edible:true,hungerRelief:[18,30],evaporation:0},
    water:{id:'water',name:'水',icon:'💧',phase:'liquid',drinkable:true,thirstRelief:[18,31],evaporation:.07},
    alcohol:{id:'alcohol',name:'酒',icon:'🍺',phase:'liquid',drinkable:true,thirstRelief:[8,17],intoxicationFactor:1.35,evaporation:.11}
  };
  const ZH = {
    hunger:'飢餓', thirst:'口渴', fatigue:'疲勞', social:'社交需求', comfort:'舒適', safety:'安全感', groomingNeed:'理毛需求',
    eat:'吃東西', drinkWater:'喝水', drinkAlcohol:'喝酒', refillFood:'補充現成食物', refillWater:'補充水桶', rest:'休息', talk:'找人聊天', petCat:'摸橘子', seekHuman:'找人撒嬌', cleanFloor:'清理地面', groom:'舔毛清潔', wander:'閒晃',
    intoxication:'醉酒', coordination:'動作協調', normal:'正常'
  };
  const DATA_ZH={seed:'隨機種子',action:'行動',amount:'數量',status:'狀態',value:'數值',successChance:'成功率',roll:'擲骰結果',reason:'原因',intoxication:'醉酒程度',coordination:'動作協調',transfer:'資源轉移',difficulty:'動作基準',environmentRisk:'環境風險',failRisk:'失敗風險',resource:'資源',from:'來源',to:'去向',container:'容器',source:'補給來源',location:'位置',target:'目標',noise:'噪音',phase:'階段'};

  function createInitialState(seed=20260911){
    const zones={
      table:{id:'table',name:'餐桌區',icon:'🍽️',neighbors:['sink','pantry','rest'],baseNoise:8,restQuality:5},
      sink:{id:'sink',name:'水槽區',icon:'🚰',neighbors:['table','doorway','hearth'],baseNoise:7,restQuality:4},
      pantry:{id:'pantry',name:'食物櫃旁',icon:'🧺',neighbors:['table','doorway'],baseNoise:4,restQuality:5},
      rest:{id:'rest',name:'休息角',icon:'🛋️',neighbors:['table','doorway','hearth'],baseNoise:3,restQuality:30},
      hearth:{id:'hearth',name:'火爐旁',icon:'🔥',neighbors:['sink','rest'],baseNoise:9,restQuality:20},
      doorway:{id:'doorway',name:'出入口',icon:'🚪',neighbors:['sink','pantry','rest'],baseNoise:6,restQuality:2}
    };
    const surfaces={};
    for(const z of Object.values(zones)) surfaces[`floor:${z.id}`]={id:`floor:${z.id}`,name:`${z.name}地面`,icon:'🟫',zone:z.id,contents:{}};
    return {
      tick:0, day:1, minute:12*60, seed:(Number(seed)>>>0)||20260911, rngState:(Number(seed)>>>0)||20260911,
      zones,
      containers:{
        mealTray:{id:'mealTray',name:'現成食物',icon:'🍲',capacity:100,preferredResource:'food',contents:{food:68},refillFrom:'foodPantry',location:'table',portable:false,access:1},
        foodPantry:{id:'foodPantry',name:'食物櫃',icon:'🧺',capacity:200,preferredResource:'food',contents:{food:140},location:'pantry',portable:false,access:1},
        waterBucket:{id:'waterBucket',name:'水桶',icon:'💧',capacity:100,preferredResource:'water',contents:{water:72},refillFrom:'tap',location:'sink',portable:false,access:1},
        cupA:{id:'cupA',name:'白色杯子',icon:'🥛',capacity:35,contents:{alcohol:20},location:'table',portable:true,canDrinkFrom:true,drinkPreference:.95,heldBy:null},
        cupB:{id:'cupB',name:'藍色杯子',icon:'🥛',capacity:35,contents:{},location:'table',portable:true,canDrinkFrom:true,drinkPreference:.95,heldBy:null},
        alcoholBottle:{id:'alcoholBottle',name:'酒瓶',icon:'🍾',capacity:160,preferredResource:'alcohol',contents:{alcohol:120},location:'table',portable:true,canDrinkFrom:true,drinkPreference:.28,heldBy:null}
      },
      sources:{tap:{id:'tap',name:'水龍頭',icon:'🚰',resource:'water',infinite:true,location:'sink'}},
      surfaces,
      endpointCauses:{}, locks:{}, noiseEvents:[],
      agents:{
        zhen:{id:'zhen',name:'阿真',kind:'human',location:'rest',needs:{hunger:34,thirst:29,fatigue:41,social:38},wellbeing:{comfort:58,safety:80},status:{intoxication:0},contacts:{hands:{},feet:{}},causes:{intoxication:null,contacts:{hands:{},feet:{}}},traits:{alcoholLike:.25,social:.55,careful:.82,animalAffinity:.72},held:null,carrying:null,pendingInteraction:null,plan:null},
        zhou:{id:'zhou',name:'老周',kind:'human',location:'table',needs:{hunger:31,thirst:62,fatigue:46,social:24},wellbeing:{comfort:55,safety:80},status:{intoxication:0},contacts:{hands:{},feet:{}},causes:{intoxication:null,contacts:{hands:{},feet:{}}},traits:{alcoholLike:.72,social:.32,careful:.48,animalAffinity:.46},held:null,carrying:null,pendingInteraction:null,plan:null},
        orange:{id:'orange',name:'橘子',kind:'cat',location:'doorway',needs:{hunger:26,thirst:22,fatigue:30,social:28,groomingNeed:75},wellbeing:{comfort:70,safety:82},status:{intoxication:0},contacts:{paws:{}},causes:{intoxication:null,contacts:{paws:{}}},traits:{curious:.7,careful:.62,social:.78},held:null,carrying:null,pendingInteraction:null,plan:null}
      },
      events:[], causes:{}, thoughts:{}
    };
  }

  window.SimWorld={RESOURCE_TYPES,ZH,DATA_ZH,createInitialState};
})();
