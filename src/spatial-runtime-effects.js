(() => {
  const E=window.SimEngine,SP=window.SimSpatial,W=window.SimWorld;if(!E||!SP?.resolveEffectNode||!SP?.environmentAt)return;
  const FLOOR='floor';
  E.DATA_ZH.effectNode='效果位置';
  E.DATA_ZH.spillEndpoint='環境端點';

  function resourceCause(st,node,resource){const id=SP.environmentEndpointId(st,node);return id?st.endpointCauses?.[`${id}|${resource}`]||null:null;}
  function targetFromSource(st,id){return st.sources?.[id]?{kind:'source',id}:st.containers?.[id]?{kind:'object',id}:null;}
  function relocateFailedPourSpill(st,event){
    if(event?.data?.reason!=='coordination'||!(event.data.amount>0)||!event.data.resource)return;
    const attempt=(event.causeIds||[]).map(id=>st.causes?.[id]).find(e=>e?.data?.action==='pour');if(!attempt)return;
    const actor=st.agents?.[event.data.actor],target=targetFromSource(st,attempt.data.from);if(!actor||!target)return;
    const actorAtAttempt=SP.nodeFromKey(st,attempt.data.position)||SP.nodeForAgent(st,actor),floorPosition={x:actorAtAttempt.x,y:actorAtAttempt.y,spaceId:actorAtAttempt.spaceId},actorZ=SP.zOf?.(actorAtAttempt)??actorAtAttempt.z??0;if(actorZ!==0)floorPosition.z=actorZ;const floorNode=SP.normalizeNode(st,floorPosition,FLOOR);
    const effectNode=SP.resolveEffectNode(st,{actor,target,affordance:'fill'})||actorAtAttempt;
    const targetEnv=SP.environmentAt(st,effectNode,{create:true});if(!targetEnv)return;
    const floorEndpoint=E.tileEndpointId(floorNode),floorCauseKey=`${floorEndpoint}|${event.data.resource}`;
    if(!SP.nodeSame(st,floorNode,effectNode)){
      const moved=SP.takeEnvironmentResource(st,floorNode,event.data.resource,event.data.amount);
      if(moved>0)SP.putEnvironmentResource(st,effectNode,event.data.resource,moved);
      if(st.endpointCauses?.[floorCauseKey]===event.id)delete st.endpointCauses[floorCauseKey];
    }
    const envEndpoint=SP.environmentEndpointId(st,effectNode);
    if(envEndpoint)st.endpointCauses[`${envEndpoint}|${event.data.resource}`]=event.id;
    if(effectNode.surfaceId===FLOOR)st.endpointCauses[floorCauseKey]=event.id;
    event.data.action='spill';
    event.data.position=SP.nodeKey(st,effectNode);
    event.data.effectNode=SP.nodeKey(st,effectNode);
    event.data.spillEndpoint=envEndpoint;
  }
  function applySurfaceContact(st,a){
    const node=SP.nodeForAgent(st,a);if(!node||node.surfaceId===FLOOR)return;
    const env=SP.environmentAt(st,node,{create:false});if(!env)return;
    const part=a.kind==='cat'?'paws':a.contacts?.feet?'feet':null;if(!part)return;
    a.contacts[part]??={};
    for(const [resource,amount] of Object.entries({...env.contents})){
      if(W.RESOURCE_TYPES?.[resource]?.phase!=='liquid'||amount<=.05)continue;
      const ratio=a.kind==='cat'?E.rand(.08,.20):E.rand(.03,.08),picked=SP.takeEnvironmentResource(st,node,resource,amount*ratio);if(picked<=0)continue;
      a.contacts[part][resource]=(a.contacts[part][resource]||0)+picked;
      const cause=resourceCause(st,node,resource),place=SP.describePlace(st,a);
      E.addEvent(`${a.name}踩到${place}上的${E.resourceName(resource)}，${a.kind==='cat'?'腳掌':'腳部'}沾上了一些。`,'warn',cause?[cause]:[],{actor:a.id,action:'surfaceContact',resource,amount:picked,position:SP.nodeKey(st,node),effectNode:SP.nodeKey(st,node),surfaceId:node.surfaceId});
    }
  }
  function captureSpatialTick(st){
    const oldEventIds=new Set((st.events||[]).map(e=>e.id)),oldNodes={};
    for(const a of Object.values(st.agents||{}))if(!a.offMap&&a.position)oldNodes[a.id]={...SP.nodeForAgent(st,a)};
    return {oldEventIds,oldNodes};
  }
  function settleSpatialTick(st,snap){
    if(!snap)return;
    const fresh=(st.events||[]).filter(e=>!snap.oldEventIds.has(e.id));
    for(const e of fresh)relocateFailedPourSpill(st,e);
    for(const a of Object.values(st.agents||{})){
      if(a.offMap||!a.position)continue;const prev=snap.oldNodes[a.id],now=SP.nodeForAgent(st,a);
      if(prev&&now&&!SP.nodeSame(st,prev,now))applySurfaceContact(st,a);
    }
  }

  if(!E.registerRuntimeHook)throw new Error('spatial-runtime-effects.js requires runtime-hook-pipeline.js');
  E.registerRuntimeHook('beforeTick','spatial.capture',(ctx)=>{ctx.locals.spatialV1114=captureSpatialTick(E.getState());},1100);
  E.registerRuntimeHook('afterTick','spatial.effects',(ctx)=>settleSpatialTick(E.getState(),ctx.locals.spatialV1114),100);
})();
