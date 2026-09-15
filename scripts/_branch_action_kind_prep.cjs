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

// The original base validator predates Action Terminology and must no longer require the removed alias.
{
  const file='src/state-validator.js';
  let s=fs.readFileSync(file,'utf8');
  s=s.replaceAll('a.action?.intent','a.action?.kind');
  s=s.replace("if(a.action&&(!a.action.intent||!a.action.phase))add('invalid_action',`${a.name}的 action 缺少 intent / phase。`,{agentId:a.id});","if(a.action&&(!a.action.kind||!a.action.phase))add('invalid_action',`${a.name}的 action 缺少 kind / phase。`,{agentId:a.id});");
  if(s.includes('a.action.intent'))throw new Error('base validator still reads action.intent');
  fs.writeFileSync(file,s);
}

fs.unlinkSync(__filename);
