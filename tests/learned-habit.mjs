import assert from 'node:assert/strict';
import {loadProductionBefore} from './helpers/production-loader.mjs';

globalThis.window=globalThis;
loadProductionBefore('src/ui/core.js');

const E=globalThis.SimEngine,H=globalThis.SimDailyLifeLearnedHabit,V=globalThis.SimValidator,W=globalThis.SimWorld;
assert.ok(E&&H&&V&&W,'production prefix must load Engine, Learned Habit, Validator, and World');
assert.equal(H.VERSION,'daily-life-learned-habit-v1');
assert.equal(E.DAILY_LIFE_LEARNED_HABIT_VERSION,H.VERSION);
assert.equal(W.DAILY_LIFE_LEARNED_HABIT_SCHEMA_VERSION,H.VERSION);
assert.ok(E.listRuntimeHooks('episodicMemoryCreated').some(entry=>entry.id==='dailyLifeLearnedHabit.consolidate'&&entry.order===50),'Learned Habit must consume the canonical episodicMemoryCreated phase before Appraisal');

function neutralize(st,a){
  Object.assign(a.needs,{hunger:0,thirst:0,fatigue:0,sleepNeed:0,social:0,stimulation:0,relaxation:0});
  a.traits.alcoholLike=0;a.traits.social=0;a.traits.animalAffinity=0;
  a.action=null;a.activeIntent=null;a.decisionEvidence=null;
}
function habit(a,activity,bucket){return a.learnedHabits?.[`${activity}|daily-time-bucket:${bucket}`]||null;}
function addExperience(st,a,data,type='good'){
  return E.addEvent(`qa ${data.action}`,type,[],{actor:a.id,position:E.positionRef(a.position),...data});
}

E.reset(18001);
let st=E.getState(),a=st.agents.zhen;
assert.deepEqual(a.learnedHabits,{},'Learned Habit truth must initialize on each Agent');
assert.equal(Object.prototype.hasOwnProperty.call(st,'learnedHabits'),false,'Learned Habit must not create World-level personal habit truth');

st.minute=19*60;
const memoryCount=a.episodicMemories.length;
addExperience(st,a,{action:'read',phase:'plan',feedbackUnits:0},'system');
assert.equal(a.episodicMemories.length,memoryCount,'plan event must remain excluded by canonical episodic policy');
assert.equal(habit(a,'read','evening'),null,'plan must not form Learned Habit');

addExperience(st,a,{action:'eat',phase:'start',from:'foodA'},'normal');
assert.ok(a.episodicMemories.some(memory=>memory.observed?.action==='eat'),'eat start is a real observed event even though it is not qualifying Habit experience');
assert.equal(habit(a,'eat','evening'),null,'eat phase:start must not form Learned Habit');

addExperience(st,a,{action:'read',target:'bookA',feedbackUnits:6});
assert.equal(habit(a,'read','evening')?.strength,.2,'first realized read experience must create a weak Habit summary');
assert.equal(habit(a,'read','evening')?.experienceCount,1);
assert.equal(Object.prototype.hasOwnProperty.call(habit(a,'read','evening'),'targetObject'),false,'Learned Habit must not persist exact Object identity');

addExperience(st,a,{action:'read',target:'bookB',feedbackUnits:6});
assert.ok(habit(a,'read','evening').strength>.2&&habit(a,'read','evening').strength<1,'repetition must strengthen gradually rather than jump to full strength');
assert.equal(habit(a,'read','evening').experienceCount,2);

addExperience(st,a,{action:'eat',amount:6,from:'foodA'});
assert.equal(habit(a,'eat','evening')?.strength,.2,'real resource consumption must qualify as eat experience');
addExperience(st,a,{action:'talk',target:'zhou'});
assert.equal(habit(a,'talk','evening')?.strength,.2,'completed social interaction must qualify as talk experience');

const observerBefore=habit(a,'talk','evening').experienceCount;
E.addEvent('mei talks to zhen','good',[],{actor:'zhou',target:a.id,action:'talk',position:E.positionRef(st.agents.zhou.position)});
assert.ok(a.episodicMemories.some(memory=>memory.observed?.action==='talk'&&memory.observed?.actorId==='zhou'),'direct target may remember another actor talk event');
assert.equal(habit(a,'talk','evening').experienceCount,observerBefore,'observing another actor must not consolidate own Learned Habit');

st.minute=8*60;
addExperience(st,a,{action:'read',target:'bookA',feedbackUnits:6});
assert.equal(habit(a,'read','morning')?.strength,.2,'different daypart must create a separate context summary');
assert.equal(habit(a,'read','evening').experienceCount,2,'morning experience must not rewrite evening Habit');

const eveningContext=H.contextForMinute(19*60),eveningHabit=habit(a,'read','evening'),stored=eveningHabit.strength;
st.tick=eveningHabit.lastExperienceTick+H.LEARNED_HABIT_HALF_LIFE_TICKS;
assert.ok(Math.abs(H.effectiveLearnedHabitStrength(st,a,'read',eveningContext)-stored*.5)<1e-12,'one deterministic half-life must halve effective strength');

