import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,R=globalThis.SimResources,SP=globalThis.SimSpatial,L=globalThis.SimLocomotion,V=globalThis.SimValidator;
const APP_VERSION=globalThis.SimRelease.VERSION;
const RESOURCES_VERSION='11.56.0-resource-container-capability';
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const dropEventsFor=(st,containerId)=>st.events.filter(e=>e.data?.container===containerId&&e.data?.action==='containerDrop');
const contentEventsFor=(st,containerId)=>st.events.filter(e=>e.data?.container===containerId&&(e.data?.action==='spill'||e.data?.action==='contentsDrop'));
const armWander=(st,a,goal)=>{const intent={id:`intent:${a.id}:${st.tick}:container-drop-test`,kind:'explore',createdTick:st.tick,lifecycle:'actionBound',source:{type:'emergency',reason:'container-drop-test-fixture'}};a.activeIntent=intent;a.action={kind:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...goal},oneShot:true,intentId:intent.id};};

assert.equal(E.VERSION,APP_VERSION);
assert.equal(R.VERSION,RESOURCES_VERSION);

function resetLowPassage(){
  E.reset(14100);
  const st=E.getState(),a=st.agents.zhen,bottle=st.objects.alcoholBottle;
  for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
  for(const tile of Object.values(st.map.tiles||{})){tile.terrain='wall';tile.walkable=false;tile.furnitureIds=[];tile.surface={contents:{}};}
  for(const [x,y] of [[1,1],[2,1],[3,1]]){const tile=st.map.tiles[`${x},${y}`];tile.terrain='floor';tile.walkable=true;tile.furnitureIds=[];}
  st.furniture={testPassageCover:{id:'testPassageCover',name:'測試通道上蓋',footprint:[{x:2,y:1}],displayAt:{x:2,y:1},slots:[],spatial:{solids:[{key:'roof',layerZ:0,bounds:{x:2,y:1,z:.95,width:1,depth:1,height:.05}}]}}};
  st.map.passageConstraints={};
  const start=floor(st,1,1),mid=floor(st,2,1),goal=floor(st,3,1);
  st.map.passageConstraints[SP.passageConstraintKey(st,start,mid)]={clearanceWidth:.8};
  st.map.passageConstraints[SP.passageConstraintKey(st,mid,goal)]={clearanceWidth:.8};
  a.position={...start};a.posture={kind:'standing',slotId:null,furnitureId:null};a.locomotion={mode:null,phase:'idle'};a.traits.careful=0;
  a.held=bottle.id;delete bottle.supportId;bottle.position={...start};bottle.contents={alcohol:60};
  armWander(st,a,goal);
  return {st,a,bottle,start,mid,goal};
}

