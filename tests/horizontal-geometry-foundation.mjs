import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadAuthoringProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadAuthoringProfile();

const H=globalThis.SimHorizontalGeometry;
const A=globalThis.SimWorldAuthoring;
const clone=value=>JSON.parse(JSON.stringify(value));
const EPS=1e-9;

assert.equal(H.VERSION,'11.29.0-horizontal-geometry-foundation');

function snapshot({solids=[],boundaries={},passageConstraints={}}={}){
  const cells={};
  for(let y=0;y<2;y++)for(let x=0;x<2;x++)cells[x+','+y]={id:x+','+y,x,y,z:0,structuralOpen:true,staticBlocked:false};
  return {spaceId:'fixture',surfaceId:'floor',z:0,width:2,height:2,cellSizeMeters:1,cells,solids,boundaries,passageConstraints};
}
function derive(options){return H.deriveHorizontalGeometry(snapshot(options));}
function connection(result,a,b,kind){
  const [from,to]=H.canonicalEndpoints(a,b);
  return result.horizontalConnections.find(item=>item.kind===kind&&
    item.from.x===from.x&&item.from.y===from.y&&item.to.x===to.x&&item.to.y===to.y);
}
const nw={x:0,y:0,z:0},se={x:1,y:1,z:0},ne={x:1,y:0,z:0};

{
  const result=derive();
  const cardinal=connection(result,nw,ne,'cardinal');
  const diagonal=connection(result,nw,se,'diagonal');
  assert.equal(cardinal.status,'candidate');
  assert.ok(Math.abs(cardinal.distanceMeters-1)<EPS);
  assert.equal(diagonal.status,'candidate','fully open four-cell corner must be a diagonal candidate');
  assert.ok(diagonal.options.some(option=>option.clearanceWidth>=1-EPS));
  assert.ok(Math.abs(diagonal.distanceMeters-Math.SQRT2)<EPS);
  assert.equal(diagonal.resource,'corner:fixture|floor|0|1,1');
}

{
  const wall=derive({boundaries:{'v:1,0':{id:'v:1,0',kind:'wall',passable:false}}});
  assert.equal(connection(wall,nw,se,'diagonal').status,'blocked','solid wall on a necessary incident edge must block the diagonal');
}

{
  const closed=derive({boundaries:{'v:1,0':{id:'v:1,0',kind:'opening',passable:false,doorIds:['doorA']}}});
  const blocked=connection(closed,nw,se,'diagonal');
  assert.equal(blocked.status,'blocked','closed Door must block the necessary corner edge');
  assert.deepEqual(blocked.constrainedBy.doors,['doorA']);

  const open=derive({boundaries:{'v:1,0':{id:'v:1,0',kind:'opening',passable:true,doorIds:['doorA']}}});
  assert.equal(connection(open,nw,se,'diagonal').status,'candidate','open Door with provable corner clearance must remain candidate');
}

{
  const partial=derive({solids:[
    {key:'partial',layerZ:0,bounds:{x:0,y:0,z:0,width:.28,depth:.28,height:1}}
  ]});
  assert.equal(connection(partial,nw,se,'diagonal').status,'candidate','Furniture intrusion away from the shared corner must preserve a provable corridor');
}

{
  const narrow=derive({solids:[
    {key:'northEastStrip',layerZ:0,bounds:{x:.9,y:0,z:0,width:.1,depth:.62,height:1}},
    {key:'southWestStrip',layerZ:0,bounds:{x:0,y:.9,z:0,width:.64,depth:.1,height:1}}
  ]});
  const diagonal=connection(narrow,nw,se,'diagonal');
  assert.equal(diagonal.status,'candidate','two solids may jointly narrow the corner while leaving a provable corridor');
  const width=Math.max(...diagonal.options.map(option=>option.clearanceWidth));
  assert.ok(width>.3&&width<.5,'narrow fixture must expose a bounded objective corner clearance');
  assert.equal(.25<=width,true,'small MovementEnvelope would fit the candidate option');
  assert.equal(.5<=width,false,'large MovementEnvelope would fail later feasibility without rewriting connection status');
  assert.equal(diagonal.status,'candidate');
}

