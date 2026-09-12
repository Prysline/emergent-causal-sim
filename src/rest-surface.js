(() => {
  const E=window.SimEngine,F=window.SimFurniture,SP=window.SimSpatial;
  if(!E||!F||!SP||E.__restSurfaceV104)return;
  E.__restSurfaceV104=true;

  const baseTick=E.tick.bind(E);
  const baseReset=E.reset.bind(E);
  const basePlanLabel=E.planLabel.bind(E);
  let restEventSeq=0;

  const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
  const slotPos=slot=>slot?.position?{...slot.position}:null;

  function addEvent(st,text,type='normal',data={}){
    const id=`r${++restEventSeq}`;
    const e={id,time:E.timeStr(),text,type,causeIds:[],data:{...data,system:'rest-surface'}};
    st.events.unshift(e);st.causes[id]=e;
    if(st.events.length>260){const old=st.events.pop();if(old?.id?.startsWith('r'))delete st.causes[old.id];}
    return id;
  }

  function furnitureLabel(slot){
    const f=slot&&F.get(slot.furnitureId);
    return `${f?.name||'座位'}${slot?.label&&slot.label!=='座位'?`的${slot.label}`:''}`;
  }

  function isOnSlot(a,slot){return !!slot?.position&&same(a.position,slot.position);}

  function clearSeatIfMoved(a){
    if(!a.seatSlot)return;
    const slot=F.getSlot(a.seatSlot);
    if(!slot||!isOnSlot(a,slot)){
      delete a.seatSlot;
      delete a.seatedOn;
    }
  }

  function restSlotsFor(a,st){
    return F.allSlots().filter(slot=>slot.canRest&&F.slotAllowsAgent(slot,a));
  }

  function chooseRestSlot(a,st,excludeId=null,targetZone=a.plan?.targetZone||null){
    const list=restSlotsFor(a,st).filter(slot=>slot.id!==excludeId&&F.slotAvailable(slot.id,a.id)).map(slot=>{
      const p=slotPos(slot),path=p?SP.astar(a.position,p,a.id):[];
      if(!path.length)return null;
      const physicalCrowding=Object.values(st.agents).filter(x=>x.id!==a.id&&same(x.position,p)).length;
      const zonePenalty=targetZone&&slot.zone!==targetZone?22:0;
      const qualityBonus=(slot.restQuality||0)*12;
      return {slot,pathLength:path.length-1,physicalCrowding,score:zonePenalty+physicalCrowding*8+(path.length-1)-qualityBonus};
    }).filter(Boolean);
    list.sort((x,y)=>x.score-y.score||x.pathLength-y.pathLength);
    return list[0]?.slot||null;
  }

  function restoreRestPlan(a,st,reason=null){
    const rest=a.__restAfterSlot;if(!rest)return;
    a.plan=rest;
    delete a.__restAfterSlot;
    delete a.__slotTarget;
    if(reason)addEvent(st,`${a.name}${reason}，改為直接在原地休息。`,'normal',{action:'restSlotFallback',agent:a.id});
  }

  function startRestSlotMove(a,restPlan,slot,st){
    const p=slotPos(slot);if(!p)return false;
    a.__restAfterSlot=restPlan;
    a.__slotTarget=slot.id;
    a.plan={intent:'wander',phase:'move',targetZone:slot.zone,oneShot:true,__restSeatMove:true,__restSlotId:slot.id,__spatialGoal:p,__spatialGoalZone:slot.zone};
    addEvent(st,`${a.name}想休息，先往${furnitureLabel(slot)}。`,'normal',{action:'seekRestSlot',slot:slot.id,furniture:slot.furnitureId,location:a.location});
    return true;
  }

  function releaseSeat(a){delete a.seatSlot;delete a.seatedOn;}

  function maybeStartRestSlotMove(a,st){
    const p=a.plan;
    if(a.kind!=='human'||!p||p.intent!=='rest'||p.__restSlotDecision)return;

    if(a.seatSlot){
      const slot=F.getSlot(a.seatSlot);
      if(slot?.canRest&&isOnSlot(a,slot)){
        p.__restSlotDecision=true;
        p.__restSlotId=slot.id;
        p.targetZone=slot.zone;
        p.__spatialGoal=slotPos(slot);
        p.__spatialGoalZone=slot.zone;
        return;
      }
    }

    p.__restSlotDecision=true;
    const slot=chooseRestSlot(a,st,null,p.targetZone);
    if(slot){startRestSlotMove(a,p,slot,st);return;}
    p.__restStanding=true;
    addEvent(st,`${a.name}沒有找到空的休息座位，只好先停下來休息。`,'normal',{action:'restSlotFallback',reason:'no_available_rest_slot',agent:a.id,location:a.location});
  }

  function maintainRestSlotMove(a,st){
    if(!a.__restAfterSlot)return;
    const slot=F.getSlot(a.__slotTarget);
    if(!slot){restoreRestPlan(a,st,'找不到原本的休息位置');return;}
    if(!F.slotAvailable(slot.id,a.id)){
      const alt=chooseRestSlot(a,st,slot.id,a.__restAfterSlot?.targetZone);
      if(alt){
        a.__slotTarget=alt.id;
        if(a.plan?.__restSeatMove){
          a.plan.__restSlotId=alt.id;
          a.plan.targetZone=alt.zone;
          a.plan.__spatialGoal=slotPos(alt);
          a.plan.__spatialGoalZone=alt.zone;
        }
        addEvent(st,`${a.name}發現原本的休息位置被占用，改去${furnitureLabel(alt)}。`,'normal',{action:'switchRestSlot',from:slot.id,to:alt.id,location:a.location});
      }else restoreRestPlan(a,st,'找不到其他空的休息座位');
    }
  }

  function reconsiderRestSlotAfterReplan(a,st){
    const p=a.plan;if(a.kind!=='human'||!p||p.intent!=='rest'||!p.__restSlotId)return;
    const slot=F.getSlot(p.__restSlotId);
    if(!slot||p.targetZone===slot.zone)return;
    releaseSeat(a);
    delete p.__restSlotId;
    delete p.__restSlotDecision;
    delete p.__spatialGoal;
    delete p.__spatialGoalZone;
  }

  function beforeTick(st){
    for(const a of Object.values(st.agents)){
      clearSeatIfMoved(a);
      reconsiderRestSlotAfterReplan(a,st);
      maintainRestSlotMove(a,st);
      if(!a.__restAfterSlot)maybeStartRestSlotMove(a,st);
    }
  }

  function patchRestEvents(st,oldIds){
    for(const e of st.events){
      if(oldIds.has(e.id)||e.data?.action!=='rest')continue;
      const a=Object.values(st.agents).find(x=>e.text?.startsWith(x.name));if(!a||a.kind!=='human')continue;
      const slot=a.seatSlot&&F.getSlot(a.seatSlot);
      if(slot&&isOnSlot(a,slot)){
        e.text=`${a.name}坐在${furnitureLabel(slot)}休息。`;
        Object.assign(e.data,{slot:slot.id,furniture:slot.furnitureId,posture:'sitting'});
      }else{
        e.text=`${a.name}停下來休息。`;
        Object.assign(e.data,{posture:'standing'});
      }
    }
  }

  function afterTick(st,oldIds){
    for(const a of Object.values(st.agents)){
      clearSeatIfMoved(a);
      if(!a.__restAfterSlot)continue;
      const slot=F.getSlot(a.__slotTarget);
      if(slot&&isOnSlot(a,slot)&&F.slotAvailable(slot.id,a.id)){
        const rest=a.__restAfterSlot;
        a.seatedOn=slot.furnitureId;
        a.seatSlot=slot.id;
        rest.__restSlotDecision=true;
        rest.__restSlotId=slot.id;
        rest.targetZone=slot.zone;
        rest.__spatialGoal=slotPos(slot);
        rest.__spatialGoalZone=slot.zone;
        a.plan=rest;
        delete a.__restAfterSlot;
        delete a.__slotTarget;
        addEvent(st,`${a.name}坐到${furnitureLabel(slot)}，開始休息。`,'normal',{action:'sitForRest',slot:slot.id,furniture:slot.furnitureId,location:a.location});
      }else if(!a.plan?.__restSeatMove){
        restoreRestPlan(a,st,'沒有成功坐到休息位置');
      }
    }
    patchRestEvents(st,oldIds);
  }

  function tick(){
    const st=E.getState(),oldIds=new Set(st.events.map(e=>e.id));
    beforeTick(st);
    baseTick();
    afterTick(E.getState(),oldIds);
  }

  function reset(seed){
    restEventSeq=0;
    const st=baseReset(seed);
    for(const a of Object.values(st.agents)){
      delete a.__restAfterSlot;delete a.__slotTarget;
    }
    return st;
  }

  E.tick=tick;
  E.reset=reset;
  E.planLabel=a=>{
    if(a.plan?.__restSeatMove){const slot=F.getSlot(a.plan.__restSlotId);return `休息・前往${furnitureLabel(slot)}`;}
    const base=basePlanLabel(a);
    if(a.plan?.intent==='rest'&&a.seatSlot){const slot=F.getSlot(a.seatSlot);return `${base}・${furnitureLabel(slot)}`;}
    return base;
  };
})();