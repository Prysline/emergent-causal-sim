const fs=require('fs');
const files=[
  'src/human-social-response-runtime-v1133a.js',
  'src/social-bid-runtime-v1122.js',
  'src/social-response-runtime-v1132a.js',
  'tests/active-intent-foundation.mjs',
  'tests/human-social-response-agency.mjs',
  'tests/intent-replan-preemption.mjs',
  'tests/memory-deliberation-influence.mjs',
  'tests/social-bid-lifecycle.mjs',
  'tests/social-response-agency.mjs',
  'tests/soft-reconsideration-hysteresis.mjs'
];
for(const file of files){
  let s=fs.readFileSync(file,'utf8');
  // All affected fixtures/actions already declare canonical `kind`; remove obsolete normalization/install calls only.
  s=s.replace(/E\.installActionKind\?\.\([^;]+\);/g,'');
  s=s.replace(/E\.installActionKind\([^;]+\);/g,'');
  s=s.replace(/E\.normalizeStateActions\(st\);/g,'');
  fs.writeFileSync(file,s);
}
fs.unlinkSync(__filename);
