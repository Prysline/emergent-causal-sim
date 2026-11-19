# Food v1 Slice F0 — Ready-to-eat Meal Object (Current)

Status: implementation on `feat/food-v1-f0-ready-meal`; no Cooking F1 or general Meal production pipeline.

## Canonical inventory and physical contract

- `state.objects[objectId]` is the single authoritative Meal identity and remaining fully edible amount: `object.meal.edibleMassGrams`, a positive safe integer in **grams** while the Object exists. No `servingsRemaining`, no second mass field, no Resource `contents.food` mirror.
- `object.meal.standardServingMassGrams` is an authored positive integer reference used to derive presentation/planning servings: `edibleMassGrams / standardServingMassGrams`. It never changes available stock.
- The authored `readyMealF0` starts at 300g on the dining table, with canonical `eatFrom` affordance. F0 supports an exposed, fully edible, nonportable Meal Object only; Ingredient Types, density, heterogeneous composition, Cooking and Object stacks are deferred. No inferred Resource-unit ↔ gram conversion.
- The World Authoring v20 overlay validates Meal records and pins the default F0 Meal. World initializer admits validated authoring; `SimFood` owns Food mass read, intake target, debit and retirement; validation rejects malformed / duplicated inventory. At zero grams, the Object is removed, but prior canonical Events retain its stable historical reference.

## Action, needs, events, observation

- The existing `eat` Action gains `toMeal` → `eatingMeal`. Initial Hunger captured at Action construction determines a one-time desired mass `min(standardServingMassGrams, ceil(max(0, initialHunger) / 0.08))`. This is Action-local, not World stock; target is not silently recalculated every tick.
- The Meal must be directly perceptible by current canonical Object point visibility or by legal interaction contact and reachable through the canonical `eatFrom` geometry. Action progress revalidates the Object and contact at execution. A valid tick takes `min(50g, remaining Action target, current actual Meal grams)`. No full-target reservation or prefetched resource debit.
- Each actual tick decreases this one Meal inventory and only the ingesting Agent's private `needs.hunger` by `0.08 × actual grams`, clamped through existing Need bounds. No intake during `socialSpeaking` (progress 0); listening preserves progress 1. A finished Action, exhausted source, invalid target or normal emergency preemption uses the existing Action / Intent lifecycle. Actual debit and relief remain committed after interruption; no cross-Action resume.
- One ingestion per effective tick creates one canonical World Event with `foodKind:'meal'`, explicit `intakeGrams`, `remainingGrams`, `unit:'g'`, source Object reference, actor, realized Hunger relief and predecessor Event ID where applicable. Event history and observations project from this event; no extra Event truth.
- Learned Habit counts only the first realized intake tick of each continuous Meal Action as one eating experience; the remaining tick Events remain eligible for normal episodic memory observation without multiplying learned activity experience. Legacy `eat` Resource events keep their prior `amount` semantics.

## Legacy boundary

Existing Resource-container `contents.food` `amount` quantities, `takeResource`, `transferResource`, plates, tray, pantry, `foodStock()`, restock and external supply keep their prior unit and API semantics. The old `applyIngestion(...,'food',amount)` remains valid only for Resource amounts. Do **not** sum or convert it with new Meal grams or reinterpret the numeric `foodStock()` trigger. Material mass / Ingredient Type defaults and cooking transforms require separate future gates.

## Verification

`node tests/food-v1-f0.mjs` must cover fully authored production Object, multi-tick intake, Hunger, partial shortage, contention, speech/listening, emergency interruption, retirement, event cause and legacy regression. Canonical CI also runs existing `activity-concurrency-eating-social`, `learned-habit`, `state-regression`, `logistics-invariants`, `object-unification`, `world-authoring` and Node/Browser checks as appropriate. Unexecuted checks must never be reported as passed.

Further context: [Food Domain](https://app.notion.com/p/41db4185273f81bebb06d7b802b4a21e); earlier proposed `servingsRemaining` is historical, not this contract.
