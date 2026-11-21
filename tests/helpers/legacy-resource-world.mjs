// Historical Resource-unit regression fixture. The current production default
// contains ONLY ordinary Food v2 plates; legacy Resource plates exist solely
// in the separately authored test scene returned here.
import vm from 'node:vm';
import {readRepoFile} from './production-loader.mjs';

export function legacyResourceWorld(currentAuthoring) {
  const prior=globalThis.SimWorldAuthoring;
  if(prior!==currentAuthoring)throw new Error('Legacy fixture requires the active World Authoring owner.');
  let historic;
  try {
    // The v16 base remains the isolated pre-Food scene for legacy test profiles.
    // Its Resource plate IDs and visible names are explicitly legacy-prefixed.
    vm.runInThisContext(readRepoFile('src/world-authoring.js'),
      {filename:'test-fixture:world-authoring-v16.js'});
    historic=currentAuthoring.cloneAuthoring(globalThis.SimWorldAuthoring.DEFAULT_WORLD_AUTHORING);
  } finally {
    globalThis.SimWorldAuthoring=prior;
  }
  historic.authoringSchema=currentAuthoring.VERSION;
  if(currentAuthoring.DEFAULT_WORLD_AUTHORING.entities.objects.readyMealF0){
    const meal=currentAuthoring.cloneAuthoring(currentAuthoring.DEFAULT_WORLD_AUTHORING.entities.objects.readyMealF0);
    meal.position={x:5,y:2,z:0};
    historic.entities.objects.readyMealF0=meal;
  }
  if('plateA' in historic.entities.objects||'plateB' in historic.entities.objects)
    throw new Error('Legacy fixture must use namespaced Object IDs only.');
  const report=currentAuthoring.validateAuthoring(historic);
  if(!report.ok)throw new Error('Invalid legacy Resource fixture: '+report.errors.map(e=>e.code).join(','));
  return historic;
}

export function useLegacyResourceWorld(authoring,world,engine) {
  const authored=legacyResourceWorld(authoring);
  engine.configureResetStateSource('isolated-legacy-resource-plates',
    seed=>world.createInitialStateFromAuthoring(authored,seed));
  return authored;
}
