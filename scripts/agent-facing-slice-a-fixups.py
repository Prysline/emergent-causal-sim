from pathlib import Path

path=Path('tests/production-source-load-architecture.mjs')
s=path.read_text()
s=s.replace("assert.equal(W.DELIBERATION_SCHEMA_VERSION,CURRENT_VERSION);","assert.equal(W.DELIBERATION_SCHEMA_VERSION,'11.48.1-sleep-perception-approach','Deliberation own generation must not fake-bump for Agent facing foundation');")
s=s.replace("assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,CURRENT_VERSION);","assert.equal(E.DECISION_EVIDENCE_SCHEMA_VERSION,'11.48.1-sleep-perception-approach','Decision Evidence own generation must not fake-bump for Agent facing foundation');")
path.write_text(s)
Path('scripts/agent-facing-slice-a-fixups.py').unlink()
print('Slice A stale subsystem-version assertions fixed.')
