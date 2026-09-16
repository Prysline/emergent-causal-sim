from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, repl, label, flags=0):
    text2, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 regex match, got {count}')
    return text2


# Base UI: explicit Inspector render/decorator lifecycle.
path = 'src/ui.js'
text = read(path)
text = replace_once(
    text,
    "  let selected=null,timer=null,mobileView='map',logMode='summary';",
    "  const UI=window.SimUI=window.SimUI||{};\n  const inspectorDecorators=new Map();\n  let selected=null,timer=null,mobileView='map',logMode='summary';",
    'ui.js lifecycle state',
)
needle = "  const sum=o=>Object.values(o||{}).reduce((a,b)=>a+b,0),NEED_SHORT_ZH={hunger:'飢餓',thirst:'口渴',fatigue:'疲勞',sleepNeed:'睡意',social:'社交'};\n"
insert = needle + """
  function sortedInspectorDecorators(){
    return [...inspectorDecorators.values()].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  }
  function currentInspectorSelection(){return selected?{...selected}:null;}
  function runInspectorDecorators(){
    const host=$('inspector');if(!host)return;
    const context={host,selected:currentInspectorSelection(),state:st()};
    for(const entry of sortedInspectorDecorators())entry.handler(context);
  }
  function registerInspectorDecorator(id,handler,order=0){
    if(typeof id!=='string'||!id||typeof handler!=='function')throw new Error('invalid inspector decorator');
    if(inspectorDecorators.has(id))throw new Error(`duplicate inspector decorator: ${id}`);
    inspectorDecorators.set(id,{id,handler,order:Number(order)||0});
    return handler;
  }
  function listInspectorDecorators(){return sortedInspectorDecorators().map(({id,order})=>({id,order}));}
  UI.registerInspectorDecorator=registerInspectorDecorator;
  UI.listInspectorDecorators=listInspectorDecorators;
  UI.runInspectorDecorators=runInspectorDecorators;
  UI.getInspectorSelection=currentInspectorSelection;
"""
text = replace_once(text, needle, insert, 'ui.js lifecycle functions')
text = replace_once(
    text,
    "if(!selected){host.innerHTML=worldOverview();return;}",
    "if(!selected){host.innerHTML=worldOverview();runInspectorDecorators();return;}",
    'ui.js world inspector render',
)
text = replace_once(
    text,
    ":worldOverview();}\n\n  function renderBadges",
    ":worldOverview();runInspectorDecorators();}\n\n  function renderBadges",
    'ui.js selected inspector render',
)
write(path, text)


# Agent-only Inspector sections: move from MutationObserver/click guesses to named decorators.
agent_decorators = [
    ('src/ui-intent-v1121.js', '[data-v1121-intent]', 'intent.active', 300, True),
    ('src/ui-memory-v1130.js', '[data-v1130-memory]', 'memory.episodic', 400, False),
    ('src/ui-appraisal-v1131.js', '[data-v1131-appraisal]', 'appraisal.historical', 500, False),
    ('src/ui-affect-v1132.js', '[data-v1132-affect]', 'affect.current', 600, False),
    ('src/ui-memory-retention-v1133.js', '[data-v1133-retention]', 'memory.retention', 700, False),
    ('src/ui-memory-deliberation-v1134.js', '[data-v1134-memory-deliberation]', 'memory.deliberation', 800, False),
    ('src/ui-social-outcome-memory-v1135.js', '[data-v1135-social-outcome-memory]', 'socialOutcome.memory', 900, False),
]
meta_line = "    const meta=[...host.querySelectorAll('.inspect-title small')].find(x=>x.textContent?.startsWith('Agent・'));if(!meta)return;\n"
for path, selector, reg_id, order, needs_guard in agent_decorators:
    text = read(path)
    text = replace_once(text, '  function decorateInspector(){\n', '  function decorateInspector({host,selected,state:st}){\n', f'{path} signature')
    old_host = f"    const host=document.getElementById('inspector');if(!host||host.querySelector('{selector}'))return;\n"
    new_host = f"    if(!host||host.querySelector('{selector}')||selected?.type!=='agent')return;\n"
    text = replace_once(text, old_host, new_host, f'{path} host guard')
    text = replace_once(text, meta_line, '', f'{path} meta parsing')
    text = sub_once(
        text,
        r"    const id=meta\.textContent\.slice\('Agent・'\.length\),st=E\.getState\(\),a=st\?\.agents\?\.\[id\];",
        "    const id=selected.id,a=st?.agents?.[id];",
        f'{path} selected agent',
    )
    if needs_guard:
        text = replace_once(
            text,
            "    const id=selected.id,a=st?.agents?.[id];\n",
            "    const id=selected.id,a=st?.agents?.[id];if(!a)return;\n",
            f'{path} agent guard',
        )
    tail_pattern = r"\n  const host=document\.getElementById\('inspector'\);\n(?:.|\n)*?\n\}\)\(\);\s*$"
    tail = (
        "\n  const UI=window.SimUI;\n"
        f"  if(!UI?.registerInspectorDecorator)throw new Error('{reg_id} requires inspector decorator lifecycle');\n"
        f"  UI.registerInspectorDecorator('{reg_id}',decorateInspector,{order});\n"
        "})();\n"
    )
    text = sub_once(text, tail_pattern, tail, f'{path} registration', flags=re.S)
    write(path, text)


