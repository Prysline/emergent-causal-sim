import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','systems/locomotion.js','engine.js'
]);

const D=globalThis.SimFurnitureDefinitions,E=globalThis.SimEngine,SP=globalThis.SimSpatial,L=globalThis.SimLocomotion;
const local=(x,y,z=0)=>({x,y,z});
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];

function addResolvedFurniture(st,resolved){
  st.furniture[resolved.id]=resolved;
  for(const cell of resolved.footprint||[]){
    const tile=SP.tileByPos(st,cell);
    if(tile&&!tile.furnitureIds.includes(resolved.id))tile.furnitureIds.push(resolved.id);
  }
}
function outsideFloorFor(st,entry,agent){
  for(const cell of entry.surface.cells||[])for(const [dx,dy] of dirs){
    const p=floor(st,cell.x+dx,cell.y+dy);
    if(!p)continue;
    if((entry.furniture.footprint||[]).some(c=>c.x===p.x&&c.y===p.y&&(c.z??0)===(p.z??0)))continue;
    if(SP.nodeWalkable(st,p,agent))return p;
  }
  return null;
}

E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,chair=st.furniture.chairNW;
  const surface=chair.spatial.surfaces.find(s=>s.sourceSolidKey==='seat');
  assert.ok(surface,'chair seat must be present in canonical spatial.surfaces');
  const top=SP.normalizeNode(st,surface.cells[0],surface.id);
  const fit=SP.surfaceStaticFitResult(st,top,human,'standing');
  assert.equal(fit.fits,true,'Default Human standing support footprint must fit a chair seat top');
  assert.ok(fit.witness&&Number.isFinite(fit.witness.x)&&Number.isFinite(fit.witness.y),'static fit must expose an ephemeral deterministic witness');
  assert.equal(SP.nodeWalkable(st,top,human),true,'derived chair Surface must be walk-occupiable when static fit succeeds');
  assert.equal(SP.surfaceNodeFitsMode(st,top,human,'kneelCrawl'),false,'generic Surface occupancy must reject postures without a support profile');

  const start=outsideFloorFor(st,SP.surfaceEntry(st,surface.id),human);
  assert.ok(start,'fixture must expose an adjacent walkable floor node');
  const passage=SP.getPassageProfile(st,start,top);
  assert.equal(passage.edgeKind,'surfaceTransition');
  assert.equal(passage.surfaceTransition.surfaceId,surface.id);
  assert.ok(Math.abs(passage.surfaceTransition.heightDelta-.47)<1e-9,'chair seat top elevation must drive objective verticalDelta');
  assert.ok(passage.surfaceTransition.horizontalGap>=0&&passage.surfaceTransition.horizontalGap<.5);
  const feasibility=SP.traversalFeasibility(st,human,start,top);
  assert.equal(feasibility.modes.walk.feasible,true,'Default Human must have at least one legal chair-scale Surface maneuver');
  const kinds=feasibility.modes.walk.maneuverCandidates.map(x=>x.kind);
  assert.ok(kinds.includes('stepUp')||kinds.includes('climbUp'),'Human chair transition must expose a physical step/climb candidate');
  const plan=SP.planRoute(st,human,top,{mode:'auto',objective:'traversalCost'}),step=plan.steps[0],selected=L.selectSurfaceManeuver(human,feasibility.modes.walk.maneuverCandidates,'walk',1,0);
  assert.ok(step?.surfaceManeuver,'Route step must carry the selected Surface maneuver identity');
  assert.equal(step.surfaceManeuver.kind,selected.kind,'Route must consume the Locomotion-selected candidate rather than inventing another maneuver');
  assert.equal(step.edgeTraversalCost,L.surfaceManeuverBurden(human,step.surfaceManeuver),'Surface transition objective burden must come from Locomotion ownership');
  assert.equal(step.movementTicks,L.surfaceManeuverTiming(human,'walk',step.surfaceManeuver,1,0).movementTicks,'Surface transition timing must come from the same Locomotion maneuver policy');
}

E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen,cat=st.agents.orange;
  const definition={
    id:'test-low-overhead-platform',name:'低頂空測試平台',icon:'▱',kind:'platform',
    footprint:[local(0,0)],displayOffset:local(0,0),slots:[],
    spatial:{solids:[
      {key:'body',bounds:{x:0,y:0,z:0,width:1,depth:1,height:.25},faces:{top:{supportsBodyOccupancy:true,surfaceKey:'top',surfaceLabel:'測試平台頂面'}}},
      {key:'roof',bounds:{x:0,y:0,z:.70,width:1,depth:1,height:.10}}
    ]}
  };
  const resolved=D.resolveDefinitionInstance(definition,{id:'lowRoofPlatform',definitionId:definition.id,origin:local(2,5),orientation:'south'});
  addResolvedFurniture(st,resolved);
  const surface=resolved.spatial.surfaces[0],top=SP.normalizeNode(st,surface.cells[0],surface.id);
  const humanFit=SP.surfaceStaticFitResult(st,top,human,'standing');
  const catFit=SP.surfaceStaticFitResult(st,top,cat,'standing');
  assert.equal(humanFit.fits,false,'support fit alone must not bypass standing body clearance');
  assert.equal(humanFit.reason,'clearance');
  assert.equal(catFit.fits,true,'smaller Cat body must fit below the same overhead when the support witness is valid');
}

E.reset(20260911);
{
  const st=E.getState(),human=st.agents.zhen;
  st.agents.zhou.offMap=true;st.agents.orange.offMap=true;
  const cabinet=D.resolveInstance({id:'testCabinet',definitionId:'cabinet-tall',origin:local(2,5),orientation:'south'});
  addResolvedFurniture(st,cabinet);
  const surface=cabinet.spatial.surfaces[0],entry=SP.surfaceEntry(st,surface.id),top=SP.normalizeNode(st,surface.cells[0],surface.id);
  assert.equal(SP.surfaceStaticFitResult(st,top,human,'standing').fits,true,'cabinet top may be a valid support Surface even when it is not reachable');
  const start=outsideFloorFor(st,entry,human);
  assert.ok(start,'cabinet fixture must expose an adjacent walkable floor node');
  human.position={...start};human.posture={kind:'standing',slotId:null,furnitureId:null};
  const feasibility=SP.traversalFeasibility(st,human,start,top);
  assert.equal(feasibility.passage.edgeKind,'surfaceTransition');
  assert.ok(Math.abs(feasibility.passage.surfaceTransition.heightDelta-1.90)<1e-9);
  assert.equal(feasibility.modes.walk.feasible,false,'static-fit cabinet top must remain unreachable without a legal elevation maneuver');
  assert.ok(feasibility.modes.walk.failedAxes.includes('maneuver'));
  assert.deepEqual(feasibility.modes.walk.maneuverCandidates,[]);
  assert.equal(SP.planRoute(st,human,top,{mode:'auto',objective:'traversalCost'}).traversalCost,Infinity,'Route must not convert static-fit alone into cabinet-top reachability');
}

console.log('Surface static-fit + objective transition feasibility regression: ok');
