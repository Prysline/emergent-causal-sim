# Mental Regulation v1

Current subsystem marker: `mental-regulation-v1`.

## Canonical ownership

`Agent.needs.engagement` 與 `Agent.needs.relaxation` 是兩份獨立的 Agent-private canonical Need truth，沿用既有 `Agent.needs` owner；本 subsystem 不建立第二份 Mental Regulation state，也不建立 persistent `overload` bar。

- `engagement > 0`：角色主觀上缺乏有意義投入與實際 feedback。
- `relaxation > 0`：角色主觀上需要降低心理負荷或持續投入。
- `0`：該 channel 目前沒有特別調節壓力。
- 兩者第一版皆 clamp 在 `0..100`；不使用負值表示過度滿足。
- 在尚未核准 Need generation policy 前，兩者初始化皆為 `0`；這代表「目前沒有已建立的 Mental Regulation 壓力」，不是用預設常數猜測角色一開始應該多無聊或多緊張。

## Activity profile 與 realized effect

第一個 consumer 刻意重用既有 `wander` / exploration Action，而不是先新增 `read` Action、content subsystem、物件或 affordance。

`SimMentalRegulation.ACTIVITY_PROFILES.wander` 只描述 regulation opportunity：

- `engagementProvision`
- `mentalLoad`
- `relaxationProvision`

profile 不是 Need truth，也不直接寫 Need。runtime 在 core execution 前只保存當下確實正在 `wander` 的 Agent 與 canonical position，在 core execution 後只於該位置實際改變時，才把一個 movement feedback unit 結算成 realized regulation effect。因此：

- Intent / plan 建立不會降低 Need；
- nominal Action tick 沒有實際 movement 時不會得到 regulation relief；
- sustained execution 每次實際 feedback 各自累積；
- 中途被其他 Action 取代時，已發生的 effect 不回滾。

## Deliberation evidence

Mental Regulation 使用既有 `registerDecisionOptionProvider(...)` extension seam，把同一個 `wander` concrete Action 提供為一個有 Mental Regulation provenance 的候選。Engagement / Relaxation 各自轉成 bounded `0..1` evidence，並以兩個獨立 `need` contributors 進入既有 initial Deliberation / Decision Evidence；Need 本身不 hard-trigger Action。

當 Engagement 與 Relaxation 都為 `0` 時，Mental Regulation provider 不新增 `wander` candidate，避免 dormant foundation 改寫 current default deliberation。只有 canonical Mental Regulation pressure 實際存在時，才形成該 subsystem 的候選 evidence。

這不建立第二套 decision system，也不改寫 `rest`：既有 `rest` 仍只由 fatigue semantics 擁有。

## Need generation boundary

本 slice **不新增通用、隨時間自動上升的 Engagement / Relaxation drift**。目前已核准 baseline 定義 Need 的主觀意義與 realized Activity effect，但沒有核准「清醒時間本身必然增加多少 Mental Regulation pressure」這類生成政策；因此第一版只建立 canonical state、bounded decision evidence 與 execution-driven regulation effect，不把時間經過偷渡成新的因果來源。

未來若實際玩法需要 Engagement / Relaxation 自主生成或累積，應另外依明確 consumer / evidence 決定 owner、rate 與 provenance，而不是由本 slice 預設。

## Environment interference

本 slice 不實作 Environment Interference consumer。repo 雖已有 canonical `noiseEvents` / spatial `noiseAt(...)`，目前一般 Auditory perception 仍未成為可供 Mental Regulation 合法消費的 Agent-perceived evidence，因此不把 World noise 直接接到 private Need 或 regulation effectiveness。

後續若加入 interference，必須維持：

`World sensory fact -> Perception -> current Activity context interpretation -> regulation-effectiveness modifier -> realized Activity regulation effect`

並持續禁止 `noise === interference`、persistent Overload bar、universal `activityEffectiveness` 與因 interference 直接 random failure。

## Version boundary

本 slice 新增獨立 `mental-regulation-v1` subsystem marker。因未核准 Need generation policy，neutral default (`0 / 0`) 不新增 Mental Regulation decision candidate，因此 current default simulation 行為與既有 Presentation 不因本 slice 自動改變；overall release、Action、Deliberation、Perception、Presentation 等未改 contract 的 marker 不形式性換代。

## Deferred

本 slice 明確不包含 generic Mental Regulation need-generation drift、`read` content model、novelty / familiarity / habituation、preferred stimulation range、generic interference framework、noise propagation、progress effectiveness、continuation / reconsideration pressure、resume lifecycle、Routine / Learned Habit / Standing Responsibility 或完整 Traits schema。
