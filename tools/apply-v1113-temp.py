from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)

engine_path = Path('src/engine.js')
engine = engine_path.read_text()
engine = replace_once(
    engine,
    "  function tileEndpointId(p){return `tile:${p.x},${p.y}`;}\n",
    "  function tileEndpointId(p){return `tile:${p.x},${p.y}`;}\n  function positionRef(p){return SP.nodeKey?SP.nodeKey(state,p):SP.key(p);}\n",
    'positionRef helper',
)
engine = replace_once(
    engine,
    "  function lieDown(a,slot=null){a.posture={kind:'lying',slotId:slot?.id||null,furnitureId:slot?.furnitureId||null};if(slot)releaseReservation(`slot:${slot.id}`,a);}\n",
    "  function lieDown(a,slot=null){a.posture={kind:'lying',slotId:slot?.id||null,furnitureId:slot?.furnitureId||null};if(slot)releaseReservation(`slot:${slot.id}`,a);}\n  function atSpatialPosition(a,p){if(!a?.position||!p)return false;if(SP.nodeSame&&SP.normalizeNode){const here=SP.nodeForAgent?SP.nodeForAgent(state,a):SP.normalizeNode(state,a.position,a.position.surfaceId||'floor'),target=SP.normalizeNode(state,p,p.surfaceId||'floor');return SP.nodeSame(state,here,target);}return SP.same(a.position,p);}\n",
    'spatial arrival helper',
)
engine = replace_once(
    engine,
    "function onEnterTile(a){const t=SP.tileByPos(state,a.position),wet=SP.tileLiquidAmount(t);",
    "function onEnterTile(a){const t=SP.floorTileAtNode?SP.floorTileAtNode(state,a.position):SP.tileByPos(state,a.position);if(!t)return;const wet=SP.tileLiquidAmount(t);",
    'floor-only enter effect',
)
engine = engine.replace('SP.same(a.position,goal)', 'atSpatialPosition(a,goal)')
engine = engine.replace('SP.same(a.position,p)', 'atSpatialPosition(a,p)')
engine = engine.replace('SP.same(a.position,slot.position)', 'atSpatialPosition(a,slot.position)')
engine = engine.replace('position:SP.key(a.position)', 'position:positionRef(a.position)')
engine = engine.replace('position:SP.key(target.position)', 'position:positionRef(target.position)')
engine = replace_once(
    engine,
    'causeTree,tileEndpointId,reservationOwner,holderOf};',
    'causeTree,tileEndpointId,positionRef,reservationOwner,holderOf};',
    'positionRef export',
)
engine_path.write_text(engine)

index_path = Path('index.html')
index = index_path.read_text()
index = replace_once(index, '因果湧現模擬器 v11.11.2｜Supported Contact Audit', '因果湧現模擬器 v11.11.3｜Node-aware Floor Effects', 'page title')
index = replace_once(index, 'v11.11.2・Supported Contact Audit', 'v11.11.3・Node-aware Floor Effects', 'header version')
index = replace_once(index, '<script src="src/contact-v1112.js" defer></script>\n<script src="src/engine.js" defer></script>', '<script src="src/contact-v1112.js" defer></script>\n<script src="src/spatial-v1113.js" defer></script>\n<script src="src/engine.js" defer></script>', 'runtime script')
index_path.write_text(index)

Path('src/spatial-v1113.js').write_text("""(() => {
  const W=window.SimWorld,SP=window.SimSpatial;if(!W||!SP?.normalizeNode)return;
  const VERSION='11.11.3-node-aware-floor-effects',FLOOR='floor';
  const baseCreateInitialState=W.createInitialState,baseInit=SP.init;

  function node(st,p){return p?SP.normalizeNode(st,p,p.surfaceId||FLOOR):null;}
  function isFloorNode(st,p){return node(st,p)?.surfaceId===FLOOR;}
  function floorTileAtNode(st,p){return isFloorNode(st,p)?SP.tileByPos(st,p):null;}
  function floorLiquidAmountAtNode(st,p){const t=floorTileAtNode(st,p);return t?SP.tileLiquidAmount(t):0;}
  function floorSlipRiskAt(st,p){return Math.min(45,floorLiquidAmountAtNode(st,p)*.55);}
  function localNodeCrowd(st,p){const n=node(st,p);if(!n)return 0;const count=SP.nodeOccupantsAt?SP.nodeOccupantsAt(st,n).length:SP.occupantsAt(st,p).length;return Math.max(0,count-1);}
  function noiseAt(st,p){
    const n=node(st,p);if(!n)return 0;
    const targetRoom=SP.roomAt(st,n);let total=1;
    for(const e of st.noiseEvents||[]){if(!e.position)continue;const d=SP.manhattan(n,e.position),sameRoom=SP.roomAt(st,e.position)===targetRoom;total+=(e.amount||0)/(1+d*.75)*(sameRoom?1:.18);}
    total+=localNodeCrowd(st,n)*.8;return total;
  }
  function comfortAt(st,p){
    const n=node(st,p),t=n&&SP.tileByPos(st,n);if(!t)return 0;
    const wet=n.surfaceId===FLOOR?SP.tileLiquidAmount(t):0,crowd=localNodeCrowd(st,n);
    return Math.max(0,Math.min(100,48+SP.nearbyRestQuality(st,n)*28-wet*1.2-crowd*5-noiseAt(st,n)*.35));
  }

  W.VERSION=VERSION;
  W.createInitialState=(seed)=>{const st=baseCreateInitialState(seed);st.version=VERSION;return st;};
  SP.init=(st)=>baseInit(st);
  SP.floorSlipRiskAt=floorSlipRiskAt;
  SP.noiseAt=noiseAt;
  SP.comfortAt=comfortAt;
  Object.assign(SP,{ENVIRONMENT_VERSION:VERSION,isFloorNode,floorTileAtNode,floorLiquidAmountAtNode,localNodeCrowd});
})();
""")

