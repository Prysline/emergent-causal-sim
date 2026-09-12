(() => {
  const W=window.SimWorld,SP=window.SimSpatial;
  if(!W||!SP)return;
  const {RESOURCE_TYPES,ZH,DATA_ZH,createInitialState}=W;
  const DEFAULT_SEED=20260911;
  const MAX_INTERACTION_WAIT=6;
  let state=null,eventSeq=0;

  function normalizeSeed(seed){const n=Number(seed);return Number.isFinite(n)&&n!==0?(n>>>0):DEFAULT_SEED;}
  function random(){state.rngState=(state.rngState+0x6D2B79F5)>>>0;let t=state.rngState;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
  function rand(min=0,max=1){return min+random()*(max-min);}
  function shuffle(list){for(let i=list.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}
  function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,v));}
  function timeStr(minute=state.minute){const h=Math.floor(minute/60)%24,m=minute%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
  function resourceName(id){return RESOURCE_TYPES[id]?.name||id;}
  function resourceIcon(id){return RESOURCE_TYPES[id]?.icon||'◻';}
  function contentSummary(contents){const e=Object.entries(contents||{}).filter(([,v])=>v>.05);return e.length?e.map(([r,v])=>`${resourceIcon(r)} ${resourceName(r)} ${Math.round(v*10)/10}`).join('・'):'空';}

  function addEvent(text,type='normal',causeIds=[],data={}){
    const id=`e${++eventSeq}`,e={id,time:timeStr(),text,type,causeIds:[...new Set(causeIds.filter(Boolean))],data};
    state.events.unshift(e);state.causes[id]=e;if(state.events.length>300)state.events.pop();
    if(eventSeq%200===0)pruneCauses();return id;
  }
  function pruneCauses(){
    const keep=new Set(state.events.map(e=>e.id));
    for(const a of Object.values(state.agents))if(a.causes?.intoxication)keep.add(a.causes.intoxication);
    const mark=id=>{if(!id||keep.has(id)&&state.causes[id]?.__marked)return;const e=state.causes[id];if(!e)return;keep.add(id);e.__marked=true;for(const c of e.causeIds||[])mark(c);};
    [...keep].forEach(mark);for(const [id,e] of Object.entries(state.causes)){if(!keep.has(id))delete state.causes[id];else delete e.__marked;}
  }
  function addNoise(position,amount,ttl=2,kind='activity'){state.noiseEvents.push({position:{...position},amount,ttl,kind});}

  function tileEndpointId(p){return `tile:${p.x},${p.y}`;}
  function endpoint(id){
    if(state.containers[id])return {kind:'container',id,obj:state.containers[id],contents:state.containers[id].contents};
    if(state.sources[id])return {kind:'source',id,obj:state.sources[id]};
    if(id?.startsWith('tile:')){const [x,y]=id.slice(5).split(',').map(Number),t=SP.tileAt(state,x,y);return t?{kind:'tile',id,obj:t,contents:t.surface.contents}:null;}
    if(id?.startsWith('contact:')){const [,agentId,part]=id.split(':'),a=state.agents[agentId];if(!a)return null;a.contacts[part]??={};return {kind:'contact',id,obj:{name:`${a.name}・${part}`},contents:a.contacts[part],agent:a,part};}
    return null;
  }
  function endpointName(id){const ep=endpoint(id);return ep?.obj?.name||state.containers[id]?.name||state.sources[id]?.name||id;}
  function sumContents(obj){return Object.values(obj?.contents||{}).reduce((a,b)=>a+b,0);}
  function amountAt(id,r){const ep=endpoint(id);if(!ep)return 0;if(ep.kind==='source')return ep.obj.resource===r?(ep.obj.infinite?Infinity:(ep.obj.amount||0)):0;return ep.contents?.[r]||0;}
  function capacityLeft(id){const ep=endpoint(id);if(!ep)return 0;if(ep.kind==='container')return Math.max(0,ep.obj.capacity-sumContents(ep.obj));if(ep.kind==='tile')return Infinity;if(ep.kind==='contact')return Math.max(0,100-sumContents(ep));return 0;}
  function takeResource(id,r,amount){const ep=endpoint(id);if(!ep||amount<=0)return 0;if(ep.kind==='source'){if(ep.obj.resource!==r)return 0;if(ep.obj.infinite)return amount;const m=Math.min(amount,ep.obj.amount||0);ep.obj.amount-=m;return m;}const have=ep.contents[r]||0,m=Math.min(amount,have);ep.contents[r]=Math.max(0,have-m);if(ep.contents[r]<.001)delete ep.contents[r];return m;}
  function putResource(id,r,amount){const ep=endpoint(id);if(!ep||amount<=0||ep.kind==='source')return 0;const m=Math.min(amount,capacityLeft(id));ep.contents[r]=(ep.contents[r]||0)+m;return m;}
  function transferResource(r,from,to,amount){const available=amountAt(from,r),room=capacityLeft(to),m=Math.max(0,Math.min(amount,available,room));if(!isFinite(m)||m<=0)return 0;return putResource(to,r,takeResource(from,r,m));}
  const causeKey=(endpointId,r)=>`${endpointId}|${r}`;
  function setResourceCause(endpointId,r,eventId){if(eventId)state.endpointCauses[causeKey(endpointId,r)]=eventId;else delete state.endpointCauses[causeKey(endpointId,r)];}
  function resourceCause(endpointId,r){return state.endpointCauses[causeKey(endpointId,r)]||null;}

  function coordination(a){const intoxPenalty=a.status.intoxication*.65,fatiguePenalty=Math.max(0,a.needs.fatigue-65)*.35;return clamp(100-intoxPenalty-fatiguePenalty);}
  function precisionCheck(a,baseRisk=1,environmentRisk=0){const coord=coordination(a),careful=a.traits.careful??.55,ordinaryRisk=baseRisk*(1.18-careful*.36),impairmentRisk=Math.max(0,95-coord)*.55,failRisk=clamp(ordinaryRisk+impairmentRisk+environmentRisk,.1,75),success=100-failRisk,roll=rand(0,100);return {success,failRisk,roll,ok:roll<=success,coord,baseRisk,environmentRisk};}
  function applyExertion(a,amount,reason,{thirstFactor=.24,hungerFactor=.08}={}){
    if(!a||amount<=0)return 0;const activity=amount*(a.kind==='cat'?.72:1),fatigueCost=activity*(a.traits.exertionSensitivity??1);
    a.needs.fatigue=clamp(a.needs.fatigue+fatigueCost);a.needs.thirst=clamp(a.needs.thirst+activity*thirstFactor);a.needs.hunger=clamp(a.needs.hunger+activity*hungerFactor);
    a.metrics.exertionToday=(a.metrics.exertionToday||0)+activity;a.metrics.lastExertion={amount:activity,fatigueCost,reason,tick:state.tick};return activity;
  }

  function reservationOwner(key){const id=state.reservations[key];return id?state.agents[id]||null:null;}
  function reserve(key,a){const owner=reservationOwner(key);if(!owner||owner.id===a.id){state.reservations[key]=a.id;return true;}return false;}
  function releaseReservation(key,a){if(state.reservations[key]===a.id)delete state.reservations[key];}
  function releaseAgentReservations(a,prefix=null){for(const [k,id] of Object.entries({...state.reservations}))if(id===a.id&&(!prefix||k.startsWith(prefix)))delete state.reservations[k];}

  function holderOf(id){return SP.holderOf(state,id);}
  function holdContainer(a,id){
    const c=state.containers[id];if(!c?.portable)return false;
    const reserved=reservationOwner(`object:${id}`);if(reserved&&reserved.id!==a.id)return false;
    const holder=holderOf(id);if(holder&&holder.id!==a.id)return false;
    if(a.held&&a.held!==id)releaseHeld(a);a.held=id;delete c.supportId;return true;
  }
  function releaseHeld(a){if(!a.held)return;const c=state.containers[a.held];if(c)c.position={...a.position};a.held=null;}
  function standUp(a){if(a.posture?.kind==='standing')return;a.posture={kind:'standing',slotId:null,furnitureId:null};}
  function sitOn(a,slot){a.posture={kind:'sitting',slotId:slot.id,furnitureId:slot.furnitureId};releaseReservation(`slot:${slot.id}`,a);}
  function lieDown(a){a.posture={kind:'lying',slotId:null,furnitureId:null};}

  function onEnterTile(a){
    const t=SP.tileByPos(state,a.position),wet=SP.tileLiquidAmount(t);if(wet<=.1)return;
    if(a.kind==='cat'){
      for(const [r,amt] of Object.entries({...t.surface.contents})){
        if(RESOURCE_TYPES[r]?.phase!=='liquid'||amt<=0)continue;const picked=Math.min(amt,amt*rand(.08,.20));if(picked<=0)continue;
        t.surface.contents[r]-=picked;if(t.surface.contents[r]<.001)delete t.surface.contents[r];a.contacts.paws[r]=(a.contacts.paws[r]||0)+picked;
        addEvent(`${a.name}踩過 (${t.x}, ${t.y}) 的${resourceName(r)}，腳掌沾上了一些。`,'warn',[resourceCause(tileEndpointId(t),r)].filter(Boolean),{action:'tileContact',resource:r,amount:picked,position:t.id});
      }return;
    }
    const risk=Math.min(45,wet*.55+Math.max(0,a.status.intoxication-10)*.16+Math.max(0,a.needs.fatigue-75)*.24);
    if(random()*100<risk){a.wellbeing.comfort=clamp(a.wellbeing.comfort-rand(3,8));a.wellbeing.safety=clamp(a.wellbeing.safety-rand(4,10));const slip=addEvent(`${a.name}踩到 (${t.x}, ${t.y}) 的濕地，腳下一滑。`,'warn',[],{action:'tileSlip',environmentRisk:risk,position:t.id});if(a.held)spillHeldAt(a,t,[slip]);}
  }
  function spillHeldAt(a,tile,causeIds=[]){const c=a.held&&state.containers[a.held];if(!c)return;for(const [r,amt] of Object.entries({...c.contents})){if(RESOURCE_TYPES[r]?.phase!=='liquid'||amt<=0)continue;const m=transferResource(r,c.id,tileEndpointId(tile),amt*rand(.14,.34));if(m>0){const e=addEvent(`${resourceName(r)}從${c.name}灑在 (${tile.x}, ${tile.y}) 的地面。`,'bad',causeIds,{action:'spill',resource:r,amount:m,position:tile.id});setResourceCause(tileEndpointId(tile),r,e);}}}

  function targetLabel(t){if(!t)return'目標';if(t.kind==='agent')return state.agents[t.id]?.name||t.id;if(t.kind==='slot'){const s=SP.getSlot(state,t.id);return state.furniture[s?.furnitureId]?.name||'座位';}if(t.kind==='tile')return`(${t.position.x}, ${t.position.y})`;return state.containers[t.id]?.name||state.sources[t.id]?.name||state.furniture[t.id]?.name||t.id;}
  function targetAvailability(target){
    if(!target)return {exists:false,available:false,reason:'missing',label:'目標'};
    if(target.kind==='agent'){
      const obj=state.agents[target.id];if(!obj)return {exists:false,available:false,reason:'missing',label:target.id};
      return {exists:true,available:!obj.offMap,reason:obj.offMap?'offMap':null,label:obj.name};
    }
    if(target.kind==='object'){
      const obj=state.containers[target.id];if(!obj)return {exists:false,available:false,reason:'missing',label:target.id};
      const holder=holderOf(target.id);if(holder?.offMap)return {exists:true,available:false,reason:'offMap',label:obj.name};
      return {exists:true,available:!!SP.objectPosition(state,target.id),reason:SP.objectPosition(state,target.id)?null:'noPosition',label:obj.name};
    }
    if(target.kind==='source'){
      const obj=state.sources[target.id];return obj?{exists:true,available:!!obj.position,reason:obj.position?null:'noPosition',label:obj.name}:{exists:false,available:false,reason:'missing',label:target.id};
    }
    if(target.kind==='furniture'){
      const obj=state.furniture[target.id];return obj?{exists:true,available:true,reason:null,label:obj.name}:{exists:false,available:false,reason:'missing',label:target.id};
    }
    if(target.kind==='slot'){
      const slot=SP.getSlot(state,target.id);return slot?{exists:true,available:true,reason:null,label:targetLabel(target)}:{exists:false,available:false,reason:'missing',label:target.id};
    }
    if(target.kind==='tile'){
      const tile=SP.tileByPos(state,target.position);return tile?{exists:true,available:SP.walkable(state,target.position),reason:SP.walkable(state,target.position)?null:'blocked',label:targetLabel(target)}:{exists:false,available:false,reason:'missing',label:targetLabel(target)};
    }
    return {exists:false,available:false,reason:'missing',label:targetLabel(target)};
  }
  function interruptUnavailableTarget(a,target,status){
    const label=status.label||targetLabel(target);
    if(status.reason==='offMap')abortAction(a,`發現${label}已經離開可互動範圍`);
    else if(!status.exists)abortAction(a,`找不到原本的目標${label?`「${label}」`:''}`);
    else abortAction(a,`發現${label}目前無法互動`);
  }
  function moveToward(a,goal,reason){
    if(!goal||a.offMap)return false;if(SP.same(a.position,goal))return true;const path=SP.astar(state,a.position,goal,a.id);if(path.length<2)return false;
    standUp(a);const next=path[1];a.position={...next};let cost=.10;if(a.held)cost+=.03;if(a.carrying)cost+=.05+Math.min(.05,(a.carrying.amount||0)*.0015);applyExertion(a,cost,a.carrying?'搬運中步行':a.held?'拿著物品步行':'步行',{thirstFactor:.18,hungerFactor:.05});onEnterTile(a);a.action.lastMoveReason=reason;a.action.lastPath=path.map(p=>({...p}));return SP.same(a.position,goal);
  }
  function moveToInteraction(a,target,reason){
    const status=targetAvailability(target);if(!status.exists||!status.available){interruptUnavailableTarget(a,target,status);return false;}
    if(SP.isAtInteraction(state,a,target)){a.action.wait=0;return true;}
    const goal=SP.bestInteractionPosition(state,a,target);
    if(!goal){a.action.wait=(a.action.wait||0)+1;if(a.action.wait===1||a.action.wait===4)addEvent(`${a.name}暫時找不到能接近${status.label}的位置。`,'normal',[],{action:'wait',target:target.id});if(a.action.wait>=MAX_INTERACTION_WAIT)abortAction(a,`持續找不到能接近${status.label}的位置`);return false;}
    a.action.wait=0;a.action.spatialGoal={...goal};moveToward(a,goal,reason);return false;
  }
  function moveToExact(a,p,reason){if(SP.same(a.position,p))return true;a.action.spatialGoal={...p};moveToward(a,p,reason);return false;}

  function applyIngestion(a,r,amount,causeIds=[]){const def=RESOURCE_TYPES[r];if(!def||amount<=0)return;if(def.hungerRelief){const[lo,hi]=def.hungerRelief;a.needs.hunger=clamp(a.needs.hunger-rand(lo,hi)*Math.min(1,amount/6));}if(def.thirstRelief){const[lo,hi]=def.thirstRelief;a.needs.thirst=clamp(a.needs.thirst-rand(lo,hi)*Math.min(1,amount/6));}if(def.intoxicationFactor){a.status.intoxication=clamp(a.status.intoxication+amount*def.intoxicationFactor+rand(1,5));const e=addEvent(`${a.name}的醉酒程度上升至 ${Math.round(a.status.intoxication)}。`,'warn',causeIds,{status:'intoxication',resource:r,value:a.status.intoxication,coordination:coordination(a)});a.causes.intoxication=e;}}
  function consumeFrom(a,fromId,r,amount,label){const taken=takeResource(fromId,r,amount);if(taken<=0)return false;const e=addEvent(`${a.name}${label}`,'good',[resourceCause(fromId,r)].filter(Boolean),{action:r==='food'?'eat':r==='water'?'drinkWater':'drinkAlcohol',resource:r,from:fromId,amount:taken,position:SP.key(a.position)});applyIngestion(a,r,taken,[e]);return true;}
  function pourIntoHeld(a,sourceId,r,difficulty=.9){
    if(!a.held)return false;const desired=Math.min(capacityLeft(a.held),rand(9,16));if(desired<=0)return false;const pc=precisionCheck(a,difficulty,SP.floorSlipRiskAt(state,a.position)*.08);
    const attempt=addEvent(`${a.name}嘗試把${resourceName(r)}從${endpointName(sourceId)}倒進${endpointName(a.held)}。`,'normal',a.causes.intoxication?[a.causes.intoxication]:[],{action:'pour',resource:r,from:sourceId,to:a.held,successChance:pc.success,roll:pc.roll,coordination:pc.coord,position:SP.key(a.position)});
    if(pc.ok){const moved=transferResource(r,sourceId,a.held,desired);const e=addEvent(`${a.name}順利把${resourceName(r)}倒進${endpointName(a.held)}。`,'good',[attempt],{resource:r,from:sourceId,to:a.held,amount:moved});setResourceCause(a.held,r,e);return moved>0;}
    const available=isFinite(amountAt(sourceId,r))?Math.min(desired,amountAt(sourceId,r)):desired,kept=transferResource(r,sourceId,a.held,available*rand(.2,.55)),tileId=tileEndpointId(a.position),spilled=transferResource(r,sourceId,tileId,Math.max(0,available-kept));const f=addEvent(`${a.name}倒${resourceName(r)}時手一晃，灑掉了一部分。`,'warn',[attempt],{reason:'coordination',resource:r,amount:spilled,coordination:pc.coord,position:SP.key(a.position)});if(spilled>0)setResourceCause(tileId,r,f);return kept>0||spilled>0;
  }

  function foodStock(){return Object.values(state.containers).reduce((sum,c)=>sum+(c.contents?.food||0),0);}
  function wetTotal(){return Object.values(state.map.tiles).reduce((s,t)=>s+SP.tileLiquidAmount(t),0);}
  function nearestHuman(a){return Object.values(state.agents).filter(x=>x.kind==='human'&&!x.offMap).sort((x,y)=>SP.pathDistance(state,a,x.position)-SP.pathDistance(state,a,y.position))[0]||null;}
  function edibleFoodContainers(a){
    return Object.values(state.containers).filter(c=>{
      if(!c.canEatFrom||(c.contents?.food||0)<=.05)return false;
      const holder=holderOf(c.id);return !holder||holder.id===a?.id;
    });
  }
  function availableFoodAmount(a){return edibleFoodContainers(a).reduce((sum,c)=>sum+(c.contents?.food||0),0);}
  function foodSourceDistance(a,c){const p=SP.bestInteractionPosition(state,a,{kind:'object',id:c.id});return p?SP.pathDistance(state,a,p):Infinity;}
  function chooseFoodSource(a){
    const list=edibleFoodContainers(a).map(c=>({c,d:foodSourceDistance(a,c)})).filter(x=>Number.isFinite(x.d));
    list.sort((x,y)=>x.d-y.d||(x.c.servingDish?0:1)-(y.c.servingDish?0:1));return list[0]?.c||null;
  }
  function servingDishes(a){
    const list=Object.values(state.containers).filter(c=>{
      if(!c.servingDish||!c.portable)return false;
      const holder=holderOf(c.id);if(holder&&holder.id!==a.id)return false;
      return !Object.entries(c.contents||{}).some(([r,v])=>r!=='food'&&v>.05);
    }).map(c=>({c,d:foodSourceDistance(a,c),filled:(c.contents?.food||0)>.05})).filter(x=>Number.isFinite(x.d));
    list.sort((x,y)=>(y.filled?1:0)-(x.filled?1:0)||x.d-y.d);return list.map(x=>x.c);
  }
  function mealSlots(a){
    const list=SP.allSlots(state).filter(s=>SP.slotAllows(s,a)&&SP.slotAvailable(state,s.id,a.id)&&(s.mealSeat||s.canRest)).map(s=>({s,d:SP.pathDistance(state,a,s.position),penalty:s.mealSeat?0:8,noise:SP.noiseAt(state,s.position)})).filter(x=>Number.isFinite(x.d));
    list.sort((x,y)=>(x.penalty+x.d+x.noise*.15)-(y.penalty+y.d+y.noise*.15));return list.map(x=>x.s);
  }

  function options(a){
    const o=[],food=availableFoodAmount(a),water=state.containers.waterBucket.contents.water||0,wet=wetTotal();
    if(a.kind==='human'){
      if(food>0)o.push({id:'eat',score:a.needs.hunger*1.08+12,why:['飢餓','家中有可食用的食物']});
      o.push({id:'drinkWater',score:a.needs.thirst*1.18+10,why:['口渴','會尋找可用容器與水源']});
      if((state.containers.alcoholBottle.contents.alcohol||0)>0)o.push({id:'drinkAlcohol',score:a.needs.thirst*.42+a.traits.alcoholLike*34+(a.status.intoxication<35?6:-18),why:['口渴與飲酒偏好','酒瓶本身也可直接飲用']});
      o.push({id:'rest',score:Math.max(0,a.needs.fatigue-18)*1.25+9,why:['疲勞','會依可用 Rest Surface 與局部噪音選位置']});
      if(Object.values(state.agents).some(x=>x.kind==='human'&&x.id!==a.id&&!x.offMap))o.push({id:'talk',score:Math.max(0,a.needs.social-18)*.9+a.traits.social*16,why:['社交需求']});
      if(a.pendingInteraction?.type==='cat_request')o.push({id:'petCat',score:72+a.traits.animalAffinity*20,why:['橘子剛剛主動討摸','回應已形成短期社交動機']});
      else o.push({id:'petCat',score:8+a.traits.animalAffinity*18+a.needs.social*.18,why:['對橘子的親和度']});
      if(wet>.2)o.push({id:'cleanFloor',score:15+wet*.9+a.wellbeing.safety*.08,why:['附近有濕地','降低未來滑倒與沾濕風險']});
      if((state.containers.waterBucket.contents.water||0)<24)o.push({id:'refillWater',score:42-(state.containers.waterBucket.contents.water||0)*.5,why:['水桶存量偏低']});
      if((state.containers.mealTray.contents.food||0)<18&&(state.containers.foodPantry.contents.food||0)>5)o.push({id:'refillFood',score:45-(state.containers.mealTray.contents.food||0),why:['現成食物偏低','食物櫃仍有庫存']});
      if(foodStock()<state.supply.trigger&&!state.supply.workerId&&a.needs.fatigue<74&&a.needs.thirst<82&&a.needs.hunger<82)o.push({id:'supplyFood',score:58+(state.supply.trigger-foodStock())*.5-a.needs.fatigue*.18,why:['食物總庫存低於補給門檻','外出勞動可補回食物']});
      o.push({id:'wander',score:10+rand(0,14),why:['沒有更迫切的需求時會閒晃']});
    }else{
      if(food>0)o.push({id:'eat',score:a.needs.hunger*1.08+12,why:['飢餓','會直接吃可接近的食物，包括盤子裡的食物']});
      o.push({id:'groom',score:a.needs.groomingNeed*.83+Object.values(a.contacts.paws||{}).reduce((x,y)=>x+y,0)*.9+18,why:['理毛需求','腳掌異物會提高舔毛意願']});
      o.push({id:'rest',score:Math.max(0,a.needs.fatigue-15)*1.05+8,why:['疲勞','可選沙發或安全乾燥地面']});
      if(a.needs.social>14&&nearestHuman(a))o.push({id:'seekHuman',score:Math.max(0,a.needs.social-10)*.95+a.traits.social*18,why:['社交需求','會主動找附近的人']});
      o.push({id:'wander',score:20+a.traits.curious*25+rand(0,16),why:['探索傾向']});
      if(water>0)o.push({id:'drinkWater',score:a.needs.thirst*1.05+8,why:['口渴']});
    }
    return o.map(x=>({...x,score:Math.max(0,x.score+rand(-5,5))})).sort((a,b)=>b.score-a.score);
  }
  function choose(a){const os=options(a),pick=os[0];state.thoughts[a.id]={options:os,pick,tick:state.tick};return pick;}

  function randomFloorTile(a){const tiles=Object.values(state.map.tiles).filter(t=>SP.walkable(state,t)),scored=tiles.map(t=>({t,d:SP.pathDistance(state,a,t)})).filter(x=>Number.isFinite(x.d)&&x.d>0);if(!scored.length)return null;return scored[Math.floor(rand(0,scored.length))].t;}
  function startAction(a,choice){
    const base={intent:choice.id,phase:'start',started:state.tick,wait:0};
    switch(choice.id){
      case'eat':a.action={...base,phase:'prepare'};break;
      case'drinkWater':a.action=a.kind==='cat'?{...base,phase:'move',targetObject:'waterBucket',resource:'water'}:{...base,phase:'chooseVessel',sourceObject:'waterBucket',resource:'water'};break;
      case'drinkAlcohol':a.action={...base,phase:'chooseVessel',sourceObject:'alcoholBottle',resource:'alcohol'};break;
      case'rest':a.action={...base,phase:'chooseSurface',restTicks:0};break;
      case'talk':{const other=Object.values(state.agents).filter(x=>x.kind==='human'&&x.id!==a.id&&!x.offMap).sort((x,y)=>SP.pathDistance(state,a,x.position)-SP.pathDistance(state,a,y.position))[0];a.action=other?{...base,phase:'move',targetAgent:other.id}:null;break;}
      case'petCat':a.action={...base,phase:'move',targetAgent:'orange',commitment:{acceptedAt:state.tick,strength:'light'}};if(a.pendingInteraction?.type==='cat_request')a.pendingInteraction.accepted=true;break;
      case'seekHuman':{const h=nearestHuman(a);a.action=h?{...base,phase:'move',targetAgent:h.id}:null;break;}
      case'cleanFloor':{const t=SP.wettestTile(state);a.action={...base,phase:'move',targetTile:t?{x:t.x,y:t.y}:null};break;}
      case'groom':a.action={...base,phase:'groom'};break;
      case'wander':{const t=randomFloorTile(a);a.action={...base,phase:'move',targetTile:t?{x:t.x,y:t.y}:null,oneShot:true};break;}
      case'refillWater':a.action={...base,phase:'toBucket'};break;
      case'refillFood':a.action={...base,phase:'toPantry'};break;
      case'supplyFood':state.supply.workerId=a.id;a.action={...base,phase:'toDoor',workLeft:Math.floor(rand(7,11)),produced:0};break;
      default:a.action=null;
    }
    if(a.action)addEvent(`${a.name}決定${ZH[choice.id]||choice.id}。`,'system',[],{action:choice.id,phase:'plan',position:SP.key(a.position)});
  }
  function finishAction(a,{dropHeld=true}={}){
    releaseAgentReservations(a);if(dropHeld&&a.held)releaseHeld(a);if(a.action?.intent==='supplyFood'&&state.supply.workerId===a.id)state.supply.workerId=null;a.action=null;
  }
  function abortAction(a,reason){addEvent(`${a.name}${reason}，放棄目前的行動。`,'normal',[],{action:'abort',intent:a.action?.intent||''});finishAction(a);}

  function chooseDrinkVessel(a,r){
    const desperate=a.needs.thirst>=88;
    const list=Object.values(state.containers).filter(c=>c.portable&&c.canDrinkFrom&&!holderOf(c.id));
    const compatible=list.filter(c=>desperate||!Object.entries(c.contents||{}).some(([x,v])=>x!==r&&v>.1));
    compatible.sort((x,y)=>{
      const sx=(x.drinkPreference??.5)*45+(amountAt(x.id,r)>0?25:sumContents(x)<=.1?12:0)-SP.pathDistance(state,a,SP.bestInteractionPosition(state,a,{kind:'object',id:x.id})||a.position)*4;
      const sy=(y.drinkPreference??.5)*45+(amountAt(y.id,r)>0?25:sumContents(y)<=.1?12:0)-SP.pathDistance(state,a,SP.bestInteractionPosition(state,a,{kind:'object',id:y.id})||a.position)*4;
      return sy-sx;
    });return compatible[0]||null;
  }
  function restRecoveryInfo(a){
    const noise=SP.noiseAt(state,a.position);let surfaceQuality=.18,surfaceKind='standing',slot=null;
    if(a.posture?.kind==='sitting'&&a.posture.slotId){slot=SP.getSlot(state,a.posture.slotId);surfaceQuality=slot?.restQuality??.35;surfaceKind='seat';}
    else if(a.posture?.kind==='lying'){surfaceQuality=a.kind==='cat'?.42:.35;surfaceKind='floor';}
    const baseEfficiency=clamp(.92-noise*.025,.25,1.08),surfaceMultiplier=surfaceKind==='seat'?clamp(.90+surfaceQuality*.25,.9,1.15):surfaceKind==='floor'?clamp(.82+surfaceQuality*.24,.78,1.05):.72,restEfficiency=clamp(baseEfficiency*surfaceMultiplier,.12,1.30),recoveryRate=a.traits.recoveryRate??1,recovery=3.2*restEfficiency*recoveryRate;
    return {recovery,restEfficiency,baseEfficiency,surfaceMultiplier,surfaceKind,slotId:slot?.id||null,furnitureId:slot?.furnitureId||null,recoveryRate,noise,localComfort:SP.comfortAt(state,a.position)};
  }

  function directFoodFallback(a,p){
    const src=chooseFoodSource(a);if(!src){finishAction(a,{dropHeld:false});return false;}p.foodSource=src.id;p.container=null;p.slotId=null;p.phase='toDirectFood';return true;
  }
  function stepEat(a,p){
    if(p.phase==='prepare'){
      if(a.kind==='cat'){
        directFoodFallback(a,p);return;
      }
      if(a.needs.hunger>=82){directFoodFallback(a,p);return;}
      for(const dish of servingDishes(a)){
        if(reserve(`object:${dish.id}`,a)){p.container=dish.id;p.phase='toDish';return;}
      }
      directFoodFallback(a,p);return;
    }
    if(p.phase==='toDish'){
      const dish=state.containers[p.container],holder=holderOf(p.container);
      if(!dish||!dish.servingDish||(holder&&holder.id!==a.id)){releaseReservation(`object:${p.container}`,a);p.container=null;p.phase='prepare';return;}
      if(!reserve(`object:${p.container}`,a)){p.container=null;p.phase='prepare';return;}
      if(!moveToInteraction(a,{kind:'object',id:p.container},`去拿${endpointName(p.container)}`))return;p.phase='takeDish';return;
    }
    if(p.phase==='takeDish'){
      if(!holdContainer(a,p.container)){releaseReservation(`object:${p.container}`,a);p.container=null;p.phase='prepare';return;}
      releaseReservation(`object:${p.container}`,a);addEvent(`${a.name}拿起了${endpointName(p.container)}。`,'normal',[],{action:'takeServingDish',container:p.container});
      p.phase=amountAt(p.container,'food')>.05?'chooseSeat':'toFood';return;
    }
    if(p.phase==='toFood'){
      if(amountAt('mealTray','food')<=.05){abortAction(a,'發現現成食物已經吃完了');return;}
      if(!moveToInteraction(a,{kind:'object',id:'mealTray'},`拿著${endpointName(p.container)}去盛食物`))return;p.phase='serve';return;
    }
    if(p.phase==='serve'){
      if(amountAt('mealTray','food')<=.05){abortAction(a,'準備盛食物時發現已經沒有了');return;}
      if(!reserve('object:mealTray',a)){
        p.wait=(p.wait||0)+1;if(p.wait===1||p.wait===4)addEvent(`${a.name}端著${endpointName(p.container)}等別人取完食物。`,'normal',[],{action:'wait',target:'mealTray'});
        if(p.wait>=MAX_INTERACTION_WAIT)abortAction(a,'等不到可以盛食物的機會');return;
      }
      p.wait=0;const wanted=Math.min(capacityLeft(p.container),rand(7,10)),m=transferResource('food','mealTray',p.container,wanted);releaseReservation('object:mealTray',a);
      if(m<=0){abortAction(a,'沒有盛到食物');return;}
      const e=addEvent(`${a.name}把一份食物盛進${endpointName(p.container)}。`,'good',[],{action:'serveFood',from:'mealTray',to:p.container,amount:m});setResourceCause(p.container,'food',e);p.phase='chooseSeat';return;
    }
    if(p.phase==='chooseSeat'){
      for(const slot of mealSlots(a)){
        if(reserve(`slot:${slot.id}`,a)){p.slotId=slot.id;p.phase='toSeat';return;}
      }
      p.phase='standEat';return;
    }
    if(p.phase==='toSeat'){
      const slot=SP.getSlot(state,p.slotId);if(!slot||!reserve(`slot:${p.slotId}`,a)){p.slotId=null;p.phase='chooseSeat';return;}
      if(!moveToExact(a,slot.position,'端著餐盤去找座位'))return;p.phase='sit';return;
    }
    if(p.phase==='sit'){
      const slot=SP.getSlot(state,p.slotId);if(!slot||!SP.same(a.position,slot.position)){p.slotId=null;p.phase='chooseSeat';return;}
      sitOn(a,slot);addEvent(`${a.name}端著${endpointName(p.container)}坐到${state.furniture[slot.furnitureId]?.name||'座位'}。`,'normal',[],{action:'sitForMeal',slot:slot.id,container:p.container});p.phase='eatingPlate';return;
    }
    if(p.phase==='standEat'){
      standUp(a);addEvent(`${a.name}沒有找到合適座位，便端著${endpointName(p.container)}站著吃。`,'normal',[],{action:'standForMeal',container:p.container});p.phase='eatingPlate';return;
    }
    if(p.phase==='eatingPlate'){
      const amount=amountAt(p.container,'food');if(amount<=.05){finishAction(a);return;}
      consumeFrom(a,p.container,'food',amount,`把${endpointName(p.container)}裡的食物吃完了。`);finishAction(a);return;
    }
    if(p.phase==='toDirectFood'){
      const src=state.containers[p.foodSource],holder=holderOf(p.foodSource);
      if(!src||!src.canEatFrom||amountAt(p.foodSource,'food')<=.05||(holder&&holder.id!==a.id)){p.foodSource=null;p.phase='prepare';return;}
      if(!moveToInteraction(a,{kind:'object',id:p.foodSource},`去找${endpointName(p.foodSource)}裡的食物`))return;p.phase='claimDirect';return;
    }
    if(p.phase==='claimDirect'){
      const src=state.containers[p.foodSource],holder=holderOf(p.foodSource);
      if(!src||amountAt(p.foodSource,'food')<=.05||(holder&&holder.id!==a.id)){p.foodSource=null;p.phase='prepare';return;}
      if(!reserve(`object:${p.foodSource}`,a)){p.wait=(p.wait||0)+1;if(p.wait===1||p.wait===4)addEvent(`${a.name}到了食物旁，但有人正在取用，只好等一下。`,'normal',[],{action:'wait',target:p.foodSource});if(p.wait>=MAX_INTERACTION_WAIT){p.foodSource=null;p.wait=0;p.phase='prepare';}return;}
      p.wait=0;p.phase='eatingDirect';addEvent(`${a.name}開始吃${endpointName(p.foodSource)}裡的食物。`,'normal',[],{action:'eat',phase:'start',from:p.foodSource});return;
    }
    if(p.phase==='eatingDirect'){
      const src=state.containers[p.foodSource],holder=holderOf(p.foodSource);if(!src||amountAt(p.foodSource,'food')<=.05||(holder&&holder.id!==a.id)){releaseReservation(`object:${p.foodSource}`,a);finishAction(a,{dropHeld:false});return;}
      const label=a.kind==='cat'?`低頭吃了些${endpointName(p.foodSource)}裡的食物。`:`直接吃了一份${endpointName(p.foodSource)}裡的食物。`;
      consumeFrom(a,p.foodSource,'food',rand(5,10),label);releaseReservation(`object:${p.foodSource}`,a);finishAction(a,{dropHeld:false});return;
    }
  }

  function stepDrink(a,p){
    if(a.kind==='cat'){
      if(p.phase==='move'){if(!moveToInteraction(a,{kind:'object',id:'waterBucket'},'去找水喝'))return;p.phase='drink';return;}
      if(p.phase==='drink'){consumeFrom(a,'waterBucket','water',rand(4,8),'低頭喝了些水。');finishAction(a,{dropHeld:false});return;}return;
    }
    if(p.phase==='chooseVessel'){const v=chooseDrinkVessel(a,p.resource);if(!v){abortAction(a,'找不到可用的飲用容器');return;}p.container=v.id;p.phase='toVessel';return;}
    if(p.phase==='toVessel'){const holder=holderOf(p.container);if(holder&&holder.id!==a.id){p.phase='chooseVessel';return;}if(!moveToInteraction(a,{kind:'object',id:p.container},`去拿${endpointName(p.container)}`))return;p.phase='take';return;}
    if(p.phase==='take'){if(!holdContainer(a,p.container)){p.phase='chooseVessel';return;}addEvent(`${a.name}拿起了${endpointName(p.container)}。`,'normal',[],{action:'takeContainer',container:p.container});p.phase=amountAt(p.container,p.resource)>=4?'drink':'toSource';return;}
    if(p.phase==='toSource'){if(p.container===p.sourceObject){p.phase='drink';return;}if(!moveToInteraction(a,{kind:state.sources[p.sourceObject]?'source':'object',id:p.sourceObject},`拿著${endpointName(p.container)}去取${resourceName(p.resource)}`))return;p.phase='fill';return;}
    if(p.phase==='fill'){if(amountAt(p.sourceObject,p.resource)<=0){abortAction(a,`到了${endpointName(p.sourceObject)}卻發現已經沒有${resourceName(p.resource)}`);return;}pourIntoHeld(a,p.sourceObject,p.resource,p.resource==='alcohol'?1.4:.8);p.phase='drink';return;}
    if(p.phase==='drink'){if(amountAt(p.container,p.resource)<=0){p.phase='toSource';return;}const name=endpointName(p.container);consumeFrom(a,p.container,p.resource,rand(5,10),p.resource==='alcohol'?`直接從${name}喝了些酒。`:`從${name}喝了些水。`);finishAction(a);return;}
  }

  function stepRest(a,p){
    if(p.phase==='chooseSurface'){
      const candidates=SP.restTargets(state,a).filter(x=>x.id!==p.excludeTarget);const t=candidates[0];
      if(t){p.restTarget={...t};if(t.kind==='slot'){if(!reserve(`slot:${t.id}`,a)){p.excludeTarget=t.id;return;}}p.phase='move';return;}
      p.restTarget={kind:'standing',position:{...a.position},quality:.18,posture:'standing'};p.phase='settle';return;
    }
    if(p.phase==='move'){
      const t=p.restTarget;if(t.kind==='slot'&&!reserve(`slot:${t.id}`,a)){p.excludeTarget=t.id;p.phase='chooseSurface';return;}if(!moveToExact(a,t.position,'前往休息位置'))return;p.phase='settle';return;
    }
    if(p.phase==='settle'){
      const t=p.restTarget;if(t.kind==='slot'){const slot=SP.getSlot(state,t.id);if(!slot||!SP.same(a.position,slot.position)){p.phase='chooseSurface';return;}sitOn(a,slot);}else if(t.posture==='lying')lieDown(a);else standUp(a);
      p.phase='resting';p.restTicks=0;p.targetFatigue=a.kind==='cat'?18:20;addEvent(`${a.name}${a.posture.kind==='sitting'?`坐在${state.furniture[a.posture.furnitureId]?.name||'座位'}`:a.posture.kind==='lying'?'蜷下身體':'停下來'}休息。`,'normal',[],{action:'rest',posture:a.posture.kind,position:SP.key(a.position)});return;
    }
    if(p.phase==='resting'){
      const info=restRecoveryInfo(a);p.restTicks++;
      if(info.noise>22&&p.restTicks<=4){const old=p.restTarget?.id;if(a.posture.kind==='sitting'&&a.posture.slotId)releaseReservation(`slot:${a.posture.slotId}`,a);standUp(a);p.excludeTarget=old;p.phase='chooseSurface';addEvent(`${a.name}覺得這裡太吵，改找別的休息位置。`,'normal',[],{action:'restReroute',noise:info.noise});return;}
      a.needs.fatigue=clamp(a.needs.fatigue-info.recovery);a.wellbeing.comfort=clamp(a.wellbeing.comfort+.12*info.restEfficiency);
      if(a.needs.fatigue<=p.targetFatigue||p.restTicks>=24){finishAction(a,{dropHeld:false});return;}return;
    }
  }

  function stepSocial(a,p){
    const target=state.agents[p.targetAgent];if(!target){interruptUnavailableTarget(a,{kind:'agent',id:p.targetAgent},targetAvailability({kind:'agent',id:p.targetAgent}));return;}
    if(target.offMap){interruptUnavailableTarget(a,{kind:'agent',id:target.id},targetAvailability({kind:'agent',id:target.id}));return;}
    if(p.phase==='move'){if(!moveToInteraction(a,{kind:'agent',id:target.id},p.intent==='petCat'?'去找橘子':p.intent==='seekHuman'?'去找人撒嬌':'去找人聊天'))return;p.phase='interact';return;}
    if(p.phase==='interact'){
      if(!SP.isAtInteraction(state,a,{kind:'agent',id:target.id})){p.phase='move';return;}
      if(p.intent==='talk'){a.needs.social=clamp(a.needs.social-rand(12,20));target.needs.social=clamp(target.needs.social-rand(8,15));addNoise(a.position,8,2,'talk');addEvent(`${a.name}和${target.name}聊了一會兒。`,'good',[],{action:'talk',target:target.id,position:SP.key(a.position)});}
      else if(p.intent==='petCat'){a.needs.social=clamp(a.needs.social-rand(5,10));target.needs.social=clamp(target.needs.social-rand(12,20));target.wellbeing.comfort=clamp(target.wellbeing.comfort+rand(2,5));addEvent(`${a.name}主動走去找橘子，蹲下來摸了摸牠；橘子靠過去蹭了幾下。`,'good',[],{action:'petCat',target:target.id,position:SP.key(a.position)});}
      else if(p.intent==='seekHuman'){target.pendingInteraction={type:'cat_request',from:a.id,createdTick:state.tick,expiresTick:state.tick+3,accepted:false};a.needs.social=clamp(a.needs.social-rand(3,6));addEvent(`${a.name}主動跑到${target.name}旁邊，喵了一聲又蹭了蹭腿，等著${target.name}回應。`,'good',[],{action:'seekHuman',target:target.id,position:SP.key(a.position)});}
      finishAction(a,{dropHeld:false});return;
    }
  }

  function stepRefillWater(a,p){
    if(p.phase==='toBucket'){if(!moveToInteraction(a,{kind:'object',id:'waterBucket'},'去水桶旁'))return;p.phase='toTap';return;}
    if(p.phase==='toTap'){if(!moveToInteraction(a,{kind:'source',id:'tap'},'準備補水'))return;p.phase='fill';return;}
    if(p.phase==='fill'){const wanted=Math.min(capacityLeft('waterBucket'),rand(18,30)),m=transferResource('water','tap','waterBucket',wanted);applyExertion(a,.7,'補充水桶');addEvent(`${a.name}替水桶補了 ${Math.round(m)} 單位的水。`,'good',[],{action:'refillWater',amount:m});finishAction(a,{dropHeld:false});return;}
  }
  function stepRefillFood(a,p){
    if(p.phase==='toPantry'){if(!moveToInteraction(a,{kind:'object',id:'foodPantry'},'去食物櫃拿食物'))return;p.phase='take';return;}
    if(p.phase==='take'){const m=takeResource('foodPantry','food',Math.min(rand(12,20),capacityLeft('mealTray')));if(m<=0){finishAction(a,{dropHeld:false});return;}a.carrying={resource:'food',amount:m};applyExertion(a,.55,'搬取食物',{thirstFactor:.18,hungerFactor:.06});p.phase='toTray';return;}
    if(p.phase==='toTray'){if(!moveToInteraction(a,{kind:'object',id:'mealTray'},'把食物搬到餐桌'))return;p.phase='deposit';return;}
    if(p.phase==='deposit'){const m=putResource('mealTray','food',a.carrying?.amount||0);a.carrying=null;addEvent(`${a.name}把食物補進現成食物。`,'good',[],{action:'refillFood',amount:m});finishAction(a,{dropHeld:false});return;}
  }
  function stepClean(a,p){if(!p.targetTile){finishAction(a,{dropHeld:false});return;}if(p.phase==='move'){if(!moveToExact(a,p.targetTile,'去清理濕地'))return;p.phase='clean';return;}if(p.phase==='clean'){const t=SP.tileByPos(state,p.targetTile);let total=0;for(const [r,v] of Object.entries({...t.surface.contents})){if(RESOURCE_TYPES[r]?.phase!=='liquid')continue;const m=Math.min(v,rand(8,18));t.surface.contents[r]-=m;if(t.surface.contents[r]<.001)delete t.surface.contents[r];total+=m;}applyExertion(a,.65,'清理地面');addEvent(`${a.name}清理了 (${t.x}, ${t.y}) 的濕地。`,'good',[],{action:'cleanFloor',amount:total,position:t.id});finishAction(a,{dropHeld:false});return;}}
  function stepGroom(a){let ingested=0;for(const [r,v] of Object.entries({...a.contacts.paws})){const m=v*rand(.45,.75);a.contacts.paws[r]-=m;if(a.contacts.paws[r]<.001)delete a.contacts.paws[r];ingested+=m;if(m>0)applyIngestion(a,r,m,[]);}a.needs.groomingNeed=clamp(a.needs.groomingNeed-rand(18,30));applyExertion(a,.08,'舔毛');addEvent(`${a.name}舔了舔腳掌和身上的毛。${ingested>0?'也因此吞下了一些沾在毛上的東西。':''}`,'good',[],{action:'groom',amount:ingested});finishAction(a,{dropHeld:false});}
  function stepWander(a,p){if(!p.targetTile){finishAction(a,{dropHeld:false});return;}if(moveToExact(a,p.targetTile,'閒晃'))finishAction(a,{dropHeld:false});}
  function stepSupply(a,p){
    const door=SP.getSlot(state,'frontDoor:inside');
    if(p.phase==='toDoor'){if(!door||!moveToExact(a,door.position,'準備外出補給'))return;p.phase='exit';return;}
    if(p.phase==='exit'){a.offMap=true;standUp(a);addEvent(`${a.name}從大門外出補給食物。`,'normal',[],{action:'supplyExit'});p.phase='work';return;}
    if(p.phase==='work'){if(a.needs.fatigue>88||a.needs.thirst>94||a.needs.hunger>94){a.offMap=false;a.position={...door.position};abortAction(a,'身體狀況太差，提早回家');return;}applyExertion(a,1.05,'外出補給工作',{thirstFactor:.33,hungerFactor:.10});p.workLeft--;if(p.workLeft<=0){p.produced=rand(32,46);a.carrying={resource:'food',amount:p.produced};a.offMap=false;a.position={...door.position};p.phase='returnPantry';addEvent(`${a.name}完成外出補給，帶著食物回到大門。`,'good',[],{action:'supplyReturn',amount:p.produced});}return;}
    if(p.phase==='returnPantry'){if(!moveToInteraction(a,{kind:'object',id:'foodPantry'},'把補給帶回食物櫃'))return;p.phase='deposit';return;}
    if(p.phase==='deposit'){const m=putResource('foodPantry','food',a.carrying?.amount||0);a.carrying=null;state.supply.trips++;state.supply.totalProduced+=m;addEvent(`${a.name}把補給帶回的 ${Math.round(m)} 單位食物放進食物櫃。`,'good',[],{action:'supplyDeposit',amount:m});finishAction(a,{dropHeld:false});return;}
  }

  function stepAction(a){const p=a.action;if(!p)return;switch(p.intent){case'eat':stepEat(a,p);break;case'drinkWater':case'drinkAlcohol':stepDrink(a,p);break;case'rest':stepRest(a,p);break;case'talk':case'petCat':case'seekHuman':stepSocial(a,p);break;case'refillWater':stepRefillWater(a,p);break;case'refillFood':stepRefillFood(a,p);break;case'cleanFloor':stepClean(a,p);break;case'groom':stepGroom(a,p);break;case'wander':stepWander(a,p);break;case'supplyFood':stepSupply(a,p);break;default:finishAction(a);}}

  function needDrift(){for(const a of Object.values(state.agents)){a.needs.hunger=clamp(a.needs.hunger+rand(.15,.55));a.needs.thirst=clamp(a.needs.thirst+rand(.25,.75));a.needs.fatigue=clamp(a.needs.fatigue+rand(.03,.14));a.needs.social=clamp(a.needs.social+rand(.05,.3));if(a.kind==='cat')a.needs.groomingNeed=clamp(a.needs.groomingNeed+rand(.08,.28));a.status.intoxication=clamp(a.status.intoxication-rand(.05,.18));}}
  function expirePendingInteractions(){for(const a of Object.values(state.agents)){const p=a.pendingInteraction;if(!p||state.tick<p.expiresTick)continue;if(p.type==='cat_request')addEvent(`${a.name}沒有立刻回應橘子的撒嬌，橘子便自己走開了。`,'normal',[],{action:'catRequestExpired',accepted:!!p.accepted});a.pendingInteraction=null;}}
  function decayNoise(){state.noiseEvents=state.noiseEvents.map(n=>({...n,ttl:n.ttl-1})).filter(n=>n.ttl>0);}
  function dayRollover(){if(state.minute<1440)return;state.minute-=1440;state.day++;for(const a of Object.values(state.agents))a.metrics.exertionToday=0;}

  function tick(){
    state.tick++;state.minute+=2;dayRollover();decayNoise();needDrift();expirePendingInteractions();
    const order=shuffle(Object.values(state.agents));
    for(const a of order){if(a.offMap&&a.action?.intent!=='supplyFood')continue;if(!a.action){const c=choose(a);if(c)startAction(a,c);continue;}stepAction(a);}
    return state;
  }

  function actionLabel(a){
    const p=a.action;if(!p)return'目前沒有進行中的行動';const moveTarget=p.spatialGoal?`・目標 (${p.spatialGoal.x},${p.spatialGoal.y})`:'';
    switch(p.intent){
      case'eat':{
        const plate=p.container?endpointName(p.container):'餐盤';
        if(p.phase==='toDish'||p.phase==='takeDish')return`吃東西・去拿${plate}${moveTarget}`;
        if(p.phase==='toFood'||p.phase==='serve')return`吃東西・用${plate}盛食物${moveTarget}`;
        if(p.phase==='chooseSeat')return`吃東西・端著${plate}找座位`;
        if(p.phase==='toSeat'||p.phase==='sit')return`吃東西・端著${plate}前往座位${moveTarget}`;
        if(p.phase==='standEat')return`吃東西・準備站著吃`;
        if(p.phase==='eatingPlate')return`吃東西・${plate}・進食中`;
        if(p.phase==='toDirectFood')return`吃東西・前往${p.foodSource?endpointName(p.foodSource):'食物'}${moveTarget}`;
        if(p.phase==='claimDirect'||p.phase==='eatingDirect')return`吃東西・${p.foodSource?endpointName(p.foodSource):'食物'}・進食中`;
        return`吃東西${moveTarget}`;
      }
      case'drinkWater':case'drinkAlcohol':return `${ZH[p.intent]}・${p.phase==='toVessel'?'去拿容器':p.phase==='toSource'?'前往來源':p.phase==='fill'?'裝取中':p.phase==='drink'?'飲用中':'準備中'}${p.container?`・${endpointName(p.container)}`:''}${moveTarget}`;
      case'rest':return p.phase==='resting'?`休息・${a.posture.kind==='sitting'?'坐著':a.posture.kind==='lying'?'躺／蜷著':'站著'}`:p.restTarget?`休息・前往${p.restTarget.kind==='slot'?targetLabel({kind:'slot',id:p.restTarget.id}):'休息位置'}`:'休息・尋找位置';
      case'talk':return`找人聊天・${state.agents[p.targetAgent]?.name||''}${moveTarget}`;
      case'petCat':return`摸橘子${moveTarget}`;
      case'seekHuman':return`找人撒嬌${moveTarget}`;
      case'cleanFloor':return`清理地面${moveTarget}`;
      case'groom':return'舔毛清潔';
      case'wander':return`閒晃${moveTarget}`;
      case'refillWater':return`補充水桶・${p.phase}`;
      case'refillFood':return`補充現成食物・${p.phase}`;
      case'supplyFood':return`外出補給・${p.phase}`;
      default:return ZH[p.intent]||p.intent;
    }
  }
  function phaseLabel(p){return p?.phase||'';}

  function getEntity(type,id){if(type==='agent')return state.agents[id];if(type==='container')return state.containers[id];if(type==='source')return state.sources[id];if(type==='furniture')return state.furniture[id];if(type==='room')return state.map.rooms[id];return null;}
  function causeTree(id,depth=0,seen=new Set()){if(!id||seen.has(id)||depth>8)return'';seen.add(id);const e=state.causes[id];if(!e)return'';const line=`${'  '.repeat(depth)}${e.time} ${e.text}`;const kids=(e.causeIds||[]).map(c=>causeTree(c,depth+1,seen)).filter(Boolean);return [line,...kids].join('\n');}
  function supplyStatus(){return {stock:foodStock(),trigger:state.supply.trigger,workerId:state.supply.workerId,workerName:state.agents[state.supply.workerId]?.name||null,trips:state.supply.trips,totalProduced:state.supply.totalProduced};}

  function reset(seed=DEFAULT_SEED){eventSeq=0;state=createInitialState(normalizeSeed(seed));SP.init(state);addEvent('v11.2 初始化：Serving / Plate 已納入同一 action core；人類可端盤找座位，橘子可直接吃可接近盤子裡的食物。','system',[],{seed:state.seed});return state;}
  reset(DEFAULT_SEED);

  window.SimEngine={RESOURCE_TYPES,ZH,DATA_ZH,clamp,rand,getState:()=>state,reset,tick,timeStr,addEvent,addNoise,resourceName,resourceIcon,contentSummary,endpointName,amountAt,capacityLeft,transferResource,coordination,applyExertion,restRecoveryInfo,foodStock,supplyStatus,actionLabel,planLabel:actionLabel,phaseLabel,getEntity,causeTree,tileEndpointId,reservationOwner,holderOf};
})();