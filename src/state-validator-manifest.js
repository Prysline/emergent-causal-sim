(() => {
  const V=window.SimValidator;
  if(!V?.finalizeValidationLayers)throw new Error('Validator registry is unavailable.');
  const EXPECTED_VALIDATION_LAYERS=['spatial.node', 'spatial.environment', 'action.canonical-type', 'intent.active', 'social-bid', 'interruption', 'deliberation', 'memory.episodic', 'appraisal', 'affect', 'social-response', 'memory-retention', 'human-social-response', 'memory-deliberation', 'social-outcome-memory', 'relationship'];
  V.finalizeValidationLayers(EXPECTED_VALIDATION_LAYERS);
})();
