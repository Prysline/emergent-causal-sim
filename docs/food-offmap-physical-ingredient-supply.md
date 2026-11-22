# R3｜Off-map Physical Ingredient Supply｜Current Contract

R3 extends the existing `externalSupply` Action through explicit `mode:'physicalIngredient'`. It does not add a second Action/Intent, inventory, World Event stream or legacy Food Resource path. The prior amount-based `externalSupply` remains isolated pending R5 retirement.

## Finite source and authority

World Authoring v28 declares `offMapIngredientSources` keyed by ID. Exactly five fields are allowed per source: `id`, `exitId`, `ingredientTypeId`, `availableUnits` (finite nonnegative integer) and `workTicksPerUnit` (positive integer). The exit must exist and be `offMap`; the Ingredient Type must be registered. Unknown, conflicting or malformed source data fails at authoring validation. World Initializer projects the authored source to `state.offMapIngredientSources` with mutable current `availableUnits` and a monotonic `nextSerial` identity allocator. There is no auto-replenishment or Resource Food `contents.food` bridge.

## Actual work, multiple identities, and return

The canonical B house supplies a finite ten-unit example Type A source through `frontExit`, with the ordinary `basketA` as a physically legal carrier. An explicit `externalSupply` physical-mode Action may carry an optional positive `unitLimit` upper bound; there is no hardcoded single-item-per-trip cap. Each Ingredient needs `workTicksPerUnit` actual Engine ticks. A completed unit first passes `SimObjectStorageVolume.storageLegality` on a pure candidate view, then commits exactly one `SimIngredient.createIngredientObject` result, uniquely identified by `ingredient:offmap:<sourceId>:<serial>`, with `containedBy:<carrierId>`. That same successful unit decrements stock once and emits one canonical `physicalIngredientAcquired` Event; Event references contain actor, source ID, carrier, Ingredient ID and canonical grams. Events form a causal chain, and the return event cites the last successful acquisition. Off-map acquisition is not Agent-private knowledge or an invented observation.

Fatigue or other need interruption, finite-source depletion and volume capacity limits trigger return with only objects already acquired. No failed unit decrements stock or creates cargo. A temporarily inaccessible exit suspends physical reentry until the same exit becomes structurally available; no teleport or silent fallback. Return uses the original held-carrier/nearby-release lifecycle and preserves every canonical `containedBy` relation. Invalid identity, state or phase fails loudly, and a completed acquisition does not replay upon retry.

## Scope and regression

R3 provides a physically valid, explicitly planned supply trip. It does **not** add the autonomous decision to seek ingredients, automatic unloading to the pantry, Cooking/Serving supply loop, automatic source regeneration, or legacy Food Resource retirement. Those belong to R4/R5/R6 separately. Non-Food Resource amount semantics remain independent.

`tests/food-offmap-physical-supply.mjs` is a true production-loader Engine regression for real B scene, multiple items, finite stock, capacity, partial return, exit closure, collision, authoring validation and causal World Events. Exact-head CI is required before merge.