# Spatial observability: Inspector uses explicit lifecycle; map/actions keep their DOM sync observers.
path = 'src/ui-spatial-observability.js'
text = read(path)
text = replace_once(
    text,
    "  function normalizedInspectorType(type){return type==='Resource Source'?'Source':type;}",
    "  function normalizedInspectorType(type){return ({agent:'Agent',container:'Container',source:'Source',furniture:'Furniture',tile:'Tile',room:'Room',event:'Event'})[type]||(type==='Resource Source'?'Source':type);}",
    'spatial observability type normalization',
)
old_sync = """  function syncInspector(){
    const host=document.getElementById('inspector');if(!host)return;
    const meta=host.querySelector('.inspect-title small')?.textContent?.trim();
    let section=host.querySelector('.spatial-observability-section');
    if(!meta||!meta.includes('・')){section?.remove();return;}
    const [type,id]=meta.split('・',2),html=sectionHtml(type,id);
    syncBaseObjectLocation(host,type,id);
    if(!html){section?.remove();return;}
    if(!section){section=document.createElement('div');section.className='inspect-section spatial-observability-section';const first=host.querySelector('.inspect-section');if(first)first.insertAdjacentElement('afterend',section);else host.append(section);}
    if(section.innerHTML!==html)section.innerHTML=html;
  }
"""
new_sync = """  function decorateInspector({host,selected}){
    if(!host)return;
    let section=host.querySelector('.spatial-observability-section');
    if(!selected){section?.remove();return;}
    const type=selected.type,id=selected.id,html=sectionHtml(type,id);
    syncBaseObjectLocation(host,type,id);
    if(!html){section?.remove();return;}
    if(!section){section=document.createElement('div');section.className='inspect-section spatial-observability-section';const first=host.querySelector('.inspect-section');if(first)first.insertAdjacentElement('afterend',section);else host.append(section);}
    if(section.innerHTML!==html)section.innerHTML=html;
  }
"""
text = replace_once(text, old_sync, new_sync, 'spatial observability inspector decorator')
old_tail = """  function sync(){pending=false;syncInspector();syncMap();syncActions();}
  function schedule(){if(pending)return;pending=true;queueMicrotask(sync);}
  for(const id of ['inspector','map','actions']){const el=document.getElementById(id);if(el)new MutationObserver(schedule).observe(el,{childList:true,subtree:true,characterData:true});}
  schedule();
})();
"""
new_tail = """  function syncMapAndActions(){pending=false;syncMap();syncActions();}
  function schedule(){if(pending)return;pending=true;queueMicrotask(syncMapAndActions);}
  const UI=window.SimUI;
  if(!UI?.registerInspectorDecorator)throw new Error('spatial.observability requires inspector decorator lifecycle');
  UI.registerInspectorDecorator('spatial.observability',decorateInspector,100);
  for(const id of ['map','actions']){const el=document.getElementById(id);if(el)new MutationObserver(schedule).observe(el,{childList:true,subtree:true,characterData:true});}
  schedule();
})();
"""
text = replace_once(text, old_tail, new_tail, 'spatial observability registration')
write(path, text)