Path('tests/spatial-floor-boundaries.mjs').write_text("""import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['world.js','spatial.js','spatial-v111.js','spatial-observability.js','contact-v1112.js','spatial-v1113.js','engine.js','state-validator.js','state-validator-v111.js']){
  vm.runInThisContext(fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{filename:file});
}

const E=globalThis.SimEngine,SP=globalThis.SimSpatial,V=globalThis.SimValidator;
const floor=(st,x,y)=>SP.normalizeNode(st,{x,y},'floor');
const table=(st,x,y)=>SP.normalizeNode(st,{x,y},'diningTable:surface');

E.reset(20260911);
let st=E.getState(),orange=st.agents.orange;
assert.equal(st.version,'11.11.3-node-aware-floor-effects');
assert.equal(E.VERSION,'11.11.3-node-aware-floor-effects');
assert.equal(SP.ENVIRONMENT_VERSION,'11.11.3-node-aware-floor-effects');

const under=SP.tileByPos(st,{x:6,y:2});
under.surface.contents.water=12;
const floorNode=floor(st,6,2),tableNode=table(st,6,2);
assert.ok(SP.floorSlipRiskAt(st,floorNode)>0,'wet floor should still have slip risk');
assert.equal(SP.floorSlipRiskAt(st,tableNode),0,'tabletop must not inherit slip risk from floor below');
assert.equal(SP.floorLiquidAmountAtNode(st,tableNode),0,'tabletop node must not report floor liquid');
assert.ok(SP.comfortAt(st,tableNode)>SP.comfortAt(st,floorNode),'floor wetness must not lower tabletop local comfort');

orange.position={...floor(st,5,2)};
orange.contacts.paws={};
orange.action={intent:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...table(st,5,2)},oneShot:true};
for(let i=0;i<8&&orange.action;i++)E.tick();
assert.equal(orange.action,null,'same-XY floor→tabletop move should finish');
assert.equal(orange.position.surfaceId,'diningTable:surface','same XY must not short-circuit Surface transition');
assert.equal(orange.position.x,5);assert.equal(orange.position.y,2);

orange.position={...table(st,5,2)};
orange.contacts.paws={};
const wetBefore=under.surface.contents.water;
orange.action={intent:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...table(st,6,2)},oneShot:true};
for(let i=0;i<4&&orange.action;i++)E.tick();
assert.equal(orange.position.surfaceId,'diningTable:surface');
assert.equal(orange.position.x,6);assert.equal(orange.position.y,2);
assert.equal(orange.contacts.paws.water||0,0,'tabletop movement must not touch floor liquid below');
assert.equal(under.surface.contents.water,wetBefore,'tabletop movement must not consume floor liquid below');
assert.ok(!st.events.some(e=>e.data?.action==='tileContact'&&e.data?.position==='6,2'),'tabletop move must not emit floor tileContact');

orange.position={...floor(st,7,2)};
orange.contacts.paws={};
orange.action={intent:'wander',phase:'move',started:st.tick,wait:0,targetTile:{...floor(st,6,2)},oneShot:true};
for(let i=0;i<4&&orange.action;i++)E.tick();
assert.equal(orange.position.surfaceId,'floor');
assert.ok((orange.contacts.paws.water||0)>0,'actual floor traversal must still pick up liquid');
assert.ok(under.surface.contents.water<wetBefore,'actual floor contact must reduce floor liquid');

E.reset(20260911);st=E.getState();orange=st.agents.orange;
st.containers.cupA.contents={water:10};
orange.position={...table(st,6,2)};
orange.action={intent:'drinkWater',phase:'move',started:st.tick,wait:0,targetObject:'cupA',resource:'water'};
for(let i=0;i<4&&orange.action;i++)E.tick();
const drinkEvent=st.events.find(e=>e.data?.actor==='orange'&&e.data?.action==='drinkWater');
assert.ok(drinkEvent,'tabletop drink should emit event');
assert.equal(drinkEvent.data.position,'room1|diningTable:surface|6,2','event position must retain Surface identity');

let validation=V.validateState(st);
assert.equal(validation.issueCount,0,validation.issues.map(x=>x.message).join('\\n'));
E.reset(20260911);
for(let i=0;i<500;i++)E.tick();
validation=V.validateState(E.getState());
assert.equal(validation.issueCount,0,validation.issues.slice(0,8).map(x=>x.message).join('\\n'));
console.log('v11.11.3 node-aware floor effects + movement arrival passed');
""")

workflow_path=Path('.github/workflows/state-regression.yml')
workflow=workflow_path.read_text()
line='      - run: node tests/spatial-floor-boundaries.mjs\n'
if line not in workflow:
    workflow += line
workflow_path.write_text(workflow)

print('v11.11.3 patch applied')
