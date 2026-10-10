# Mental Regulation v4

Current subsystem marker: `mental-regulation-v4`.

## Canonical ownership

`Agent.needs.stimulation` 與 `Agent.needs.relaxation` 是兩份獨立的 Agent-private canonical Need truth，沿用既有 `Agent.needs` owner；本 subsystem 不建立第二份 Mental Regulation state，也不建立 persistent `overload` / workload / last-feedback history。

- `stimulation > 0`：角色主觀上缺乏有意義投入與實際 feedback。
- `relaxation > 0`：角色主觀上需要降低心理負荷或持續投入。
- `0`：該 channel 目前沒有特別調節壓力。
- 兩者皆 clamp 在 `0..100`；不使用負值表示過度滿足。
- 初始值仍為 `0 / 0`；Need generation 從 runtime experience 開始，不以非零 default 猜測角色初始心理狀態。

目前只有既有 Mental Regulation consumer 的 `human` Agent eligible。其他 species 即使因共用 Agent schema 持有 `needs.stimulation / relaxation`，也不會累積沒有合法 consumer 可處理的 baseline pressure。

## Need generation / atomic settlement

`mental-regulation-v4` 新增第一個 approved Need generation policy：

- eligible human 在清醒 tick 產生 `0.08` Stimulation baseline gain；
- sleeping tick 不產生 awake baseline；
- Relaxation **沒有** generic time-based baseline drift；
- realized Activity feedback、mental load 與 relaxation provision 與 awake baseline 先形成 ephemeral contributors，再由 after-tick `mentalRegulation.settle` 一次彙整、一次 clamp；
- 新 Need 值因此在 core execution 後才成立，最早由下一次新的 Deliberation 使用。

`0.08` 是第一版 deterministic calibration。它遠低於現有 realized `wander` / `read` 的 `stimulationProvision`（`1.4` / `1.8` per realized unit），所以持續取得 meaningful feedback 可以抵銷甚至降低 pressure；而從 `0` 累積到 production resident 常見的約 `29` thirst 初始量級需要約 363 個完全沒有 meaningful feedback 的 eligible awake ticks，不會在數個 tick 內搶過既有 physiological motives。

每個 settlement 至少保留 ephemeral provenance：

- `awake-baseline`
- `activity-stimulation`
- `activity-mental-load`
- `activity-relaxation`

contributor 記錄 `need`、直接 `source`、`activityKind`（如適用）、`realizedUnits` 與 `rawContribution`；settlement result 同時提供 raw / clamp 後 `appliedDelta`。這些 diagnostics 不持久化成 per-tick history，也不建立競爭 truth。

## Activity profile 與 realized effect

目前 concrete consumers 為既有 `wander` / exploration 與 `read` Activity。`SimMentalRegulation.ACTIVITY_PROFILES` 只描述 regulation opportunity：

- `stimulationProvision`
- `mentalLoad`
- `relaxationProvision`

profile 不是 Need truth，也不直接寫 Need。runtime 在 core execution 前捕捉 eligible Agent 的 awake / execution context，在 core execution 後只把真正 realized 的 movement / reading feedback 送進同一 settlement。因此：

- Intent / plan / Action 建立不會滿足 Need；
- nominal Action tick 沒有 actual realized feedback 時不會得到 activity relief；
- sustained execution 每次實際 feedback 各自貢獻；
- 中途被其他 Action 取代時，已發生的 effect 不回滾；
- 同 tick 的 awake baseline 與 realized activity effect 不逐項 clamp。

Relaxation 現在正式將 `mentalLoad` 與 `relaxationProvision` 保留成兩個獨立 contributor：

`relaxationDelta = realizedMentalLoad - realizedRelaxationProvision`

例如 `read` 的 `0.35 - 0.65 = -0.30` 在 Relaxation 已為 `0` 時會先得到 raw net `-0.30`，最後一次 clamp 後仍維持 `0`，不會因先加 load、clamp、再減 provision 而製造假的暫時 pressure。未來合法的 stress / trait / social / environment-derived load 仍必須有自己的 authority / provenance；本 slice 不預先實作。

## Deliberation evidence

Mental Regulation 使用既有 `registerDecisionOptionProvider(...)` extension seam，把 `wander` / `read` concrete Action 提供為有 Mental Regulation provenance 的候選。Stimulation / Relaxation 各自轉成 bounded `0..1` evidence，並以兩個獨立 `need` contributors 進入既有 initial Deliberation / Decision Evidence；Need 本身不 hard-trigger Action。

Initial `0 / 0` 仍不會在 reset 當下憑空增加候選。第一個 eligible awake tick 完成後，Stimulation baseline 已成為 canonical Need，因此後續新的 Deliberation 可以合法看見它。這不建立第二套 decision system，也不改寫 `rest`：既有 `rest` 與 Fatigue physiology 仍由各自 authority 擁有。

## Fatigue boundary

Mental Regulation settlement 不讀寫 Fatigue 的 baseline physiology、exertion 或 rest / sleep recovery truth。Relaxation 表示心理／注意投入與認知負荷的 down-regulation pressure，不是第二條 Fatigue；兩者不得共用自然累積規則。

## Environment interference

本 slice仍不實作 Environment Interference consumer。repo 雖已有 canonical `noiseEvents` / spatial `noiseAt(...)`，Mental Regulation runtime 不直接讀取這些 World facts。

後續若加入 interference，必須維持：

`World sensory fact -> Perception -> current Activity / experience context interpretation -> regulation-effectiveness / mental-load contributor -> Mental Regulation settlement`

並持續禁止 `noise === interference`、persistent Overload bar、universal `activityEffectiveness` 與因 interference 直接 random failure。

## Runtime ordering

Mental Regulation 延續既有 explicit runtime hook pipeline：

`beforeTick mentalRegulation.capture-execution (1200) -> coreTick -> afterTick mentalRegulation.settle (50) -> later afterTick hooks -> Presentation observers`

這保證 baseline generation 不會回頭改變同 tick 已經開始的 execution / chooser 語意；UI / Inspector 則可在 tick 完成後投影 settlement 後的 canonical Need。

## Version boundary

`mental-regulation-v4` 新增 approved Stimulation generation 與 atomic Stimulation / Relaxation settlement semantics，並把 Relaxation 從舊的 relief-only `max(0, relaxationProvision - mentalLoad)` 改為獨立 load / provision contributors 的 net delta。Overall / Presentation marker 因 production default observable behavior 改變而前進至 `11.53.0-mental-regulation-generation`。Action、Deliberation、Perception、Fatigue physiology 等未改 contract 的 own marker 不形式性換代。

## Deferred

本 slice 明確不包含 negative Need、generic return-to-zero、novelty / familiarity / habituation、boredom history、`lastMeaningfulFeedbackTick`、persistent workload、Overload Need、Character Trait / anxiety implementation、recent-stress persistence、Affect coupling、social load、Environment Interference / noise perception integration、generic Activity profile overhaul、替所有 Activities 補 Mental Regulation profile、Learned Habit、Standing Responsibility 或 generic Activity Continuity / resume。
