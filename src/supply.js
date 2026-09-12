(() => {
  const E=window.SimEngine;
  if(!E||E.__supplyV9)return;
  E.__supplyV9=true;

  const baseTick=E.tick.bind(E);
  const baseReset=E.reset.bind(E);
  const basePlanLabel=E.planLabel.bind(E);
  const basePhaseLabel=E.phaseLabel.bind(E);
  let supplyEventSeq=0;

  const CONFIG={
    triggerFood:70,
    targetFood:150,
    minWorkTicks:7,
    maxWorkTicks:10,
    minYield:32,
    maxYield:46,
    workExertion:.72
  };

  function initSupply(st){
    st.supply??={
      workerId:null,
      trips:0,
      totalProduced:0,
      lastResult:null,
      rngState:((st.seed^0x51f15e5d)>>>0)||0x51f15e5d,
      config:{...CONFIG}
    };
    st.supply.config={...CONFIG,...(st.supply.config||{})};
    return st.supply;
  }

  function srandom(st){
    const s=initSupply(st);
    s.rngState=(s.rngState+0x6D2B79F5)>>>0;
    let t=s.rngState;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  }
  function srand(st,min,max){return min+srandom(st)*(max-min)}
  function sint(st,min,max){return Math.floor(srand(st,min,max+1))}

  function foodStock(st=E.getState()){
    return (st.containers.mealTray?.contents?.food||0)+(st.containers.foodPantry?.contents?.food||0);
  }

  function addSupplyEvent(text,type='normal',data={},causeIds=[]){
    const st=E.getState();
    const id=`s${++supplyEventSeq}`;
    const e={id,time:E.timeStr(),text,type,causeIds:[...new Set(causeIds.filter(Boolean))],data:{...data,system:'supply'}};
    st.events.unshift(e);
    st.causes[id]=e;
    if(st.events.length>260){
      const old=st.events.pop();
      if(old?.id?.startsWith('s'))delete st.causes[old.id];
    }
    return id;
  }

  function criticalNeed(a){
    if(a.needs.fatigue>=82)return '太疲勞';
    if(a.needs.thirst>=88)return '太口渴';
    if(a.needs.hunger>=88)return '太餓';
    return null;
  }

  function workScore(a,stock,st){
    const cfg=initSupply(st).config;
    const shortage=Math.max(0,cfg.targetFood-stock);
    return shortage*1.05
      -a.needs.fatigue*.72
      -a.needs.thirst*.34
      -a.needs.hunger*.30
      +(a.traits.careful??.5)*8
      +(a.wellbeing.safety??70)*.06;
  }

  function startFoodSupply(a,st){
    const supply=initSupply(st),stock=foodStock(st);
    const requiredTicks=sint(st,supply.config.minWorkTicks,supply.config.maxWorkTicks);
    const amount=Math.round(srand(st,supply.config.minYield,supply.config.maxYield)*10)/10;
    const score=workScore(a,stock,st);
    a.supplyTask={kind:'food',phase:'toExit',requiredTicks,workTicks:0,amount,startedTick:st.tick,startStock:stock};
    supply.workerId=a.id;
    st.thoughts[a.id]={
      options:[{id:'supplyFood',score,why:[`食物總庫存只剩 ${Math.round(stock)}`,`補給目標約 ${supply.config.targetFood}`,`目前疲勞 ${Math.round(a.needs.fatigue)}、口渴 ${Math.round(a.needs.thirst)}、飢餓 ${Math.round(a.needs.hunger)}`]}],
      pick:{id:'supplyFood',score,why:[`食物總庫存只剩 ${Math.round(stock)}`,'需要有人花時間與體力把外部食物帶回來']},
      tick:st.tick
    };
    addSupplyEvent(`${a.name}注意到食物庫存偏低，決定外出補給。`,'warn',{action:'supplyFood',phase:'plan',target:'frontDoor',stock});
  }

  function chooseWorker(st){
    const supply=initSupply(st),stock=foodStock(st);
    if(supply.workerId||stock>=supply.config.triggerFood)return null;
    const candidates=Object.values(st.agents).filter(a=>a.kind==='human'&&!a.supplyTask&&!a.plan&&!a.held&&!a.carrying&&!criticalNeed(a));
    if(!candidates.length)return null;
    candidates.sort((a,b)=>workScore(b,stock,st)-workScore(a,stock,st));
    const best=candidates[0];
    if(workScore(best,stock,st)<18)return null;
    startFoodSupply(best,st);
    return best;
  }

  function preciseGoal(a,targetId,targetZone){
    const F=window.SimFurniture;
    if(!F?.interactionGoal)return null;
    const goal=F.interactionGoal(targetId,a.id);
    return goal?{...goal}:null;
  }

  function atPreciseTarget(a,targetId,fallbackZone){
    const F=window.SimFurniture;
    if(F?.isAtInteraction)return F.isAtInteraction(a.id,targetId);
    return a.location===fallbackZone;
  }

  function assignNativeMove(a,targetZone,targetId){
    const goal=preciseGoal(a,targetId,targetZone);
    const p=a.plan;
    if(p?.__supplyMove&&p.targetZone===targetZone&&p.__supplyTarget===targetId){
      if(goal){p.__spatialGoal=goal;p.__spatialGoalZone=targetZone;}
      return;
    }
    a.plan={intent:'wander',phase:'move',targetZone,oneShot:true,__supplyMove:true,__supplyTarget:targetId};
    if(goal){a.plan.__spatialGoal=goal;a.plan.__spatialGoalZone=targetZone;}
  }

  function setWorkPlan(a){
    if(a.plan?.intent==='supplyWork')return;
    a.plan={intent:'supplyWork',phase:'supplyWork',started:E.getState().tick};
  }

  function cancelTask(a,reason){
    const st=E.getState(),s=initSupply(st),t=a.supplyTask;
    if(!t)return;
    addSupplyEvent(`${a.name}${reason}，暫停這次外出補給。`,'warn',{action:'supplyFood',phase:'cancel',reason,stock:foodStock(st)});
    a.plan=null;
    a.supplyTask=null;
    if(s.workerId===a.id)s.workerId=null;
  }

  function prepareBeforeTick(st){
    const s=initSupply(st);
    if(!s.workerId)chooseWorker(st);
    const worker=s.workerId?st.agents[s.workerId]:null;
    if(!worker?.supplyTask){if(s.workerId)s.workerId=null;return;}
    const t=worker.supplyTask;

    if(t.phase==='toExit'){
      if(atPreciseTarget(worker,'frontDoor','doorway')){
        t.phase='work';worker.plan=null;setWorkPlan(worker);
      }else assignNativeMove(worker,'doorway','frontDoor');
      return;
    }
    if(t.phase==='work'){
      const blocked=criticalNeed(worker);
      if(blocked){cancelTask(worker,blocked);return;}
      setWorkPlan(worker);
      return;
    }
    if(t.phase==='return'){
      if(atPreciseTarget(worker,'foodPantry','pantry')){
        setWorkPlan(worker);
      }else assignNativeMove(worker,'pantry','foodPantry');
    }
  }

  function depositFood(a){
    const st=E.getState(),s=initSupply(st),t=a.supplyTask,pantry=st.containers.foodPantry;
    if(!t||!pantry)return;
    if(!atPreciseTarget(a,'foodPantry','pantry'))return;
    const carrying=a.carrying?.resource==='food'?a.carrying.amount:0;
    const used=Object.values(pantry.contents||{}).reduce((x,y)=>x+y,0);
    const room=Math.max(0,pantry.capacity-used);
    const moved=Math.min(room,carrying);
    pantry.contents.food=(pantry.contents.food||0)+moved;
    const leftover=Math.max(0,carrying-moved);
    if(leftover>.05){
      a.carrying.amount=leftover;
      addSupplyEvent(`${a.name}走到食物櫃旁，把 ${moved.toFixed(1)} 單位食物放進食物櫃，但還有 ${leftover.toFixed(1)} 單位暫時放不下。`,'warn',{action:'supplyFood',phase:'deposit',resource:'food',amount:moved,leftover,location:'pantry'});
    }else{
      a.carrying=null;
      addSupplyEvent(`${a.name}走到食物櫃旁，把外出帶回的 ${moved.toFixed(1)} 單位食物收進食物櫃。`,'good',{action:'supplyFood',phase:'deposit',resource:'food',amount:moved,location:'pantry',stock:foodStock(st)});
    }
    s.trips++;
    s.totalProduced+=moved;
    s.lastResult={workerId:a.id,amount:moved,tick:st.tick,stock:foodStock(st)};
    a.supplyTask=null;
    a.plan=null;
    if(s.workerId===a.id)s.workerId=null;
  }

  function advanceAfterTick(st){
    const s=initSupply(st),worker=s.workerId?st.agents[s.workerId]:null;
    if(!worker?.supplyTask){if(s.workerId)s.workerId=null;return;}
    const t=worker.supplyTask;

    if(t.phase==='toExit'&&atPreciseTarget(worker,'frontDoor','doorway')){
      t.phase='work';worker.plan=null;
      addSupplyEvent(`${worker.name}走到大門，從門口離開房間並開始外出補給。`,'normal',{action:'supplyFood',phase:'workStart',location:'doorway',target:'frontDoor'});
      return;
    }

    if(t.phase==='work'){
      const blocked=criticalNeed(worker);
      if(blocked){cancelTask(worker,blocked);return;}
      E.applyExertion(worker,s.config.workExertion,'外出補給工作',{thirstFactor:.30,hungerFactor:.10});
      t.workTicks++;
      if(t.workTicks>=t.requiredTicks){
        worker.carrying={resource:'food',amount:t.amount};
        t.phase='return';worker.plan=null;
        addSupplyEvent(`${worker.name}完成外出補給，帶著 ${t.amount.toFixed(1)} 單位食物回來。`,'good',{action:'supplyFood',phase:'return',resource:'food',amount:t.amount,target:'foodPantry'});
      }
      return;
    }

    if(t.phase==='return'&&atPreciseTarget(worker,'foodPantry','pantry'))depositFood(worker);
  }

  function tick(){
    const st=E.getState();
    prepareBeforeTick(st);
    baseTick();
    advanceAfterTick(E.getState());
  }

  function reset(seed){
    supplyEventSeq=0;
    const st=baseReset(seed);
    initSupply(st);
    for(const a of Object.values(st.agents))delete a.supplyTask;
    addSupplyEvent(`v10.1 補給：食物不足會觸發外出補給；角色必須走到大門才算出門，回程也必須走到食物櫃互動位置才會入庫。`,'system',{action:'supplySystem',stock:foodStock(st)});
    return st;
  }

  function supplyStatus(){
    const st=E.getState(),s=initSupply(st),worker=s.workerId?st.agents[s.workerId]:null;
    return {stock:foodStock(st),trigger:s.config.triggerFood,target:s.config.targetFood,workerId:s.workerId,workerName:worker?.name||null,task:worker?.supplyTask||null,trips:s.trips,totalProduced:s.totalProduced,lastResult:s.lastResult};
  }

  E.ZH.supplyFood='外出補給食物';
  E.ZH.supplyWork='補給勞動';
  E.tick=tick;
  E.reset=reset;
  E.supplyStatus=supplyStatus;
  E.phaseLabel=p=>p==='supplyWork'?'補給勞動中':basePhaseLabel(p);
  E.planLabel=a=>{
    const t=a.supplyTask;
    if(!t)return basePlanLabel(a);
    if(t.phase==='toExit')return '外出補給食物・前往大門';
    if(t.phase==='work')return `外出補給食物・工作中 ${t.workTicks}/${t.requiredTicks}`;
    if(t.phase==='return')return `外出補給食物・搬運到食物櫃${a.carrying?`・${Math.round(a.carrying.amount*10)/10}`:''}`;
    return '外出補給食物';
  };

  initSupply(E.getState());
  addSupplyEvent(`v10.1 補給模組已啟用：食物低於 ${CONFIG.triggerFood} 時，角色可能安排外出補給。`,'system',{action:'supplySystem',stock:foodStock(E.getState())});
})();