{
  const cut=derive({solids:[
    {key:'eastCut',layerZ:0,bounds:{x:.9,y:0,z:0,width:.1,depth:1,height:1}}
  ]});
  assert.equal(connection(cut,nw,se,'diagonal').status,'blocked','Furniture union that removes a necessary corner edge must be blocked');
}

{
  const ambiguous=derive({solids:[
    {key:'cornerNib',layerZ:0,bounds:{x:.9,y:.9,z:0,width:.1,depth:.1,height:1}}
  ]});
  const diagonal=connection(ambiguous,nw,se,'diagonal');
  assert.equal(diagonal.status,'unsupported','free local area without a provable corner-continuous B+ corridor must be unsupported');
  assert.ok(Object.values(ambiguous.cells).every(cell=>cell.floorGeometry.regionCount===1));
}

{
  const disconnected=derive({solids:[
    {key:'splitter',layerZ:0,bounds:{x:.45,y:0,z:0,width:.1,depth:1,height:1}}
  ]});
  assert.equal(disconnected.cells['0,0'].floorGeometry.regionCount,2);
  assert.equal(connection(disconnected,nw,se,'diagonal').status,'unsupported','multiple disconnected free-space regions must stay behind the future Nav Cell gate');
}

{
  const forward=H.canonicalEndpoints({x:1,y:1,z:0},{x:0,y:0,z:0});
  assert.deepEqual(forward,[{x:0,y:0,z:0},{x:1,y:1,z:0}],'HorizontalConnection endpoints must use stable canonical ordering');
  const first=connection(derive(),nw,se,'diagonal');
  const second=connection(derive(),se,nw,'diagonal');
  assert.equal(first.resource,second.resource,'resource identity must be stable across endpoint query order');
}

{
  const authored=clone(A.DEFAULT_WORLD_AUTHORING);
  const topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.ok(topology.horizontalConnections.some(item=>item.kind==='diagonal'),'authoring adapter must expose ephemeral diagonal HorizontalConnections');
  for(const cell of Object.values(topology.cells)){
    for(const neighborId of cell.adjacent){
      const [nx,ny]=neighborId.split(',').map(Number);
      assert.equal(Math.abs(nx-cell.x)+Math.abs(ny-cell.y),1,'legacy adjacent must remain cardinal-only');
    }
  }
  assert.ok(topology.components.every(component=>component.cells.every(id=>topology.cells[id].componentId===component.id)),'legacy componentId/components must remain internally consistent');
}

{
  const authored=clone(A.DEFAULT_WORLD_AUTHORING);
  authored.map.layers[0].boundaries['v:4,4']={kind:'wall',material:'stone'};
  let topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(topology.cells['3,4'].adjacent.includes('4,4'),false,'legacy cardinal wall behavior must not drift after kernel extraction');
  authored.map.layers[0].boundaries['v:4,4']={kind:'opening',material:'wood',clearanceWidth:.8,clearanceHeight:2};
  topology=A.deriveHorizontalTopology(authored,{z:0});
  assert.equal(topology.cells['3,4'].adjacent.includes('4,4'),true,'legacy cardinal opening behavior must remain compatible');
}

{
  const source=fs.readFileSync(new URL('../src/horizontal-geometry.js',import.meta.url),'utf8');
  for(const forbidden of ['SimWorld','SimSpatial','SimEngine','SimLocomotion','SimCrowding']){
    assert.equal(source.includes(forbidden),false,'pure horizontal geometry kernel must not import '+forbidden);
  }
  assert.doesNotMatch(source,/\.agents\b/,'pure kernel must not read Agent state');
}

console.log('8-direction Slice 1 horizontal geometry foundation: ok');
