const fs=require('fs');
const path=require('path');
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const replace=(s,oldText,newText,label)=>{
  if(!s.includes(oldText))throw new Error(`missing expected text: ${label}`);
  return s.replace(oldText,newText);
};

let p='src/engine.js',s=read(p);
s=replace(s,"a?.action?.intent==='sleep'","a?.action?.kind==='sleep'",'engine isSleeping');
s=replace(s,"a=>a.action?.intent==='externalSupply'","a=>a.action?.kind==='externalSupply'",'engine activeSupplyActor');
s=replace(s,"const base={intent:choice.id,phase:'start',started:state.tick,wait:0};","const base={kind:choice.id,phase:'start',started:state.tick,wait:0};",'engine buildAction base');
s=replace(s,"    if(action&&window.SimEngine?.installActionKind)window.SimEngine.installActionKind(action);return action;","    return action;",'engine installActionKind');
s=replace(s,"{actor:a.id,action:'abort',intent:a.action?.intent||''}","{actor:a.id,action:'abort',actionKind:a.action?.kind||''}",'engine abort metadata');
s=s.replaceAll('p.intent','p.kind');
s=replace(s,"a.action?.intent!=='externalSupply'","a.action?.kind!=='externalSupply'",'engine offMap guard');
write(p,s);

p='src/action-runtime-v1120.js';
write(p,`(() => {\n  const E=window.SimEngine,W=window.SimWorld;if(!E||!W)return;\n  const VERSION=W.ACTION_SCHEMA_VERSION||'11.12.0-action-terminology';\n  function actionKind(action){return action?.kind??null;}\n  Object.assign(E,{ACTION_SCHEMA_VERSION:VERSION,actionKind});\n})();\n`);

p='src/intent-runtime-v1121.js';s=read(p);
s=s.replace("    if(E.installActionKind)E.installActionKind(action);\n",'');
write(p,s);

p='src/intent-runtime-v1123.js';s=read(p);
s=s.replaceAll('E.installActionKind?.(action);','');
write(p,s);

p='src/intent-runtime-v1124.js';s=read(p);
s=s.replace("    E.installActionKind?.(nextAction);\n",'');
write(p,s);

p='src/state-validator-v1120.js';
write(p,`(() => {\n  const V=window.SimValidator,E=window.SimEngine;if(!V||!E?.actionKind)return;\n  const baseValidate=V.validateState;\n\n  function validateState(st){\n    const base=baseValidate(st),issues=[...base.issues],add=(code,message,data={})=>issues.push({code,message,...data});\n    for(const a of Object.values(st?.agents||{})){\n      const action=a.action;if(!action)continue;\n      if(!action.kind)add('action_kind_missing',\`${'${a.name}'} 的 action 缺少 canonical kind。\`,{agentId:a.id});\n      if(Object.prototype.hasOwnProperty.call(action,'intent'))add('legacy_action_intent_present',\`${'${a.name}'} 的 action 仍含有已廢除的 intent 欄位；Action type 只能使用 kind。\`,{agentId:a.id});\n    }\n    return {...base,issueCount:issues.length,issues,ok:issues.length===0};\n  }\n\n  V.validateState=validateState;\n})();\n`);

