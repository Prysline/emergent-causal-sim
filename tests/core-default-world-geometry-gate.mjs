// Core Default World Redesign A/B: independent, non-canonical geometry fixtures.
import assert from 'node:assert/strict';
import {legacyResourceWorld} from './helpers/legacy-resource-world.mjs';
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
      bookA: [7, 3], legacyResourceMealTray: [7, 3], legacyResourcePlateA: [7, 3],
      legacyResourcePlateB: [8, 4], legacyResourceFoodPantry: [2, 4], legacyResourceBasket: [3, 4],
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
      bookA: [11, 5], legacyResourceMealTray: [11, 5], legacyResourcePlateA: [11, 5],
      legacyResourcePlateB: [12, 6], legacyResourceFoodPantry: [14, 2], legacyResourceBasket: [14, 3],
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
  const doc = legacyResourceWorld(A);
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


// Controlled activity opportunities and autonomous tick smoke, using the real production
// consumers. Only the fixtures change; they never replace DEFAULT_WORLD_AUTHORING.
const E = globalThis.SimEngine;
const V = globalThis.SimValidator;
const P = globalThis.SimPerception;
const commonStarts = { zhen: [8, 6], zhou: [9, 5], orange: [6, 7] };
function controlledCandidate(name) {
  const doc = makeCandidate(name);
  for (const [id, [x, y]] of Object.entries(commonStarts)) {
    doc.residents[id].initial.placement = { mode: 'exact', node: p(x, y) };
  }
  const report = I.analyzeInitialPlacements(doc);
  assert.equal(report.ok, true, name + ' controlled starts: ' + JSON.stringify(report.hardErrors));
  assert.deepEqual(report.diagnostics, []);
  return doc;
}

for (const name of ['A', 'B']) {
  const doc = controlledCandidate(name);
  const st = W.createInitialStateFromAuthoring(doc, 20261121);
  const opportunities = {};
  for (const id of ['zhen', 'zhou']) {
    const agent = st.agents[id];
    const read = E.bestReadableObjectOpportunity(st, agent);
    const fill = SP.bestInteractionPositionResult(st, agent, { kind: 'source', id: 'tap' }, 'fill');
    const meal = SP.bestInteractionPositionResult(st, agent, { kind: 'object', id: 'readyMealF0' }, 'eatFrom');
    const stove = SP.bestInteractionPositionResult(st, agent, { kind: 'furniture', id: 'stoveA' }, 'default');
    const sleep = SP.sleepTargets(st, agent);
    const rest = SP.restTargets(st, agent);
    const other = id === 'zhen' ? 'zhou' : 'zhen';
    const social = SP.bestInteractionPositionResult(st, agent, { kind: 'agent', id: other }, 'social');
    for (const [activity, result] of Object.entries({ read, fill, meal, stove, social })) {
      assert.ok(Number.isFinite(result?.traversalCost),
        name + ': ' + id + ' lacks legal ' + activity + ' opportunity');
    }
    assert.ok(sleep.length > 0, name + ': ' + id + ' lacks legal sleeping target');
    assert.ok(rest.length > 0, name + ': ' + id + ' lacks legal resting target');
    opportunities[id] = {
      read: read.traversalCost, fill: fill.traversalCost,
      meal: meal.traversalCost, stove: stove.traversalCost,
      social: social.traversalCost, sleep: sleep[0].score, rest: rest[0].score,
    };
  }

  const bed = doc.furniture.bed.origin;
  const los = P.classifyStaticVisualLos(doc.furniture.stoveA.origin,
    p(bed.x + 1, bed.y + 1), P.projectStaticVisualOpacity(doc, 0));
  assert.equal(los.losAvailable, name === 'A',
    name + ': static kitchen-to-bedroom visual occlusion');

  assert.equal(Object.keys(SP.recomputeRooms(st)).length, 1, name + ': open doors are one room');
  if (name === 'B') {
    // The wall and the door must affect both traversal topology and the actual
    // room-based agent-context consumer. No private knowledge is manufactured.
    const zhen = st.agents.zhen, zhou = st.agents.zhou;
    zhen.position = p(6, 4);
    zhou.position = p(6, 5);
    assert.equal(E.observeAgentContext(st, zhen, zhou).observable, true,
      'open bedroom door permits same-room agent context');
    st.doors.bedroomDoor.state = 'closed';
    assert.equal(Object.keys(SP.recomputeRooms(st)).length, 2);
    const observation = E.observeAgentContext(st, zhen, zhou);
    assert.equal(observation.observable, false);
    assert.equal(observation.reason, 'different-room');
  }
  console.log('Core default controlled activity opportunities ' +
    name + ': ' + JSON.stringify(opportunities));
}

