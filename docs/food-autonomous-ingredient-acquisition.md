# Food／Cooking — Autonomous Ingredient Acquisition v1

**Current contained Meal correction (11.81.1):** Cooking atomically replaces the loaded Ingredient with one Meal with `containedBy=potId`, no independent `position` or `supportId`. The same pot's physical volume/mass remains derived from its actual child. `cookingEligible` alone does not expose content; the cookware additionally needs explicit `canEatFrom:true` and existing reach/supportReach eatFrom geometry to be visible/serving-accessible. Plate-only destination eligibility is retained; generic cargo stays hidden. `serve` delegates to the actual cookware receive contact, `eatFrom` to actual cookware eatFrom. A carried-by-other/off-map or reserved cookware cannot grant interaction. Partial serving keeps the source Meal in the pot; full serving moves the original ID to the plate. No new action, inventory, thermal model or B1 Surface capacity. Earlier slice descriptions below are historical wherever they conflict with this correction.

Implementation source: [PR #247](https://github.com/Prysline/emergent-causal-sim/pull/247). For live merge and CI status, check the PR and canonical current release marker; do not treat historical PR checkpoints as current runtime truth.

## Minimal lifecycle and canonical owners
- One complete Type A Ingredient exists only as `state.objects[ingredientId]` with its physical grams derived from `Object.handling.massKg`; no Food-only inventory. Cooking uses existing bounded `ingredient-A-equimass` D1 recipe and existing `gas-stove` station plus `cookingEligible` pot.
- A candidate Ingredient may be exposed on a real `supportsObjects:true` Furniture support, including the first kitchen-counter fixture, with its `supportId` and position on that support's actual footprint. Neither support ID nor Furniture type is hardcoded. Hidden, held, contained or physically illegal sources do not qualify.
- A human Actor needs current Ingredient and pot visual availability and real pickup/receive/station route costs, capacity, and reservations. `sourceId` and `potId` are Action-local, pinned from same-tick evidence. An external change of source before pickup aborts; after pickup only canonical `Agent.held` and `Object.containedBy` matter. No path is cached across ticks.
- The existing `toStation → toIngredient → toPot → toCookingContact → cooking` lifecycle uses real generic `holdObject` and `containHeldObject`. On successful pickup `cookMeal/pickupIngredient` is emitted with source/Ingredient references; `cookMeal/loadPot` cites the pickup, while `cookMeal/complete` cites the loaded Event. Completion atomically retires the whole input Ingredient and creates one F0 Meal, with no shadow ledger.
- The cooked F0 Meal remains non-portable on the cooking station; existing `eat` uses canonical `meal.edibleMassGrams`. No automatic plating or delivery is claimed.

## Verification and negative cases
- Direct production regression: `tests/food-v1-f1b-cooking.mjs` includes real World Authoring kitchen-counter placement, active Decision/Action from current Perception, same physical Ingredient pickup and pot loading, one causal source→load→complete chain, F0 eat, reservations against second resident, and fail-closed changed-source cancellation.
- Existing Cookware, F1-B2, Object containment, Meal F0, Spatial, Action, runtime architecture and version ownership tests remain responsible for their existing contract boundaries.
- Before merge: require exact-head Node and Browser CI, inspect all changed files and negative scenarios. Pre-merge success is not post-merge current-main verification.

## Explicit exclusions / related ownership
- [Food Workstream Record](https://app.notion.com/p/41fb4185273f8124ad59c3e6c43da474); [Food Domain authority](https://app.notion.com/p/41db4185273f81bebb06d7b802b4a21e).
- Core Default World remains separate [PR #246](https://github.com/Prysline/emergent-causal-sim/pull/246) (A/B non-canonical geometry); Meal Serving / Physical Transfer, D2 batch planning, Ingredient supply and legacy Resource food migration are not implemented here.
- No World Authoring/Editor/Furniture generation change or default fixture rewrite; no Current TODO priority change. This implementation does not authorize a release tag, branch deletion, or manual deploy.


## R4-A2 preparation extension

Existing exposed-input decision, recipe, physical pickup and load/complete remain unchanged. The same Action may now first inspect fixed storage at real contact, take one actual compatible child, and place it on the specified legal support through the shared Spatial placement owner. The real placement event is the causal predecessor of the ordinary Cooking pickup. See [R4-A2](food-r4a2-pantry-access.md) for the boundary and verification scope.
