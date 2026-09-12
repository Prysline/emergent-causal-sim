(() => {
  const E=window.SimEngine,F=window.SimFurniture,SP=window.SimSpatial;
  if(!E||!F||E.__seatingV102)return;
  E.__seatingV102=true;

  const baseTick=E.tick.bind(E);
  const baseReset=E.reset.bind(E);
  const basePlanLabel=E.planLabel.bind(E);
  let seatingEventSeq=0;

  const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
  const slotPos=slot=>slot?.position?{...slot.position}:null;

  function addEvent(st,text,type='normal',data={}){
    const id=`q${++seatingEventSeq}`;
    const e={id,time:E.timeStr(),text,type,causeIds:[],data:{...data,system:'seating'}};
    st.events.unshift(e);st.causes[id]=e;
    if(st.events.length>260){const old=st.events.pop();if(old?.id?.startsWith('q'))delete st.causes[old.id];}
    return id;
  }

  function isOnSlot(a,slot){return !!slot?.position&&same(a.position,slot.position);}
  function mealSlots(st){
    return F.allSlots().filter(slot=>slot.mealSeat&&F.slotAllowsAgent(slot,st.agents.zhen||Object.values(st.agents)[0]));
  }

  function compatibleMealSlots(a,st){
    return mealSlots(st).filter(slot=>F.slotAllowsAgent(slot,a)&&F.slotCanInteract(slot.id,'mealTray'));
  }

  function chooseMealSlot(a,st,excludeId=null){
    const list=compatibleMealSlots(a,st).filter(slot=>slot.id!==excludeId&&F.slotAvailable(slot.id,a.id));
    list.sort((x,y)=>{
      const px=slotPos(x),py=slotPos(y);
      const dx=SP?.astar&&px?(SP.astar(a.position,px,a.id).length||999):Math.abs(a.position.x-px.x)+Math.abs(a.position.y-px.y);
      const dy=SP?.astar&&py?(SP.astar(a.position,py,a.id).length||999):Math.abs(a.position.x-py.x)+Math.abs(a.position.y-py.y);
      const cx=F.slotOccupant(x.id,a.id)?1:0,cy=F.slotOccupant(y.id,a.id)?1:0;
      return cx-cy||dx-dy;
    });
    return list[0]||null;
  }

  function clearSeatIfMoved(a){
    if(!a.seatSlot)return;
    const slot=F.getSlot(a.seatSlot);
    if(!slot||!isOnSlot(a,slot)){
      delete a.seatSlot;
      delete a.seatedOn;
    }
  }

  function restoreEatingPlan(a,st,reason=null){
    const eat=a.__eatAfterSeat;if(!eat)return;
    a.plan=eat;
    delete a.__eatAfterSeat;
    delete a.__slotTarget;
    if(reason)addEvent(st,`${a.name}${reason}，改為直接站著吃。`,'normal',{action:'seatFallback',agent:a.id});
  }

  function startSeatMove(a,eatPlan,slot,st){
    const p=slotPos(slot);if(!p)return false;
    a.__eatAfterSeat=eatPlan;
    a.__slotTarget=slot.id;
    a.plan={intent:'wander',phase:'move',targetZone:slot.zone||'table',oneShot:true,__seatMove:true,__seatSlotId:slot.id,__spatialGoal:p,__spatialGoalZone:slot.zone||'table'};
    const furniture=F.get(slot.furnitureId);
    addEvent(st,`${a.name}準備吃東西，先往${furniture?.name||'座位'}${slot.label&&slot.label!=='座位'?`的${slot.label}`:''}坐下。`,'normal',{action:'seekSeat',slot:slot.id,furniture:slot.furnitureId,location:a.location});
    return true;
  }

  function maybeStartSeatMove(a,st){
    const p=a.plan;
    if(a.kind!=='human'||!p||p.intent!=='eat'||p.__seatDecision)return;
    p.__seatDecision=true;
    if(a.needs.hunger>=82){
      addEvent(st,`${a.name}已經很餓，不再特地找座位，直接吃東西。`,'normal',{action:'seatFallback',reason:'very_hungry',agent:a.id});
      return;
    }

    if(a.seatSlot){
      const slot=F.getSlot(a.seatSlot);
      if(slot?.mealSeat&&F.slotCanInteract(slot.id,'mealTray')&&isOnSlot(a,slot))return;
    }

    const compatible=compatibleMealSlots(a,st);
    const slot=chooseMealSlot(a,st);
    if(slot){startSeatMove(a,p,slot,st);return;}
    if(compatible.length)addEvent(st,`${a.name}想坐著吃，但目前能直接拿到食物的座位沒有空位，決定站著吃。`,'normal',{action:'seatFallback',reason:'no_available_meal_slot',agent:a.id});
  }

  function maintainSeatMove(a,st){
    if(!a.__eatAfterSeat)return;
    const slot=F.getSlot(a.__slotTarget);
    if(!slot){restoreEatingPlan(a,st,'找不到原本的座位');return;}

    if(!F.slotAvailable(slot.id,a.id)){
      const alt=chooseMealSlot(a,st,slot.id);
      if(alt){
        const pos=slotPos(alt);
        a.__slotTarget=alt.id;
        if(a.plan?.__seatMove){
          a.plan.__seatSlotId=alt.id;
          a.plan.__spatialGoal=pos;
          a.plan.__spatialGoalZone=alt.zone||'table';
        }
        addEvent(st,`${a.name}發現原本的座位被占用，改去${F.get(alt.furnitureId)?.name||'另一個座位'}。`,'normal',{action:'switchSeat',from:slot.id,to:alt.id,location:a.location});
      }else restoreEatingPlan(a,st,'找不到空的合適餐椅');
    }
  }

  function beforeTick(st){
    for(const a of Object.values(st.agents)){
      clearSeatIfMoved(a);
      maintainSeatMove(a,st);
      if(!a.__eatAfterSeat)maybeStartSeatMove(a,st);
    }
  }

  function afterTick(st){
    for(const a of Object.values(st.agents)){
      clearSeatIfMoved(a);
      if(!a.__eatAfterSeat)continue;
      const slot=F.getSlot(a.__slotTarget);
      if(slot&&isOnSlot(a,slot)&&F.slotAvailable(slot.id,a.id)){
        const eat=a.__eatAfterSeat;
        a.seatedOn=slot.furnitureId;
        a.seatSlot=slot.id;
        a.plan=eat;
        delete a.__eatAfterSeat;
        delete a.__slotTarget;
        const furniture=F.get(slot.furnitureId);
        addEvent(st,`${a.name}坐到${furniture?.name||'座位'}${slot.label&&slot.label!=='座位'?`的${slot.label}`:''}，準備拿食物。`,'normal',{action:'sitForMeal',slot:slot.id,furniture:slot.furnitureId,location:a.location});
      }else if(!a.plan?.__seatMove){
        restoreEatingPlan(a,st,'沒有成功坐到座位');
      }
    }
  }

  function tick(){
    const st=E.getState();beforeTick(st);baseTick();afterTick(E.getState());
  }

  function reset(seed){
    seatingEventSeq=0;
    const st=baseReset(seed);
    for(const a of Object.values(st.agents)){
      delete a.seatedOn;delete a.seatSlot;delete a.__eatAfterSeat;delete a.__slotTarget;
    }
    return st;
  }

  E.tick=tick;
  E.reset=reset;
  E.planLabel=a=>{
    if(a.plan?.__seatMove){const slot=F.getSlot(a.plan.__seatSlotId),f=slot&&F.get(slot.furnitureId);return `吃東西・前往${f?.name||'餐椅'}${slot?.label&&slot.label!=='座位'?` ${slot.label}`:''}`;}
    const base=basePlanLabel(a);
    if(a.plan?.intent==='eat'&&a.seatSlot){const slot=F.getSlot(a.seatSlot),f=slot&&F.get(slot.furnitureId);return `${base}・坐在${f?.name||'座位'}${slot?.label&&slot.label!=='座位'?` ${slot.label}`:''}`;}
    return base;
  };
})();