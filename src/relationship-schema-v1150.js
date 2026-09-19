(() => {
  const W=window.SimWorld;if(!W)return;
  if(!W.registerInitialStateInitializer)throw new Error('relationship-schema-v1150.js requires world.js initial-state pipeline.');
  const VERSION='11.15.2-relationship-responder-bias';
  const ENCOUNTER_WEIGHTS=Object.freeze({
    acceptTalk:1,
    talk:1,
    briefTalkReply:.6,
    declineTalk:.6,
    petAnimal:1,
    avoidPet:.6,
    socialNoResponse:.25
  });

  W.VERSION=VERSION;
  W.registerInitialStateInitializer('relationship.schema',(st)=>{
    st.version=VERSION;
    for(const a of Object.values(st.agents||{}))a.relationships={};
    return st;
  },1500);
  W.RELATIONSHIP_SCHEMA_VERSION=VERSION;
  W.RELATIONSHIP_MIN_RELEVANCE=.15;
  W.RELATIONSHIP_FAMILIARITY_RATE=.08;
  W.RELATIONSHIP_AFFINITY_RATE=.10;
  W.RELATIONSHIP_TARGET_CAP=8;
  W.RELATIONSHIP_ENCOUNTER_WEIGHTS=ENCOUNTER_WEIGHTS;
})();
