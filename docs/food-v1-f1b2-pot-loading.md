# Food F1-B2 — Physical pot loading via canonical Object containment

Status: PR candidate on `feat/food-f1b2-pot-loading`; not merged. Exact-head CI required. Historical F1-B1 is merged PR #242.

## Narrow production consumer

The Cooking Action reuses existing generic Object lifecycle rather than adding a parallel Food inventory, carry action, storage list, or observation authority:

1. Decision uses a **visually exposed** whole Type A Ingredient on the gas stove, the visible pot, and reachable canonical Spatial geometry. It checks `objectStorage` capacity and obtains the normal ingredient/pot/stove reservations.
2. The original Action reaches the exposed Ingredient at its generic `pickup` interaction, picks it up through the existing Engine `holdObject`, approaches the pot at generic `receive`, and inserts it through existing Engine `containHeldObject`.
3. The Ingredient now has **only** `Object.containedBy = potId`, with no child-side `position` or `supportId`. The pot is an ordinary `portable:true` Object, `objectContainment:true`, `objectStorage:{maxItems:1,maxMassKg:.6}`, `handling.massKg:.8`, `cookingPot:true`, supported on the stove. Object Handling alone derives contained cargo mass from the Ingredient's own `handling.massKg`—no `pot.contents.food` or mutable second mass.
4. Only after a canonical **`cookMeal/loadPot` World Event** records actual insertion can the same Action perform its existing four effective Cooking ticks. Completion re-checks valid pot containment, material, contact, reservations, and the load event. The single canonical `cookMeal/complete` material transformation cites the loading event as a cause.
5. At completion the whole Ingredient Object is retired exactly once, and a F0 Meal Object of equal edible grams is created on the **same stove support surface**. The pot becomes empty. The existing `eat` Action remains the real downstream consumer; no Meal grams are mirrored into Object `handling.massKg` or legacy `Resource contents.food`.

The generic Perception contract deliberately treats contained Objects as **not visually exposed**. Cooking starts only from an exposed visible Ingredient; after the actor inserts it, the active Action follows its own observed input, physical mutation and reservation, not a fabricated continuing visual observation. A different Agent cannot begin Cooking solely by reading World inventory of a closed/contained ingredient. If an Action is interrupted after loading, material remains in the pot and can be recovered using generic `takeContainedObject`; automatic cooking resumption from unobserved pot contents is **not** claimed in F1-B2.

## Truth and regression

- `SimFoodCooking` generation moves to `food-cooking-f1b2-pot-loading`. Overall runtime candidate `11.71.0-food-v1-f1b2-pot-loading`. Unchanged: `SimIngredient` v1, `SimFood` F0, Object Handling v2, Spatial, Perception, Engine's generic physical lifecycle, Furniture Catalog v14, World Authoring v22.
- `tests/food-v1-f1b-cooking.mjs` verifies actual real Agent Action from exposed source through pot insertion, causal load-to-completion, mass conservation, default F0 `eat`, reservations and interruption.
- `tests/food-v1-f1b2-pot-loading.mjs` verifies authored Ingredient physically contained within the pot, canonical Object load and location, Perception hidden-truth boundary, no competing inferred Cooking decision, failed forged completion, safe generic recovery and re-insertion. The test uses production-composed Engine/Spatial/Validator, not a parallel Cooking harness.
- Empty pot and one whole Ingredient are the only supported demonstration inputs. Another item, overweight material, inaccessible pickup/receive, moved pot, missing Ingredient, or missing loading provenance blocks completion; no silent generic fallback.

## Still pending — visible successors, not automatically ACTIVE

The F0 Meal cannot yet be physically contained in a portable pot or transferred in portions to a resident-carried plate. That requires a separate Meal mass/physical container contract, then reuse of original `serve`/`eat` flow. Ingredient `externalSupply` adaptation, old food Resource retirement, off-map capacity/time, full default kitchen and long-term meal continuity also remain outside this PR. There is no fuel/temperature/3D pot volume, spills, cutting, multi-ingredient Recipe engine, or automatic unobserved pot-content discovery. WORLD 001 priority unchanged.
