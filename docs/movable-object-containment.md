# Movable Object Containment v1 — canonical Object cargo

Status: merged into `main` by PR #240 (squash commit `1d26f8c935a9293751b40e849c31f07d088d6148`); authoritative runtime contract verified by PR exact-head and post-merge Node regressions.

## Ownership and schema

All physical children remain canonical `state.objects[id]` items. A child has exactly one `containedBy` reference to either a containment-capable Furniture or an opt-in portable Object. The container does **not** persist an ordinary-Object `contents[]` mirror; `resourceContainer.contents` remains amount-based Resource only.

A portable Object target opts in with:

```js
objectContainment: true,
objectStorage: { maxItems: 2, maxMassKg: 3 }
```

These bounded values describe the admitted **ordinary Object cargo**. Neither field changes the existing Resource capacity units or implies a 3D volume/packing simulation.

An ordinary child admitted to a portable Object container requires a strictly positive finite `handling.massKg`, owned by generic Object Handling. It remains the single physical mass input for that Object in this slice. `SimObjectHandling.objectStorageStatus` derives current child count and mass from `containedBy`; `SimResources.containerLoad` combines existing Resource container empty-load and resource-derived load with this derived mass. The legacy `fillRatio` continues to measure **only Resource amount** and is not a second Object inventory metric.

The subsequent Food F1-A Ingredient contract stores Ingredient physical mass solely in existing `Object.handling.massKg`, so this generic Container mass consumer already reads Ingredient load without duplication. Existing Meal F0 edible mass is a distinct canonical value; its future plate / physical mass integration remains pending. Neither this containment slice nor Ingredient F1-A migrates `contents.food`, adds Cooking, or splits Meals.

## Position, interaction and lifecycle

- `Held / Contained / Supported / Free` remain exclusive derived location states. A child in a portable container has no own `position` or `supportId`; Spatial resolves its effective node from the parent, including its Surface or `Agent.held` owner.
- Insertion reuses the container's existing `receive` interaction; a contained child can only be picked up after reaching the container's ordinary Object `pickup` geometry (including required ground-pickup posture). Pickup of the child is **not** possible while another Agent—or the same Agent—is holding the container; the container must be put down first. Other affordances remain unavailable while contained.
- Generic Engine `containHeldObject` and `takeContainedObject` perform placement and pickup; no Food-specific Action, second held relation, new decision provider or automatic remote knowledge is introduced.
- Furniture-contained Object handling remains unchanged. Portable Object target IDs and Furniture IDs cannot be ambiguous. Missing capability, self-reference, nested portable Object / Resource container cargo, invalid child mass, overcapacity and position/support conflicts must explicitly fail.
- The existing generic nearby release and container-drop placement retain child identity and containment; children move with the parent by resolving the same canonical relation. Object scattering from open containers is **not** simulated in v1. Existing Resource content loss and container-drop risk are not silently redefined.

## Validation scope

`tests/movable-object-containment.mjs` tests two independent cargo identities, a bounded carrier, authoring round-trip, full-capacity rejection, canonical mass/load, movement-following, held-owner pickup exclusion, release, individual pickup and runtime validation. `tests/object-containment.mjs` protects original Furniture storage, while Resource / Handling / Spatial regressions protect prior consumers.

This slice intentionally does not include nested Object containers, 3D packing or volume, generic item stacking, automatic container insertion actions, physical object spilling, Food portion transfer, recipe/cooking or long-term production logistics.
