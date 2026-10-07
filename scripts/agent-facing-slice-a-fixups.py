from pathlib import Path

path=Path('tests/production-source-load-architecture.mjs')
s=path.read_text()
s=s.replace("assert.equal(W.DELIBERATION_SCHEMA_VERSION,CURRENT_VERSION);","assert.equal(W.DELIBERATION_SCHEMA_VERSION,'11.48.1-sleep-perception-approach','Deliberation own generation must not fake-bump for Agent facing foundation');")
s=s.replace("assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,CURRENT_VERSION);","assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,'11.48.1-sleep-perception-approach','Decision Evidence own generation must not fake-bump for Agent facing foundation');")
path.write_text(s)

path=Path('tests/sleep-preferred-slot-conflict.mjs')
s=path.read_text()
s=s.replace("assert.equal(E.DELIBERATION_SCHEMA_VERSION,APP_VERSION);","assert.equal(E.DELIBERATION_SCHEMA_VERSION,'11.48.1-sleep-perception-approach','Deliberation own generation must not fake-bump for Agent facing foundation');")
path.write_text(s)

path=Path('tests/carried-container-handling-risk.mjs')
s=path.read_text()
s=s.replace("const DELIBERATION_VERSION='11.49.0-agent-facing-foundation';","const DELIBERATION_VERSION='11.48.1-sleep-perception-approach';")
path.write_text(s)

path=Path('tests/debug-inspector-contextual-diagnostics.mjs')
s=path.read_text()
old="assert.match(release,/11\\.48\\.1-sleep-perception-approach/,'Inspector must follow the canonical overall release after the semantic Sleep boundary fix');"
new="assert.match(release,/11\\.49\\.0-agent-facing-foundation/,'Inspector must follow the canonical overall release after Agent facing foundation');"
if old not in s:
    raise SystemExit('Debug Inspector overall-release expectation changed unexpectedly')
s=s.replace(old,new,1)
path.write_text(s)

path=Path('tests/agent-facing-foundation.mjs')
s=path.read_text()
old="""import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

globalThis.window=globalThis;
for(const file of ['furniture-definitions.js','horizontal-geometry.js','world-authoring.js','embodiment-capabilities.js','world-initializer.js','world.js','release.js']){
  vm.runInThisContext(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{filename:file});
}
"""
new="""import assert from 'node:assert/strict';
import {loadInitialStateProfile} from './helpers/test-profiles.mjs';

globalThis.window=globalThis;
loadInitialStateProfile(['world-authoring.js','world-initializer.js','world.js','release.js','spatial.js']);
"""
if old not in s:
    raise SystemExit('focused facing regression load block changed unexpectedly')
s=s.replace(old,new,1)
path.write_text(s)

Path('scripts/agent-facing-slice-a-fixups.py').unlink()
print('Slice A stale-version and test-profile fixups applied.')
