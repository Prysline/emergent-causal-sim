// Core Default World Redesign A/B: independent, non-canonical geometry fixtures.
import assert from 'node:assert/strict';
import { loadProductionBefore } from './helpers/production-loader.mjs';

globalThis.window = globalThis;
loadProductionBefore('src/ui/core.js');

const A = globalThis.SimWorldAuthoring;
const I = globalThis.SimWorldInitializer;
const W = globalThis.SimWorld;
const SP = globalThis.SimSpatial;
const Ingredient = globalThis.SimIngredient;
const p = (x, y) => ({ x, y, z: 0 });

const PLANS = {
  A: {
    maxX: 12,
    frontBoundary: 'v:1,7', frontAccess: [1, 7],
    furniture: {
      stoveA: [2, 2, 'gas-stove'], counterA: [3, 2, 'kitchen-counter'],
      diningTable: [7, 3, 'dining-table'], chairNW: [6, 3, 'chair-basic'],
      chairNE: [9, 3, 'chair-basic'], chairSW: [6, 4, 'chair-basic'],
      chairSE: [9, 4, 'chair-basic'], sofa: [10, 2, 'sofa-basic'],
      bed: [10, 6, 'double-bed'], bookshelfA: [12, 2, 'bookshelf-basic'],
      catbed: [7, 7, 'pet-bed-small'],
    },
    objects: {
      bookA: [7, 3], mealTray: [7, 3], plateA: [7, 3],
      plateB: [8, 4], foodPantry: [2, 4], basket: [3, 4],
      waterBucket: [5, 3], cupA: [8, 3], cupB: [8, 4],
      alcoholBottle: [7, 4], readyMealF0: [7, 3],
    },
    source: [5, 2], sourcePort: [5, 3],
    initial: { zhen: [8, 5], zhou: [4, 6], orange: [6, 7] },
  },
  B: {
    maxX: 14,
    frontBoundary: 'h:4,9', frontAccess: [4, 8],
    furniture: {
      stoveA: [12, 2, 'gas-stove'], counterA: [11, 2, 'kitchen-counter'],
      diningTable: [11, 5, 'dining-table'], chairNW: [10, 5, 'chair-basic'],
      chairNE: [13, 5, 'chair-basic'], chairSW: [10, 6, 'chair-basic'],
      chairSE: [13, 6, 'chair-basic'], sofa: [3, 6, 'sofa-basic'],
      bed: [3, 2, 'double-bed'], bookshelfA: [6, 6, 'bookshelf-basic'],
      catbed: [7, 7, 'pet-bed-small'],
    },
    objects: {
      bookA: [11, 5], mealTray: [11, 5], plateA: [11, 5],
      plateB: [12, 6], foodPantry: [14, 2], basket: [14, 3],
      waterBucket: [10, 3], cupA: [12, 5], cupB: [12, 6],
      alcoholBottle: [11, 6], readyMealF0: [11, 5],
    },
    source: [10, 2], sourcePort: [10, 3],
    initial: { zhen: [10, 4], zhou: [5, 7], orange: [8, 7] },
  },
};

