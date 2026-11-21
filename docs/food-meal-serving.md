# Food｜Meal Serving & Physical Transfer v1 — Current Contract

Workstream: [Meal Serving v1](https://app.notion.com/p/41fb4185273f815c8bc6f089b49172e9). 2026-11-21 A／A／A Design Gate: actual partial grams; reuse `eat` Action; allow an explicitly exposed plate to reveal/serve Meal. This version is bounded: fully edible F0 Meal, one serving transfer into an eligible ordinary Object plate, normal physical carry/placement, and `eatingMeal`. The default house is not changed by this slice.

## Canonical truth and quantity

- Each ready Meal exists exactly once as `state.objects[id]`, with `meal.edibleMassGrams` the sole positive integer edible quantity. No `servingsRemaining`, mutable `handling.massKg` duplicate, `contents.food`, Food inventory, reverse `children[]`, or replacement Resource unit.
- `SimFood.serveMeal(state,sourceId,plateId,requestedGrams,newMealId)` checks an exposed source and a legal empty plate before any mutation. Partial serving creates one new Meal ID with `containedBy=plateId` and exact gram debit from the original; the original remains at its previous support/position. Full serving preserves the original Meal identity and moves its canonical placement to `containedBy=plateId`. Failed serving has no debit or new Object. The effective portion is bounded by current source grams and actual Object storage mass capacity in integer grams.
- A contained Meal has neither `position` nor `supportId`. Spatial effective location follows its plate. Only the plate may be `Agent.held`. `SimObjectHandling.cargoMassKg` projects fully edible grams / 1000 to kg; it is the shared capacity/load authority for Object storage and Resource carried-load. This does not claim a generic total-body or inedible-weight physical model.
- Historical Cooking `producedByEventId` remains on derived portions; the Engine emits one canonical `serveMeal` World Event per actual physical transfer, records `servedByEventId`, and links actual intake through placement and serving to Cooking completion. Individual successful intake ticks remain separately realized canonical Events; partial/failed preparation alone never decreases Hunger.

## Eligible plate, observed information and contact

An exposed serving plate is deliberately opt-in: ordinary `portable:true`, `objectContainment:true`, valid `objectStorage`, `canEatFrom:true` and `interactions.eatFrom.mode` being a legal reach mode, without Resource `contents`. It is an ordinary Object, not legacy `resourceContainer` / `servingDish`.

- A Meal inside such a plate may be visually observed only via the canonical Perception projection of the plate's current real position and sight. If the plate is held by the observer, local access is permitted; a plate held by another actor is not made remotely edible/observable through Meal visibility.
- Only this explicit Food case projects contained Meal `eatFrom` interaction via the plate's canonical Spatial geometry. Production `src/spatial-traversal.js` overrides the base `src/spatial.js` resolver; both must delegate to the same `SimFood.servingPlateForMeal` truth and the **effective traversal owner** exports `MEAL_PLATE_INTERACTION_VERSION='meal-plate-eat-from-v1'`. All other contained Objects still have their prior pickup-only interaction and hidden-point availability.
- Visible World inventory never equals universal Agent knowledge. `eat` source selection uses same-tick actual visual availability or legal contact and reachable interaction, with execution-time revalidation.

## Actual action lifecycle

`eat.prepare` may choose an available physical serving plate when a visible, directly exposed Meal exists. It reuses canonical pickup, current movement geometry, reservations, held Object relation, nearby release and existing `toMeal → eatingMeal`. Serving phases: `toMealDish → takeMealDish → toMealServe → serveMeal → toMealDining → placeMealDish → toMeal → eatingMeal`. Their names are Action-local phases, not another `serveMeal` Action kind or world ledger.

- A dedicated plate is chosen only if currently reachable, unheld, unreserved and empty; source and container legality are checked again at the actual serving tick.
- An actually committed portion remains in its plate on ordinary Action interruption. The existing cleanup/release mechanism preserves real Object location and clears reservations; no magic rollback.
- Carrying the plate is genuine `Agent.held` and has canonical carry geometry/load; placing it at the chosen meal-seat approach uses `releaseHeldObjectNearby` and real Surface/floor fallback, not a bespoke teleport/guaranteed table slot. Other residents may take or eat from a placed exposed plate through ordinary `eat`, without a new proactive delivery Intent.
- Per effective `eatingMeal` tick at most 50 g are consumed and only that Agent's private Hunger is relieved by 0.08 per ingested gram. Social speaking continues to pause consumption, listening does not. Legacy Resource `eatingPlate` and `transferResource` are intentionally distinct.

## Existing canonical producers / semantic-equivalent inventory

| Code path | Disposition |
| --- | --- |
| `src/food-cooking-contract.js` completes full Ingredient → Meal | Intentionally distinct — production of an initial cooked Meal, not a serving transfer; Cooking event remains causal origin |
| `src/food-contract.js` `consumeMeal` | Intentionally distinct — ingestion debit/retirement rather than serving split; retains one Food mass authority |
| `src/food-contract.js` `serveMeal` | Canonical new portion transfer; no separate writer to `edibleMassGrams` in Engine |
| `src/engine.js` `transferResource('food',...)` | Intentionally distinct legacy amount-based Resource owner; no Meal conversion |
| `src/engine.js` pickup／`containHeldObject` | Intentionally distinct full ordinary Object movement and contain mutations; no second Meal positioning authority |
| `src/spatial-candidate-selection.js` `releaseHeldObjectNearby` | Canonical placement consumer reused, not copied into Food |
| `src/systems/object-handling.js` `cargoMassKg` | Canonical mass projection consumed by storage admission and carried-load |
| `src/world-authoring.js` and `src/validation/rules/spatial-node.js` | Integrated canonical mass projection and valid containment checks, no authored mirrored cargo |
| `src/systems/perception/object-point-visual-availability.js` / `src/spatial.js` | Scoped exposure/contact projections; ordinary containment remains hidden |
| Inspector | Read-only projection of canonical grams and container relationships |

## Regression and release

Node: `tests/food-meal-serving.mjs` checks exact 300→180+120, all-or-nothing source identity, mass capacity, exhaustion, hidden cargo, held-by-another plate, second resident intake, physical `eat` phases, causality, and true Cooking→Serving→Intake. The existing canonical Node workflow continues its full F0, Cooking, Object, Spatial, Social and Resource suite. A separate `food-meal-serving-regression.yml` triggers the dedicated Serving Node 22 regression on all PRs to `main` and on `main` pushes, without editing the shared Node workflow owned by parallel PR #246; the Food Browser matrix also runs the Serving test as `extra_test`. Both the dedicated Serving Node check and the existing full Node suite are required evidence for Serving Merge Gate. This independent check is intentional until the shared workflow owner can decide any later consolidation. Browser QA must still prove the unchanged page/Inspector wiring with the current overall release. Failures, interruption, competition and no shadow stock must remain tested in real Action execution, not merely the Food helper.

Current release: `11.75.0-food-meal-serving`; Food `food-v2-meal-serving`, Object Handling `object-handling-v3-meal-mass-projection`, Perception Visual Availability `perception-visual-availability-v4-exposed-meal`, World Authoring `world-authoring-v24`. Cooking, Ingredient, Resources, and Physical own markers do not mechanically advance.

Deferred: plate delivery to others and social serving responsibility, batch cooking D2, generic meal composition/material and inedible mass, legacy Resource migration, ingredient supply, default house acceptance and chosen layout, fine-grained meal-seat targeting.