# Spatial environment: Inspector-only observer becomes explicit decorator.
path = 'src/ui-spatial-environment.js'
text = read(path)
text = replace_once(text, '  let pending=false;\n\n', '', 'spatial environment pending state')
text = replace_once(
    text,
    "  function normalizedType(type){return type==='Resource Source'?'Source':type;}",
    "  function normalizedType(type){return ({agent:'Agent',container:'Container',source:'Source',furniture:'Furniture',tile:'Tile',room:'Room',event:'Event'})[type]||(type==='Resource Source'?'Source':type);}",
    'spatial environment type normalization',
)
old_block = """  function sync(){
    pending=false;const host=document.getElementById('inspector');if(!host)return;
    const meta=host.querySelector('.inspect-title small')?.textContent?.trim();let section=host.querySelector('.spatial-environment-section');
    if(!meta||!meta.includes('・')){section?.remove();return;}
    const [type,id]=meta.split('・',2),html=sectionHtml(type,id);if(!html){section?.remove();return;}
    if(!section){section=document.createElement('div');section.className='inspect-section spatial-environment-section';const spatial=host.querySelector('.spatial-observability-section'),first=host.querySelector('.inspect-section');if(spatial)spatial.insertAdjacentElement('afterend',section);else if(first)first.insertAdjacentElement('afterend',section);else host.append(section);}
    if(section.innerHTML!==html)section.innerHTML=html;
  }
  function schedule(){if(pending)return;pending=true;queueMicrotask(sync);}
  const host=document.getElementById('inspector');if(host)new MutationObserver(schedule).observe(host,{childList:true,subtree:true,characterData:true});
  schedule();
})();
"""
new_block = """  function decorateInspector({host,selected}){
    if(!host)return;
    let section=host.querySelector('.spatial-environment-section');
    if(!selected){section?.remove();return;}
    const type=selected.type,id=selected.id,html=sectionHtml(type,id);if(!html){section?.remove();return;}
    if(!section){section=document.createElement('div');section.className='inspect-section spatial-environment-section';const spatial=host.querySelector('.spatial-observability-section'),first=host.querySelector('.inspect-section');if(spatial)spatial.insertAdjacentElement('afterend',section);else if(first)first.insertAdjacentElement('afterend',section);else host.append(section);}
    if(section.innerHTML!==html)section.innerHTML=html;
  }
  const UI=window.SimUI;
  if(!UI?.registerInspectorDecorator)throw new Error('spatial.environment requires inspector decorator lifecycle');
  UI.registerInspectorDecorator('spatial.environment',decorateInspector,200);
})();
"""
text = replace_once(text, old_block, new_block, 'spatial environment registration')
write(path, text)


# Resident View: final explicit Inspector layer, no MutationObserver or DOM-parsed selection.
path = 'src/ui-resident-view-v1140.js'
text = read(path)
text = replace_once(
    text,
    "  const E=window.SimEngine,SP=window.SimSpatial,W=window.SimWorld;\n  if(!E||!SP||!W||typeof document==='undefined')return;",
    "  const E=window.SimEngine,SP=window.SimSpatial,W=window.SimWorld,UI=window.SimUI;\n  if(!E||!SP||!W||typeof document==='undefined')return;\n  if(!UI?.registerInspectorDecorator)throw new Error('Resident View requires inspector decorator lifecycle');",
    'resident lifecycle dependency',
)
text = replace_once(
    text,
    "  let currentAgentId=null,mode='resident',residentTab='overview',scheduled=false,mutating=false;",
    "  let currentAgentId=null,mode='resident',residentTab='overview',scheduled=false;",
    'resident state',
)
text = sub_once(
    text,
    r"\n  function selectedAgentFromDebug\(\)\{.*?\n  \}\n  function needText",
    "\n  function needText",
    'resident DOM selection parser',
    flags=re.S,
)
old_layer = """  function layerInspector(){
    scheduled=false;if(mutating)return;
    const id=selectedAgentFromDebug();
    if(!id){currentAgentId=null;return;}
    if(id!==currentAgentId){currentAgentId=id;mode='resident';residentTab='overview';}
    mutating=true;
    let shell=host.querySelector(':scope > [data-v1140-resident-root]');
    if(!shell)shell=buildShell(id);
    else{
      const debug=shell.querySelector('[data-v1140-debug-view]');
      for(const node of [...host.childNodes])if(node!==shell)debug.appendChild(node);
      renderResident(shell,id);applyMode(shell);
    }
    mutating=false;
  }
  function schedule(){
    if(scheduled)return;scheduled=true;
    queueMicrotask(()=>requestAnimationFrame(layerInspector));
  }
  function resetResidentView(){currentAgentId=null;mode='resident';residentTab='overview';schedule();}

  new MutationObserver(()=>schedule()).observe(host,{childList:true,subtree:false});
"""
new_layer = """  function layerInspector({host:renderHost,selected}){
    scheduled=false;
    if(renderHost!==host)return;
    if(selected?.type!=='agent'){currentAgentId=null;return;}
    const id=selected.id;
    if(id!==currentAgentId){currentAgentId=id;mode='resident';residentTab='overview';}
    let shell=host.querySelector(':scope > [data-v1140-resident-root]');
    if(!shell)shell=buildShell(id);
    else{renderResident(shell,id);applyMode(shell);}
  }
  function refreshResidentView(){
    scheduled=false;
    const selected=UI.getInspectorSelection?.(),shell=host.querySelector(':scope > [data-v1140-resident-root]');
    if(!shell||selected?.type!=='agent')return;
    if(selected.id!==currentAgentId){currentAgentId=selected.id;mode='resident';residentTab='overview';}
    renderResident(shell,selected.id);applyMode(shell);
  }
  function schedule(){
    if(scheduled)return;scheduled=true;
    queueMicrotask(()=>requestAnimationFrame(refreshResidentView));
  }
  function resetResidentView(){currentAgentId=null;mode='resident';residentTab='overview';schedule();}

  UI.registerInspectorDecorator('residentView.layer',layerInspector,1000);
"""
text = replace_once(text, old_layer, new_layer, 'resident explicit layer')
text = replace_once(text, "    schedule();\n  });\n\n  if(E.registerRuntimeHook){", "  });\n\n  if(E.registerRuntimeHook){", 'resident catch-all click schedule')
write(path, text)