function makeCandidate(name) {
  const plan = PLANS[name];
  const isPartitioned = name === 'B';
  const doc = A.cloneAuthoring(A.DEFAULT_WORLD_AUTHORING);
  doc.id = 'core-default-world-geometry-' + name.toLowerCase();
  doc.label = 'Core Default World geometry candidate ' + name;
  const cells = {};
  const boundaries = {};
  for (let y = 1; y <= 8; y++) {
    for (let x = 1; x <= plan.maxX; x++) cells[x + ',' + y] = { terrain: 'floor', material: 'wood' };
  }
  for (let x = 1; x <= plan.maxX; x++) {
    boundaries['h:' + x + ',1'] = { kind: 'wall', material: 'stone' };
    boundaries['h:' + x + ',9'] = { kind: 'wall', material: 'stone' };
  }
  for (let y = 1; y <= 8; y++) {
    boundaries['v:1,' + y] = { kind: 'wall', material: 'stone' };
    boundaries['v:' + (plan.maxX + 1) + ',' + y] = { kind: 'wall', material: 'stone' };
  }
  boundaries[plan.frontBoundary] = { kind: 'opening', material: 'wood' };
  if (isPartitioned) {
    for (let x = 1; x <= 6; x++) {
      boundaries['h:' + x + ',5'] = { kind: x === 6 ? 'opening' : 'wall', material: 'stone' };
    }
    for (let y = 1; y <= 4; y++) boundaries['v:7,' + y] = { kind: 'wall', material: 'stone' };
  }
  doc.map = {
    width: plan.maxX + 2, height: 10, cellSizeMeters: 1,
    layers: [{ z: 0, cells, boundaries }],
  };
  doc.doors = {
    frontDoor: {
      id: 'frontDoor', name: '大門',
      boundary: { z: 0, id: plan.frontBoundary }, state: 'open',
    },
  };
  if (isPartitioned) {
    doc.doors.bedroomDoor = {
      id: 'bedroomDoor', name: '臥室門',
      boundary: { z: 0, id: 'h:6,5' }, state: 'open',
    };
  }
  doc.exits = {
    frontExit: {
      id: 'frontExit', name: '大門外', kind: 'offMap',
      boundary: { z: 0, id: plan.frontBoundary },
      access: p(...plan.frontAccess),
    },
  };
  doc.furniture = {};
  const orientation = {
    chairNW: 'east', chairNE: 'west', chairSW: 'east', chairSE: 'west', bed: 'north',
  };
  for (const [id, [x, y, definitionId]] of Object.entries(plan.furniture)) {
    doc.furniture[id] = {
      id, definitionId, origin: p(x, y), orientation: orientation[id] ?? 'south',
    };
  }
  for (const [id, [x, y]] of Object.entries(plan.objects)) {
    doc.entities.objects[id].position = p(x, y);
  }
  const [stoveX, stoveY] = plan.furniture.stoveA;
  const [counterX, counterY] = plan.furniture.counterA;
  doc.entities.objects.potA = {
    id: 'potA', name: '料理鍋', icon: '🍲', cookingEligible: true, portable: true,
    objectContainment: true, objectStorage: { maxItems: 1, maxMassKg: 0.6 },
    handling: {
      carryGeometry: { width: 0.35, height: 0.25, length: 0.35 },
      handsRequired: 1, massKg: 0.8,
    },
    position: p(stoveX, stoveY), supportId: 'stoveA',
  };
  doc.entities.objects.ingredientA1 = Ingredient.createIngredientObject({
    id: 'ingredientA1', typeId: 'A',
    position: p(counterX, counterY), supportId: 'counterA',
  });
  doc.entities.sources.tap = {
    ...doc.entities.sources.tap,
    position: p(...plan.source),
    interactionPorts: [{
      id: 'tap:south', label: '水龍頭南側', position: p(...plan.sourcePort),
      edge: 'north', affordances: ['fill'],
    }],
  };
  for (const [id, [x, y]] of Object.entries(plan.initial)) {
    doc.residents[id].initial.placement = { mode: 'exact', node: p(x, y) };
  }
  return doc;
}

for (const name of ['A', 'B']) {
  const doc = makeCandidate(name);
  const authoring = A.validateAuthoring(doc);
  assert.equal(authoring.ok, true, name + ': ' + JSON.stringify(authoring.errors));
  const roundTripped = A.parseAuthoringJSON(A.serializeAuthoring(doc));
  assert.equal(A.semanticFingerprint(roundTripped), A.semanticFingerprint(doc));

  const placements = I.analyzeInitialPlacements(doc);
  assert.equal(placements.ok, true, name + ': ' + JSON.stringify(placements.hardErrors));
  assert.deepEqual(placements.diagnostics, []);
  for (const id of ['zhen', 'zhou', 'orange']) {
    const reachability = placements.reachabilityByResident[id];
    for (const type of ['exit', 'food', 'water', 'sleep']) {
      assert.equal(reachability.targets[type].reachable, true, name + ': ' + id + ' cannot reach ' + type);
    }
  }

  const st = W.createInitialStateFromAuthoring(doc, 20261121);
  assert.equal(Object.keys(st.agents).length, 3);
  assert.equal(Object.keys(st.objects).length, 13);
  assert.equal(st.objects.ingredientA1.supportId, 'counterA');
  assert.equal(st.objects.potA.supportId, 'stoveA');
  assert.equal(st.objects.readyMealF0.supportId, 'diningTable');

  // Production Spatial gate: deliberately stricter than initial-placement reachability.
  for (const id of ['zhen', 'zhou']) {
    const a = st.agents[id];
    for (const [description, target, mode] of [
      ['ingredient pickup', { kind: 'object', id: 'ingredientA1' }, 'pickup'],
      ['pot receive', { kind: 'object', id: 'potA' }, 'receive'],
      ['stove', { kind: 'furniture', id: 'stoveA' }, 'default'],
      ['counter', { kind: 'furniture', id: 'counterA' }, 'default'],
    ]) {
      const result = SP.bestInteractionPositionResult(st, a, target, mode);
      assert.ok(Number.isFinite(result?.traversalCost), name + ': ' + id + ' cannot reach ' + description);
    }
  }

  if (name === 'B') {
    // Ensure the partition is actual canonical movement geometry, not decorative.
    assert.ok(placements.reachabilityByResident.zhen.reachableKeys.includes('2,2'));
    doc.doors.bedroomDoor.state = 'closed';
    const closed = I.analyzeInitialPlacements(doc);
    assert.equal(closed.reachabilityByResident.zhen.reachableKeys.includes('2,2'), false);
  }
  console.log(name + ': authoring, initializer, state and Spatial geometry passed');
}
