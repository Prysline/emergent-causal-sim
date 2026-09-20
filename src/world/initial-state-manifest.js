(() => {
  const W=window.SimWorld;
  if(!W?.finalizeInitialStateRegistry)throw new Error('Initial-state registry is unavailable.');
  W.finalizeInitialStateRegistry({
    schema:[
      {id:'release.version',order:0},
      {id:'spatial.schema',order:10},
      {id:'contact.schema',order:30},
      {id:'spatialSurfaceEnvironment.schema',order:50},
      {id:'action.schema',order:100},
      {id:'intent.schema',order:200},
      {id:'socialBid.schema',order:300},
      {id:'interruption.schema',order:400},
      {id:'deliberation.schema',order:500},
      {id:'memory.schema',order:600},
      {id:'appraisal.schema',order:700},
      {id:'affect.schema',order:800},
      {id:'socialResponse.schema',order:900},
      {id:'memoryRetention.schema',order:1000},
      {id:'humanSocialResponse.schema',order:1100},
      {id:'memoryDeliberation.schema',order:1200},
      {id:'socialOutcomeMemory.schema',order:1300},
      {id:'presentation.schema',order:1400},
      {id:'relationship.schema',order:1500},
      {id:'physical.schema',order:1600},
      {id:'locomotion.schema',order:1700}
    ],
    finalize:[
      {id:'spatial.finalize',order:100}
    ]
  });
})();
