(() => {
  const SP=window.SimSpatial;if(!SP?.normalizeNode)return;
  const VERSION='11.11.3-node-aware-floor-effects',FLOOR='floor';

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
  SP.floorSlipRiskAt=floorSlipRiskAt;
  SP.noiseAt=noiseAt;
  SP.comfortAt=comfortAt;
  Object.assign(SP,{ENVIRONMENT_VERSION:VERSION,isFloorNode,floorTileAtNode,floorLiquidAmountAtNode,localNodeCrowd});
})();
