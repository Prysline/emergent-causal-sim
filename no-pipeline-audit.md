# Legacy no-pipeline runtime audit

## Potential fallback owners

These are `src/*.js` files other than canonical `engine.js` / `runtime-hook-pipeline.js` that assign `E.tick`, `E.reset`, or `E.onEpisodicMemoryCreated`, or retain a `baseTick/baseReset/baseMemoryHook` chain.

### `affect-runtime-v1132.js`
- also registers formal runtime hooks: `True`
```text
37:     const baseTick=E.tick,baseReset=E.reset,priorMemoryCreatedHook=E.onEpisodicMemoryCreated;
38:     E.onEpisodicMemoryCreated=(st,a,memory)=>{if(typeof priorMemoryCreatedHook==='function')priorMemoryCreatedHook(st,a,memory);updateAffectFromAppraisal(st,a,memory);return memory?.appraisal||null;};
39:     E.tick=(...args)=>{const st=E.getState();decayAffectState(st,(st?.tick||0)+1);return baseTick(...args);};
40:     E.reset=(...args)=>normalizeAffectState(baseReset(...args));
```

### `appraisal-human-social-response-v1133a.js`
- also registers formal runtime hooks: `True`
```text
41:     E.onEpisodicMemoryCreated=(st,a,memory)=>{if(typeof priorMemoryCreatedHook==='function')priorMemoryCreatedHook(st,a,memory);if(['acceptTalk','talk','briefTalkReply','declineTalk'].includes(memory?.observed?.action))return appraiseHumanSocialResponseMemory(st,a,memory);return memory?.appraisal||null;};
```

### `appraisal-runtime-v1131.js`
- also registers formal runtime hooks: `True`
```text
48:     E.onEpisodicMemoryCreated=(st,a,memory)=>{if(typeof priorMemoryCreatedHook==='function')priorMemoryCreatedHook(st,a,memory);return appraiseEpisodicMemory(st,a,memory);};
```

### `appraisal-social-response-v1132a.js`
- also registers formal runtime hooks: `True`
```text
31:     E.onEpisodicMemoryCreated=(st,a,memory)=>{if(typeof priorMemoryCreatedHook==='function')priorMemoryCreatedHook(st,a,memory);if(memory?.observed?.action==='avoidPet')return appraiseAvoidPetMemory(st,a,memory);return memory?.appraisal||null;};
```

### `engine-spatial-v1114.js`
- also registers formal runtime hooks: `True`
```text
62:     const baseTick=E.tick;
63:     E.tick=(...args)=>{const snap=captureSpatialTick(E.getState()),result=baseTick(...args);settleSpatialTick(E.getState(),snap);return result;};
```

### `human-social-response-runtime-v1133a.js`
- also registers formal runtime hooks: `True`
```text
92:     const baseTick=E.tick,baseReset=E.reset;
93:     E.tick=(...args)=>{prepareTick(E.getState());const result=baseTick(...args);settleTick(E.getState());return result;};
94:     E.reset=(...args)=>baseReset(...args);
```

### `intent-runtime-v1121.js`
- also registers formal runtime hooks: `True`
```text
41:     const baseTick=E.tick,baseReset=E.reset;
42:     E.tick=(...args)=>{reconcileIntents(E.getState());const result=baseTick(...args);reconcileIntents(E.getState());return result;};
43:     E.reset=(...args)=>reconcileIntents(baseReset(...args));
```

### `intent-runtime-v1123.js`
- also registers formal runtime hooks: `True`
```text
46:     const baseTick=E.tick,baseReset=E.reset;
47:     E.tick=(...args)=>{const snap=prepareTick(E.getState()),result=baseTick(...args);settleTick(E.getState(),snap);return result;};
48:     E.reset=(...args)=>baseReset(...args);
```

### `intent-runtime-v1124.js`
- also registers formal runtime hooks: `True`
```text
141:     const baseTick=E.tick,baseReset=E.reset;
142:     E.tick=(...args)=>{applySoftReconsiderations(E.getState());return baseTick(...args);};
143:     E.reset=(...args)=>baseReset(...args);
```

### `memory-deliberation-runtime-v1134.js`
- also registers formal runtime hooks: `True`
```text
61:     const baseTick=E.tick,baseReset=E.reset;
62:     E.tick=(...args)=>{const idleBefore=captureIdle(E.getState()),result=baseTick(...args);correctInitialDeliberation(E.getState(),idleBefore);return result;};
63:     E.reset=(...args)=>baseReset(...args);
```

### `memory-retention-runtime-v1133.js`
- also registers formal runtime hooks: `True`
```text
40:   else{const baseReset=E.reset;E.reset=(...args)=>normalizeRetentionState(baseReset(...args));}
```

