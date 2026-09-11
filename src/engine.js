(() => {
  const {RESOURCE_TYPES,ZH,DATA_ZH,createInitialState}=window.SimWorld;
  let state=null, eventSeq=0;
  function rand(min=0,max=1){return min+Math.random()*(max-min)}
  function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,v))}
  function sumContents(obj){return Object.values(obj?.contents||{}).reduce((a,b)=>a+b,0)}
  function zoneName(id){return state.zones[id]?.name||id}
  function surfaceId(zoneId){return `floor:${zoneId}`}
  function coordination(a){
    const intoxPenalty=a.status.intoxication*.65;
    const fatiguePenalty=Math.max(0,a.needs.fatigue-65)*.35;
    return clamp(100-intoxPenalty-fatiguePenalty);
  }
  function zoneNoise(zoneId){return (state.zones[zoneId]?.baseNoise||0)+state.noiseEvents.filter(n=>n.zone===zoneId).reduce((s,n)=>s+n.amount,0)}
  function addNoise(zoneId,amount,ttl=2){state.noiseEvents.push({zone:zoneId,amount,ttl})}
  function floorLiquidAmount(zoneId){
    const floor=state.surfaces[surfaceId(zoneId)];
    return Object.entries(floor?.contents||{}).reduce((sum,[r,amt])=>sum+(RESOURCE_TYPES[r]?.phase==='liquid'?amt:0),0);
  }
  function floorSlipRisk(zoneId){return clamp(floorLiquidAmount(zoneId)*.16,0,14)}
  function precisionCheck(a,baseRisk=1,environmentRisk=0){
    const coord=coordination(a), careful=a.traits.careful??.55;
    const ordinaryRisk=baseRisk*(1.18-careful*.36);
    const impairmentRisk=Math.max(0,95-coord)*.55;
    const failRisk=clamp(ordinaryRisk+impairmentRisk+environmentRisk,.1,75);
    const success=100-failRisk, roll=rand(0,100);
    return {success,failRisk,roll,ok:roll<=success,coord,baseRisk,environmentRisk};
  }
  function timeStr(minute=state.minute){const h=Math.floor(minute/60)%24,m=minute%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`}
  function addEvent(text,type='normal',causeIds=[],data={}){
    const id='e'+(++eventSeq); const e={id,time:timeStr(),text,type,causeIds:[...new Set(causeIds.filter(Boolean))],data};
    state.events.unshift(e); state.causes[id]=e; if(state.events.length>260) state.events.pop(); return id;
  }

  function objectLocation(id){
    if(state.containers[id]){
      const c=state.containers[id];
      if(c.heldBy&&state.agents[c.heldBy]) return state.agents[c.heldBy].location;
      return c.location;
    }
    if(state.sources[id]) return state.sources[id].location;
    return null;
  }
  function endpoint(id){
    if(state.containers[id]) return {kind:'container',id,obj:state.containers[id],contents:state.containers[id].contents};
    if(state.sources[id]) return {kind:'source',id,obj:state.sources[id]};
    if(state.surfaces[id]) return {kind:'surface',id,obj:state.surfaces[id],contents:state.surfaces[id].contents};
    if(id.startsWith('contact:')){
      const [,agentId,zone]=id.split(':'); const a=state.agents[agentId];
      if(!a) return null; a.contacts[zone]??={}; a.causes.contacts[zone]??={};
      return {kind:'contact',id,obj:{name:`${a.name}・${zone==='paws'?'腳掌':zone==='hands'?'雙手':'腳'}`},contents:a.contacts[zone],agent:a,zone};
    }
    return null;
  }
  function endpointName(id){const ep=endpoint(id); return ep?.obj?.name||id}
  function resourceName(id){return RESOURCE_TYPES[id]?.name||id}
  function resourceIcon(id){return RESOURCE_TYPES[id]?.icon||'◻'}
  function amountAt(id,resourceId){
    const ep=endpoint(id); if(!ep) return 0;
    if(ep.kind==='source') return ep.obj.resource===resourceId ? (ep.obj.infinite?Infinity:(ep.obj.amount||0)) : 0;
    return ep.contents?.[resourceId]||0;
  }
  function capacityLeft(id){
    const ep=endpoint(id); if(!ep) return 0;
    if(ep.kind==='container') return Math.max(0,ep.obj.capacity-sumContents(ep.obj));
    if(ep.kind==='contact') return Math.max(0,100-Object.values(ep.contents).reduce((a,b)=>a+b,0));
    if(ep.kind==='surface') return Infinity;
    return 0;
  }
  function sourceCanProvide(id,resourceId){return amountAt(id,resourceId)>0}
  function takeResource(id,resourceId,amount){
    const ep=endpoint(id); if(!ep||amount<=0) return 0;
    if(ep.kind==='source'){
      if(ep.obj.resource!==resourceId) return 0;
      if(ep.obj.infinite) return amount;
      const moved=Math.min(amount,ep.obj.amount||0); ep.obj.amount-=moved; return moved;
    }
    const have=ep.contents[resourceId]||0, moved=Math.min(amount,have); ep.contents[resourceId]=Math.max(0,have-moved);
    if(ep.contents[resourceId]<.001) delete ep.contents[resourceId];
    return moved;
  }
  function putResource(id,resourceId,amount){
    const ep=endpoint(id); if(!ep||amount<=0||ep.kind==='source') return 0;
    const moved=Math.min(amount,capacityLeft(id)); ep.contents[resourceId]=(ep.contents[resourceId]||0)+moved; return moved;
  }
  function transferResource(resourceId,fromId,toId,amount){
    const available=amountAt(fromId,resourceId), room=capacityLeft(toId);
    const moved=Math.max(0,Math.min(amount,available,room)); if(!isFinite(moved)||moved<=0) return 0;
    const taken=takeResource(fromId,resourceId,moved); return putResource(toId,resourceId,taken);
  }
  function causeKey(endpointId,resourceId){return `${endpointId}|${resourceId}`}
  function setResourceCause(endpointId,resourceId,eventId){if(eventId)state.endpointCauses[causeKey(endpointId,resourceId)]=eventId;else delete state.endpointCauses[causeKey(endpointId,resourceId)]}
  function resourceCause(endpointId,resourceId){return state.endpointCauses[causeKey(endpointId,resourceId)]||null}
  function contactCause(a,zone,resourceId){return a.causes.contacts?.[zone]?.[resourceId]||null}
  function setContactCause(a,zone,resourceId,eventId){a.causes.contacts[zone]??={}; if(eventId)a.causes.contacts[zone][resourceId]=eventId;else delete a.causes.contacts[zone][resourceId]}

  function occupants(zoneId){return Object.values(state.agents).filter(a=>a.location===zoneId)}
  function crowdPenalty(zoneId,a){return occupants(zoneId).filter(x=>x.id!==a.id).length*(a.kind==='cat'?.25:.75)}
  function shortestPath(start,target,a,weighted=true){
    if(start===target) return [start];
    const dist={},prev={},todo=new Set(Object.keys(state.zones));
    for(const id of todo) dist[id]=Infinity; dist[start]=0;
    while(todo.size){
      let u=null,best=Infinity; for(const id of todo){if(dist[id]<best){best=dist[id];u=id;}}
      if(u===null)break; todo.delete(u); if(u===target)break;
      for(const v of state.zones[u].neighbors){
        if(!todo.has(v))continue;
        const hazard=a.kind==='human'?floorSlipRisk(v)*.08:0;
        const cost=1+(weighted?crowdPenalty(v,a)+hazard:0);
        const alt=dist[u]+cost; if(alt<dist[v]){dist[v]=alt;prev[v]=u;}
      }
    }
    if(!isFinite(dist[target])) return [start];
    const path=[target]; let cur=target; while(cur!==start){cur=prev[cur]; if(!cur)return [start];path.unshift(cur);} return path;
  }
  function moveToward(a,targetZone,reason='前往目標'){
    if(!targetZone||a.location===targetZone) return true;
    const normal=shortestPath(a.location,targetZone,a,false), weighted=shortestPath(a.location,targetZone,a,true);
    if(weighted.length<2) return false;
    const from=a.location,next=weighted[1];
    if(normal[1]&&normal[1]!==next) addEvent(`${a.name}避開較擁擠或濕滑的${zoneName(normal[1])}，改從${zoneName(next)}繞過去。`,'normal',[],{action:'reroute',from:from,to:next,target:targetZone});
    a.location=next;
    if(a.held&&state.containers[a.held]) state.containers[a.held].location=next;
    addEvent(`${a.name}從${zoneName(from)}走到${zoneName(next)}，${reason}。`,'normal',[],{action:'move',from:from,to:next,target:targetZone,location:next});
    onEnterZone(a,next);
    return a.location===targetZone;
  }
  function onEnterZone(a,zoneId){
    const sid=surfaceId(zoneId), floor=state.surfaces[sid];
    if(!floor) return;
    if(a.kind==='human'){
      const envRisk=floorSlipRisk(zoneId), needsCheck=a.status.intoxication>12||envRisk>.4||a.needs.fatigue>78;
      if(needsCheck){
        const pc=precisionCheck(a,.2,envRisk);
        if(!pc.ok){
          a.needs.comfort=clamp(a.needs.comfort-rand(4,9));a.needs.safety=clamp(a.needs.safety-rand(5,12));
          const slip=addEvent(`${a.name}在${zoneName(zoneId)}腳下一滑，踉蹌了一下。`,'warn',[resourceCause(sid,'water'),resourceCause(sid,'alcohol')].filter(Boolean),{reason:envRisk>pc.failRisk/2?'floor_hazard':'coordination',coordination:pc.coord,environmentRisk:envRisk,location:zoneId});
          if(a.held) spillContainerAt(a.held,rand(.2,.48),zoneId,[slip]);
        }
      }
    }else{
      for(const [r,amt] of Object.entries({...floor.contents})){
        if(RESOURCE_TYPES[r]?.phase!=='liquid'||amt<=0)continue;
        const picked=transferResource(r,sid,`contact:${a.id}:paws`,amt*rand(.12,.28));
        if(picked>0){const tr=addEvent(`${a.name}走過${zoneName(zoneId)}的${resourceName(r)}，腳掌沾上了一些。`,'warn',[resourceCause(sid,r)].filter(Boolean),{transfer:'floor_to_contact',resource:r,from:sid,to:`contact:${a.id}:paws`,amount:picked,location:zoneId});setContactCause(a,'paws',r,tr);}
      }
    }
  }

  function acquireLock(a,id){if(!state.locks[id]||state.locks[id]===a.id){state.locks[id]=a.id;return true;}return false}
  function releaseLock(a,id){if(state.locks[id]===a.id)delete state.locks[id]}
  function blockerName(id){const aid=state.locks[id];return aid?state.agents[aid]?.name:null}
  function holdContainer(a,id){
    const c=state.containers[id]; if(!c||!c.portable)return false;
    if(c.heldBy&&c.heldBy!==a.id)return false;
    if(a.held&&a.held!==id) releaseHeld(a);
    c.heldBy=a.id;c.location=a.location;a.held=id;return true;
  }
  function releaseHeld(a){if(!a.held)return;const c=state.containers[a.held];if(c){c.heldBy=null;c.location=a.location;}a.held=null}
  function compatibleDrinkContainers(resourceId){
    return Object.values(state.containers).filter(c=>c.portable&&c.canDrink&&sumContents(c)<=.1||c.portable&&c.canDrink&&Object.keys(c.contents).every(r=>r===resourceId));
  }
  function freeDrinkContainer(a,resourceId,preferFilled=true){
    const list=compatibleDrinkContainers(resourceId).filter(c=>!c.heldBy||c.heldBy===a.id);
    list.sort((x,y)=>{
      const xf=amountAt(x.id,resourceId)>0?1:0,yf=amountAt(y.id,resourceId)>0?1:0;
      if(preferFilled&&xf!==yf)return yf-xf;
      return shortestPath(a.location,objectLocation(x.id),a,true).length-shortestPath(a.location,objectLocation(y.id),a,true).length;
    });
    return list[0]||null;
  }

  function needDrift(){
    for(const a of Object.values(state.agents)){
      a.needs.hunger=clamp(a.needs.hunger+rand(.15,.55));
      a.needs.thirst=clamp(a.needs.thirst+rand(.25,.75));
      a.needs.fatigue=clamp(a.needs.fatigue+rand(.1,.5));
      a.needs.social=clamp(a.needs.social+rand(a.kind==='cat'?.08:.05,a.kind==='cat'?.28:.3));
      if(a.kind==='cat') a.needs.cleanliness=clamp(a.needs.cleanliness+rand(.08,.28));
      if(a.status.intoxication>0){a.status.intoxication=clamp(a.status.intoxication-rand(.15,.45));if(a.status.intoxication<1){a.status.intoxication=0;a.causes.intoxication=null;}}
      for(const [zone,contents] of Object.entries(a.contacts)) for(const [r,amt] of Object.entries(contents)){
        const def=RESOURCE_TYPES[r]; if(def?.phase==='liquid') contents[r]=Math.max(0,amt-rand(.02,.12));
        if(contents[r]<.25){delete contents[r];setContactCause(a,zone,r,null);}
      }
    }
    for(const s of Object.values(state.surfaces)) for(const [r,amt] of Object.entries({...s.contents})){
      const evap=RESOURCE_TYPES[r]?.evaporation||0;s.contents[r]=Math.max(0,amt-rand(0,evap));
      if(s.contents[r]<.15){delete s.contents[r];setResourceCause(s.id,r,null);}
    }
    state.noiseEvents.forEach(n=>n.ttl--); state.noiseEvents=state.noiseEvents.filter(n=>n.ttl>0);
  }

  function options(a){
    const o=[], food=amountAt('mealTray','food'), water=amountAt('waterBucket','water'), alcohol=amountAt('alcoholBottle','alcohol')+Object.values(state.containers).filter(c=>c.canDrink).reduce((s,c)=>s+amountAt(c.id,'alcohol'),0);
    if(a.kind==='human'){
      if(food>0) o.push({id:'eat',score:a.needs.hunger*1.16+17,why:['飢餓越高越想吃','現成食物仍有存量；但必須真的走到餐桌區']});
      if(water>0) o.push({id:'drinkWater',score:a.needs.thirst*1.15+20,why:['口渴越高越想喝','需要找到可用杯子，再前往水桶取水']});
      if(alcohol>0) o.push({id:'drinkAlcohol',score:a.needs.thirst*.72+a.traits.alcoholLike*45-a.status.intoxication*.35,why:['口渴會提高飲用意願',`個人對酒的偏好：${Math.round(a.traits.alcoholLike*100)}`,'需要先取得一個可用的通用杯子']});
      if(food<24&&sourceCanProvide('foodPantry','food')) o.push({id:'refillFood',score:(24-food)*2.1+a.traits.careful*10,why:['現成食物快吃完了','必須先去食物櫃取食物，再搬到餐桌區']});
      if(water<24&&sourceCanProvide('tap','water')) o.push({id:'refillWater',score:(24-water)*2.2+a.traits.careful*9,why:['水桶快空了','水龍頭與水桶都在水槽區，但操作仍需要時間']});
      o.push({id:'rest',score:a.needs.fatigue*1.05+12+(100-a.needs.safety)*.06,why:['疲勞越高越想休息','會尋找安靜且舒適的區域；太吵會換地方']});
      o.push({id:'talk',score:a.needs.social*.78+a.traits.social*34,why:['社交需求','需要實際走到另一個人所在的位置']});
      const cat=state.agents.orange;if(cat.location===a.location) o.push({id:'petCat',score:a.needs.social*.55+(100-a.needs.comfort)*.2+cat.needs.social*.35,why:['橘子就在附近','摸貓可以同時影響人與貓的狀態']});
      const wettest=wettestZone(); if(wettest&&floorSlipRisk(wettest)>0.4)o.push({id:'cleanFloor',score:floorSlipRisk(wettest)*4.5+a.traits.careful*18+(100-a.needs.safety)*.12,why:['某處地面有液體，形成滑倒風險',`最高滑倒風險在${zoneName(wettest)}，約 ${floorSlipRisk(wettest).toFixed(1)}%`]});
      o.push({id:'wander',score:8+rand(0,10)-(100-a.needs.safety)*.08,why:['沒有更迫切需求時可能短暫走動']});
    }else{
      if(food>0)o.push({id:'eat',score:a.needs.hunger*1.08+12,why:['飢餓','需要走到現成食物所在位置']});
      const pawTotal=Object.values(a.contacts.paws||{}).reduce((x,y)=>x+y,0);
      o.push({id:'groom',score:a.needs.cleanliness*.83+pawTotal*.9+18,why:['清潔需求',pawTotal>0?'腳掌沾到異物，強烈提高舔毛意願':'一般理毛習慣']});
      o.push({id:'rest',score:a.needs.fatigue*.95+20,why:['疲勞越高越想睡','同樣會偏好較安靜的位置']});
      o.push({id:'seekHuman',score:a.needs.social*.95+a.traits.social*28,why:['貓的社交需求現在會隨時間上升','會主動走去找附近的人']});
      o.push({id:'wander',score:20+a.traits.curious*25+rand(0,16),why:['貓的探索傾向','移動途中會真的接觸所在區域的地面']});
      if(water>0)o.push({id:'drinkWater',score:a.needs.thirst*1.05+8,why:['口渴','會走到水桶所在的水槽區']});
    }
    return o.map(x=>({...x,score:Math.max(0,x.score+rand(-5,5))})).sort((a,b)=>b.score-a.score);
  }
  function choose(a){const os=options(a),pick=os[0];state.thoughts[a.id]={options:os,pick,tick:state.tick};return pick}

  function bestRestZone(a,exclude=null,useLiveNoise=false){
    const candidates=Object.values(state.zones).filter(z=>z.restQuality>0&&z.id!==exclude);
    const noiseOf=z=>useLiveNoise?zoneNoise(z.id):z.baseNoise;
    candidates.sort((x,y)=>((y.restQuality-noiseOf(y)*.75-shortestPath(a.location,y.id,a,true).length*2)-(x.restQuality-noiseOf(x)*.75-shortestPath(a.location,x.id,a,true).length*2)));
    return candidates[0]?.id||'rest';
  }
  function nearestHuman(a){
    const hs=Object.values(state.agents).filter(x=>x.kind==='human');
    hs.sort((x,y)=>shortestPath(a.location,x.location,a,true).length-shortestPath(a.location,y.location,a,true).length);return hs[0]||null;
  }
  function wettestZone(){let best=null,bestAmt=0;for(const z of Object.keys(state.zones)){const v=floorLiquidAmount(z);if(v>bestAmt){bestAmt=v;best=z;}}return best}
  function startPlan(a,choice){
    let p={intent:choice.id,phase:'start',wait:0,started:state.tick};
    if(choice.id==='eat')p={...p,targetObject:'mealTray',phase:'move'};
    else if(choice.id==='drinkWater') p=a.kind==='cat'?{...p,targetObject:'waterBucket',resource:'water',phase:'move'}:{...p,resource:'water',sourceObject:'waterBucket',phase:'findCup',container:null};
    else if(choice.id==='drinkAlcohol') p={...p,resource:'alcohol',sourceObject:'alcoholBottle',phase:'findCup',container:null};
    else if(choice.id==='refillFood')p={...p,phase:'toSource',sourceObject:'foodPantry',targetObject:'mealTray'};
    else if(choice.id==='refillWater')p={...p,phase:'move',targetObject:'waterBucket'};
    else if(choice.id==='rest')p={...p,phase:'move',targetZone:bestRestZone(a),restTicks:0};
    else if(choice.id==='talk'){const other=Object.values(state.agents).filter(x=>x.kind==='human'&&x.id!==a.id).sort((x,y)=>shortestPath(a.location,x.location,a,true).length-shortestPath(a.location,y.location,a,true).length)[0];p={...p,phase:'move',targetAgent:other?.id};}
    else if(choice.id==='petCat')p={...p,phase:'interact',targetAgent:'orange'};
    else if(choice.id==='seekHuman'){const h=nearestHuman(a);p={...p,phase:'move',targetAgent:h?.id};}
    else if(choice.id==='cleanFloor')p={...p,phase:'move',targetZone:wettestZone()};
    else if(choice.id==='groom')p={...p,phase:'groom'};
    else if(choice.id==='wander'){const choices=state.zones[a.location].neighbors;p={...p,phase:'move',targetZone:choices[Math.floor(rand(0,choices.length))],oneShot:true};}
    a.plan=p; addEvent(`${a.name}決定${ZH[choice.id]||choice.id}。`,'system',[],{action:choice.id,phase:'plan',location:a.location,target:p.targetZone||p.targetObject||p.targetAgent||''});
  }
  function finishPlan(a){
    for(const [id,owner] of Object.entries({...state.locks}))if(owner===a.id)delete state.locks[id];
    if(a.held)releaseHeld(a); a.plan=null;
  }
  function waitFor(a,thingId,why){
    a.plan.wait=(a.plan.wait||0)+1; const blocker=blockerName(thingId)||state.containers[thingId]?.heldBy&&state.agents[state.containers[thingId].heldBy]?.name;
    addEvent(`${a.name}${why}${blocker?`，因為${blocker}正在使用它`:''}。`,'normal',[],{action:'wait',target:thingId,location:a.location});
  }

  function applyIngestion(a,resourceId,amount,causeIds=[]){
    const def=RESOURCE_TYPES[resourceId];if(!def||amount<=0)return null;
    if(def.hungerRelief){const[lo,hi]=def.hungerRelief;a.needs.hunger=clamp(a.needs.hunger-rand(lo,hi)*Math.min(1,amount/6));}
    if(def.thirstRelief){const[lo,hi]=def.thirstRelief;a.needs.thirst=clamp(a.needs.thirst-rand(lo,hi)*Math.min(1,amount/6));}
    if(def.intoxicationFactor){const prev=a.status.intoxication;a.status.intoxication=clamp(prev+amount*def.intoxicationFactor+rand(1,5));const e=addEvent(`${a.name}的醉酒程度上升至 ${Math.round(a.status.intoxication)}。`,'warn',causeIds,{status:'intoxication',resource:resourceId,value:a.status.intoxication,coordination:coordination(a)});a.causes.intoxication=e;return e;}return null;
  }
  function consumeFrom(a,fromId,resourceId,requestedAmount,label,type='good',causeIds=[]){
    const amount=takeResource(fromId,resourceId,requestedAmount);if(amount<=0)return null;
    const e=addEvent(`${a.name}${label}`,type,[...causeIds,resourceCause(fromId,resourceId)].filter(Boolean),{action:resourceId==='food'?'eat':resourceId==='water'?'drinkWater':'drinkAlcohol',resource:resourceId,from:fromId,amount,location:a.location});applyIngestion(a,resourceId,amount,[e]);return e;
  }
  function spillContainerAt(containerId,fraction,zoneId,causeIds=[]){
    const c=state.containers[containerId],sid=surfaceId(zoneId),events=[];if(!c)return events;
    for(const [r,amt] of Object.entries({...c.contents})){
      if(RESOURCE_TYPES[r]?.phase!=='liquid'||amt<=0)continue;
      const moved=transferResource(r,containerId,sid,amt*fraction);
      if(moved>0){const e=addEvent(`${resourceName(r)}從${c.name}灑到${zoneName(zoneId)}地面。`,'bad',causeIds,{transfer:'container_to_floor',resource:r,from:containerId,to:sid,amount:moved,location:zoneId});setResourceCause(sid,r,e);events.push(e);}
    }return events;
  }
  function pourIntoHeld(a,sourceId,resourceId,difficulty=.9){
    if(!a.held)return null;const targetId=a.held,desired=Math.min(capacityLeft(targetId),rand(9,16));if(desired<=0)return null;
    const pc=precisionCheck(a,difficulty,floorSlipRisk(a.location)*.08);
    const attempt=addEvent(`${a.name}嘗試把${resourceName(resourceId)}從${endpointName(sourceId)}倒進${endpointName(targetId)}。`,'normal',a.causes.intoxication?[a.causes.intoxication]:[],{action:'pour',resource:resourceId,from:sourceId,to:targetId,successChance:pc.success,roll:pc.roll,coordination:pc.coord,location:a.location});
    if(pc.ok){const moved=transferResource(resourceId,sourceId,targetId,desired);const e=addEvent(`${a.name}順利把${resourceName(resourceId)}倒進${endpointName(targetId)}。`,'good',[attempt],{resource:resourceId,from:sourceId,to:targetId,amount:moved,location:a.location});setResourceCause(targetId,resourceId,e);return e;}
    const available=isFinite(amountAt(sourceId,resourceId))?Math.min(desired,amountAt(sourceId,resourceId)):desired;const keptWant=available*rand(.2,.55),spillWant=available-keptWant;const kept=transferResource(resourceId,sourceId,targetId,keptWant);const spilled=transferResource(resourceId,sourceId,surfaceId(a.location),spillWant);const f=addEvent(`${a.name}倒${resourceName(resourceId)}時手一晃，灑掉了一部分。`,'warn',[attempt],{reason:'coordination',resource:resourceId,amount:spilled,coordination:pc.coord,location:a.location});if(kept>0)setResourceCause(targetId,resourceId,f);if(spilled>0){const s=addEvent(`${resourceName(resourceId)}灑到${zoneName(a.location)}地面。`,'bad',[f],{transfer:'resource_to_floor',resource:resourceId,from:sourceId,to:surfaceId(a.location),amount:spilled,location:a.location});setResourceCause(surfaceId(a.location),resourceId,s);}return f;
  }

  function advancePlan(a){
    const p=a.plan;if(!p)return;
    if(p.intent==='eat'){
      const target=state.containers[p.targetObject],loc=objectLocation(target.id);
      if(a.location!==loc){moveToward(a,loc,'準備吃東西');return;}
      if(p.phase==='move'||p.phase==='wait'){
        if(!acquireLock(a,target.id)){
          waitFor(a,target.id,'到了食物旁，卻得先等一下');
          const blocker=state.agents[state.locks[target.id]];
          if(blocker&&blocker.location===a.location&&a.needs.social>45&&Math.random()<.35){a.needs.social=clamp(a.needs.social-rand(3,7));blocker.needs.social=clamp(blocker.needs.social-rand(2,5));addEvent(`${a.name}等食物時順便和${blocker.name}聊了兩句。`,'good',[],{action:'talkWhileWaiting',location:a.location});}
          p.phase='wait';return;
        }
        p.phase='eating';addEvent(`${a.name}在${zoneName(a.location)}開始吃東西。`,'normal',[],{action:'eat',phase:'start',location:a.location});return;
      }
      if(p.phase==='eating'){consumeFrom(a,target.id,'food',rand(5,10),'吃完了一份食物。','good');releaseLock(a,target.id);finishPlan(a);return;}
    }
    if(p.intent==='drinkWater'&&a.kind==='cat'){
      const loc=objectLocation('waterBucket');if(a.location!==loc){moveToward(a,loc,'去找水喝');return;}consumeFrom(a,'waterBucket','water',rand(4,8),'低頭喝了些水。','good');finishPlan(a);return;
    }
    if((p.intent==='drinkWater'||p.intent==='drinkAlcohol')&&a.kind==='human'){
      const resource=p.resource,sourceId=p.sourceObject;
      if(p.phase==='findCup'){
        const cup=freeDrinkContainer(a,resource,true);
        if(!cup){
          const held=compatibleDrinkContainers(resource).find(c=>c.heldBy&&c.heldBy!==a.id);
          if(held){p.wait++;const owner=state.agents[held.heldBy];addEvent(`${a.name}想${resource==='water'?'喝水':'喝酒'}，但可用杯子都被拿走了${owner?`；${owner.name}正拿著${held.name}`:''}。`,'normal',[],{action:'wait',target:'cup',location:a.location});if(p.wait>=2&&owner&&owner.location===a.location)addEvent(`${a.name}向${owner.name}問了一下杯子還要不要用。`,'normal',[],{action:'request',target:held.id,location:a.location});return;}
          finishPlan(a);return;
        }
        if(p.container&&p.container!==cup.id)addEvent(`${a.name}發現原本的杯子不可用，改找${cup.name}。`,'normal',[],{action:'switchContainer',from:p.container,to:cup.id,location:a.location});
        if(!p.container&&amountAt(cup.id,resource)<=0){
          const occupiedFilled=compatibleDrinkContainers(resource).find(c=>amountAt(c.id,resource)>0&&c.heldBy&&c.heldBy!==a.id);
          if(occupiedFilled)addEvent(`${a.name}本來想用${occupiedFilled.name}，但它正被${state.agents[occupiedFilled.heldBy]?.name||'別人'}拿著，因此改拿${cup.name}。`,'normal',[],{action:'switchContainer',from:occupiedFilled.id,to:cup.id,location:a.location});
        }
        p.container=cup.id;p.phase='toCup';
      }
      if(p.phase==='toCup'){
        const cup=state.containers[p.container];
        if(cup.heldBy&&cup.heldBy!==a.id){const alt=freeDrinkContainer(a,resource,true);if(alt&&alt.id!==cup.id){addEvent(`${a.name}發現${cup.name}被${state.agents[cup.heldBy]?.name||'別人'}拿著，改用${alt.name}。`,'normal',[],{action:'switchContainer',from:cup.id,to:alt.id,location:a.location});p.container=alt.id;return;}p.wait++;addEvent(`${a.name}到了杯子附近，但${cup.name}還在別人手上，只好等一下。`,'normal',[],{action:'wait',target:cup.id,location:a.location});return;}
        const loc=objectLocation(cup.id);if(a.location!==loc){moveToward(a,loc,`去拿${cup.name}`);return;}
        if(!holdContainer(a,cup.id)){p.phase='findCup';return;}
        addEvent(`${a.name}拿起了${cup.name}。`,'normal',[],{action:'takeContainer',container:cup.id,location:a.location});
        p.phase=amountAt(cup.id,resource)>=4?'drink':'toSource';
      }
      if(p.phase==='toSource'){
        const sourceLoc=objectLocation(sourceId);if(a.location!==sourceLoc){moveToward(a,sourceLoc,`拿著${endpointName(p.container)}去取${resourceName(resource)}`);return;}
        if(amountAt(sourceId,resource)<=0){addEvent(`${a.name}到了${endpointName(sourceId)}，卻發現${resourceName(resource)}已經沒有了。`,'warn',[],{action:'resourceMissing',source:sourceId,resource,location:a.location});finishPlan(a);return;}
        pourIntoHeld(a,sourceId,resource,resource==='alcohol'?1.4:.8);p.phase='drink';return;
      }
      if(p.phase==='drink'){
        if(amountAt(p.container,resource)<=0){p.phase='toSource';return;}
        consumeFrom(a,p.container,resource,rand(5,10),resource==='alcohol'?'喝下了杯裡的酒。':'喝了杯裡的水。',resource==='alcohol'?'warn':'good');releaseHeld(a);finishPlan(a);return;
      }
    }
    if(p.intent==='refillWater'){
      const loc=objectLocation('waterBucket');if(a.location!==loc){moveToward(a,loc,'去補水桶');return;}
      if(!acquireLock(a,'waterBucket')){waitFor(a,'waterBucket','想補水，但水桶正在被使用');return;}
      const desired=Math.min(capacityLeft('waterBucket'),rand(28,42));if(desired>0){const pc=precisionCheck(a,.8,floorSlipRisk(a.location)*.08);const attempt=addEvent(`${a.name}打開水龍頭補水桶。`,'normal',[],{action:'refillWater',successChance:pc.success,roll:pc.roll,coordination:pc.coord,location:a.location});if(pc.ok){const moved=transferResource('water','tap','waterBucket',desired);const e=addEvent(`${a.name}順利把水桶補滿了一些。`,'good',[attempt],{resource:'water',from:'tap',to:'waterBucket',amount:moved,location:a.location});setResourceCause('waterBucket','water',e);}else{const kept=transferResource('water','tap','waterBucket',desired*.45),spilled=putResource(surfaceId(a.location),'water',desired*.55);const f=addEvent(`${a.name}補水時灑出了一些水。`,'warn',[attempt],{resource:'water',amount:spilled,coordination:pc.coord,location:a.location});if(kept>0)setResourceCause('waterBucket','water',f);if(spilled>0)setResourceCause(surfaceId(a.location),'water',f);}}releaseLock(a,'waterBucket');finishPlan(a);return;
    }
    if(p.intent==='refillFood'){
      if(p.phase==='toSource'){
        const loc=objectLocation('foodPantry');if(a.location!==loc){moveToward(a,loc,'去食物櫃拿補充食物');return;}
        if(!acquireLock(a,'foodPantry')){waitFor(a,'foodPantry','想拿食物，但食物櫃前有人正在用');return;}
        const amount=takeResource('foodPantry','food',rand(24,36));a.carrying={resource:'food',amount};releaseLock(a,'foodPantry');addEvent(`${a.name}從食物櫃拿了些食物，準備送到餐桌區。`,'normal',[],{action:'carryResource',resource:'food',amount,from:'foodPantry',location:a.location});p.phase='toTarget';return;
      }
      if(p.phase==='toTarget'){
        const loc=objectLocation('mealTray');if(a.location!==loc){moveToward(a,loc,'拿著食物去補餐桌上的現成食物');return;}
        if(!acquireLock(a,'mealTray')){waitFor(a,'mealTray','拿著食物到了餐桌旁，但現成食物正在被使用');return;}
        const moved=putResource('mealTray','food',a.carrying?.amount||0);a.carrying=null;const e=addEvent(`${a.name}把帶來的食物補進現成食物。`,'good',[],{action:'refillFood',resource:'food',to:'mealTray',amount:moved,location:a.location});setResourceCause('mealTray','food',e);releaseLock(a,'mealTray');finishPlan(a);return;
      }
    }
    if(p.intent==='rest'){
      if(a.location!==p.targetZone){moveToward(a,p.targetZone,'去找地方休息');return;}
      const noise=zoneNoise(a.location);
      if(noise>24){const old=p.targetZone,alt=bestRestZone(a,old,true);if(alt&&alt!==old){p.targetZone=alt;p.restTicks=0;addEvent(`${a.name}到了${zoneName(old)}，但那裡太吵（噪音 ${Math.round(noise)}），決定改去${zoneName(alt)}。`,'warn',[],{action:'replanRest',from:old,to:alt,noise,location:a.location});return;}}
      p.restTicks++;a.needs.fatigue=clamp(a.needs.fatigue-rand(6,11));a.needs.comfort=clamp(a.needs.comfort+rand(1,4));if(p.restTicks===1)addEvent(`${a.name}在${zoneName(a.location)}坐下休息。`,'normal',[],{action:'rest',noise,location:a.location});if(p.restTicks>=2)finishPlan(a);return;
    }
    if(p.intent==='talk'){
      const other=state.agents[p.targetAgent];if(!other){finishPlan(a);return;}if(a.location!==other.location){moveToward(a,other.location,`去找${other.name}`);return;}a.needs.social=clamp(a.needs.social-rand(12,22));other.needs.social=clamp(other.needs.social-rand(5,12));a.needs.comfort=clamp(a.needs.comfort+rand(1,3));addNoise(a.location,24,2);addEvent(`${a.name}走到${other.name}旁邊，兩人聊了幾句。`,'good',[],{action:'talk',target:other.id,location:a.location,noise:zoneNoise(a.location)});finishPlan(a);return;
    }
    if(p.intent==='petCat'){
      const cat=state.agents.orange;if(a.location!==cat.location){moveToward(a,cat.location,'去找橘子');return;}a.needs.social=clamp(a.needs.social-rand(4,9));a.needs.comfort=clamp(a.needs.comfort+rand(4,8));cat.needs.social=clamp(cat.needs.social-rand(13,23));cat.needs.comfort=clamp(cat.needs.comfort+rand(4,7));addEvent(`${a.name}蹲下來摸了摸橘子；橘子靠過去蹭了幾下。`,'good',[],{action:'petCat',target:'orange',location:a.location});finishPlan(a);return;
    }
    if(p.intent==='seekHuman'){
      const human=state.agents[p.targetAgent]||nearestHuman(a);if(!human){finishPlan(a);return;}p.targetAgent=human.id;if(a.location!==human.location){moveToward(a,human.location,`去找${human.name}`);return;}a.needs.social=clamp(a.needs.social-rand(15,25));a.needs.comfort=clamp(a.needs.comfort+rand(2,5));human.needs.comfort=clamp(human.needs.comfort+rand(2,5));human.needs.social=clamp(human.needs.social-rand(2,6));addNoise(a.location,6,1);addEvent(`${a.name}主動跑到${human.name}旁邊，喵了一聲又蹭了蹭腿。`,'good',[],{action:'seekHuman',target:human.id,location:a.location});finishPlan(a);return;
    }
    if(p.intent==='cleanFloor'){
      if(!p.targetZone){finishPlan(a);return;}if(a.location!==p.targetZone){moveToward(a,p.targetZone,'去處理地上的液體');return;}const sid=surfaceId(a.location),floor=state.surfaces[sid].contents,removed=[];for(const [r,amt] of Object.entries({...floor})){if(RESOURCE_TYPES[r]?.phase!=='liquid'||amt<=0)continue;const got=takeResource(sid,r,Math.min(amt,rand(8,18)));if(got>0)removed.push(`${resourceName(r)} ${got.toFixed(1)}`);}a.needs.safety=clamp(a.needs.safety+rand(2,6));a.needs.comfort=clamp(a.needs.comfort+rand(1,4));addNoise(a.location,10,1);addEvent(`${a.name}在${zoneName(a.location)}清理了地面上的液體。`,'good',[],{action:'cleanFloor',amount:removed.join('、'),environmentRisk:floorSlipRisk(a.location),location:a.location});finishPlan(a);return;
    }
    if(p.intent==='groom'){
      a.needs.cleanliness=clamp(a.needs.cleanliness-rand(19,31));const groom=addEvent(`${a.name}停下來舔毛清潔。`,'normal',[],{action:'groom',location:a.location});for(const [r,amt] of Object.entries({...a.contacts.paws})){if(amt<=0)continue;const taken=takeResource(`contact:${a.id}:paws`,r,amt*rand(.48,.82));if(taken<=0)continue;const ing=addEvent(`${a.name}在舔毛時攝入了腳掌上的${resourceName(r)}。`,RESOURCE_TYPES[r]?.intoxicationFactor?'bad':'normal',[groom,contactCause(a,'paws',r)].filter(Boolean),{transfer:'contact_to_internal',resource:r,from:`contact:${a.id}:paws`,to:'internal',amount:taken,location:a.location});applyIngestion(a,r,taken,[ing]);if(amountAt(`contact:${a.id}:paws`,r)<.25)setContactCause(a,'paws',r,null);}finishPlan(a);return;
    }
    if(p.intent==='wander'){
      if(a.location!==p.targetZone){moveToward(a,p.targetZone,'隨意走動');return;}finishPlan(a);return;
    }
  }

  function tick(){
    state.tick++;state.minute+=2;if(state.minute>=1440){state.minute-=1440;state.day++;}
    needDrift();const order=Object.values(state.agents).sort(()=>Math.random()-.5);
    for(const a of order){if(!a.plan)startPlan(a,choose(a));advancePlan(a);}
  }

  function contentSummary(contents){const parts=Object.entries(contents||{}).filter(([,v])=>v>.1).map(([r,v])=>`${resourceIcon(r)} ${resourceName(r)} ${Math.round(v)}`);return parts.length?parts.join('・'):'空'}
  function contactSummary(a,zone){return contentSummary(a.contacts[zone]||{})}
  function planLabel(a){
    const p=a.plan;if(!p)return '目前沒有進行中的行動';
    const target=p.targetZone?zoneName(p.targetZone):p.targetObject?endpointName(p.targetObject):p.targetAgent?state.agents[p.targetAgent]?.name:p.container?endpointName(p.container):'';
    return `${ZH[p.intent]||p.intent}・${phaseLabel(p.phase)}${target?`・目標：${target}`:''}${p.wait?`・等待 ${p.wait} 輪`:''}`;
  }
  function phaseLabel(p){return ({start:'準備',move:'移動中',wait:'等待',eating:'進食中',findCup:'找杯子',toCup:'去拿杯子',toSource:'前往來源',drink:'飲用',toTarget:'前往目標',interact:'互動',groom:'清潔'})[p]||p}

  function resetSim(){
    eventSeq=0;
    state=createInitialState();
    addEvent('v7 初始化：模擬核心與觀測 UI 已拆分。需求增長率維持 v6；本版優先改善可觀測性。','system');
    return state;
  }
  function getEntity(type,id){
    if(type==='agent') return state.agents[id];
    if(type==='container') return state.containers[id];
    if(type==='source') return state.sources[id];
    if(type==='surface') return state.surfaces[id];
    if(type==='zone') return state.zones[id];
    if(type==='event') return state.causes[id];
    return null;
  }
  window.SimEngine={
    reset:resetSim,tick,getState:()=>state,getEntity,
    RESOURCE_TYPES,ZH,DATA_ZH,
    clamp,coordination,zoneNoise,floorLiquidAmount,floorSlipRisk,timeStr,zoneName,surfaceId,
    objectLocation,endpointName,resourceName,resourceIcon,contentSummary,contactSummary,planLabel,phaseLabel,
    causeTree:(id)=>{function walk(cid,depth=0,seen=new Set()){if(seen.has(cid))return `${'  '.repeat(depth)}└─（循環參照）`;seen.add(cid);const e=state.causes[cid];if(!e)return '';let out=`${'  '.repeat(depth)}${depth?'└─ ':''}${e.text}`;for(const c of e.causeIds||[])out+='\n'+walk(c,depth+1,new Set(seen));return out}return walk(id);},
    occupants
  };
  resetSim();
})();