const originalExposure=L.handlingExposureForEdge;
L.handlingExposureForEdge=()=>({tilt:1e12,impact:1e12,oscillation:1e12});
try{
  {
    const {st,a,bottle,start,mid}=resetLowPassage(),before=bottle.contents.alcohol;
    E.tick();
    assert.ok(SP.nodeSame(st,a.position,start),'posture transition tick must not commit the edge');
    assert.equal(a.held,bottle.id,'posture transition must not drop the held Container');
    assert.equal(dropEventsFor(st,bottle.id).length,0);

    E.tick();
    assert.ok(SP.nodeSame(st,a.position,start),'multi-tick intermediate tick must remain in progress');
    assert.equal(a.held,bottle.id,'intermediate movement tick must not evaluate Container drop');
    assert.equal(dropEventsFor(st,bottle.id).length,0);

    E.tick();
    assert.ok(SP.nodeSame(st,a.position,mid),'Container drop may only happen after completed-edge position commit');
    assert.equal(a.held,null,'successful Container drop must clear the canonical held relation');
    assert.ok(SP.nodeSame(st,SP.objectNode(st,bottle.id),mid),'dropped Container actual position must be the completed-edge destination node');
    assert.equal(bottle.contents.alcohol,before,'sealed Container drop v1 must not invent drop-impact contents loss');
    assert.equal(contentEventsFor(st,bottle.id).length,0,'Container drop v1 must not create spill/contentsDrop without a separate movement contents-loss consequence');
    const drops=dropEventsFor(st,bottle.id);
    assert.equal(drops.length,1,'one completed edge may evaluate Container drop at most once');
    const drop=drops[0];
    assert.equal(drop.data.position,SP.nodeKey(st,mid));
    assert.equal(drop.data.completedEdge.to,SP.nodeKey(st,mid));
    assert.deepEqual(drop.data.handlingExposure,{tilt:1e12,impact:1e12,oscillation:1e12});
    assert.equal(drop.data.handlingRisk.containerDrop,1);
    assert.equal(drop.data.consequenceKind,'containerDrop');
  }

  {
    E.reset(14101);
    const st=E.getState(),a=st.agents.zhen,bottle=st.objects.alcoholBottle;
    for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
    const surface=st.furniture.diningTable.spatial.surfaces.find(x=>x.id==='diningTable:surface');
    const top=SP.normalizeNode(st,surface.cells[0],surface.id),start=floor(st,5,1);
    a.position={...start};a.posture={kind:'standing',slotId:null,furnitureId:null};a.locomotion={mode:null,phase:'idle'};a.traits.careful=0;
    a.held=bottle.id;delete bottle.supportId;bottle.position={...start};bottle.contents={alcohol:60};
    armWander(st,a,top);
    E.tick();
    assert.ok(SP.nodeSame(st,a.position,top),'Surface transition fixture must complete the edge');
    assert.equal(a.held,null);
    const droppedNode=SP.objectNode(st,bottle.id);
    assert.ok(SP.nodeSame(st,droppedNode,top),'Container dropped on a Furniture Surface must retain the Surface node instead of projecting to floor');
    assert.equal(droppedNode.surfaceId,top.surfaceId);
    assert.equal(bottle.supportId,undefined,'accidental drop must not invent an authored supportId relation');
    assert.equal(bottle.contents.alcohol,60,'Surface drop v1 must not trigger drop-impact contents loss');
    assert.equal(dropEventsFor(st,bottle.id).length,1);
    assert.equal(dropEventsFor(st,bottle.id)[0].data.position,SP.nodeKey(st,top));
  }

  {
    E.reset(14102);
    const st=E.getState(),a=st.agents.zhen,plate=st.objects.plateA;
    for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
    for(const furniture of Object.values(st.furniture||{}))furniture.supportsObjects=false;
    const releaseNode=floor(st,2,6);
    a.position={...releaseNode};a.posture={kind:'standing',slotId:null,furnitureId:null};
    a.held=plate.id;delete plate.supportId;plate.position={...releaseNode};plate.contents={};
    assert.equal(SP.bestNearbySupportPlacement(st,a),null,'floor fallback fixture must expose no legal support candidate');
    a.action={kind:'eat',phase:'eatingPlate',container:plate.id,started:st.tick,wait:0};
    E.tick();
    assert.equal(a.held,null,'normal Action lifecycle completion must release held Container');
    assert.equal(plate.supportId,undefined,'floor fallback must remain structural Floor rather than inventing supportId');
    assert.ok(SP.nodeSame(st,SP.objectNode(st,plate.id),releaseNode),'normal lifecycle release without a legal support must use actor current canonical Floor node');
    assert.equal(dropEventsFor(st,plate.id).length,0,'normal lifecycle release must not masquerade as accidental containerDrop');
  }

  {
    E.reset(14106);
    const st=E.getState(),a=st.agents.zhen,cup=st.objects.cupA,table=st.furniture.diningTable;
    for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
    for(const furniture of Object.values(st.furniture||{}))if(furniture.id!==table.id)furniture.supportsObjects=false;
    table.supportsObjects=true;
    const contact=SP.supportContactNodes(st,table.id,a).find(node=>node.surfaceId==='floor')||SP.supportContactNodes(st,table.id,a)[0];
    assert.ok(contact,'drink lifecycle fixture requires a canonical dining-table contact node');
    a.position={...contact};a.posture={kind:'standing',slotId:null,furnitureId:null};
    cup.contents={water:8};delete cup.supportId;cup.position={...contact};a.held=cup.id;
    const candidate=SP.bestNearbySupportPlacement(st,a);
    assert.equal(candidate?.supportId,table.id,'drink lifecycle fixture must expose diningTable as the canonical nearby support winner');
    a.action={kind:'drinkWater',phase:'drink',container:cup.id,resource:'water',started:st.tick,wait:0};
    E.tick();
    assert.equal(a.action,null,'Human drink completion must finish the production Action lifecycle');
    assert.equal(a.held,null,'Human drink completion must clear the canonical held relation');
    assert.equal(cup.supportId,table.id,'Human drink completion must use canonical nearby placement instead of leaving the cup on Floor');
    const placedNode=SP.objectNode(st,cup.id),surface=SP.supportSurfaceForFurniture(st,table)?.surface;
    assert.equal(placedNode?.surfaceId,surface?.id,'Human drink completion must resolve the cup onto the table canonical support Surface');
    assert.ok((surface?.cells||[]).some(cell=>SP.nodeSame(st,placedNode,SP.normalizeNode(st,cell,surface.id))),'Human drink completion must choose a real cell on the canonical support Surface');
    assert.equal(dropEventsFor(st,cup.id).length,0,'intentional drink completion must not emit accidental containerDrop');
  }

  {
    E.reset(14104);
    const st=E.getState(),a=st.agents.zhen,plate=st.objects.plateA;
    for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
    plate.contents={food:6};delete plate.supportId;plate.position={...a.position};a.held=null;
    a.action={kind:'eat',phase:'eatingPlate',container:plate.id,started:st.tick,wait:0};
    const before=plate.contents.food;
    E.tick();
    assert.equal(a.action,null,'carried-dependent eat action must abort after the canonical held relation is lost');
    assert.equal(plate.contents.food,before,'lost held relation must not permit remote consumption from a dropped plate');
    assert.ok(st.events.some(e=>e.data?.actor===a.id&&e.data?.action==='abort'),'lost held dependency must enter normal action-abort lifecycle');
  }

  {
    E.reset(14105);
    const st=E.getState(),a=st.agents.zhen,cup=st.objects.cupA;
    for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
    cup.contents={water:8};delete cup.supportId;cup.position={...a.position};a.held=null;
    a.action={kind:'drinkWater',phase:'drink',container:cup.id,resource:'water',started:st.tick,wait:0};
    const before=cup.contents.water;
    E.tick();
    assert.equal(a.action,null,'carried-dependent drink action must abort after the canonical held relation is lost');
    assert.equal(cup.contents.water,before,'lost held relation must not permit remote drinking from a dropped vessel');
  }

  {
    E.reset(14103);
    const st=E.getState(),a=st.agents.zhen,bottle=st.objects.alcoholBottle,goal=floor(st,6,4);
    for(const other of Object.values(st.agents))if(other.id!==a.id)other.offMap=true;
    a.held=bottle.id;delete bottle.supportId;bottle.position={...a.position};
    const before=JSON.stringify({held:a.held,position:bottle.position,events:st.events,rngState:st.rngState});
    SP.planRoute(st,a,goal,{mode:'walk',objective:'weighted',weights:{dropRiskWeight:12}});
    const after=JSON.stringify({held:a.held,position:bottle.position,events:st.events,rngState:st.rngState});
    assert.equal(after,before,'planning-only containerDrop risk must not mutate held state, Container position, Events, or consequence RNG');
  }
}finally{
  L.handlingExposureForEdge=originalExposure;
}

assert.equal(V.validateState(E.getState()).issueCount,0);
console.log('Carried Container drop regression: ok');
