import assert from 'node:assert/strict';
import {loadRuntimeProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadRuntimeProfile([
  'world-authoring.js','world-initializer.js','world.js','release.js','spatial.js','spatial-traversal.js',
  'systems/physical.js','spatial-passage.js','spatial-contact.js','engine.js'
]);

const E=globalThis.SimEngine,SP=globalThis.SimSpatial;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const hasNode=(st,list,node)=>list.some(p=>SP.nodeSame(st,p,node));
assert.equal(E.VERSION,'11.35.0-affect-responder-bias');
assert.equal(SP.VERSION,'11.34.0-surface-traversal-maneuvers');
assert.equal(SP.CONTACT_VERSION,'11.32.0-contact-slot-corner');

function openFixture(){
  E.reset(20260927);
  const st=E.getState();
  for(const tile of Object.values(st.map.tiles||{})){
    tile.terrain='wall';
    tile.walkable=false;
    tile.furnitureIds=[];
  }
  for(let y=1;y<=3;y++)for(let x=1;x<=3;x++){
    const tile=st.map.tiles[x+','+y];
    tile.terrain='floor';
    tile.walkable=true;
    tile.furnitureIds=[];
  }
  st.furniture={};
  st.map.boundaries={};
  st.doors={};
  st.map.passageConstraints={};
  for(const c of Object.values(st.containers||{}))if(c.position)c.position={x:10,y:6};
  for(const source of Object.values(st.sources||{}))if(source.position)source.position={x:10,y:6};

  const human=st.agents.zhen,target=st.agents.zhou;
  st.agents.orange.offMap=true;
  human.offMap=false;
  target.offMap=false;
  human.position={...floor(st,2,2)};
  target.position={...floor(st,1,1)};
  human.posture={kind:'standing',slotId:null,furnitureId:null};
  target.posture={kind:'standing',slotId:null,furnitureId:null};
  return {st,human,target,targetNode:floor(st,1,1),cornerNode:floor(st,2,2)};
}

{
  const {st,human,target,cornerNode}=openFixture();
  const contact=SP.interactionGeometry(st,{kind:'agent',id:target.id},human,'default');
  assert.equal(contact.mode,'socialReach');
  assert.ok(hasNode(st,contact.positions,cornerNode),'open diagonal corner must be a local socialReach candidate');
}

{
  const {st,human,target,cornerNode}=openFixture();
  st.map.tiles['2,1'].terrain='void';st.map.tiles['2,1'].walkable=false;
  let contact=SP.interactionGeometry(st,{kind:'agent',id:target.id},human,'default');
  assert.ok(hasNode(st,contact.positions,cornerNode),'one non-walkable intermediate terrain cell must leave the other diagonal Contact path available');
  st.map.tiles['1,2'].terrain='void';st.map.tiles['1,2'].walkable=false;
  contact=SP.interactionGeometry(st,{kind:'agent',id:target.id},human,'default');
  assert.equal(hasNode(st,contact.positions,cornerNode),false,'two non-walkable intermediate terrain cells must seal the diagonal Contact corner');
}

{
  const {st,human,target,cornerNode}=openFixture();
  st.map.boundaries['0|v:2,1']={id:'v:2,1',kind:'wall'};
  const contact=SP.interactionGeometry(st,{kind:'agent',id:target.id},human,'default');
  assert.ok(hasNode(st,contact.positions,cornerNode),'one fully blocked incident side must not block diagonal Contact while the other side remains open');
}

{
  const {st,human,target,cornerNode}=openFixture();
  st.map.boundaries['0|v:2,1']={id:'v:2,1',kind:'wall'};
  st.map.boundaries['0|h:1,2']={id:'h:1,2',kind:'wall'};
  const contact=SP.interactionGeometry(st,{kind:'agent',id:target.id},human,'default');
  assert.equal(hasNode(st,contact.positions,cornerNode),false,'two blocked incident sides must seal the shared corner for Contact');
}

{
  const {st,human,target,cornerNode}=openFixture();
  st.map.boundaries['0|v:2,1']={id:'v:2,1',kind:'opening'};
  st.doors.closedNorth={id:'closedNorth',boundary:{z:0,id:'v:2,1'},state:'closed'};
  const contact=SP.interactionGeometry(st,{kind:'agent',id:target.id},human,'default');
  assert.ok(hasNode(st,contact.positions,cornerNode),'one closed Door side must still allow diagonal Contact through the other confirmed opening');
}

{
  const {st,human,target,cornerNode}=openFixture();
  st.furniture.northNib={id:'northNib',footprint:[{x:2,y:1,z:0}],slots:[],spatial:{solids:[{key:'nib',layerZ:0,bounds:{x:2,y:1.8,z:0,width:.2,depth:.2,height:1}}]}};
  let contact=SP.interactionGeometry(st,{kind:'agent',id:target.id},human,'default');
  assert.ok(hasNode(st,contact.positions,cornerNode),'Furniture blocking one L-shaped corner path must still allow Contact through the other path');
  st.furniture.westNib={id:'westNib',footprint:[{x:1,y:2,z:0}],slots:[],spatial:{solids:[{key:'nib',layerZ:0,bounds:{x:1.8,y:2,z:0,width:.2,depth:.2,height:1}}]}};
  contact=SP.interactionGeometry(st,{kind:'agent',id:target.id},human,'default');
  assert.equal(hasNode(st,contact.positions,cornerNode),false,'Furniture sealing both L-shaped corner paths must block diagonal Contact');
}

{
  const {st,human,targetNode,cornerNode}=openFixture();
  st.agents.zhou.offMap=true;
  st.containers.defaultReach={id:'defaultReach',name:'default reach',portable:true,capacity:1,contents:{},position:{...targetNode}};
  let geometry=SP.interactionGeometry(st,{kind:'object',id:'defaultReach'},human,'default');
  assert.equal(geometry.mode,'reach');
  assert.ok(hasNode(st,geometry.positions,cornerNode),'generic object default reach must use the same diagonal Contact helper');
  st.sources.defaultReachSource={id:'defaultReachSource',name:'default source',position:{...targetNode},blocksMovement:false};
  geometry=SP.interactionGeometry(st,{kind:'source',id:'defaultReachSource'},human,'default');
  assert.equal(geometry.mode,'reach');
  assert.ok(hasNode(st,geometry.positions,cornerNode),'generic source default reach must use the same diagonal Contact helper');
  st.sources.cornerPort={id:'cornerPort',name:'corner port',position:{...targetNode},blocksMovement:false,interactions:{default:{mode:'port'}},interactionPorts:[{id:'cornerPort:south',position:{x:1,y:2,z:0},affordances:['default']}]};
  geometry=SP.interactionGeometry(st,{kind:'source',id:'cornerPort'},human,'default');
  assert.equal(geometry.mode,'port');
  assert.equal(hasNode(st,geometry.positions,cornerNode),false,'port must remain authored-port-only instead of inheriting diagonal reach');
  st.containers.cornerOccupy={id:'cornerOccupy',name:'corner occupy',portable:true,capacity:1,contents:{},position:{...targetNode},interactions:{default:{mode:'occupy'}}};
  geometry=SP.interactionGeometry(st,{kind:'object',id:'cornerOccupy'},human,'default');
  assert.equal(geometry.mode,'occupy');
  assert.equal(hasNode(st,geometry.positions,cornerNode),false,'occupy must remain exact-position geometry');
}

function slotFixture(edges=['north','west']){
  const {st,human}=openFixture();
  st.agents.zhou.offMap=true;
  st.furniture.cornerSeat={
    id:'cornerSeat',
    name:'Corner Seat',
    footprint:[{x:2,y:2,z:0}],
    slots:[{
      id:'cornerSeat:seat',
      label:'seat',
      position:{x:2,y:2,z:0},
      approachEdges:[...edges],
      canRest:true,
      allowKinds:['human']
    }],
    spatial:{
      solids:[{
        key:'body',
        layerZ:0,
        bounds:{x:2.2,y:2.2,z:0,width:.6,depth:.6,height:.5}
      }]
    }
  };
  st.map.tiles['2,2'].furnitureIds=['cornerSeat'];
  const slot=SP.getSlot(st,'cornerSeat:seat');
  human.position={...floor(st,3,3)};
  human.posture={kind:'standing',slotId:null,furnitureId:null};
  return {
    st,human,slot,
    north:floor(st,2,1),
    west:floor(st,1,2),
    northwest:floor(st,1,1)
  };
}

{
  const {st,human,slot,north,west,northwest}=slotFixture();
  const approach=SP.slotApproachNodes(st,slot,human,'walk');
  assert.ok(hasNode(st,approach,north),'authored north side remains a cardinal Slot approach');
  assert.ok(hasNode(st,approach,west),'authored west side remains a cardinal Slot approach');
  assert.ok(hasNode(st,approach,northwest),'north + west must derive a direct northwest corner settle candidate');
  assert.equal(Object.hasOwn(slot,'approachCorners'),false,'Slice 5 must not add authored approachCorners schema');
}

{
  const {st,human,slot,northwest}=slotFixture(['north']);
  assert.equal(hasNode(st,SP.slotApproachNodes(st,slot,human,'walk'),northwest),false,'a single authored approach side must not derive a diagonal Slot corner candidate');
}

{
  const {st,human,slot,northwest}=slotFixture();
  st.map.boundaries['0|v:2,1']={id:'v:2,1',kind:'wall'};
  assert.equal(hasNode(st,SP.slotApproachNodes(st,slot,human,'walk'),northwest),false,'direct diagonal Slot settle must conservatively reject when the outside corner cannot reach both incident sides');
}

{
  const {st,human,slot,northwest}=slotFixture();
  human.position={...slot.position};
  human.posture={kind:'sitting',slotId:slot.id,furnitureId:slot.furnitureId};
  assert.ok(hasNode(st,SP.slotEgressNodes(st,slot,human,'walk'),northwest),'Slot egress must use the same diagonal corner semantics as approach');
}

console.log('8-direction Contact + Slot corner semantics regression: ok');
