# Food — Cookware Eligibility v1

## Scope and truth

- Current overall: `11.72.0-food-cookware-eligibility`; Cooking: `food-cooking-v1-cookware-eligibility`; World Authoring: `world-authoring-v23`.
- A portable ordinary Object may declare `cookingEligible: true` independently of a pot name or `kind`. The pure `SimFoodCookwareEligibility` contract (`food-cookware-eligibility-v1`) answers this temporary qualification question. A missing or explicit `false` is not eligible. Invalid types, any legacy `cookingPot` and a Resource-container marked eligible are authoring/runtime validation errors; loading a legacy document requires explicit migration, not runtime fallback.
- Qualification is **not** heat resistance, ignition immunity or universal cooking legality. Material / Thermal / Combustion and multiple cooking techniques remain deferred.
- Current `gas-stove` / `cookingStation:true` + `supportsObjects:true` remains the only implemented station profile. `kitchen-counter` is an ordinary support surface.

## Single-batch D1

- The bounded recipe takes exactly one whole Ingredient Type A Object (300 g in the first fixture), using `handling.massKg` as its sole physical mass. No generic recipe planner or D2 batch planner.
- Enumerate all same-station eligible portable ordinary containers with `objectContainment:true`, canonical support and footprint geometry. For the real batch, use `SimObjectHandling.objectStorageStatus` and `objectStorageLegality` to check `maxItems` / `maxMassKg`; no lexicographic-first pot before capacity checks.
- Decision checks actual Ingredient/pot visual availability, Spatial stove contact, Ingredient pickup and pot receive traversal geometry, and Ingredient/pot/station reservations. Deterministic score/IDs break ties only after legality; world inventory is not automatically Agent-private knowledge.
- Engine `buildAction` binds the chosen `potId` with same-tick evidence. `stepCookMeal` revalidates **that pot** on every tick through pickup, carry, generic `containHeldObject`, `loadPot`, four Cooking ticks and completion. Loss of capacity, placement, eligibility, material or reservation aborts; it never switches to another pot without a new Action.
- Canonical child-side `containedBy=potId` is the only physical cargo truth. Completion retires the one Ingredient, creates one F0 Meal on the same stove support, and records exactly one `complete` material World Event citing the actual `loadPot` World Event; `Meal.producedByEventId` is a reference.

## Evidence and boundaries

- World Authoring v23 and runtime Validator share the pure eligibility issue contract. The Editor imports/exports the same v23 schema without a separate rule; no new cookware preset is required here.
- Real production-path Node regression `tests/food-cookware-eligibility.mjs` covers multiple pots, invalid and undersized pots, Actor visual/reservation evidence, pinned Action, interruption and canonical Event provenance. F1-B1/F1-B2 and containment regressions remain in the canonical suite.
- Browser CI validates production scripts and Editor startup; neither isolated stub tests nor static syntax checks claim to substitute for actual CI. D2 goal quantity / split-batch planning remains deferred in its separate Notion candidate. No Core Default World, Meal Serving, external supply, legacy Resource food migration or material/thermal simulation.