// Use the same seed, start positions and needs, but allow the real Deliberation
// and Action runtime to choose their own trajectories. Do not lock a story.
let currentControlledDoc = null;
E.configureResetStateSource('core-default-world-ab-controlled', seed =>
  W.createInitialStateFromAuthoring(currentControlledDoc, seed));
// Core Default World x Food v2 integration, using the current production
// Cooking decision consumer and real Engine action lifecycle. The Action is
// explicitly selected by this test, not falsely described as a Deliberation
// outcome. The previous 36-tick probes separately exercise Deliberation.
const Cooking = globalThis.SimFoodCooking;
const Food = globalThis.SimFood;
assert.equal(Cooking.VERSION, 'food-cooking-v2-autonomous-ingredient-acquisition');
const facings = ['north', 'northEast', 'east', 'southEast', 'south',
  'southWest', 'west', 'northWest'];
for (const name of ['A', 'B']) {
  const doc = controlledCandidate(name);
  // Keep normal geometry and the canonical supported Ingredient, but omit the
  // unrelated pre-cooked Meal so downstream intake has unambiguous provenance.
  delete doc.entities.objects.readyMealF0;
  const [counterX, counterY] = PLANS[name].furniture.counterA;
  doc.residents.zhen.initial.placement = {
    mode: 'exact', node: p(counterX, counterY + 1),
  };
  doc.residents.zhen.initial.facing = 'north';
  const authoring = A.validateAuthoring(doc);
  assert.equal(authoring.ok, true, name + ' food integration authoring: ' +
    JSON.stringify(authoring.errors));
  const initial = I.analyzeInitialPlacements(doc);
  assert.equal(initial.ok, true, name + ' food integration placement: ' +
    JSON.stringify(initial.hardErrors));
  assert.deepEqual(initial.diagnostics, []);

  currentControlledDoc = doc;
  E.reset(20261125);
  const st = E.getState(), agent = st.agents.zhen;
  for (const other of Object.values(st.agents)) {
    if (other.id !== agent.id) other.offMap = true;
  }
  Object.assign(agent.needs, {
    hunger: 55, thirst: 0, fatigue: 0, sleepNeed: 0, social: 0,
    stimulation: 0, relaxation: 0,
  });
  agent.action = null;
  agent.activeIntent = null;

  const ingredient = st.objects.ingredientA1;
  assert.equal(ingredient.supportId, 'counterA');
  assert.equal(st.objects.potA.supportId, 'stoveA');
  assert.equal(Cooking.eligible(st, ingredient.id, 'stoveA')?.sourceId, 'counterA');
  let choice = null;
  for (const facing of facings) {
    agent.facing = facing;
    choice = E.cookingDecisionOption(st, agent);
    if (choice) break;
  }
  assert.equal(choice?.id, 'cookMeal',
    name + ': no observable autonomous Cooking opportunity at the actual counter');
  assert.equal(choice.observed.sourceId, 'counterA');
  assert.ok(choice.decisionContributors.some(c => c.kind === 'observation'),
    name + ': Cooking must cite perception evidence');

  const action = E.buildAction(agent, choice);
  assert.equal(action?.kind, 'cookMeal');
  assert.equal(action?.sourceId, 'counterA');
  assert.equal(action?.potId, 'potA');
  agent.action = action;
  E.ensureIntentForAction?.(st, agent);
  let completed = false;
  for (let tick = 0; tick < 140; tick++) {
    E.tick();
    if (st.events.some(e => e.data?.action === 'cookMeal' &&
      e.data.phase === 'complete')) {
      completed = true;
      break;
    }
  }
  assert.equal(completed, true, name + ': real Cooking Action did not complete');
  const phases = {};
  for (const phase of ['pickupIngredient', 'loadPot', 'complete']) {
    const matching = st.events.filter(e => e.data?.action === 'cookMeal' &&
      e.data.phase === phase);
    assert.equal(matching.length, 1, name + ': expected one ' + phase + ' event');
    phases[phase] = matching[0];
    assert.equal(st.causes[matching[0].id], matching[0],
      name + ': all Cooking events must be canonical');
  }
  assert.equal(phases.pickupIngredient.data.sourceId, 'counterA');
  assert.deepEqual(phases.loadPot.causeIds, [phases.pickupIngredient.id]);
  assert.deepEqual(phases.complete.causeIds, [phases.loadPot.id]);
  assert.equal(st.objects.ingredientA1, undefined,
    name + ': original Ingredient must be retired once');
  const cooked = st.objects[phases.complete.data.mealId];
  assert.ok(Food.validMeal(cooked), name + ': missing produced F0 Meal');
  assert.equal(cooked.producedByEventId, phases.complete.id);
  assert.equal(cooked.supportId, 'stoveA',
    name + ': no teleportation of cooked Meal to the table');
  assert.equal(phases.complete.data.inputMassGrams,
    phases.complete.data.mealMassGrams +
    phases.complete.data.processOutflowMassGrams);
  assert.equal(V.validateState(st).issueCount, 0,
    name + ': validator rejected cooked state');

  // Same F0 eat consumer must accept the cooked Meal at its actual location.
  const eatAction = E.buildAction(agent, { id: 'eat' });
  assert.equal(eatAction?.kind, 'eat', name + ': cooked F0 Meal is not edible');
  agent.action = eatAction;
  E.ensureIntentForAction?.(st, agent);
  let intake = null;
  for (let tick = 0; tick < 40; tick++) {
    E.tick();
    intake = st.events.find(e => e.data?.action === 'eat' &&
      e.data.foodKind === 'meal' && e.data.phase === 'intake');
    if (intake) break;
  }
  assert.ok(intake, name + ': existing F0 eat did not consume cooked Meal');
  assert.equal(st.causes[intake.id], intake);
  assert.equal(V.validateState(st).issueCount, 0,
    name + ': validator rejected post-intake state');
  console.log('Core Default World x Food v2 integration ' + name + ': ' +
    JSON.stringify({
      sourceId: phases.pickupIngredient.data.sourceId,
      eventIds: ['pickupIngredient', 'loadPot', 'complete'].map(p => phases[p].id),
      mealId: cooked.id, intakeEventId: intake.id, ticks: st.tick,
    }));
}

