(() => {
  const VERSION='world-authoring-v1';
  const pos=(x,y,z=0)=>({x,y,z});

  function buildDefaultCells(){
    const width=12,height=8,cells={};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const boundary=x===0||y===0||x===width-1||y===height-1;
      const door=x===0&&y===6;
      cells[x+','+y]={
        terrain:door?'doorway':boundary?'wall':'floor',
        material:boundary&&!door?'stone':'wood'
      };
    }
    return cells;
  }

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    for(const child of Object.values(value))deepFreeze(child);
    return value;
  }

  const DEFAULT_WORLD_AUTHORING={
    authoringSchema:VERSION,
    id:'mvp-default-house',
    label:'Current MVP Default World',
    scenario:{startDay:1,startMinute:12*60},
    map:{width:12,height:8,layers:[{z:0,cells:buildDefaultCells()}]},
    furniture:{
      diningTable:{id:'diningTable',name:'餐桌',icon:'▰',kind:'table',blocksMovement:true,supportsObjects:true,value:30,
        footprint:[pos(5,2),pos(6,2),pos(5,3),pos(6,3)],displayAt:pos(5,2),slots:[]},
      chairNW:{id:'chairNW',name:'餐椅 A',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
        footprint:[pos(4,2)],displayAt:pos(4,2),slots:[{id:'chairNW:seat',label:'座位',position:pos(4,2),canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
      chairNE:{id:'chairNE',name:'餐椅 B',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
        footprint:[pos(7,2)],displayAt:pos(7,2),slots:[{id:'chairNE:seat',label:'座位',position:pos(7,2),canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
      chairSW:{id:'chairSW',name:'餐椅 C',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
        footprint:[pos(4,3)],displayAt:pos(4,3),slots:[{id:'chairSW:seat',label:'座位',position:pos(4,3),canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
      chairSE:{id:'chairSE',name:'餐椅 D',icon:'🪑',kind:'chair',blocksMovement:false,value:10,
        footprint:[pos(7,3)],displayAt:pos(7,3),slots:[{id:'chairSE:seat',label:'座位',position:pos(7,3),canRest:true,mealSeat:true,restQuality:.48,allowKinds:['human']}]},
      sofa:{id:'sofa',name:'沙發',icon:'🛋️',kind:'sofa',blocksMovement:false,value:35,
        footprint:[pos(9,2),pos(10,2)],displayAt:pos(9,2),slots:[
          {id:'sofa:left',label:'左側',position:pos(9,2),canRest:true,canSleep:true,restQuality:.82,sleepQuality:.62,allowKinds:['human','cat']},
          {id:'sofa:right',label:'右側',position:pos(10,2),canRest:true,canSleep:true,restQuality:.82,sleepQuality:.62,allowKinds:['human','cat']}
        ]},
      bed:{id:'bed',name:'雙人床',icon:'🛏️',kind:'bed',blocksMovement:false,value:55,
        footprint:[pos(9,5),pos(10,5)],displayAt:pos(9,5),slots:[
          {id:'bed:left',label:'左側',position:pos(9,5),canRest:true,canSleep:true,restQuality:.98,sleepQuality:1,restPosture:'lying',allowKinds:['human']},
          {id:'bed:right',label:'右側',position:pos(10,5),canRest:true,canSleep:true,restQuality:.98,sleepQuality:1,restPosture:'lying',allowKinds:['human']}
        ]},
      frontDoor:{id:'frontDoor',name:'大門',icon:'🚪',kind:'door',blocksMovement:true,value:18,
        footprint:[pos(0,6)],displayAt:pos(0,6),slots:[{id:'frontDoor:inside',label:'門內',position:pos(1,6),canExit:true,allowKinds:['human','cat']}]}
    },
    entities:{
      containers:{
        mealTray:{id:'mealTray',name:'現成食物',icon:'🍲',roles:['readyFood'],capacity:100,emptyLoad:2.5,preferredResource:'food',contents:{food:68},portable:false,canEatFrom:true,access:1,position:pos(5,2),supportId:'diningTable',restock:{resource:'food',low:18,strategy:'logisticsContainer',sourceRole:'foodReserve'},interactions:{serve:{mode:'supportReach'},eatFrom:{mode:'reach'}}},
        plateA:{id:'plateA',name:'餐盤 A',icon:'🍽️',roles:['servingDish'],capacity:12,emptyLoad:.35,contents:{},portable:true,servingDish:true,canEatFrom:true,position:pos(5,2),supportId:'diningTable',interactions:{eatFrom:{mode:'reach'}}},
        plateB:{id:'plateB',name:'餐盤 B',icon:'🍽️',roles:['servingDish'],capacity:12,emptyLoad:.35,contents:{},portable:true,servingDish:true,canEatFrom:true,position:pos(6,3),supportId:'diningTable',interactions:{eatFrom:{mode:'reach'}}},
        foodPantry:{id:'foodPantry',name:'食物櫃',icon:'🗄️',roles:['foodReserve','externalSupplyDestination'],capacity:200,emptyLoad:8,preferredResource:'food',contents:{food:140},portable:false,access:1,position:pos(2,2)},
        basket:{id:'basket',name:'搬運籃',icon:'🧺',roles:['logisticsContainer'],capacity:55,emptyLoad:.8,contents:{},portable:true,transportResources:['food'],position:pos(3,2),interactions:{pickup:{mode:'occupy'},receive:{mode:'reach'},deposit:{mode:'reach'}}},
        waterBucket:{id:'waterBucket',name:'水桶',icon:'💧',roles:['waterReserve','refillable','drinkSource'],capacity:100,emptyLoad:1.3,preferredResource:'water',contents:{water:72},portable:true,canDrinkFrom:true,drinkPreference:.12,access:1,position:pos(5,5),restock:{resource:'water',low:24,strategy:'carryContainer',sourceRole:'resourceSource'},interactions:{pickup:{mode:'occupy'},drinkFrom:{mode:'reach'}}},
        cupA:{id:'cupA',name:'白色杯子',icon:'🥛',roles:['drinkVessel'],capacity:35,emptyLoad:.25,contents:{alcohol:20},portable:true,canDrinkFrom:true,drinkPreference:.95,position:pos(6,2),supportId:'diningTable'},
        cupB:{id:'cupB',name:'藍色杯子',icon:'🥛',roles:['drinkVessel'],capacity:35,emptyLoad:.25,contents:{},portable:true,canDrinkFrom:true,drinkPreference:.95,position:pos(6,3),supportId:'diningTable'},
        alcoholBottle:{id:'alcoholBottle',name:'酒瓶',icon:'🍾',roles:['drinkSource'],capacity:160,emptyLoad:.65,preferredResource:'alcohol',contents:{alcohol:120},portable:true,canDrinkFrom:true,drinkPreference:.28,position:pos(5,3),supportId:'diningTable'}
      },
      sources:{
        tap:{id:'tap',name:'水龍頭',icon:'🚰',roles:['resourceSource'],resource:'water',infinite:true,position:pos(6,5),interactions:{fill:{mode:'port'}},interactionPorts:[{id:'tap:west',label:'水龍頭左側',position:pos(5,5),edge:'east',affordances:['fill']}]}
      }
    },
    residents:{
      zhen:{id:'zhen',name:'阿真',kind:'human',traits:{alcoholLike:.25,social:.55,careful:.82,animalAffinity:.72,exertionSensitivity:.95,recoveryRate:1.05},initial:{needs:{hunger:34,thirst:29,fatigue:41,sleepNeed:34,social:38},wellbeing:{comfort:58,safety:80},status:{intoxication:0},placement:{mode:'exact',node:pos(9,3)},posture:{kind:'standing'}}},
      zhou:{id:'zhou',name:'老周',kind:'human',traits:{alcoholLike:.72,social:.32,careful:.48,animalAffinity:.46,exertionSensitivity:1.05,recoveryRate:.95},initial:{needs:{hunger:31,thirst:62,fatigue:46,sleepNeed:40,social:24},wellbeing:{comfort:55,safety:80},status:{intoxication:0},placement:{mode:'exact',node:pos(7,3)},posture:{kind:'standing'}}},
      orange:{id:'orange',name:'橘子',kind:'cat',traits:{curious:.7,careful:.62,social:.78,exertionSensitivity:.90,recoveryRate:1.10},initial:{needs:{hunger:26,thirst:22,fatigue:30,sleepNeed:44,social:28,groomingNeed:75},wellbeing:{comfort:70,safety:82},status:{intoxication:0},placement:{mode:'exact',node:pos(2,6)},posture:{kind:'standing'}}}
    }
  };

  window.SimWorldAuthoring={VERSION,DEFAULT_WORLD_AUTHORING:deepFreeze(DEFAULT_WORLD_AUTHORING)};
})();