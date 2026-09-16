from pathlib import Path

ROOT=Path('.')

def replace_once(path,old,new,label):
    text=path.read_text()
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    path.write_text(text.replace(old,new,1))

engine=ROOT/'src/engine.js'
replace_once(
    engine,
    "function startAction(a,choice){a.action=buildAction(a,choice);if(a.action)addEvent(`${a.name}決定${ZH[choice.id]||choice.id}。`,'system',[],{actor:a.id,action:choice.id,phase:'plan',position:positionRef(a.position)});}",
    "function startAction(a,choice){a.action=buildAction(a,choice);if(a.action)addEvent(`${a.name}決定${ZH[choice.id]||choice.id}。`,'system',[],{actor:a.id,action:choice.id,phase:'plan',planLifecycle:'initialProvisional',position:positionRef(a.position)});}",
    'core initial plan marker'
)

runtime=ROOT/'src/memory-deliberation-runtime-v1134.js'
replace_once(
    runtime,
    "function rewritePlanEvent(st,a,oldPick,newPick){const e=(st.events||[]).find(x=>x.data?.actor===a.id&&x.data?.phase==='plan'&&x.data?.action===oldPick?.id);if(!e)return;e.text=`${a.name}決定${E.ZH?.[newPick.id]||newPick.id}。`;e.data.action=newPick.id;}",
    "function rewritePlanEvent(st,a,oldPick,newPick){const e=(st.events||[]).find(x=>x.tick===st.tick&&x.type==='system'&&x.data?.actor===a.id&&x.data?.phase==='plan'&&x.data?.planLifecycle==='initialProvisional'&&x.data?.action===oldPick?.id);if(!e)return;e.text=`${a.name}決定${E.ZH?.[newPick.id]||newPick.id}。`;e.data.action=newPick.id;}",
    'same-tick provisional plan rewrite boundary'
)