// Autonomous Deliberation smoke: production sight posture preflight must be
// effective without any test-only Perception overrides or fabricated observations.
for (const name of ['A', 'B']) {
  currentControlledDoc = controlledCandidate(name);
  E.reset(20261121);
  const st = E.getState();
  for (const agent of Object.values(st.agents)) {
    Object.assign(agent.needs, {
      hunger: 45, thirst: 38, fatigue: 38, sleepNeed: 43,
      social: 35, stimulation: 15, relaxation: 15,
    });
  }
  const before = V.validateState(st);
  assert.equal(before.issueCount, 0,
    name + ' initial state: ' + before.issues.map(x => x.code).join(','));
  const choices = [];
  for (let tick = 0; tick < 36; tick++) {
    E.tick();
    for (const [id, thought] of Object.entries(st.thoughts || {})) {
      if (thought?.tick === st.tick && thought.pick?.id) choices.push(id + ':' + thought.pick.id);
    }
  }
  const after = V.validateState(st);
  assert.equal(after.issueCount, 0,
    name + ' after autonomous ticks: ' + after.issues.map(x => x.code).join(','));
  assert.equal(st.tick, 36, name + ': autonomous Engine must advance 36 ticks');
  assert.ok(choices.length > 0, name + ': Deliberation must make real decisions');
  console.log('Core default autonomous tick smoke ' + name + ': ' +
    JSON.stringify({
      tick: st.tick, choices: [...new Set(choices)].sort(),
      events: st.events.length,
      agentActions: Object.fromEntries(Object.values(st.agents).map(a => [a.id, a.action?.kind || null])),
    }));
}

