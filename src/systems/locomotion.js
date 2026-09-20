(() => {
  const W=window.SimWorld,P=window.SimPhysical;if(!W||!P?.getMovementEnvelope)return;
  if(!W.registerInitialStateInitializer)throw new Error('systems/locomotion.js requires world.js initial-state pipeline.');
  const VERSION='11.19.0-locomotion-execution-posture';

  W.registerInitialStateInitializer('locomotion.schema',(st)=>{
    for(const a of Object.values(st.agents||{})){
      if(!a.locomotion)a.locomotion={mode:null,phase:'idle'};
    }
    return st;
  },1700);
  W.LOCOMOTION_SCHEMA_VERSION=VERSION;

  const POSTURE_BY_MODE=Object.freeze({walk:'standing',kneelCrawl:'kneeling',proneCrawl:'prone'});
  const MODE_BY_POSTURE=Object.freeze({standing:'walk',kneeling:'kneelCrawl',prone:'proneCrawl'});
  const MODE_LABELS=Object.freeze({walk:'步行',kneelCrawl:'跪爬',proneCrawl:'匍匐'});

  function postureForMode(mode){return POSTURE_BY_MODE[mode]||null;}
  function modeFromPosture(agentOrPosture){
    const posture=typeof agentOrPosture==='string'?agentOrPosture:agentOrPosture?.posture?.kind;
    return MODE_BY_POSTURE[posture]||null;
  }
  function transitionTicks(fromMode,toMode){return fromMode===toMode?0:1;}
  function edgeMoveTicks(agent,mode){
    const speed=Number(P.getMovementEnvelope(agent,mode)?.speedFactor);
    return Number.isFinite(speed)&&speed>0?Math.max(1,Math.ceil(1/speed)):Infinity;
  }
  function modeLabel(mode){return MODE_LABELS[mode]||mode||'移動';}
  function setState(agent,mode=null,phase='idle'){
    if(!agent)return null;
    agent.locomotion={mode:mode||null,phase:phase||'idle'};
    return agent.locomotion;
  }
  function clearState(agent){return setState(agent,null,'idle');}

  window.SimLocomotion={VERSION,POSTURE_BY_MODE,MODE_BY_POSTURE,postureForMode,modeFromPosture,transitionTicks,edgeMoveTicks,modeLabel,setState,clearState};
})();