p='tests/action-terminology.mjs';s=read(p);
s=replace(s,
`// Engine-created actions persist canonical kind, while legacy intent survives only as a non-enumerable compatibility alias.\nfor(let i=0;i<20&&!Object.values(st.agents).some(a=>a.action);i++)E.tick();\nconst active=Object.values(st.agents).find(a=>a.action);\nassert.ok(active?.action,'simulation should create an action');\nassert.ok(active.action.kind,'action must persist canonical kind');\nassert.equal(active.action.intent,active.action.kind,'legacy reads should resolve through compatibility alias');\nassert.ok(!Object.keys(active.action).includes('intent'),'legacy intent alias must not be enumerable/persistent');\nassert.ok(Object.keys(active.action).includes('kind'),'kind must be part of persistent action state');\nassert.ok(!JSON.stringify(active.action).includes('"intent"'),'serialized action must not store duplicate intent truth');\nnoIssues('engine-created action');`,
`// Engine-created actions persist canonical kind only. No compatibility alias is installed.\nfor(let i=0;i<20&&!Object.values(st.agents).some(a=>a.action);i++)E.tick();\nconst active=Object.values(st.agents).find(a=>a.action);\nassert.ok(active?.action,'simulation should create an action');\nassert.ok(active.action.kind,'action must persist canonical kind');\nassert.equal(Object.prototype.hasOwnProperty.call(active.action,'intent'),false,'Action must not expose legacy intent property');\nassert.ok(Object.keys(active.action).includes('kind'),'kind must be part of persistent action state');\nassert.ok(!JSON.stringify(active.action).includes('"intent"'),'serialized action must not store legacy intent');\nassert.equal(E.actionKind(active.action),active.action.kind,'actionKind accessor reads canonical kind only');\nnoIssues('engine-created action');`,
'action terminology canonical block');
s=replace(s,
`// Legacy injected action is migrated at the runtime boundary before the base engine executes it.\nE.reset(20260911);\nst=E.getState();\nconst legacy=st.agents.orange;\nlegacy.action={intent:'wander',phase:'move',started:st.tick,wait:0,targetTile:{x:3,y:6}};\nE.tick();\nif(legacy.action){\n  assert.equal(legacy.action.kind,'wander');\n  assert.equal(legacy.action.intent,'wander');\n  assert.ok(!Object.keys(legacy.action).includes('intent'));\n}\nnoIssues('legacy compatibility migration');`,
`// Legacy injected Action is invalid rather than migrated; there is no save/session migration contract.\nE.reset(20260911);\nst=E.getState();\nconst legacy=st.agents.orange;\nlegacy.action={intent:'wander',phase:'move',started:st.tick,wait:0,targetTile:{x:3,y:6}};\nassert.equal(E.actionKind(legacy.action),null,'actionKind must not fall back to removed intent terminology');\nlet validation=V.validateState(st);\nassert.ok(validation.issues.some(x=>x.code==='action_kind_missing'),'legacy-only action must fail missing-kind validation');\nassert.ok(validation.issues.some(x=>x.code==='legacy_action_intent_present'),'legacy intent property must be rejected, not migrated');\nlegacy.action=null;\nnoIssues('legacy state removed');`,
'action terminology no migration block');
s=replace(s,
`// Canonical kind works with exported helpers that still call the old core internals underneath.\nE.reset(20260911);\nst=E.getState();\nconst sleeper=st.agents.zhen,slot=SP.getSlot(st,'bed:left');\nsleeper.position={...slot.position};\nsleeper.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};\nsleeper.action={kind:'sleep',phase:'sleeping',started:st.tick,sleepTicks:3,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}}};\nE.normalizeStateActions(st);\nassert.equal(E.isSleeping(sleeper),true,'canonical kind should drive sleep helper through the compatibility bridge');\nassert.ok(E.actionLabel(sleeper).startsWith('睡眠'),'actionLabel should read canonical kind');\nassert.ok(!Object.keys(sleeper.action).includes('intent'));\nnoIssues('canonical helper compatibility');`,
`// Canonical kind directly drives core sleep and labels without an alias layer.\nE.reset(20260911);\nst=E.getState();\nconst sleeper=st.agents.zhen,slot=SP.getSlot(st,'bed:left');\nsleeper.position={...slot.position};\nsleeper.posture={kind:'lying',slotId:slot.id,furnitureId:slot.furnitureId};\nsleeper.action={kind:'sleep',phase:'sleeping',started:st.tick,sleepTicks:3,sleepTarget:{kind:'slot',id:slot.id,position:{...slot.position}}};\nassert.equal(E.isSleeping(sleeper),true,'canonical kind should directly drive sleep helper');\nassert.ok(E.actionLabel(sleeper).startsWith('睡眠'),'actionLabel should directly read canonical kind');\nassert.equal(Object.prototype.hasOwnProperty.call(sleeper.action,'intent'),false);\nnoIssues('canonical helper');`,
'action terminology helper block');
s=replace(s,"actor.action={intent:'talk',phase:'move',started:st.tick,wait:0,targetAgent:'missing-agent'};","actor.action={kind:'talk',phase:'move',started:st.tick,wait:0,targetAgent:'missing-agent'};",'action terminology abort injection');
s=s.replace('// Event metadata also stops persisting the overloaded intent key.','// Abort metadata uses actionKind directly; no runtime event normalization is required.');
s=s.replace("assert.ok(!Object.keys(a.action).includes('intent'),`${a.name} persisted legacy intent at tick ${E.getState().tick}`);","assert.equal(Object.prototype.hasOwnProperty.call(a.action,'intent'),false,`${a.name} live action exposed legacy intent at tick ${E.getState().tick}`);");
s=s.replace("console.log('v11.12.0 action terminology regression: ok');","console.log('v11.12.0 canonical action.kind terminology regression: ok');");
write(p,s);

p='tests/action-construction.mjs';s=read(p);
s=replace(s,"assert.ok(!Object.keys(eat).includes('intent'),'constructed Action should expose canonical kind after Action runtime normalization');","assert.equal(Object.prototype.hasOwnProperty.call(eat,'intent'),false,'constructed Action must use canonical kind directly');",'construction kind-only assertion');
s=replace(s,"human.action={kind:'wander',phase:'move',started:0,wait:0,targetTile:{x:2,y:6},oneShot:true};E.installActionKind(human.action);","human.action={kind:'wander',phase:'move',started:0,wait:0,targetTile:{x:2,y:6},oneShot:true};",'construction soft fixture');
write(p,s);

p='tests/runtime-hook-pipeline.mjs';s=read(p);
s=replace(s,"  'intent.reconcile-before',\n  'action.normalize-before',\n  'spatial.capture'","  'intent.reconcile-before',\n  'spatial.capture'",'pipeline before action normalization');
s=replace(s,"  'spatial.effects',\n  'action.normalize-after',\n  'intent.reconcile-after'","  'spatial.effects',\n  'intent.reconcile-after'",'pipeline after action normalization');
s=replace(s,"assert.deepEqual(ids('afterReset'),[\n  'action.normalize-reset',\n  'intent.normalize-reset',","assert.deepEqual(ids('afterReset'),[\n  'intent.normalize-reset',",'pipeline reset action normalization');
write(p,s);

const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const jsFiles=[...walk('src'),...walk('tests')].filter(f=>/\.(?:js|mjs)$/.test(f));
const forbidden=['installActionKind','normalizeStateActions','normalizeEventTerminology','normalizeRuntimeState'];
const leftovers=[];
for(const f of jsFiles){const t=read(f);for(const token of forbidden)if(t.includes(token))leftovers.push(`${f}: ${token}`);}
if(leftovers.length)throw new Error('removed compatibility API remains:\n'+leftovers.join('\n'));

const engine=read('src/engine.js');
for(const [name,re] of [['p.intent',/\bp\.intent\b/],['action.intent',/\baction\.intent\b/],['action?.intent',/\baction\?\.intent\b/],['a.action intent',/a\.action\?*\.intent\b/]]){
  if(re.test(engine))throw new Error(`engine still has ${name}`);
}

fs.unlinkSync(__filename);
