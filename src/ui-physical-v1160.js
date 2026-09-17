(() => {
  const E=window.SimEngine,W=window.SimWorld,P=window.SimPhysical,UI=window.SimUI;
  if(!E||!W?.PHYSICAL_SCHEMA_VERSION||!P?.getMovementEnvelope||typeof document==='undefined')return;
  if(!UI?.registerInspectorDecorator)throw new Error('Physical View requires inspector decorator lifecycle');
  const VERSION=W.PRESENTATION_SCHEMA_VERSION||W.PHYSICAL_SCHEMA_VERSION;
  const host=document.getElementById('inspector');if(!host)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const meters=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(2)} m`:'—';
  const kg=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(2)} kg`:'—';
  const cubic=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(4)} m³`:'—';

  function debugSection(a){
    const p=P.getPhysicalProfile(a),e=P.getMovementEnvelope(a,'standing');if(!p)return null;
    const section=document.createElement('div');section.className='inspect-section';section.dataset.v1160PhysicalDebug='';
    const g=p.bodyGeometry||{};
    section.innerHTML=`<h3>Physical Profile</h3><div class="kv"><div class="k">Mass</div><div>${esc(kg(p.mass))}</div><div class="k">Volume</div><div>${esc(cubic(p.volume))}</div><div class="k">Body Geometry</div><div>H ${esc(meters(g.height))}・W ${esc(meters(g.width))}・L ${esc(meters(g.length))}</div><div class="k">Standing MovementEnvelope</div><div>${e?`H ${esc(meters(e.clearanceHeight))}・W ${esc(meters(e.clearanceWidth))}・L ${esc(meters(e.clearanceLength))}・speed ×${esc(Number(e.speedFactor).toFixed(2))}`:'無法推導'}</div></div><p class="hint">mass / volume / bodyGeometry 是 Agent authoritative physical state；MovementEnvelope 由 Physical runtime 即時計算，不保存第二份 cache。Slice 1 的 Spatial clearance 仍只消費 standing envelope。</p>`;
    return section;
  }
  function decorateInspector({host:renderHost,selected,state:providedState}){
    if(renderHost!==host||selected?.type!=='agent')return;
    const st=providedState||E.getState(),a=st?.agents?.[selected.id];if(!a)return;
    const shell=host.querySelector(':scope > [data-v1140-resident-root]'),debug=shell?.querySelector('[data-v1140-debug-view]');if(!debug)return;
    debug.querySelector('[data-v1160-physical-debug]')?.remove();
    const section=debugSection(a);if(section)debug.prepend(section);
  }

  UI.registerInspectorDecorator('physical.view',decorateInspector,1026);
  E.UI_PHYSICAL_VERSION=VERSION;
})();