### `memory-runtime-v1130.js`
- also registers formal runtime hooks: `True`
```text
67:     a.episodicMemories.push(memory);if(typeof E.onEpisodicMemoryCreated==='function')E.onEpisodicMemoryCreated(st,a,memory);pruneAgentMemories(st,a);return memory;
81:     const baseTick=E.tick,baseReset=E.reset;
82:     E.tick=(...args)=>{const result=baseTick(...args);flushDeferredCoreEvents(E.getState());return result;};
83:     E.reset=(...args)=>resetMemoryRuntime(baseReset(...args));
```

### `social-bid-runtime-v1122.js`
- also registers formal runtime hooks: `True`
```text
95:     const baseTick=E.tick,baseReset=E.reset;
96:     E.tick=(...args)=>{const snap=prepareTick(E.getState()),result=baseTick(...args);settleTick(E.getState(),snap);return result;};
97:     E.reset=(...args)=>normalizeSocialState(baseReset(...args));
```

### `social-outcome-memory-runtime-v1135.js`
- also registers formal runtime hooks: `True`
```text
48:     const baseTick=E.tick,baseReset=E.reset;
49:     E.tick=(...args)=>{const marker=E.getState()?.events?.[0]?.id||null,result=baseTick(...args);processRequesterSocialOutcomes(E.getState(),marker);return result;};
50:     E.reset=(...args)=>baseReset(...args);
```

### `social-response-runtime-v1132a.js`
- also registers formal runtime hooks: `True`
```text
57:     const baseTick=E.tick,baseReset=E.reset;
58:     E.tick=(...args)=>{const before=E.getState(),pending=capturePendingPetOffers(before),result=baseTick(...args),after=E.getState();settlePendingOffers(after,pending);return result;};
59:     E.reset=(...args)=>baseReset(...args);
```

### `ui-observability-controls-v1133a.js`
- also registers formal runtime hooks: `True`
```text
82:     const baseTick=E.tick,baseReset=E.reset;
83:     E.tick=(...args)=>{const result=baseTick(...args);renderMobileSummary();return result;};
84:     E.reset=(...args)=>{const result=baseReset(...args);renderMobileSummary();return result;};
```

### `ui-resident-view-v1140.js`
- also registers formal runtime hooks: `True`
```text
176:     const baseTick=E.tick,baseReset=E.reset;
177:     E.tick=(...args)=>{const result=baseTick(...args);schedule();return result;};
178:     E.reset=(...args)=>{currentAgentId=null;mode='resident';residentTab='overview';const result=baseReset(...args);schedule();return result;};
```

## Focused Node tests using fallback owners

- `action-construction.mjs` — pipeline=`True` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-response-runtime-v1132a.js`
- `action-terminology.mjs` — pipeline=`False` — fallback-capable sources: `engine-spatial-v1114.js`
- `active-intent-foundation.mjs` — pipeline=`False` — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`
- `animal-social-outcome-memory.mjs` — pipeline=`False` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-outcome-memory-runtime-v1135.js`, `social-response-runtime-v1132a.js`
- `canonical-decision-utility-parity.mjs` — pipeline=`True` — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `social-bid-runtime-v1122.js`
- `episodic-memory-foundation.mjs` — pipeline=`False` — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`
- `event-appraisal.mjs` — pipeline=`False` — fallback-capable sources: `appraisal-runtime-v1131.js`, `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`
- `human-social-response-agency.mjs` — pipeline=`False` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-response-runtime-v1132a.js`
- `intent-replan-preemption.mjs` — pipeline=`False` — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `social-bid-runtime-v1122.js`
- `legacy-pending-interaction-cleanup.mjs` — pipeline=`False` — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `memory-deliberation-runtime-v1134.js`, `social-bid-runtime-v1122.js`
- `memory-deliberation-influence.mjs` — pipeline=`False` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-response-runtime-v1132a.js`
- `memory-event-observation-timing.mjs` — pipeline=`True` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-outcome-memory-runtime-v1135.js`, `social-response-runtime-v1132a.js`
- `memory-resource-transfer-consequence-policy.mjs` — pipeline=`True` — fallback-capable sources: `engine-spatial-v1114.js`, `memory-runtime-v1130.js`
- `memory-salience-pruning.mjs` — pipeline=`False` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-response-runtime-v1132a.js`
- `memory-spatial-event-enrichment.mjs` — pipeline=`True` — fallback-capable sources: `appraisal-runtime-v1131.js`, `engine-spatial-v1114.js`, `memory-runtime-v1130.js`
- `pet-response-observation-timing.mjs` — pipeline=`True` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-outcome-memory-runtime-v1135.js`, `social-response-runtime-v1132a.js`
- `presentation-observability-v1140.mjs` — pipeline=`False` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-outcome-memory-runtime-v1135.js`, `social-response-runtime-v1132a.js`, `ui-observability-controls-v1133a.js`, `ui-resident-view-v1140.js`
- `requester-social-outcome-memory.mjs` — pipeline=`False` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-outcome-memory-runtime-v1135.js`, `social-response-runtime-v1132a.js`
- `runtime-hook-pipeline.mjs` — pipeline=`True` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-outcome-memory-runtime-v1135.js`, `social-response-runtime-v1132a.js`
- `short-lived-affect.mjs` — pipeline=`False` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-runtime-v1131.js`, `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`
- `social-bid-lifecycle.mjs` — pipeline=`False` — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `social-bid-runtime-v1122.js`
- `social-response-agency.mjs` — pipeline=`False` — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-response-runtime-v1132a.js`
- `social-sleep-interaction.mjs` — pipeline=`True` — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `social-bid-runtime-v1122.js`
- `soft-reconsideration-hysteresis.mjs` — pipeline=`False` — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `social-bid-runtime-v1122.js`
- `surface-liquid-foundation.mjs` — pipeline=`False` — fallback-capable sources: `engine-spatial-v1114.js`

