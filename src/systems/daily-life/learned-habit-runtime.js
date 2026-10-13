(() => {
  const E=window.SimEngine,H=window.SimDailyLifeLearnedHabit;
  if(!E||!H)throw new Error('systems/daily-life/learned-habit-runtime.js requires Engine and Learned Habit state policy.');
  if(!E.registerRuntimeHook)throw new Error('systems/daily-life/learned-habit-runtime.js requires runtime-hook-pipeline.js');

  E.registerRuntimeHook('episodicMemoryCreated','dailyLifeLearnedHabit.consolidate',(ctx)=>{
    H.consolidateFromMemory(ctx.state,ctx.agent,ctx.memory);
  },50);

  E.DAILY_LIFE_LEARNED_HABIT_VERSION=H.VERSION;
})();
