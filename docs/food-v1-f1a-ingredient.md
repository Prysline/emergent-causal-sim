# Food v1 Slice F1-A — Ingredient Object Foundation

Status: PR candidate. This is an isolated Ingredient physical Object foundation, **not** Cooking / Serving / Food migration completion. Verified implementation truth remains GitHub code + exact-head regressions.

## Contract ownership

- `SimIngredient` (`src/food-ingredient-contract.js`, `food-ingredient-v1`) owns the first abstract `Ingredient Type` catalog, its default physical mass/density, explicit Object instantiation and query/validation. First type `A` has a 300 g default and effective density of 1000 kg/m³ as this slice's concrete fixture baseline, not a global nutrition/food physics policy. Other Types/Categories await real consumers.
- Every whole Ingredient is exactly one ordinary `state.objects[id]` Object with `ingredient: {typeId, densityKgPerM3}`. It is `portable:true`; its **only writable physical mass** is the existing `Object.handling.massKg`. There is deliberately **no** second `ingredient.massGrams` / `Object.amount` / Resource `contents.food` inventory.
- `createIngredientObject` resolves default or explicit `massGrams` and `densityKgPerM3` **once**, at instantiation, writing only `handling.massKg` and the chosen effective density. Existing Objects do not retroactively change when Type defaults change.
- `SimIngredient.massGrams(object)` converts that physical mass to positive, whole grams at query time. `volumeCubicMeters(object)` derives mass / effective density and is **not** a geometry collision envelope, container packing/volume or editable physical mass field. The generic `handling.carryGeometry` remains a separate physical handling envelope.
- Fail-closed: unknown Type, missing/negative/nonfinite/fractional-gram mass, invalid effective density, invalid portable handling or duplicate `meal`/`Resource` inventory. `World Authoring v22` and runtime Validator both consume `SimIngredient.validIngredient`.
- `Object.containedBy` remains the sole authoritative ordinary Object containment relation. `SimObjectHandling.objectStorageStatus` and `SimResources.containerLoad` consume the same `handling.massKg` automatically without an Ingredient-specific Container, Action or inverse list.

## Evidence and default scene boundary

`tests/food-v1-f1a-ingredient.mjs` is a real production-composition integration fixture: three separate Type A Objects, one existing Resource-capable basket opting in to portable Object storage, two legal insertions, over-capacity rejection of the third, accurate actual load, inherited positions while the basket is carried, generic release and individual pickup, authoring round-trip and runtime validator invalid-case checks. No independent food inventory or resource amount is created.

The default world remains F0: `readyMealF0` exists, and legacy `contents.food` resource meal supply still exists. F1-A does **not** populate an end-to-end default kitchen, remove `RESOURCE_TYPES.food`, add a Cooking Action, RecipeRule, Ingredients off-map production or plate-side Meal splitting. The integrated scene will need those later steps, with new action/event and truth-boundary regressions.

`SimFood` Meal F0 generation remains `food-v1-f0`. New Ingredient generation is `food-ingredient-v1`. World Authoring advances to `world-authoring-v22`, with an overall version change for the new externally available Ingredient schema. Generic Object Handling, Resources, Physical, Spatial, Deliberation and existing Food F0 own generations remain unchanged.

## Remaining dependencies

1. Cooking ingredient selection and completion-time atomic whole-object transformation into Meal, with yield / process outflow evidence and real Action consumer.
2. Meal portion transfer into resident-carried plate using the existing `serve` and `eat` lifecycle. Ingredient physical mass is handled; mutable Meal edible mass is a separate pending physical-mass integration Gate.
3. Reuse existing `externalSupply` with explicit Ingredient Object generation/transport and bounded restock.
4. Migrate existing food Resources (including default `contents.food`) to real Ingredient / Meal truth, remove legacy food units from production once downstream consumers and migration tests pass.
5. Only then complete the kitchen objects/furniture and closed-loop default scene; no automatic WORLD 001 priority change.

Other food types, density calibration, processing, cutting, partial Ingredient usage, volume packing, food spoilage, nutrition, buff/debuff, and stock batching remain future candidates.
