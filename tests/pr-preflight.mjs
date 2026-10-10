import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const checks=[
  ['Source syntax','tests/check-source-syntax.mjs'],
  ['Workflow architecture','tests/workflow-architecture.mjs'],
  ['Production load architecture','tests/production-source-load-architecture.mjs'],
  ['Current version ownership','tests/current-version-ownership.mjs'],
  ['Browser version markers','tests/browser-version-marker-preflight.mjs'],
  ['Presentation/version consistency','tests/presentation-observability.mjs']
];

for(const [label,script] of checks){
  console.log(`\n[preflight] ${label}`);
  const result=spawnSync(process.execPath,[path.join(repoRoot,script)],{cwd:repoRoot,stdio:'inherit'});
  if(result.error){
    console.error(`[preflight] ${label}: unable to start`,result.error);
    process.exit(1);
  }
  if(result.status!==0){
    console.error(`[preflight] ${label}: failed (${script})`);
    process.exit(result.status??1);
  }
}

console.log('\nPR preflight: ok');
