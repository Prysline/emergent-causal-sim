import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('src/ui/inspectors/contextual-diagnostics.js');
const intent=read('src/ui/inspectors/intent.js');
const index=read('index.html');
const release=read('src/release.js');
const controls=read('src/ui/observability-controls.js');

assert.match(source,/11\.48\.0-debug-inspector-contextual-diagnostics/,'Debug Inspector diagnostics needs an explicit presentation-only module marker');
for(const view of ['overview','decision','execution','world','perception','social','all'])assert.ok(source.includes(`['${view}'`)||source.includes(`,'${view}'`),`missing Debug Inspector view: ${view}`);
assert.match(source,/Historical \/ adopted evidence/,'historical evidence must be explicitly labeled');
assert.match(source,/Current-derived probe/,'live re-evaluation must be explicitly labeled current-derived');
assert.match(source,/currentConflictResolutionEvidence/,'historical conflict projection must consume canonical Decision Evidence');
assert.match(source,/SC\.conflictCandidates/,'current probe must consume the Sleep conflict resolver query instead of inventing a parallel ranking');
assert.match(source,/AC\.candidateAttemptability/,'carry candidate diagnostics must consume Agent Carry candidate-time authority');
assert.match(source,/SP\.slotOccupant/,'current occupant projection must consume canonical Spatial occupancy');
assert.match(source,/historical evidence 沒有保存 rejection reason/,'missing historical rejection reasons must remain explicitly unknown');
assert.doesNotMatch(source,/\.conflictResolutionEvidence\s*=|\.decisionEvidence\s*=|\.agentCarries\s*=|st\.[A-Za-z0-9_]+\s*=/,'Debug Inspector diagnostics must not persist competing simulation truth');
assert.doesNotMatch(source,/registerInspectorDecorator\(/,'contextual grouping must not create a parallel Inspector section owner');
assert.match(intent,/registerInspectorDecorator\('intent\.active',decorateInspector,300\)/,'existing Intent Inspector remains the canonical decision-section owner');
assert.match(intent,/scheduleDebugInspectorDiagnostics/,'Intent Inspector must schedule the contextual projection after canonical section composition');
assert.ok(index.indexOf('src/ui/inspectors/contextual-diagnostics.js')>index.indexOf('src/ui/inspectors/locomotion.js'),'diagnostics helper must load before bootstrap after all existing Agent Debug section modules are registered');
assert.ok(index.indexOf('src/ui/inspectors/contextual-diagnostics.js')<index.indexOf('src/app/bootstrap.js'),'diagnostics helper must be available before initial Inspector render');
assert.match(release,/11\.48\.0-carrying-replanning/,'Presentation-only Debug Inspector work must not bump overall simulation marker');
assert.match(controls,/11\.48\.0-debug-replay-p1/,'Debug Inspector work must not fake-bump the independent Debug Replay controls generation');

console.log('debug-inspector-contextual-diagnostics: ok');
