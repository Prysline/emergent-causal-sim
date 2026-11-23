# R2｜Object Storage Volume｜Current Contract

## Canonical ownership

`SimObjectStorageVolume` (`src/object-storage-volume.js`) is the single pure physical-volume/storage-capacity contract used by World Authoring, runtime Object Handling, Engine, Validation and the read-only Inspector. It is deliberately loaded before Furniture Definitions and World Authoring; no runtime-only hook, hidden script-wrapper assumption, competing container collection or reverse contents mirror is introduced.

## Canonical physical volume

- Ingredient: `Object.handling.massKg / ingredient.densityKgPerM3` in m³. The existing Ingredient mass and effective density remain authoritative.
- Fully edible Meal: `(meal.edibleMassGrams / 1000) / meal.densityKgPerM3`. Food owns grams; effective density is explicit and positive. Cooking D1 inherits effective density from its exact equimass input; the seeded ready Meal explicitly authors 1000 kg/m³. Partial Serving inherits density and changes only actual grams; real intake decreases both derived mass and occupied volume.
- Other ordinary Object: a positive, finite `physicalVolumeCubicMeters` physical property. It is not `storageVolumeCubicMeters`; `carryGeometry` is only a traversal envelope, never an implicit physical-volume conversion. No additional physical volume field is allowed on Ingredient/Meal objects.

Missing, negative, zero, nonfinite, duplicate or otherwise invalid volume is rejected. Existing `maxItems` and `maxMassKg` values cannot be automatically converted to physical volume without separate source evidence: old authored schemas fail closed rather than silently importing with different semantics.

## Storage capacity and legality

Storage-capable Object / Furniture uses `objectContainment:true` and exactly `objectStorage:{capacityCubicMeters:<positive m³>}`. Furniture capacity is defined once in its Furniture Definition and projected onto the resolved runtime instance, not duplicated as independent instance truth. `basketA` is a new, ordinary portable Object; `pantryA` is `cabinet-tall` fixed Furniture. Existing bookshelf, serving plates and `potA` use the same rule.

Every child remains a distinct `state.objects[id]`, identified only by one `containedBy` relation, with no own `position` or `supportId` while contained. The capacity sum is `Σ physicalVolumeCubicMeters(direct children)`, and legality requires `sum + candidateVolume ≤ capacity`. Runtime mutations must reject over-capacity before changing held/contained state. No 3D packing, nested container, Resource-container cargo, arbitrary stacking, separate inventory or silent fallback.

Ingredient can share the normal Object carrier and fixed pantry legality with ordinary books/objects. Non-Food Resource `contents/capacity` continues to use its original amount units and is never treated as the volume sum.

## Other responsibilities

- Object Handling's `objectStorageStatus`/`objectStorageLegality` are runtime facades over the same pure calculator.
- `handling.massKg` and Meal grams still determine mass-based carried load/exertion, not storage capacity. `SimResources.containerLoad` answers Resource-container mass only; an ordinary basket's total carried load is `SimResources.effectiveCarryLoad` (own physical mass + physical children).
- Cooking keeps single-batch and pinned `potId` rules, checking whether the physical Ingredient fits. Serving keeps one distinct Meal portion on an empty plate, bounding grams by remaining physical volume rather than a mass cap.
- World Authoring / World Initializer / Validator and Editor import/export read the same storage truth. Readable Inspector reports derived used/free/total physical volume and never persists separate contents.
- Existing Spatial contact/access, `Agent.held`, partial Serving identity, event causality, interruption and non-Food Resource invariants are unchanged.

## Validation and migration scope

Real production regressions: `tests/movable-object-containment.mjs`, `tests/food-v1-f1a-ingredient.mjs`, `tests/food-cookware-eligibility.mjs`, `tests/food-v1-f1b2-pot-loading.mjs`, `tests/food-meal-serving.mjs`, `tests/browser-food-meal-serving-qa.mjs`, `tests/browser-world-authoring-editor-qa.mjs` and the existing exact-head Node/Browser suites. These cover legal/full/overflow, independent mass, movement/held-parent, real Engine contain/pickup, exposed Meal, Cooking and Editor/Inspector.

R3 off-map physical supply is implemented through the existing Action and reuses this R2 canonical volume / `containedBy` contract. R4 autonomous closed-loop provision, R5 legacy Resource Food retirement and R6 final closeout remain separate uncompleted gates. Legacy Food may not receive new functionality.
