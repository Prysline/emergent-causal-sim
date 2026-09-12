(() => {
  const E=window.SimEngine,F=window.SimFurniture,SP=window.SimSpatial;
  if(!E||!F||E.__seatingV102)return;
  E.__seatingV102=true;

  const baseTick=E.tick.bind(E);
  const baseReset=E.reset.bind(E);
  const basePlanLabel=E.planLabel.bind(E);
  let seatingEventSeq=0;

  const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
  const seatPos=seat=>seat?.footprint?.[0] ? {...seat.footprint[0]} : null;

  function addEvent(st,text,type='normal',data={}){
    const id=`q${++seatingEventSeq}`;
    const e={id,time:E.timeStr(),text,type,causeIds:[],data:{...data,system:'seating'}};
    st.events.unshift(e);st.causes[id]=e;
    if(st.events.length>260){const old=st.events.pop();if(old?.id?.startsWith('q'))delete st.causes[old.id];}
    return id;
  }

  function seatOccupied(st,seat,agentId){
    const p=seatPos(seat);if(!p)return true;
    return Object.values(st.agents).some(a=>a.id!==agentId&&same(a.position,p));
  }

  function seatReserved(st,seatId,agentId){
    return Object.values(st.agents).some(a=>{
      if(a.id===agentId)return false;
      if(a.seatedOn===seatId)return true;
      if(a.__seatTarget===seatId)return true;
      return a.plan?.__seatId===seatId;
    });
  }

  function isOnSeat(a,seat){const p=seatPos(seat);return !!p&&same(a.position,p);}

  function mealSeats(st){return Object.values(st.furniture||{}).filter(f=>f.kind==='chair'&&f.mealSeat);}

  function chooseMealSeat(a,st,excludeId=null){
    const list=mealSeats(st).filter(seat=>seat.id!==excludeId&&!seatOccupied(st,seat,a.id)&&!seatReserved(st,seat.id,a.id));
    list.sort((x,y)=>{
      const px=seatPos(x),py=seatPos(y);
      const dx=SP?.astar&&px?(SP.astar(a.position,px,a.id).length||999):Math.abs(a.position.x-px.x)+Math.abs(a.position.y-px.y);
      const dy=SP?.astar&&py?(SP.astar(a.position,py,a.id).length||999):Math.abs(a.position.x-py.x)+Math.abs(a.position.y-py.y);
      return dx-dy;
    });
    return list[0]||null;
  }

  function clearSeatIfMoved(a,st){
    if(!a.seatedOn)return;
    const seat=st.furniture?.[a.seatedOn];
    if(!seat||!isOnSeat(a,seat))delete a.seatedOn;
  }

  function restoreEatingPlan(a,st,reason=null){
    const eat=a.__eatAfterSeat;if(!eat)return;
    a.plan=eat;
    delete a.__eatAfterSeat;
    delete a.__seatTarget;
    if(reason)addEvent(st,`${a.name}${reason}，改為直接站著吃。`,'normal',{action:'seatFallback',agent:a.id});
  }

  function startSeatMove(a,eatPlan,seat,st){
    const p=seatPos(seat);if(!p)return false;
    a.__eatAfterSeat=eatPlan;
    a.__seatTarget=seat.id;
    a.plan={intent:'wander',phase:'move',targetZone:'table',oneShot:true,__seatMove:true,__seatId:seat.id,__spatialGoal:p,__spatialGoalZone:'table'};
    addEvent(st,`${a.name}準備吃東西，先往${seat.name}坐下。`,'normal',{action:'seekSeat',seat:seat.id,location:a.location});
    return true;
  }

  function maybeStartSeatMove(a,st){
    const p=a.plan;
    if(a.kind!=='human'||!p||p.intent!=='eat'||p.__seatDecision)return;
    p.__seatDecision=true;
    if(a.needs.hunger>=82)return;

    if(a.seatedOn){
      const seat=st.furniture?.[a.seatedOn];
      if(seat?.mealSeat&&isOnSeat(a,seat))return;
    }

    const seat=chooseMealSeat(a,st);
    if(seat)startSeatMove(a,p,seat,st);
  }

  function maintainSeatMove(a,st){
    if(!a.__eatAfterSeat)return;
    const seat=st.furniture?.[a.__seatTarget];
    if(!seat){restoreEatingPlan(a,st,'找不到原本的座位');return;}

    if(seatOccupied(st,seat,a.id)){
      const alt=chooseMealSeat(a,st,seat.id);
      if(alt){
        const pos=seatPos(alt);
        a.__seatTarget=alt.id;
        if(a.plan?.__seatMove){
          a.plan.__seatId=alt.id;
          a.plan.__spatialGoal=pos;
          a.plan.__spatialGoalZone='table';
        }
        addEvent(st,`${a.name}發現${seat.name}被占用，改去${alt.name}。`,'normal',{action:'switchSeat',from:seat.id,to:alt.id,location:a.location});
      }else restoreEatingPlan(a,st,'找不到空的餐椅');
    }
  }

  function beforeTick(st){
    for(const a of Object.values(st.agents)){
      clearSeatIfMoved(a,st);
      maintainSeatMove(a,st);
      if(!a.__eatAfterSeat)maybeStartSeatMove(a,st);
    }
  }

  function afterTick(st){
    for(const a of Object.values(st.agents)){
      clearSeatIfMoved(a,st);
      if(!a.__eatAfterSeat)continue;
      const seat=st.furniture?.[a.__seatTarget];
      if(seat&&isOnSeat(a,seat)){
        const eat=a.__eatAfterSeat;
        a.seatedOn=seat.id;
        a.plan=eat;
        delete a.__eatAfterSeat;
        delete a.__seatTarget;
        addEvent(st,`${a.name}坐到${seat.name}，準備從餐桌拿食物。`,'normal',{action:'sitForMeal',seat:seat.id,location:a.location});
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
      delete a.seatedOn;delete a.__eatAfterSeat;delete a.__seatTarget;
    }
    return st;
  }

  E.tick=tick;
  E.reset=reset;
  E.planLabel=a=>{
    if(a.plan?.__seatMove){const s=F.get(a.plan.__seatId);return `吃東西・前往${s?.name||'餐椅'}`;}
    const base=basePlanLabel(a);
    if(a.plan?.intent==='eat'&&a.seatedOn){const s=F.get(a.seatedOn);return `${base}・坐在${s?.name||'座位'}`;}
    return base;
  };
})();