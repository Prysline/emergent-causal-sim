# Mental Regulation v1

Current subsystem marker: `mental-regulation-v1`.

## Canonical ownership

`Agent.needs.engagement` 與 `Agent.needs.relaxation` 是兩份獨立的 Agent-private canonical Need truth，沿用既有 `Agent.needs` owner；本 subsystem 不建立第二份 Mental Regulation state，也不建立 persistent `overload` bar。

- `engagement > 0`：角色主觀上缺乏有意義投入與實際 feedback。
- `relaxation > 0`：角色主觀上需要降低心理負荷或持續投入。
- `0`：該 channel 目前沒有特別調節壓力。
- 兩者第一版皆 clamp 在 `0..100`；不使用負值表示過度滿足。

## Activity profile 與 realized effect

第一個 consumer 刻意重用既有 `wander` / exploration Action，而不是先新增 `read` Action、content subsystem、物件或 affordance。

`SimMentalRegulation.ACTIVITY_PROFILES.wander` 只描述 regulation opportunity：

- `engagementProvision`
- `mentalLoad`
- `relaxationProvision`

profile 不是 Need truth，也不直接寫 Need。runtime 在 core execution 前保存當下 Action 與位置，在 core execution 後只於該 Agent 原本正在 `wander` 且 canonical position 實際改變時，才把一個 movement feedback unit 結算成 realized regulation effect。因此：

- Intent / plan 建立不會降低 Need；
- nominal Action tick 沒有實際 movement 時不會得到 regulation relief；
- sustained execution 每次實際 feedback 各自累積；
- 中途被其他 Action 取代時，已發生的 effect 不回滾。

## Deliberation evidence

Mental Regulation 使用既有 `registerDecisionOptionProvider(...)` extension seam，把同一個 `wander` concrete Action 提供為一個有 Mental Regulation provenance 的候選。Engagement / Relaxation 各自轉成 bounded `0..1` evidence，並以兩個獨立 `need` contributors 進入既有 initial Deliberation / Decision Evidence；Need 本身不 hard-trigger Action。

這不建立第二套 decision system，也不改寫 `rest`：既有 `rest` 仍只由 fatigue semantics 擁有。

## Baseline drift

清醒且在 map 上的 Agent 每 tick 依 Mental Regulation policy 增加少量 Engagement / Relaxation pressure。睡眠中或 off-map 的 Agent 第一版不做此 baseline drift；這不代表 Sleep 或 off-map Activity 具有 Mental Regulation recovery effect。

## Environment interference

本 slice 不實作 Environment Interference consumer。repo 雖已有 canonical `noiseEvents` / spatial `noiseAt(...)`，目前一般 Auditory perception 仍未成為可供 Mental Regulation 合法消費的 Agent-perceived evidence，因此不把 World noise 直接接到 private Need 或 regulation effectiveness。

後續若加入 interference，必須維持：

`World sensory fact -> Perception -> current Activity context interpretation -> regulation-effectiveness modifier -> realized Activity regulation effect`

並持續禁止 `noise === interference`、persistent Overload bar、universal `activityEffectiveness` 與因 interference 直接 random failure。

## Deferred

本 slice 明確不包含 `read` content model、novelty / familiarity / habituation、preferred stimulation range、generic interference framework、noise propagation、progress effectiveness、continuation / reconsideration pressure、resume lifecycle、Routine / Learned Habit / Standing Responsibility 或完整 Traits schema。
