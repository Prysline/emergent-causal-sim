(() => {
  const W=window.SimWorld;
  if(!W?.registerInitialStateInitializer)throw new Error('systems/activity-continuity/state.js requires world.js initial-state pipeline.');

  const VERSION='activity-continuity-v1';
  const LIFECYCLES=Object.freeze(['ongoing','suspended','completed','abandoned','invalidated']);
  const TERMINAL_LIFECYCLES=Object.freeze(['completed','abandoned','invalidated']);
  const SUPPORTED_ACTIVITY_KINDS=Object.freeze(['read']);

  function validProgress(progress){
    if(progress==null)return true;
    return !!progress&&Number.isFinite(progress.feedbackUnits)&&Number.isFinite(progress.feedbackGoal)&&progress.feedbackUnits>0&&progress.feedbackGoal>0&&progress.feedbackUnits<progress.feedbackGoal;
  }
  function validEpisode(episode){
    if(episode==null)return true;
    if(!episode||typeof episode!=='object'||typeof episode.id!=='string'||!episode.id)return false;
    if(!SUPPORTED_ACTIVITY_KINDS.includes(episode.kind)||!LIFECYCLES.includes(episode.lifecycle))return false;
    if(!Number.isInteger(episode.startedTick)||episode.startedTick<0||!Number.isInteger(episode.lastTransitionTick)||episode.lastTransitionTick<episode.startedTick)return false;
    if(episode.target?.kind!=='object'||typeof episode.target.id!=='string'||!episode.target.id)return false;
    if(episode.lifecycle==='ongoing')return Number.isInteger(episode.boundActionStartedTick)&&episode.boundActionStartedTick>=episode.startedTick&&episode.suspendedProgress==null;
    if(episode.lifecycle==='suspended')return episode.boundActionStartedTick==null&&validProgress(episode.suspendedProgress)&&episode.suspendedProgress!=null;
    return episode.boundActionStartedTick==null&&episode.suspendedProgress==null;
  }
  function ensureAgentState(agent){
    if(!agent)throw new Error('Activity Continuity state requires an Agent.');
    if(agent.activityEpisode===undefined)agent.activityEpisode=null;
    if(!validEpisode(agent.activityEpisode))throw new Error(`Activity Continuity state for ${agent.id||'unknown'} is invalid.`);
    return agent.activityEpisode;
  }

  W.registerInitialStateInitializer('activityContinuity.schema',(st)=>{
    if(Object.prototype.hasOwnProperty.call(st||{},'activityEpisode'))throw new Error('Activity Continuity is Agent-private; World activityEpisode truth is forbidden.');
    for(const agent of Object.values(st.agents||{}))ensureAgentState(agent);
    return st;
  },175);
  W.ACTIVITY_CONTINUITY_SCHEMA_VERSION=VERSION;
  window.SimActivityContinuityState=Object.freeze({VERSION,LIFECYCLES,TERMINAL_LIFECYCLES,SUPPORTED_ACTIVITY_KINDS,validProgress,validEpisode,ensureAgentState});
})();
