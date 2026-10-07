# Wake-causing Attention Attribution + Timeline Causal Summary

This correctness patch closes two gaps without creating a second wake or relationship truth.

## Canonical causality

`attentionStimulus` remains the canonical World Event for a requester trying to gain another Agent's attention. Interaction-caused `sleepWake` remains the canonical Sleep consequence and references the triggering stimulus through `causeIds`. `sleepDisturbance` likewise references its failed wake stimulus through `causeIds`.

No persistent wake-attribution mirror is added. Consumers resolve attribution from the existing canonical event graph.

## Agent-private appraisal and Relationship

A sleeping target that does not wake still cannot observe or remember the stimulus, so it gains no private appraisal and no Relationship update.

After a target is awake and forms its own episodic memory of an `attentionStimulus`, Appraisal checks whether the canonical event graph contains a direct `sleepWake` consequence for that same target caused by that stimulus. Only then does the memory receive the bounded `sleepWakeInterruption` appraisal factor. The attention memory retains the requester as `agency.kind='other'`; the `sleepWake` event itself remains target-self-authored Sleep consequence evidence and is not repurposed as Relationship truth.

Relationship consolidation accepts target-side `attentionStimulus` only when the historical appraisal contains this verified wake-interruption factor. Ordinary attention that did not cause a wake remains Relationship-neutral. The requester never receives a mirrored target-side update from the same evidence.

Current feature markers:

- `SimEngine.WAKE_ATTENTION_ATTRIBUTION_VERSION = 'wake-attention-attribution-v1'`
- `SimEngine.WAKE_ATTENTION_RELATIONSHIP_VERSION = 'wake-attention-relationship-v1'`

The persisted Appraisal / Relationship state shapes and their schema markers are unchanged.

## Timeline summary projection

Summary mode keeps its existing classifier as the base membership owner. `timeline-causal-summary` adds only the missing causal context for wake outcomes:

- an `attentionStimulus` direct cause is added when an already-summary-visible `sleepDisturbance` depends on it;
- an `attentionStimulus`-caused `sleepWake` becomes summary-visible together with that direct cause;
- unrelated `attentionStimulus` events are not blanket-promoted into summary mode.

The projection reads structured `data.action` and canonical `causeIds` only. It never parses `event.text` to infer semantics and never creates another event.

Current projection marker:

- `SimUI.TIMELINE_CAUSAL_SUMMARY_VERSION = 'timeline-causal-summary-v1'`

## Out of scope

This patch does not recalibrate wake probability or stimulus intensity, add personality or moral judgement, implement Visual / Auditory / Tactile perception, change Agent Orientation / turn execution, or define emergency wake appraisal. The first bounded wake-interruption appraisal is intentionally narrow and can be replaced by richer context-specific appraisal only through a later explicit contract change.
