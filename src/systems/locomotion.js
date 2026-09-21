(() => {
  const W=window.SimWorld,P=window.SimPhysical,C=window.SimEmbodimentCapabilities;if(!W||!P?.getMovementEnvelope)return;
  if(!C?.postureForMode||!C?.modeFromPosture)throw new Error('systems/locomotion.js requires embodiment-capabilities.js.');
  if(!W.registerInitialStateInitializer)throw new Error('systems/locomotion.js requires world.js initial-state pipeline.');
  const VERSION='11.24.0-locomotion-objective-burden';

  W.registerInitialStateInitializer('locomotion.schema',(st)=>{
    for(const a of Object.values(st.agents||{})){
      if(!a.locomotion)a.locomotion={mode:null,phase:'idle'};
    }
    return st;
  },1700);
  W.LOCOMOTION_SCHEMA_VERSION=VERSION;

  const POSTURE_BY_MODE=C.POSTURE_BY_MODE;
  const MODE_BY_POSTURE=C.MODE_BY_POSTURE;
  const MODE_TRAVERSAL_BURDEN=Object.freeze({walk:0,kneelCrawl:1,proneCrawl:2});
  const MODE_TRANSITION_BURDEN=1;

  function postureForMode(mode){return C.postureForMode(mode);}
  function modeFromPosture(agentOrPosture){
    const posture=typeof agentOrPosture==='string'?agentOrPosture:agentOrPosture?.posture?.kind;
    return C.modeFromPosture(posture);
  }
  function transitionTicks(fromMode,toMode){return fromMode===toMode?0:1;}
  function edgeMoveTicks(agent,mode){
    const speed=Number(P.getMovementEnvelope(agent,mode)?.speedFactor);
    return Number.isFinite(speed)&&speed>0?Math.max(1,Math.ceil(1/speed)):Infinity;
  }
  function modeTraversalBurden(agent,mode){
    const burden=MODE_TRAVERSAL_BURDEN[mode];
    return Number.isFinite(burden)&&burden>=0?burden:Infinity;
  }
  function modeTransitionBurden(agent,fromMode,toMode){
    if(fromMode===toMode)return 0;
    return Number.isFinite(modeTraversalBurden(agent,toMode))?MODE_TRANSITION_BURDEN:Infinity;
  }
  function modeLabel(mode){return C.modeLabel(mode);}
  function setState(agent,mode=null,phase='idle'){
    if(!agent)return null;
    agent.locomotion={mode:mode||null,phase:phase||'idle'};
    return agent.locomotion;
  }
  function clearState(agent){return setState(agent,null,'idle');}

  window.SimLocomotion={VERSION,POSTURE_BY_MODE,MODE_BY_POSTURE,MODE_TRAVERSAL_BURDEN,MODE_TRANSITION_BURDEN,postureForMode,modeFromPosture,transitionTicks,edgeMoveTicks,modeTraversalBurden,modeTransitionBurden,modeLabel,setState,clearState};
})();
