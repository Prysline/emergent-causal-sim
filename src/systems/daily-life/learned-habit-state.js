(() => {
  const W=window.SimWorld;
  if(!W?.registerInitialStateInitializer)throw new Error('systems/daily-life/learned-habit-state.js requires world.js initial-state pipeline.');

  const VERSION='daily-life-learned-habit-v1';
  const SUPPORTED_ACTIVITY_KINDS=Object.freeze(['read','eat','talk']);
  const CONTEXT_KIND='daily-time-bucket';
  const TIME_BUCKETS=Object.freeze(['night','morning','daytime','evening']);
  const LEARNED_HABIT_GAIN=.20;
  const LEARNED_HABIT_HALF_LIFE_TICKS=5040;
  const LEARNED_HABIT_MAX_DECISION_DELTA=10;
  const SUMMARY_FIELDS=Object.freeze(['activityKind','context','strength','experienceCount','lastExperienceTick','lastSourceMemoryId']);

  function normalizeMinute(minute){const value=Number(minute);if(!Number.isFinite(value))return null;return ((Math.floor(value)%1440)+1440)%1440;}
  function dailyTimeBucket(minute){const value=normalizeMinute(minute);if(value==null)return null;if(value<360)return'night';if(value<720)return'morning';if(value<1080)return'daytime';return'evening';}
  function minuteFromEventTime(time){const match=/^(\d{2}):(\d{2})$/.exec(String(time||''));if(!match)return null;const hour=Number(match[1]),minute=Number(match[2]);if(hour<0||hour>23||minute<0||minute>59)return null;return hour*60+minute;}
  function contextForMinute(minute){const value=dailyTimeBucket(minute);return value?{kind:CONTEXT_KIND,value}:null;}
  function validContext(context){return context?.kind===CONTEXT_KIND&&TIME_BUCKETS.includes(context.value);}
  function habitKey(activityKind,context){return `${activityKind}|${context?.kind||'unknown'}:${context?.value||''}`;}
  function ensureLearnedHabitState(st,agent){
    if(!agent)throw new Error('Learned Habit state requires an Agent.');
    if(agent.learnedHabits===undefined)agent.learnedHabits={};
    if(!agent.learnedHabits||Array.isArray(agent.learnedHabits)||typeof agent.learnedHabits!=='object')throw new Error(`Learned Habit state for ${agent.id||'unknown'} requires an object map.`);
    return agent.learnedHabits;
  }
  function validSummary(summary,key=null){
    if(!summary||typeof summary!=='object'||Array.isArray(summary))return false;
    if(Object.keys(summary).some(field=>!SUMMARY_FIELDS.includes(field)))return false;
    if(!SUPPORTED_ACTIVITY_KINDS.includes(summary.activityKind)||!validContext(summary.context))return false;
    if(key!=null&&key!==habitKey(summary.activityKind,summary.context))return false;
    const strength=Number(summary.strength),count=Number(summary.experienceCount),tick=Number(summary.lastExperienceTick);
    if(!Number.isFinite(strength)||strength<0||strength>1)return false;
    if(!Number.isInteger(count)||count<1)return false;
    if(!Number.isInteger(tick)||tick<0)return false;
    return summary.lastSourceMemoryId==null||(typeof summary.lastSourceMemoryId==='string'&&!!summary.lastSourceMemoryId);
  }
  function effectiveLearnedHabitStrength(st,agent,activityKind,context,{tick=st?.tick}={}){
    if(!SUPPORTED_ACTIVITY_KINDS.includes(activityKind)||!validContext(context))return 0;
    const summary=agent?.learnedHabits?.[habitKey(activityKind,context)];if(!summary)return 0;
    const age=Math.max(0,(Number(tick)||0)-(Number(summary.lastExperienceTick)||0));
    return Math.max(0,Math.min(1,(Number(summary.strength)||0)*Math.pow(.5,age/LEARNED_HABIT_HALF_LIFE_TICKS)));
  }
  function consolidateLearnedHabit(st,agent,activityKind,context,{experienceTick=st?.tick,sourceMemoryId=null}={}){
    if(!SUPPORTED_ACTIVITY_KINDS.includes(activityKind)||!validContext(context))return null;
    const habits=ensureLearnedHabitState(st,agent),key=habitKey(activityKind,context),current=habits[key];
    if(current&&sourceMemoryId&&current.lastSourceMemoryId===sourceMemoryId)return current;
    const effective=current?effectiveLearnedHabitStrength(st,agent,activityKind,context,{tick:experienceTick}):0;
    const next=Math.max(0,Math.min(1,effective+LEARNED_HABIT_GAIN*(1-effective)));
    const summary={activityKind,context:{kind:context.kind,value:context.value},strength:next,experienceCount:(Number(current?.experienceCount)||0)+1,lastExperienceTick:Number(experienceTick)||0,lastSourceMemoryId:sourceMemoryId||null};
    habits[key]=summary;return summary;
  }
  function qualifyingExperience(st,agent,memory){
    if(!st||!agent||!memory?.sourceEventId||memory?.observed?.actorId!==agent.id)return null;
    const event=st.causes?.[memory.sourceEventId],data=event?.data||{};
    if(!event||data.actor!==agent.id)return null;
    const action=data.action;
    let qualifies=false;
    if(action==='read')qualifies=Number(data.feedbackUnits)>0;
    else if(action==='eat')qualifies=data.phase!=='start'&&Number(data.amount)>0;
    else if(action==='talk')qualifies=true;
    if(!qualifies||!SUPPORTED_ACTIVITY_KINDS.includes(action))return null;
    const minute=minuteFromEventTime(event.time),context=contextForMinute(minute);if(!context)return null;
    return {activityKind:action,context,experienceTick:Number(event.tick)||0,sourceMemoryId:memory.id,sourceEventId:event.id};
  }
  function consolidateFromMemory(st,agent,memory){const experience=qualifyingExperience(st,agent,memory);return experience?consolidateLearnedHabit(st,agent,experience.activityKind,experience.context,experience):null;}
  function decisionContributionForOption(st,agent,option){
    if(!option?.id||!SUPPORTED_ACTIVITY_KINDS.includes(option.id))return null;
    const context=contextForMinute(st?.minute);if(!context)return null;
    const strength=effectiveLearnedHabitStrength(st,agent,option.id,context);if(strength<=0)return null;
    const scoreDelta=Math.min(LEARNED_HABIT_MAX_DECISION_DELTA,strength*LEARNED_HABIT_MAX_DECISION_DELTA),key=habitKey(option.id,context);
    return Object.freeze({scoreDelta,contributor:Object.freeze({kind:'learnedHabit',key,role:'motivation',activityKind:option.id,contextKind:context.kind,contextValue:context.value,boundedEvidence:strength,scoreDelta})});
  }

  W.registerInitialStateInitializer('dailyLifeLearnedHabit.schema',(st)=>{for(const agent of Object.values(st.agents||{}))ensureLearnedHabitState(st,agent);return st;},1475);
  W.DAILY_LIFE_LEARNED_HABIT_SCHEMA_VERSION=VERSION;
  window.SimDailyLifeLearnedHabit=Object.freeze({VERSION,SUPPORTED_ACTIVITY_KINDS,CONTEXT_KIND,TIME_BUCKETS,LEARNED_HABIT_GAIN,LEARNED_HABIT_HALF_LIFE_TICKS,LEARNED_HABIT_MAX_DECISION_DELTA,dailyTimeBucket,minuteFromEventTime,contextForMinute,validContext,habitKey,ensureLearnedHabitState,validSummary,effectiveLearnedHabitStrength,consolidateLearnedHabit,qualifyingExperience,consolidateFromMemory,decisionContributionForOption});
})();
