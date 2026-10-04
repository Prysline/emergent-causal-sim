(() => {
  const V=window.SimValidator;
  if(!V?.finalizeValidationLayers)throw new Error('Validator registry is unavailable.');
  const EXPECTED_VALIDATION_LAYERS=['physical.profile', 'agent-carry', 'locomotion.execution', 'spatial.node', 'spatial.environment', 'action.canonical-type', 'intent.active', 'social-bid', 'interruption', 'deliberation', 'memory.episodic', 'appraisal', 'affect', 'social-response', 'memory-retention', 'human-social-response', 'memory-deliberation', 'social-outcome-memory', 'relationship', 'usage-preference'];
  V.finalizeValidationLayers(EXPECTED_VALIDATION_LAYERS);
})();