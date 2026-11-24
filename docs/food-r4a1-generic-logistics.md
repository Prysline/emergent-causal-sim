# R4-A1｜Generic Physical Ingredient Logistics｜Current Contract

## Scope and single owners

R4-A1 is the first implementation slice of the existing R4 Autonomous Physical Food Provision Workstream. It adds no Food inventory and no additional Agent held-hand state. The canonical Object `containedBy` is the only physical cargo relationship; `Agent.held` remains one Object; `SimObjectStorageVolume.storageLegality` remains the only volume-admission authority; `SimObjectHandling` owns `handCapacity` and `availableSupportHands`. `SimSpatial` supplies real contact and carry geometry; `SimEngine` owns the actual Action, reservations, mutations and canonical World Events. Neither `src/systems/object-handling.js` nor `src/object-storage-volume.js` creates a competing ownership or storage ledger.

## Two ordinary baskets in current B world

- `basketA`: existing ID, 55 × 40 × 30 cm carry envelope, 24 L `objectStorage.capacityCubicMeters`, 0.8 kg empty weight, `handsRequired:2`, `physicalVolumeCubicMeters:.004`.
- `basketSmallA`: new ordinary Object, 40 × 30 × 25 cm carry envelope, 18 L storage capacity, 0.6 kg empty weight, `handsRequired:1`, independently authored `physicalVolumeCubicMeters:.003`.
- The carrying envelope, internal capacity and material physical volume are distinct facts. No geometry-derived capacity or duplicate `contents` collection.
- R3 `externalSupply` `mode:'physicalIngredient'` still takes a legal selected `carrierId`; neither name nor ID is special-cased.

## Canonical lifecycle

The explicit `transferContainedObjects` Action takes portable ordinary `sourceId` and Object/Furniture `destinationId`. It is a generic logistics Action, not a new Food-specific planner. It moves to the real source and destination through existing `moveToInteraction` and `SimSpatial` geometry, then inspects source cargo at current contact only. The list is Action-local observed evidence, not World inventory projected into unrelated Agents' private knowledge. Every item is rechecked against current canonical parent, reservations, contact and destination before mutation.

When the source is held with `availableSupportHands>=1`, `transferContainedObject` commits a single child-side `containedBy` move from source to destination after a pure detached candidate `SimObjectStorageVolume.storageLegality` check. The source remains the sole `Agent.held` throughout unloading. Every committed item produces one `objectContainerTransfer` canonical World Event. For a real R3 item, it cites that item's `physicalIngredientAcquired` event when available; consecutive successful transfers also retain Action-local event causal linkage. Invalid contact, no spare hand, held target, full destination or another Agent's reservation results in no mutation.

When all hands are occupied, the Action releases the source through the existing `releaseHeldObjectNearby` lifecycle, physically reaches the placed source and each contained child, and reuses `takeContainedObject` / `containHeldObject` for each actual item. In-flight cargo remains the single `Agent.held` Object. Interruptions release an actually held item or source using existing canonical nearby placement; completed transfers remain committed and cannot be duplicated by retrying.

## Evidence and exclusions

- Production Node regression `tests/food-r4a1-generic-logistics.mjs` starts the real R3 `externalSupply` Action, obtains dynamic `ingredient:offmap:...` IDs, then executes R4-A1 Engine ticks through the small basket to ordinary large basket or fixed pantry. It checks hands, mass, capacity, contact, reservations, two-handed fallback, interruption, unique IDs, events, and State Validator.
- Browser B World Authoring QA checks the independently authored small basket and Editor projection. Existing Object, Spatial, Intent, Food and Node/Browser regression remain canonical gates.
- R4-A2 is separately responsible for extracting from fixed storage, choosing a specified legal `supportsObjects` Surface location and connecting actual exposed Ingredient observation to existing Cooking.
- R4-B autonomous external resupply, R4-C complete provisioning and pet feeding consumer checks, R5 Legacy Resource Food removal, and R6 closeout are not completed by this slice. Existing Legacy Food code does not gain features.