E.reset(18002);st=E.getState();a=st.agents.zhen;neutralize(st,a);
const anchor=a.routine.anchors.find(item=>item.activityKind==='read');
const anchorMinute=Math.floor((anchor.context.startMinute+anchor.context.endMinute)/2);
st.minute=anchorMinute;
E.tick();
const baselineReadCount=E.getState().thoughts.zhen.options.filter(option=>option.id==='read').length;
assert.ok(baselineReadCount>0,'fixture must expose at least one existing feasible read candidate');

E.reset(18002);st=E.getState();a=st.agents.zhen;neutralize(st,a);st.minute=anchorMinute;
addExperience(st,a,{action:'read',target:'bookA',feedbackUnits:6});
const actionBefore=a.action,intentBefore=a.activeIntent;
const directContribution=H.decisionContributionForOption(st,a,{id:'read',targetObject:'bookA',score:20});
assert.equal(a.action,actionBefore,'Habit contribution query must not create Action');
assert.equal(a.activeIntent,intentBefore,'Habit contribution query must not create Active Intent');
assert.ok(directContribution.scoreDelta>0&&directContribution.scoreDelta<=H.LEARNED_HABIT_MAX_DECISION_DELTA,'Habit Decision Evidence must remain bounded');
assert.equal(Object.prototype.hasOwnProperty.call(directContribution.contributor,'targetObject'),false,'Habit contributor must not leak exact target identity');
E.tick();st=E.getState();a=st.agents.zhen;
const habitReadOptions=st.thoughts.zhen.options.filter(option=>option.id==='read');
assert.equal(habitReadOptions.length,baselineReadCount,'Learned Habit must enrich existing read candidates without creating a duplicate candidate');
assert.ok(habitReadOptions.every(option=>option.decisionContributors.some(c=>c.kind==='learnedHabit'&&c.activityKind==='read')),'every existing read candidate in the matching context must receive the same bounded Activity-level Habit evidence');

E.reset(18003);st=E.getState();a=st.agents.zhen;neutralize(st,a);st.minute=anchorMinute;
addExperience(st,a,{action:'read',target:'bookA',feedbackUnits:6});
delete st.objects.bookA;
E.tick();st=E.getState();a=st.agents.zhen;
assert.equal(st.thoughts.zhen.options.some(option=>option.id==='read'),false,'Habit must not make an infeasible Activity legal');
assert.notEqual(a.action?.kind,'read','Habit must not fabricate read Action without an existing feasible candidate');

E.reset(18004);st=E.getState();a=st.agents.zhen;neutralize(st,a);st.minute=19*60;
addExperience(st,a,{action:'talk',target:'zhou'});
E.tick();st=E.getState();
const talkOption=st.thoughts.zhen.options.find(option=>option.id==='talk');
assert.ok(talkOption?.decisionContributors.some(c=>c.kind==='learnedHabit'&&c.activityKind==='talk'),'social Activity must consume the same Learned Habit contribution contract');

E.reset(18005);st=E.getState();a=st.agents.zhen;neutralize(st,a);st.minute=19*60;
addExperience(st,a,{action:'eat',amount:5,from:'foodA'});
a.needs.hunger=95;
E.tick();st=E.getState();
const eatOption=st.thoughts.zhen.options.find(option=>option.id==='eat');
assert.ok(eatOption?.decisionContributors.some(c=>c.kind==='learnedHabit'&&c.activityKind==='eat'),'physiological Activity must consume the same Learned Habit contribution contract');
assert.equal(st.thoughts.zhen.pick.id,'eat','strong physiological Need remains free to dominate ordinary candidate competition');

E.reset(18006);st=E.getState();a=st.agents.zhen;
st.minute=19*60;addExperience(st,a,{action:'read',target:'bookA',feedbackUnits:6});
const key='read|daily-time-bucket:evening';a.learnedHabits[key].targetObject='bookA';
const validation=V.validateState(st);
assert.ok(validation.issues.some(issue=>issue.code==='learned_habit_summary_invalid'),'validator must reject hidden target identity added to Learned Habit summary');

E.reset(18007);const first=structuredClone(E.getState().agents.zhen.learnedHabits);
st=E.getState();a=st.agents.zhen;st.minute=19*60;addExperience(st,a,{action:'read',target:'bookA',feedbackUnits:6});const learnedOnce=structuredClone(a.learnedHabits);
E.reset(18007);st=E.getState();a=st.agents.zhen;st.minute=19*60;addExperience(st,a,{action:'read',target:'bookA',feedbackUnits:6});assert.deepEqual(a.learnedHabits,learnedOnce,'same seed / same realized experience must produce deterministic Habit state');
assert.deepEqual(first,{},'DAY 0 Learned Habit starts empty; Routine remains the separate initial temporal tendency truth');

console.log('learned-habit: ok');