test=ROOT/'tests/memory-deliberation-influence.mjs'
anchor="// Long-run integration remains bounded and stores no memory influence mirrors.\n"
block=r'''// Initial plan event is provisional private-cognition provenance: same-tick correction normalizes exactly that canonical event, not a decoy or a second event.
E.reset(56340);st=E.getState();st.tick=42;a=st.agents.zhen;calm(a,{social:60});a.position={x:5,y:5};st.agents.zhou.position={x:5,y:6};st.agents.orange.offMap=true;
a.episodicMemories=[
  memory(a,'plan-pos:1',{tick:40,last:40,relevance:1,congruence:1,actorId:'zhou',action:'talk'}),
  memory(a,'plan-pos:2',{tick:41,last:41,relevance:1,congruence:1,actorId:'zhou',action:'acceptTalk'}),
  memory(a,'plan-pos:3',{tick:42,last:42,relevance:1,congruence:1,actorId:'zhou',action:'talk'})
];
const oldPick={id:'wander',score:20},socialPick={id:'talk',score:10};
a.action=E.buildAction(a,oldPick);a.activeIntent=null;st.thoughts[a.id]={options:[oldPick,socialPick],pick:oldPick,tick:st.tick};
const creationSnapshots=[];
E.registerEventCreatedListener('test.initial-plan-provisional',({event})=>{if(event.data?.actor===a.id&&event.data?.phase==='plan')creationSnapshots.push({id:event.id,tick:event.tick,type:event.type,action:event.data.action,planLifecycle:event.data.planLifecycle});},900);
const currentPlanId=E.addEvent(`${a.name}決定${E.ZH?.wander||'wander'}。`,'system',[],{actor:a.id,action:'wander',phase:'plan',planLifecycle:'initialProvisional',position:E.positionRef(a.position)}),currentPlan=st.causes[currentPlanId];
st.tick=41;
const olderPlanId=E.addEvent(`${a.name}決定${E.ZH?.wander||'wander'}。`,'system',[],{actor:a.id,action:'wander',phase:'plan',planLifecycle:'initialProvisional',position:E.positionRef(a.position)}),olderPlan=st.causes[olderPlanId];
st.tick=42;
const normalDecoyId=E.addEvent('decoy plan event','normal',[],{actor:a.id,action:'wander',phase:'plan',planLifecycle:'initialProvisional',position:E.positionRef(a.position)}),normalDecoy=st.causes[normalDecoyId];
const eventCountBeforeCorrection=st.events.length;
assert.equal(E.episodicPolicyForEvent(st,currentPlan).episodic,false,'initial plan event must remain non-episodic private cognition');
assert.equal(E.episodicPolicyForEvent(st,normalDecoy).episodic,false,'plan phase remains non-episodic even for non-system decoy fixtures');
E.adjustInitialDeliberation(st,[a.id]);
assert.equal(E.actionKind(a.action),'talk','positive target history should make the correction choose talk');
assert.equal(a.action.targetAgent,'zhou','corrected social action should keep the memory-selected target');
assert.equal(st.events.length,eventCountBeforeCorrection,'correction must normalize one canonical plan event rather than append a second correction event');
assert.equal(st.causes[currentPlanId],currentPlan,'canonical plan cause identity must remain stable across normalization');
assert.equal(currentPlan.data.action,'talk','same-tick provisional system plan must normalize to the final adopted action');
assert.equal(currentPlan.data.planLifecycle,'initialProvisional','lifecycle marker records provisional-origin provenance after normalization');
assert.equal(olderPlan.data.action,'wander','an older same-actor plan event must not be rewritten');
assert.equal(normalDecoy.data.action,'wander','a same-tick non-system plan-shaped event must not be rewritten');
assert.equal(creationSnapshots.find(x=>x.id===currentPlanId)?.action,'wander','event-created consumers see the explicitly provisional creation payload before same-tick normalization');
assert.equal(creationSnapshots.find(x=>x.id===currentPlanId)?.planLifecycle,'initialProvisional');
for(const agent of Object.values(st.agents)){
  assert.equal((agent.episodicMemories||[]).some(m=>[currentPlanId,olderPlanId,normalDecoyId].includes(m.sourceEventId)),false,'plan lifecycle events must not become episodic memories');
}
const engineSource=fs.readFileSync(new URL('../src/engine.js',import.meta.url),'utf8');
assert.ok(engineSource.includes("phase:'plan',planLifecycle:'initialProvisional'"),'core initial plan producer must label provisional lifecycle explicitly');
const memoryDeliberationSource=fs.readFileSync(new URL('../src/memory-deliberation-runtime-v1134.js',import.meta.url),'utf8');
assert.ok(memoryDeliberationSource.includes("x.tick===st.tick&&x.type==='system'"),'plan normalization must be restricted to same-tick system event provenance');
assert.ok(memoryDeliberationSource.includes("x.data?.planLifecycle==='initialProvisional'"),'plan normalization must require the explicit provisional lifecycle marker');
noIssues('initial plan provisional normalization contract');

'''
text=test.read_text()
if text.count(anchor)!=1: raise SystemExit('test insertion anchor missing/duplicated')
test.write_text(text.replace(anchor,block+anchor,1))

docs=ROOT/'docs/architecture.md'
old="Memory influence 不保存成另一份 persistent relationship truth。\n"
new="""Memory influence 不保存成另一份 persistent relationship truth。\n\nInitial core chooser 建立的 `system + phase:'plan'` event 是**同 tick provisional private-cognition plan**，以 `data.planLifecycle='initialProvisional'` 明示其 creation payload 尚可能在 afterTick 800 Memory-to-Deliberation Correction 被 normalization。Correction 只能改寫同一 tick、同 actor、`type:'system'`、同 lifecycle marker 且 action 對應 initial pick 的既有 canonical plan event；不得新增第二筆 correction event，也不得回頭改寫較舊 plan 或其他 plan-shaped event。Event ID / cause identity 保持不變，event-created consumer 若讀取 creation payload 必須把它視為 provisional，而不是 immutable final plan。Plan event 仍屬 private cognition / non-episodic，不進 generic Episodic Memory。\n"""
replace_once(docs,old,new,'architecture initial plan contract')