## No-pipeline focused tests that actually call `E.tick` / `E.reset`

- `action-terminology.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `engine-spatial-v1114.js`
- `active-intent-foundation.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`
- `animal-social-outcome-memory.mjs` — calls=['reset'] — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-outcome-memory-runtime-v1135.js`, `social-response-runtime-v1132a.js`
- `episodic-memory-foundation.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`
- `event-appraisal.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `appraisal-runtime-v1131.js`, `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`
- `human-social-response-agency.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-response-runtime-v1132a.js`
- `intent-replan-preemption.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `social-bid-runtime-v1122.js`
- `interaction-geometry.mjs` — calls=['reset'] — fallback-capable sources: (none)
- `legacy-pending-interaction-cleanup.mjs` — calls=['reset'] — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `memory-deliberation-runtime-v1134.js`, `social-bid-runtime-v1122.js`
- `logistics-invariants.mjs` — calls=['tick', 'reset'] — fallback-capable sources: (none)
- `memory-deliberation-influence.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-response-runtime-v1132a.js`
- `memory-salience-pruning.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-response-runtime-v1132a.js`
- `presentation-observability-v1140.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-outcome-memory-runtime-v1135.js`, `social-response-runtime-v1132a.js`, `ui-observability-controls-v1133a.js`, `ui-resident-view-v1140.js`
- `refill-water-geometry.mjs` — calls=['tick', 'reset'] — fallback-capable sources: (none)
- `requester-social-outcome-memory.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-outcome-memory-runtime-v1135.js`, `social-response-runtime-v1132a.js`
- `short-lived-affect.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-runtime-v1131.js`, `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`
- `sleep-pressure.mjs` — calls=['tick', 'reset'] — fallback-capable sources: (none)
- `social-bid-lifecycle.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `social-bid-runtime-v1122.js`
- `social-response-agency.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `affect-runtime-v1132.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-response-runtime-v1132a.js`
- `soft-reconsideration-hysteresis.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `engine-spatial-v1114.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `social-bid-runtime-v1122.js`
- `spatial-floor-boundaries.mjs` — calls=['tick', 'reset'] — fallback-capable sources: (none)
- `spatial-observability.mjs` — calls=['reset'] — fallback-capable sources: (none)
- `spatial-traversal.mjs` — calls=['tick', 'reset'] — fallback-capable sources: (none)
- `supported-contact-audit.mjs` — calls=['tick', 'reset'] — fallback-capable sources: (none)
- `surface-liquid-foundation.mjs` — calls=['tick', 'reset'] — fallback-capable sources: `engine-spatial-v1114.js`
- `v11-state-regression.mjs` — calls=['tick', 'reset'] — fallback-capable sources: (none)
- `validator-rule-registry.mjs` — calls=['reset'] — fallback-capable sources: (none)

## Summary

- potential fallback owner files: **17**
- focused tests loading at least one fallback-capable owner: **25**
- of those, already loading production pipeline: **8**
- of those, still no-pipeline: **17**

Fallback files: `affect-runtime-v1132.js`, `appraisal-human-social-response-v1133a.js`, `appraisal-runtime-v1131.js`, `appraisal-social-response-v1132a.js`, `engine-spatial-v1114.js`, `human-social-response-runtime-v1133a.js`, `intent-runtime-v1121.js`, `intent-runtime-v1123.js`, `intent-runtime-v1124.js`, `memory-deliberation-runtime-v1134.js`, `memory-retention-runtime-v1133.js`, `memory-runtime-v1130.js`, `social-bid-runtime-v1122.js`, `social-outcome-memory-runtime-v1135.js`, `social-response-runtime-v1132a.js`, `ui-observability-controls-v1133a.js`, `ui-resident-view-v1140.js`
