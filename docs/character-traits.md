# Character Traits Foundation v1 — Current Contract

## Authority and scope

`src/character-traits.js` owns the finite set of existing trait keys, types, ranges and read-time defaults (`character-traits-v1`). `src/character-traits-authoring.js` composes World Authoring `world-authoring-v19` over v18, preserving previous generations as historical evidence. `Resident.traits` is sparse authored truth; initial-state compilation copies it into that same Agent's private `traits`. No competing World trait mirror or cross-Agent private mutation is introduced.

Missing keys are allowed and remain absent through authoring, normalization, serialization and runtime initialization:

| Existing key | Legal value | Read-time missing |
| --- | --- | --- |
| `alcoholLike`, `social`, `animalAffinity`, `curious` | finite number [0,1] | 0 |
| `careful` | finite number [0,1] | 0.55 |
| `exertionSensitivity`, `recoveryRate`, `sleepRecoveryRate` | finite nonnegative multiplier | 1 |
| `circadianPattern` | diurnal / nocturnal / crepuscular | null (existing Species Profile) |
| `circadianPhaseOffsetMinutes` | finite number | 0 |

Unknown keys, invalid types, NaN/Infinity, out-of-range unit values and negative multipliers produce explicit issues. `SimWorldAuthoring.validateAuthoring`, runtime authoring admission and `SimValidator.validateState` share `SimCharacterTraits.validateTraits`. Direct `SimCharacterTraits.value` reads reject invalid present values rather than silently coercing them; explicit `sleepRecoveryRate:0` is legal.

## Consumers and boundaries

Slice B1 changes only the social path: Engine Social Need natural gain uses `rand(.05,.3) * (.75 + .5 * socialTrait)` while keeping sleeping factor `.12`, the same random draws and [0,100] clamp. Active `talk` / `seekHuman` action utility and decision contributors now depend on the formed Social Need without adding `social` Trait directly. Other action-utility / decision-contributor, fatigue, recovery, precision and circadian calculations remain unchanged. Deliberation keeps its existing `animalAffinity` social-bid evidence and `careful` held-object route weights. Appraisal keeps `animalAffinity` contribution to observed interactions. Each consumes the same trait values without creating a parallel decision authority or claiming knowledge of another Agent's private state.

All three residents retain their authored trait values. Human talk response keeps `.70 * normalizedSocialNeed + .30 * socialTrait`; animal pet response keeps `.72 * normalizedSocialNeed + .28 * socialTrait`, each with existing Affect / Relationship adjustments and thresholds. These two response consumers now read canonical `SimCharacterTraits.value(agent,'social')` (missing `0`, invalid present value fails), not an independent missing `.5`. The Trait's upstream Need formation and independent responder disposition are distinct causal roles; no second Need, response cache, action selection engine, changed interaction relief or extra World Event is introduced. Slice A previously aligned missing `careful` to `.55` for route preference; its authoring and validation contract remains unchanged. Species circadian baseline remains the existing `SimWorld.SPECIES_PROFILES`, not another trait truth.

Slice B1 does not introduce traits, personalities, hobbies, cooking, tidying, new Needs, activities, World events or optional high-precision modules.

## Regression

Node production regression covers sparse round-trip, authoring/runtime rejection, runtime state validation, legal zero/missing, and existing consumer behavior. Production and Editor load the same v19 overlay. `src/release.js` remains the sole overall runtime marker owner.
