(() => {
  const W=window.SimWorld;if(!W)return;
  const VERSION='11.15.1-relationship-target-preference';
  const baseCreateInitialState=W.createInitialState;
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
  W.createInitialState=(seed)=>{
    const st=baseCreateInitialState(seed);
    st.version=VERSION;
    for(const a of Object.values(st.agents||{}))a.relationships={};
    return st;
  };
  W.RELATIONSHIP_SCHEMA_VERSION=VERSION;
  W.RELATIONSHIP_MIN_RELEVANCE=.15;
  W.RELATIONSHIP_FAMILIARITY_RATE=.08;
  W.RELATIONSHIP_AFFINITY_RATE=.10;
  W.RELATIONSHIP_TARGET_CAP=8;
  W.RELATIONSHIP_ENCOUNTER_WEIGHTS=ENCOUNTER_WEIGHTS;
})();
