(() => {
  const E=window.SimEngine,W=window.SimWorld,SP=window.SimSpatial,S=window.SimActivityContinuityState;
  if(!E||!W||!SP||!S)throw new Error('systems/activity-continuity/runtime.js requires Engine, World, Spatial, and Activity Continuity state.');
  if(!E.registerDecisionOptionProvider||!E.registerRuntimeHook)throw new Error('Activity Continuity requires decision-option and runtime-hook contracts.');
  if(typeof E.readAccessPenalty!=='function')throw new Error('Activity Continuity requires canonical read access penalty.');

  const VERSION=S.VERSION;
  const RESUME_SCORE_FLOOR=20,RESUME_PROGRESS_BONUS_MAX=20;
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const episodeFor=a=>S.ensureAgentState(a);
  const terminal=episode=>S.TERMINAL_LIFECYCLES.includes(episode?.lifecycle);
  function eventMarker(st){return st?.events?.[0]?.id||null;}
  function newEventsSince(st,marker){const out=[];for(const event of st?.events||[]){if(marker&&event.id===marker)break;out.push(event);}return out;}
  function readTargetStatus(st,a,episode){
    const targetId=episode?.target?.id,object=targetId?st?.objects?.[targetId]:null;
    if(!object)return {valid:false,permanent:true,reason:'target-missing',object:null,result:null};
    if(a?.kind!=='human'||!object.affordances?.includes('read'))return {valid:false,permanent:true,reason:'read-affordance-missing',object,result:null};
    const result=SP.bestInteractionPositionResult?.(st,a,{kind:'object',id:targetId},'read')||null;
    return Number.isFinite(result?.traversalCost)?{valid:true,permanent:false,reason:null,object,result}:{valid:false,permanent:false,reason:'temporarily-unreachable',object,result:null};
  }
  function progressRatio(progress){return Math.max(0,Math.min(1,(Number(progress?.feedbackUnits)||0)/Math.max(1,Number(progress?.feedbackGoal)||1)));}
  function resumeDecisionOption(st,a){
    const episode=episodeFor(a);if(!episode||episode.lifecycle!=='suspended'||episode.kind!=='read')return null;
    const status=readTargetStatus(st,a,episode);if(!status.valid)return null;
    const ratio=progressRatio(episode.suspendedProgress),score=Math.max(0,RESUME_SCORE_FLOOR+RESUME_PROGRESS_BONUS_MAX*ratio-E.readAccessPenalty(status.result.traversalCost));
    return {
      id:'read',targetObject:episode.target.id,score,activityEpisodeId:episode.id,
      why:['剛才的閱讀還沒有自然完成','恢復只提供有限 continuity evidence，仍與其他候選一起競爭'],
      decisionContributors:[
        {kind:'activityContinuity',key:'unfinishedEpisode',role:'motivation',episodeId:episode.id,activityKind:episode.kind,progressRatio:ratio,interruptedTick:episode.interruption?.tick??null},
        {kind:'spatial',key:'readAccessTraversalCost',role:'cost',value:status.result.traversalCost}
      ]
    };
  }
  function makeEpisode(st,a,action){
    const targetId=action?.targetObject,units=Number(action?.feedbackUnits)||0,goal=Number(action?.feedbackGoal)||6;
    if(action?.kind!=='read'||units<=0||units>=goal||!targetId)return null;
    const episode={id:`activity:${a.id}:${action.started}:read:${targetId}`,kind:'read',lifecycle:'ongoing',startedTick:Number(action.started)||st.tick,lastTransitionTick:st.tick,target:{kind:'object',id:targetId},boundActionStartedTick:Number(action.started)||st.tick,suspendedProgress:null,interruption:null};
    if(!S.validEpisode(episode))throw new Error('Activity Continuity created an invalid read episode.');
    a.activityEpisode=episode;
    E.addEvent(`${a.name}開始投入一段尚未完成的閱讀。`,'system',[],{actor:a.id,action:'activityStarted',activityEpisodeId:episode.id,activityKind:'read',target:targetId,position:E.positionRef(a.position)});
    return episode;
  }
  function transitionTerminal(st,a,episode,lifecycle,{reason=null,causeIds=[]}={}){
    if(!episode||terminal(episode))return false;
    episode.lifecycle=lifecycle;episode.lastTransitionTick=st.tick;episode.boundActionStartedTick=null;episode.suspendedProgress=null;episode.interruption=null;
    const action=lifecycle==='completed'?'activityCompleted':lifecycle==='invalidated'?'activityInvalidated':'activityAbandoned';
    const wording=lifecycle==='completed'?'自然完成':lifecycle==='invalidated'?'因條件失效而結束':'決定不再繼續';
    E.addEvent(`${a.name}的這段閱讀${wording}。`,lifecycle==='completed'?'good':'normal',causeIds,{actor:a.id,action,activityEpisodeId:episode.id,activityKind:episode.kind,target:episode.target.id,reason,position:E.positionRef(a.position)});
    return true;
  }
  function suspendForInterruption(st,a,{type='emergency',need=null,tick=st?.tick}={}){
    const action=a?.action;if(action?.kind!=='read')return null;
    const units=Number(action.feedbackUnits)||0,goal=Number(action.feedbackGoal)||6;if(units<=0||units>=goal)return null;
    let episode=episodeFor(a);
    if(!episode||terminal(episode)||episode.kind!=='read'||episode.target?.id!==action.targetObject||episode.boundActionStartedTick!==action.started)episode=makeEpisode(st,a,action);
    if(!episode||episode.lifecycle!=='ongoing')return null;
    episode.lifecycle='suspended';episode.lastTransitionTick=st.tick;episode.boundActionStartedTick=null;episode.suspendedProgress={feedbackUnits:units,feedbackGoal:goal};episode.interruption={type,need,tick:Number(tick)||st.tick};
    if(!S.validEpisode(episode))throw new Error('Activity Continuity suspension produced invalid state.');
    const eventId=E.addEvent(`${a.name}暫停了還沒完成的閱讀。`,'normal',[],{actor:a.id,action:'activitySuspended',activityEpisodeId:episode.id,activityKind:episode.kind,target:episode.target.id,interruptionType:type,emergencyNeed:need,feedbackUnits:units,feedbackGoal:goal,position:E.positionRef(a.position)});
    return {episode,eventId};
  }
  function resumeIntoAction(st,a,episode){
    const action=a?.action,progress=episode?.suspendedProgress;if(action?.kind!=='read'||action.targetObject!==episode?.target?.id||!progress)return false;
    action.feedbackUnits=progress.feedbackUnits;action.feedbackGoal=progress.feedbackGoal;
    episode.lifecycle='ongoing';episode.lastTransitionTick=st.tick;episode.boundActionStartedTick=action.started;episode.suspendedProgress=null;episode.interruption=null;
    if(!S.validEpisode(episode))throw new Error('Activity Continuity resume produced invalid state.');
    E.addEvent(`${a.name}回到剛才尚未完成的閱讀。`,'normal',[],{actor:a.id,action:'activityResumed',activityEpisodeId:episode.id,activityKind:episode.kind,target:episode.target.id,feedbackUnits:action.feedbackUnits,feedbackGoal:action.feedbackGoal,position:E.positionRef(a.position)});
    return true;
  }
  function settleAgent(st,a,newEvents){
    let episode=episodeFor(a);
    if(episode?.lifecycle==='suspended'){
      const status=readTargetStatus(st,a,episode);
      if(status.permanent){transitionTerminal(st,a,episode,'invalidated',{reason:status.reason});return;}
      const newlyChosen=a.action&&a.action.started===st.tick&&st.thoughts?.[a.id]?.tick===st.tick;
      if(newlyChosen){
        if(a.action.kind==='read'&&a.action.targetObject===episode.target.id){resumeIntoAction(st,a,episode);return;}
        transitionTerminal(st,a,episode,'abandoned',{reason:'deliberation-chose-other-activity'});
        episode=a.activityEpisode;
      }
    }
    if(episode?.lifecycle==='ongoing'){
      const matching=a.action?.kind==='read'&&a.action.targetObject===episode.target.id&&a.action.started===episode.boundActionStartedTick;
      if(matching)return;
      const completed=newEvents.find(event=>event.data?.action==='read'&&event.data?.actor===a.id&&event.data?.target===episode.target.id&&Number(event.data?.feedbackUnits)>=6);
      if(completed){transitionTerminal(st,a,episode,'completed',{causeIds:[completed.id]});return;}
      const aborted=newEvents.find(event=>event.data?.action==='abort'&&event.data?.actor===a.id);
      if(aborted){const status=readTargetStatus(st,a,episode);transitionTerminal(st,a,episode,status.permanent?'invalidated':'abandoned',{reason:status.reason||'read-action-aborted',causeIds:[aborted.id]});return;}
    }
    const live=a.action;
    if((!episode||terminal(episode))&&live?.kind==='read'&&(Number(live.feedbackUnits)||0)>0&&(Number(live.feedbackUnits)||0)<(Number(live.feedbackGoal)||6))makeEpisode(st,a,live);
  }
  function settle(st,marker){const events=newEventsSince(st,marker);for(const a of Object.values(st?.agents||{}))settleAgent(st,a,events);}

  E.registerDecisionOptionProvider('activityContinuity.resumeRead',(st,a)=>resumeDecisionOption(st,a),470);
  E.registerRuntimeHook('beforeTick','activityContinuity.capture-events',(ctx)=>{ctx.locals.activityContinuityEventMarker=eventMarker(ctx.state||E.getState());},1250);
  E.registerRuntimeHook('afterTick','activityContinuity.settle',(ctx)=>settle(ctx.state||E.getState(),ctx.locals.activityContinuityEventMarker),75);

  Object.assign(E,{ACTIVITY_CONTINUITY_VERSION:VERSION,ACTIVITY_CONTINUITY_RESUME_SCORE_FLOOR:RESUME_SCORE_FLOOR,ACTIVITY_CONTINUITY_RESUME_PROGRESS_BONUS_MAX:RESUME_PROGRESS_BONUS_MAX,activityEpisodeFor:episodeFor,activityContinuityResumeOption:resumeDecisionOption,suspendActivityForInterruption:suspendForInterruption});
})();
