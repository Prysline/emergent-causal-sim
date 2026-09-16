(() => {
  const V=window.SimValidator,SP=window.SimSpatial,W=window.SimWorld;if(!V||!SP?.surfaceEntry||!SP?.environmentAt)return;

  function validateLayer(st,base){
    const issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});
    for(const f of Object.values(st?.furniture||{})){
      const surface=f.spatial?.surface;if(!surface?.cells)continue;
      for(const cell of surface.cells){
        if(!cell.contents||typeof cell.contents!=='object'||Array.isArray(cell.contents)){add('surface_environment_missing_contents',`${f.name} 的 Surface Cell (${cell.x}, ${cell.y}) 缺少合法 contents storage。`,{furnitureId:f.id,surfaceId:surface.id,x:cell.x,y:cell.y});continue;}
        for(const [resource,amount] of Object.entries(cell.contents)){
          if(!W.RESOURCE_TYPES?.[resource])add('surface_environment_unknown_resource',`${f.name} 的 Surface Cell 含未知資源 ${resource}。`,{furnitureId:f.id,surfaceId:surface.id,resource});
          if(!Number.isFinite(amount)||amount<0)add('surface_environment_invalid_amount',`${f.name} 的 Surface Cell ${resource} 數量不合法：${amount}。`,{furnitureId:f.id,surfaceId:surface.id,resource,amount});
        }
      }
    }
    return {...base,issueCount:issues.length,issues,ok:issues.length===0};
  }

  V.registerValidationLayer('spatial.environment',validateLayer,200);
})();
