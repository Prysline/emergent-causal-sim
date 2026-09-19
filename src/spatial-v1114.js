(() => {
  const W=window.SimWorld,SP=window.SimSpatial;if(!W||!SP?.normalizeNode||!SP?.surfaceEntry)return;
  if(!W.registerInitialStateInitializer)throw new Error('spatial-v1114.js requires world.js initial-state pipeline.');
  const VERSION='11.11.4-surface-liquid-foundation',FLOOR='floor';
  const baseInit=SP.init;

  function installSurfaceEnvironment(st){
    for(const f of Object.values(st?.furniture||{})){
      const surface=f.spatial?.surface;if(!surface?.cells)continue;
      for(const cell of surface.cells)cell.contents??={};
    }
    return st;
  }
  function normalize(st,p){return p?SP.normalizeNode(st,p,p.surfaceId||FLOOR):null;}
  function surfaceCellAt(st,node){
    const n=normalize(st,node);if(!n||n.surfaceId===FLOOR)return null;
    const entry=SP.surfaceEntry(st,n.surfaceId);if(!entry)return null;
    return (entry.surface.cells||[]).find(c=>c.x===n.x&&c.y===n.y&&(SP.zOf?.(c)??c.z??0)===(SP.zOf?.(n)??n.z??0))||null;
  }
  function environmentAt(st,p,{create=true}={}){
    const node=normalize(st,p);if(!node)return null;
    if(node.surfaceId===FLOOR){
      const tile=SP.tileByPos(st,node);if(!tile)return null;
      tile.surface??={contents:{}};if(create)tile.surface.contents??={};
      if(!tile.surface.contents)return null;
      return {kind:'floor',node,contents:tile.surface.contents,owner:tile,cell:tile.surface};
    }
    const entry=SP.surfaceEntry(st,node.surfaceId),cell=surfaceCellAt(st,node);if(!entry||!cell)return null;
    if(create)cell.contents??={};if(!cell.contents)return null;
    return {kind:'surface',node,contents:cell.contents,owner:entry.furniture,cell,surface:entry.surface};
  }
  function environmentContentsAt(st,p,{create=true}={}){return environmentAt(st,p,{create})?.contents||null;}
  function environmentResourceAmount(st,p,resource){return environmentContentsAt(st,p,{create:false})?.[resource]||0;}
  function environmentLiquidAmount(st,p){
    const contents=environmentContentsAt(st,p,{create:false})||{};
    return Object.entries(contents).reduce((sum,[r,v])=>sum+(W.RESOURCE_TYPES?.[r]?.phase==='liquid'?Math.max(0,Number(v)||0):0),0);
  }
  function putEnvironmentResource(st,p,resource,amount){
    const contents=environmentContentsAt(st,p,{create:true}),m=Math.max(0,Number(amount)||0);if(!contents||m<=0)return 0;
    contents[resource]=(contents[resource]||0)+m;return m;
  }
  function takeEnvironmentResource(st,p,resource,amount){
    const contents=environmentContentsAt(st,p,{create:false}),wanted=Math.max(0,Number(amount)||0);if(!contents||wanted<=0)return 0;
    const have=Math.max(0,Number(contents[resource])||0),m=Math.min(have,wanted);if(m<=0)return 0;
    contents[resource]=have-m;if(contents[resource]<.001)delete contents[resource];return m;
  }
  function nodeFromKey(st,key){
    if(typeof key!=='string')return null;const parts=key.split('|');if(parts.length<3)return null;
    const xyz=parts.pop(),surfaceId=parts.pop(),spaceId=parts.join('|'),[x,y,z=0]=xyz.split(',').map(Number);
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isInteger(z))return null;const p={x,y,spaceId,surfaceId};if(z!==0)p.z=z;return SP.normalizeNode(st,p,surfaceId);
  }
  function environmentEndpointId(st,p){const n=normalize(st,p);return n?`environment:${SP.nodeKey(st,n)}`:null;}
  function environmentFromEndpointId(st,id,{create=true}={}){
    if(typeof id!=='string'||!id.startsWith('environment:'))return null;
    const node=nodeFromKey(st,id.slice('environment:'.length));return node?environmentAt(st,node,{create}):null;
  }
  function targetNode(st,target){
    if(!target)return null;
    if(target.kind==='agent')return SP.nodeForAgent(st,st.agents?.[target.id]);
    if(target.kind==='object'||target.kind==='source')return SP.objectNode(st,target.id);
    if(target.kind==='tile')return normalize(st,target.position||target);
    if(target.position)return normalize(st,target.position);
    return null;
  }
  function resolveEffectNode(st,{actor,target,affordance='default'}={}){
    const a=typeof actor==='string'?st.agents?.[actor]:actor,actorNode=SP.nodeForAgent(st,a);if(!actorNode)return null;
    if(target?.kind==='source'){
      const source=st.sources?.[target.id];
      const port=(source?.interactionPorts||[]).find(p=>(!p.affordances?.length||p.affordances.includes(affordance))&&SP.nodeSame(st,actorNode,normalize(st,p.position)));
      if(port)return normalize(st,port.position);
    }
    const t=targetNode(st,target);if(t&&environmentAt(st,t,{create:false}))return t;
    return actorNode;
  }

  W.VERSION=VERSION;
  W.registerInitialStateInitializer('spatialSurfaceEnvironment.schema',(st)=>{st.version=VERSION;installSurfaceEnvironment(st);},50);
  SP.init=(st)=>{const result=baseInit(st);installSurfaceEnvironment(st);return result;};
  Object.assign(SP,{SPATIAL_ENVIRONMENT_VERSION:VERSION,installSurfaceEnvironment,surfaceCellAt,environmentAt,environmentContentsAt,environmentResourceAmount,environmentLiquidAmount,putEnvironmentResource,takeEnvironmentResource,nodeFromKey,environmentEndpointId,environmentFromEndpointId,resolveEffectNode});
})();
