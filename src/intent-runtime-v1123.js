(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial;if(!E||!W||!SP)return;
  const VERSION=W.INTERRUPTION_SCHEMA_VERSION||'11.12.3-replan-preemption';
  const REPLAN_ACTION_BY_INTENT={
    satisfyHunger:'eat',drinkWater:'drinkWater',drinkAlcohol:'drinkAlcohol',recoverFatigue:'rest',sleep:'sleep',
    socialize:'talk',interactWithCat:'petCat',seekSocialContact:'seekHuman',removeHazard:'cleanFloor',groom:'groom',explore:'wander'
  };
  const REPLAN_SUPPORTED=new Set([...Object.keys(REPLAN_ACTION_BY_INTENT),'respondSocialBid']);
  const EMERGENCY_PREEMPTIBLE=new Set(['wander','talk','petCat','seekHuman','cleanFloor','groom','rest']);
  const MAX_REPLAN_ATTEMPTS=3;
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function actionKind(a){return E.actionKind?E.actionKind(a?.action):a?.action?.kind||null;}
  function clearAgentReservations(st,a){for(const [key,owner] of Object.entries({...st.reservations}))if(owner===a.id)delete st.reservations[key];}
  function dropHeld(st,a){if(!a.held)return;const c=st.containers?.[a.held];if(c)c.position={...a.position};a.held=null;}
  function cleanupForInterruption(st,a){clearAgentReservations(st,a);dropHeld(st,a);a.action=null;}
  function nearestAgent(st,a,kind,{awakeOnly=false}={}){return Object.values(st.agents||{}).filter(x=>x.id!==a.id&&!x.offMap&&x.kind===kind&&(!awakeOnly||!E.isSleeping(x))).map(x=>({x,d:SP.pathDistance(st,a,x.position)})).filter(x=>Number.isFinite(x.d)).sort((p,q)=>p.d-q.d)[0]?.x||null;}
  function nearestDrinkContainer(st,a,resource){return Object.values(st.containers||{}).filter(c=>c.canDrinkFrom&&(c.contents?.[resource]||0)>.05).map(c=>{const goal=SP.bestInteractionPosition(st,a,{kind:'object',id:c.id},'drinkFrom');return goal?{c,d:SP.pathDistance(st,a,goal)}:null;}).filter(x=>x&&Number.isFinite(x.d)).sort((p,q)=>p.d-q.d)[0]?.c||null;}
  function buildAction(st,a,actionKindValue,{targetAgent=null}={}){
    if(!E.buildAction)return null;
    const choice={id:actionKindValue};
    if(targetAgent)choice.targetAgent=targetAgent;
    if((actionKindValue==='drinkWater'||actionKindValue==='drinkAlcohol')&&a.kind==='cat'){
      const resource=actionKindValue==='drinkWater'?'water':'alcohol',src=nearestDrinkContainer(st,a,resource);if(!src)return null;choice.targetObject=src.id;
    }
    return E.buildAction(a,choice);
  }
  function bindActionToIntent(a,intent,action){if(!action)return false;action.intentId=intent.id;intent.lifecycle='actionBound';a.action=action;a.activeIntent=intent;return true;}
  function responseTargetForIntent(st,intent){if(intent?.kind!=='respondSocialBid'||intent.source?.type!=='socialBid')return null;const bid=E.bidEvent?.(st,intent.source.bidId);if(!bid)return null;const target=st.agents?.[bid.data?.bidFrom];return target&&!target.offMap?target.id:null;}
  function planOpenIntent(st,a){const intent=a.activeIntent;if(a.action||!intent||intent.lifecycle!=='open'||intent.kind==='awaitResponse')return false;if(!REPLAN_SUPPORTED.has(intent.kind))return false;let kind=REPLAN_ACTION_BY_INTENT[intent.kind],targetAgent=null;if(intent.kind==='respondSocialBid'){kind='petCat';targetAgent=responseTargetForIntent(st,intent);if(!targetAgent)return false;}const action=buildAction(st,a,kind,{targetAgent});if(action&&bindActionToIntent(a,intent,action)){const count=intent.replanCount||0;E.addEvent(`${a.name}依原本的「${E.intentLabel?.(intent)||intent.kind}」重新安排${E.ZH?.[kind]||kind}。`,'system',[],{actor:a.id,action:'actionReplanned',intentId:intent.id,intentKind:intent.kind,nextActionKind:kind,replanCount:count,position:E.positionRef(a.position)});return true;}intent.replanAttempts=(intent.replanAttempts||0)+1;if(intent.replanAttempts>=MAX_REPLAN_ATTEMPTS){E.addEvent(`${a.name}暫時找不到能完成「${E.intentLabel?.(intent)||intent.kind}」的方案，停止這個短期意圖。`,'normal',[],{actor:a.id,action:'intentAbandon',intentId:intent.id,intentKind:intent.kind,replanCount:intent.replanCount||0,position:E.positionRef(a.position)});a.activeIntent=null;}return false;}
  function intentStillValid(st,a,intent){if(!intent)return false;const n=a.needs||{};switch(intent.kind){case'satisfyHunger':return (n.hunger||0)>18;case'drinkWater':return (n.thirst||0)>18;case'drinkAlcohol':return (n.thirst||0)>18;case'recoverFatigue':return (n.fatigue||0)>22;case'sleep':return (n.sleepNeed||0)>=(E.sleepProfile?.(a)?.minimumSleepNeed??28);case'socialize':return (n.social||0)>10&&!!nearestAgent(st,a,'human',{awakeOnly:true});case'interactWithCat':return !!nearestAgent(st,a,'cat');case'seekSocialContact':return (n.social||0)>10&&!!nearestAgent(st,a,'human');case'removeHazard':{const t=SP.wettestTile(st);return !!t&&SP.tileLiquidAmount(t)>.2;}case'groom':return (n.groomingNeed||0)>15||Object.values(a.contacts?.paws||{}).some(v=>v>.05);case'explore':return true;case'respondSocialBid':return !!responseTargetForIntent(st,intent);default:return false;}}
  function emergencyChoice(st,a){const candidates=[];if((a.needs?.thirst||0)>=94)candidates.push({need:'thirst',value:a.needs.thirst,intentKind:'drinkWater',actionKind:'drinkWater'});if((a.needs?.hunger||0)>=94)candidates.push({need:'hunger',value:a.needs.hunger,intentKind:'satisfyHunger',actionKind:'eat'});const minSleep=E.sleepProfile?.(a)?.minimumSleepNeed??28;if((a.needs?.sleepNeed||0)>=96&&(a.needs.sleepNeed||0)>=minSleep)candidates.push({need:'sleepNeed',value:a.needs.sleepNeed,intentKind:'sleep',actionKind:'sleep'});return candidates.sort((x,y)=>y.value-x.value)[0]||null;}
  function canStartEmergency(st,a,c){return !!buildAction(st,a,c.actionKind);}
  function startEmergency(st,a,c){const priorActionKind=actionKind(a),priorIntent=clone(a.activeIntent),priorLabel=priorActionKind?(E.ZH?.[priorActionKind]||priorActionKind):priorIntent?`「${E.intentLabel?.(priorIntent)||priorIntent.kind}」`:'目前安排';cleanupForInterruption(st,a);a.activeIntent=null;const action=buildAction(st,a,c.actionKind);if(!action)return false;const intent=E.createIntent?E.createIntent(st,a,action):{id:`intent:${a.id}:${st.tick}:${c.intentKind}`,kind:c.intentKind,createdTick:st.tick,lifecycle:'actionBound',source:{type:'emergency',tick:st.tick}};intent.kind=c.intentKind;intent.lifecycle='actionBound';intent.source={type:'emergency',need:c.need,value:c.value,tick:st.tick};action.intentId=intent.id;a.action=action;a.activeIntent=intent;E.addEvent(`${a.name}因${E.ZH?.[c.need]||c.need}過於迫切，中斷${priorLabel}，改先處理緊急需求。`,'warn',[],{actor:a.id,action:'intentPreempt',priorActionKind:priorActionKind||null,nextActionKind:c.actionKind,intentId:intent.id,intentKind:intent.kind,emergencyNeed:c.need,emergencyValue:c.value,priorIntentId:priorIntent?.id||null,position:E.positionRef(a.position)});return true;}
  function applyEmergencyPreemption(st){for(const a of Object.values(st.agents||{})){const kind=actionKind(a),openIntent=!a.action&&a.activeIntent?.lifecycle==='open';if(kind&&!EMERGENCY_PREEMPTIBLE.has(kind))continue;if(!kind&&!openIntent)continue;const c=emergencyChoice(st,a);if(!c)continue;if(a.activeIntent?.kind===c.intentKind)continue;if(!canStartEmergency(st,a,c))continue;startEmergency(st,a,c);}}
  function newEventsSince(st,marker){const out=[];for(const e of st.events||[]){if(marker&&e.id===marker)break;out.push(e);}return out;}
  function recoverAbortedIntents(st,before,newEvents){const abortByActor=new Map();for(const e of newEvents)if(e.data?.action==='abort'&&e.data?.actor)abortByActor.set(e.data.actor,e);for(const [agentId,snap] of before){const a=st.agents?.[agentId],abort=abortByActor.get(agentId);if(!a||!abort||a.action||a.activeIntent)continue;const intent=snap.intent;if(!intent||intent.lifecycle!=='actionBound'||!REPLAN_SUPPORTED.has(intent.kind))continue;if(!intentStillValid(st,a,intent))continue;intent.lifecycle='open';intent.replanCount=(intent.replanCount||0)+1;intent.lastReplanTick=st.tick;intent.replanAttempts=0;a.activeIntent=intent;E.addEvent(`${a.name}的${E.ZH?.[snap.actionKind]||snap.actionKind}方案失效，但「${E.intentLabel?.(intent)||intent.kind}」仍成立，準備重新規劃。`,'normal',[abort.id],{actor:a.id,action:'replanAction',priorActionKind:snap.actionKind,intentId:intent.id,intentKind:intent.kind,replanCount:intent.replanCount,position:E.positionRef(a.position)});}}
  function snapshotLiveActions(st){const out=new Map();for(const a of Object.values(st.agents||{}))if(a.action&&a.activeIntent)out.set(a.id,{actionKind:actionKind(a),intent:clone(a.activeIntent)});return out;}
  function planOpenIntents(st){for(const a of Object.values(st.agents||{}))planOpenIntent(st,a);}
  function prepareTick(st){applyEmergencyPreemption(st);planOpenIntents(st);return {before:snapshotLiveActions(st),marker:st.events?.[0]?.id||null};}
  function settleTick(st,snap){if(!snap)return;const newEvents=newEventsSince(st,snap.marker);recoverAbortedIntents(st,snap.before,newEvents);E.reconcileIntents?.(st);}

  if(!E.registerRuntimeHook)throw new Error('intent-runtime-v1123.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','intent.replan-preemption',(ctx)=>{ctx.locals.intentV1123=prepareTick(E.getState());},800);
  E.registerRuntimeHook('afterTick','intent.recover-aborts',(ctx)=>settleTick(E.getState(),ctx.locals.intentV1123),400);

  Object.assign(E,{INTERRUPTION_SCHEMA_VERSION:VERSION,REPLAN_SUPPORTED,EMERGENCY_PREEMPTIBLE,MAX_REPLAN_ATTEMPTS,intentStillValid,planOpenIntent,emergencyChoice});
})();
