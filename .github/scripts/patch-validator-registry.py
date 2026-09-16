from pathlib import Path

path = Path('tests/v11-state-regression.mjs')
text = path.read_text()

import_anchor = "import assert from 'node:assert/strict';\n"
child_import = "import {execFileSync} from 'node:child_process';\nimport {fileURLToPath} from 'node:url';\n"
if child_import not in text:
    if text.count(import_anchor) != 1:
        raise SystemExit('unexpected v11-state-regression import shape')
    text = text.replace(import_anchor, import_anchor + child_import, 1)

end_anchor = "console.log('v11.10 core regression: ok');\n"
child_run = "console.log('v11.10 core regression: ok');\nexecFileSync(process.execPath,[fileURLToPath(new URL('./validator-rule-registry.mjs',import.meta.url))],{stdio:'inherit'});\n"
if child_run not in text:
    if text.count(end_anchor) != 1:
        raise SystemExit('unexpected v11-state-regression ending')
    text = text.replace(end_anchor, child_run, 1)

path.write_text(text)