# Static architecture guards.
path = 'tests/presentation-observability-v1140.mjs'
text = read(path)
anchor = "assert.deepEqual(E.listActionLabelResolvers(),[],'headless simulation should start without presentation label resolvers');\n"
extra = anchor + """
const baseUiSource=fs.readFileSync(new URL('../src/ui.js',import.meta.url),'utf8');
assert.match(baseUiSource,/registerInspectorDecorator/,'base UI must own explicit Inspector decorator lifecycle');
const explicitInspectorDecoratorFiles=[
  'ui-intent-v1121.js','ui-memory-v1130.js','ui-appraisal-v1131.js','ui-affect-v1132.js',
  'ui-memory-retention-v1133.js','ui-memory-deliberation-v1134.js','ui-social-outcome-memory-v1135.js',
  'ui-spatial-environment.js','ui-resident-view-v1140.js'
];
for(const file of explicitInspectorDecoratorFiles){
  const source=fs.readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
  assert.match(source,/registerInspectorDecorator/,`${file} must use explicit Inspector lifecycle`);
  assert.doesNotMatch(source,/new MutationObserver/,`${file} must not infer Inspector render completion from MutationObserver`);
}
const spatialUiSource=fs.readFileSync(new URL('../src/ui-spatial-observability.js',import.meta.url),'utf8');
assert.match(spatialUiSource,/registerInspectorDecorator\('spatial\.observability'/,'spatial Inspector must use explicit decorator lifecycle');
assert.doesNotMatch(spatialUiSource,/\['inspector','map','actions'\]/,'spatial DOM observer must no longer own Inspector rendering');
"""
text = replace_once(text, anchor, extra, 'presentation lifecycle guards')
write(path, text)


# Browser registry/order + duplicate-section ownership assertions.
path = 'tests/browser-resident-view-v1140-qa.mjs'
text = read(path)
text = replace_once(
    text,
    "      navActive:document.querySelector('.mobile-nav [data-tab=\"inspector\"]')?.classList.contains('active')??false\n",
    "      navActive:document.querySelector('.mobile-nav [data-tab=\"inspector\"]')?.classList.contains('active')??false,\n      inspectorDecorators:window.SimUI?.listInspectorDecorators?.()??[]\n",
    'resident snapshot decorator registry',
)
anchor = "assert.equal(desktop.uiVersion,'11.14.0-player-resident-view-debug-inspector');\n"
extra = anchor + """assert.deepEqual(desktop.inspectorDecorators,[
  {id:'spatial.observability',order:100},
  {id:'spatial.environment',order:200},
  {id:'intent.active',order:300},
  {id:'memory.episodic',order:400},
  {id:'appraisal.historical',order:500},
  {id:'affect.current',order:600},
  {id:'memory.retention',order:700},
  {id:'memory.deliberation',order:800},
  {id:'socialOutcome.memory',order:900},
  {id:'residentView.layer',order:1000}
],'Inspector presentation ownership must be explicit and deterministically ordered');
"""
text = replace_once(text, anchor, extra, 'resident registry assertion')
anchor = "assert.ok(debug.debugText.includes('Requester 社交結果記憶'),'Debug must retain requester outcome diagnostics');\n"
extra = anchor + """const debugOwnership=await page.evaluate(()=>({
  roots:document.querySelectorAll('[data-v1140-resident-root]').length,
  intent:document.querySelectorAll('[data-v1121-intent]').length,
  memory:document.querySelectorAll('[data-v1130-memory]').length,
  appraisal:document.querySelectorAll('[data-v1131-appraisal]').length,
  affect:document.querySelectorAll('[data-v1132-affect]').length,
  retention:document.querySelectorAll('[data-v1133-retention]').length,
  deliberation:document.querySelectorAll('[data-v1134-memory-deliberation]').length,
  socialOutcome:document.querySelectorAll('[data-v1135-social-outcome-memory]').length
}));
assert.deepEqual(debugOwnership,{roots:1,intent:1,memory:1,appraisal:1,affect:1,retention:1,deliberation:1,socialOutcome:1},'each Inspector layer must render exactly once');
"""
text = replace_once(text, anchor, extra, 'resident decorator exactly-once assertion')
write(path, text)

print('Inspector presentation lifecycle refactor applied')
