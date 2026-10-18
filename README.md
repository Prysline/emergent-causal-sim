# Emergent Causal Simulator

湧現式因果模擬器：以少量、底層且可組合的規則，產生可追溯的因果鏈與湧現行為。

目前 runtime marker：`11.63.0-tidying-put-away`。

Current release 建立 Tidying / Put-away v1：World Authoring v18 明確 author `objectStorageAssignments[]` 與 Resident 初始已知 refs，Agent 只從自己的已知 assignment 出發，依 query-time Object visual availability 形成 bounded put-away Decision Option；正式 Action 逐步拿取、搬運並存入指定 `objectContainment:true` Furniture。canonical Object location 仍由原 Engine/Spatial 處理，中斷不 rollback；default world 不配置 home、Editor GUI 未擴張。Own generation `tidying-put-away-v1`，Perception Visual Availability `perception-visual-availability-v3-object-point`。\n\n前一個 release 建立 Furniture Passage Yielding v1：明確 opt-in 的 Furniture 可在角色 normal walk route unreachable、角色實際觀察到阻塞 Furniture、正確反側 interaction position 可達，而且固定 `parkedPlacement` 的 hypothetical geometry 能恢復原 walk goal 時，作為既有 Action / Intent 的 bounded execution recovery 收回一格。Runtime move 使用 resolved 3D solids 做 destination + swept transition legality，並以單一 placement transaction 同步 current Furniture geometry、Tile membership / floor geometry 與 presentation；Perception Furniture target 讀 current runtime geometry 並排除 target self-occlusion。World Authoring 升為 `world-authoring-v17`；Furniture Definitions 維持 `furniture-definitions-v13`；Route own generation不假升版。詳細 contract 見 [`docs/furniture-passage-yielding.md`](docs/furniture-passage-yielding.md)。

前一個 `11.61.0-activity-continuity` 建立 Generic Activity Continuity v1：新增 Agent-private `activityEpisode` canonical owner，第一個 production consumer 只有 `read`。閱讀至少產生一次 realized feedback 後才形成 episode；emergency preemption 可把同一段未完成閱讀轉為 `suspended`，但不保存舊 Action / path / reservation。Resume 只形成 bounded Decision Option，仍由既有 Deliberation 與 Needs / 其他 Activities 競爭，不會自動接回。進行中 progress 只存在 live Action；Action 被中斷且不存在時才由 suspended episode 暫存，resume 建立新 Action 後再移回 Action。Activity Continuity own generation = `activity-continuity-v1`；Interruption own generation → `11.12.4-activity-continuity`；Action、generic Deliberation / Decision Evidence、Mental Regulation、Routine、Learned Habit 與 Standing Responsibility 不因本 release 假升版。

前一個 `11.60.0-standing-responsibility` 建立 Standing Responsibility v1：World 以 durable `resourceResponsibilityAssignments[]` 保存 Resources replenishment responsibility；Agent-private 只保存自己已知的 `knownResponsibilityAssignmentIds[]`。第一個 consumer 是既有合法 `restockContainer` option：責任只追加最多 `+8`、可追溯至 assignment ID 的 bounded decision contributor，不建立第二套 restock candidate、objective need、Action 或 Active Intent，也不取代 Routine、Learned Habit 或 Obligation。World Authoring 升為 `world-authoring-v16`，Editor Resident inspector 可 author Resources 補充責任，Resident View / Debug Inspector 只投影 canonical World truth 與 Agent-private known-ref linkage。

前一個 `11.59.0-learned-habit` 建立 Daily Life Learned Habit v1：Agent 自己真正形成的 episodic experience 經 `episodicMemoryCreated` 與 bounded activity classifier 收斂為 `activityKind + daily-time-bucket` 的 Agent-private `learnedHabits`；第一版支援 `read / eat / talk`，以慢速 deterministic consolidation / decay 對既有合法 Decision Option 提供最多 `+10` 的 bounded evidence。Learned Habit 不建立候選、Action 或 Active Intent，不保存 exact Object / Furniture / Agent target identity，也不取代 Routine、Usage Habit、Need 或 Standing Responsibility。

前一個 `11.58.0-object-containment` 建立 Object containment v1：Object 以 `containedBy` 保存唯一 canonical containment relation，Furniture Definition 以 `objectContainment:true` 宣告 capability；Contained Object 不保存自己的 `position`，Spatial 由 containing Furniture 推導 effective location。第一個 consumer 是 Bookshelf，提供最基本 `Held ↔ Contained` lifecycle 與必要 Editor / Presentation projection；不加入 autonomous storage policy、nested containment、capacity / packing 或 generic storage framework。

Object containment v1 建立 Object-side `containedBy: furnitureId` canonical relation；第一代只允許 `objectContainment:true` Furniture target，Bookshelf 是第一個 consumer。Held / Contained / Supported / Free 為互斥的 derived location classification；Contained Object 不保存自己的 `position`，effective location 由 Spatial 經 Furniture 推導，Furniture 不保存反向 canonical `contents[]`。`Held ↔ Contained` 只提供底層 canonical lifecycle，不加入 housekeeping / habit / autonomous storage policy；既有 bulk food / Resource Container 語意維持不變。

前一個 `11.57.1-slot-approach-arrival` 已修正 Furniture Slot-use arrival：chooser-time approach winner 只作 ephemeral navigation witness；`sleep`、`rest` 與 Human `meal` execution 以 current `slotApproachNodes()` 判斷是否已抵達任一合法 approach。

## Current authority navigation

- [`docs/architecture.md`](docs/architecture.md)：跨 subsystem 現行工程契約
- [`docs/versioning.md`](docs/versioning.md)：版本與 marker ownership
- [`docs/furniture-passage-yielding.md`](docs/furniture-passage-yielding.md)：Furniture Passage Yielding authoring / observation / geometry / recovery / runtime transaction contract
- [`docs/activity-continuity.md`](docs/activity-continuity.md)：Generic Activity Continuity / resume truth、lifecycle、progress ownership 與 interruption / Deliberation contract
- [`docs/standing-responsibility.md`](docs/standing-responsibility.md)：Standing Responsibility v1 truth / knowledge / decision / Editor contract
- [`docs/interaction-geometry.md`](docs/interaction-geometry.md)：Interaction Geometry / Pickup 詳細契約
- [`docs/tick-pipeline.md`](docs/tick-pipeline.md)：runtime hook ordering
- [`docs/agent-carry-relocate.md`](docs/agent-carry-relocate.md)：Agent Carry
- [`docs/mental-regulation.md`](docs/mental-regulation.md)：Mental Regulation
- [`docs/daily-life-routine.md`](docs/daily-life-routine.md)：Daily Life Routine
- [`docs/daily-life-learned-habit.md`](docs/daily-life-learned-habit.md)：Daily Life Learned Habit
- [`docs/reading-activity.md`](docs/reading-activity.md)：Reading Activity
- [`docs/development-workflow.md`](docs/development-workflow.md)、[`docs/pr-preflight.md`](docs/pr-preflight.md)：工程流程 / preflight

11.53 以前累積在 README / Architecture / Versioning 的全文 snapshot 保留於 `docs/archive/`，只供追溯，不是現行規格。

## Current subsystem boundary index

- **Furniture Passage Yielding**：只在 normal walk unreachable 時，對已觀察且 opt-in Furniture 檢查 fixed parked counterfactual，並以 canonical interaction geometry + runtime placement transaction做 bounded recovery；不建立第二份 motive、generic relocation 或 pushing physics。parked 後的 Furniture 仍是完整 current geometry，所有 traversal / visual consumer 重新讀同一 truth。
- **Activity Continuity**：`Agent.activityEpisode` 是已開始但未自然完成 Activity 的 Agent-private canonical owner；v1 最多一個 episode，第一個 consumer 只有 `read`。Resume 只提供 bounded normal Decision Option；不復活舊 Action、不保存 stale path / reservation、不繞過 Deliberation。
- **Standing Responsibility**：canonical World truth 是 durable `resourceResponsibilityAssignments[]`；Agent-private 只持有已知 assignment ID refs。v1 僅支援 Resources replenishment / `restock` scope；decision integration 只能 enrich 已存在且 legal 的 `restockContainer` option，不能建立 candidate 或 objective necessity。
- **Object Domain**：具體 physical item 的 canonical identity 只在 `state.objects`；`resourceContainer:true` 與 Furniture-side `objectContainment:true` 都是可組合 capability，不建立平行 entity taxonomy。Object containment 的 canonical relation 只在 child Object 的 `containedBy`；Furniture 的 reverse contents 只能投影。Generic physical handling 由 `SimObjectHandling` 持有，Resources 只消費 Resource-container capability。
- **Daily Life Learned Habit**：`Agent.learnedHabits` 是由 actor 自己已形成的 private episodic experience 收斂出的 Activity-level 慢速慣性；v1 只保存 `activityKind + daily-time-bucket`，不保存 target identity，且只 enrich 已存在的合法 Decision Option。
- **Relationship Foundation**：Relationship 是 Agent-private directional state；`A → B` 與 `B → A` 分開保存。**Relationship → Responder Bias** 只讓 responder decision 消費自己的 canonical relationship，不建立 shared pair score。
- **Physical Profile Foundation**：Agent physical profile 是 body / locomotion capability authority；`MovementEnvelope` / `PoseEnvelope` 由 canonical profile 即時計算，不保存第二份 geometry cache。
- **Passage Profile**：edge / opening geometry 由 Spatial / Passage authority 即時派生；不把 traversal feasibility 寫回 Furniture 或 Tile。
- **Metric Route**：`pathDistance`、`traversalCost`、`travelTime` 分工；target ranking 使用 canonical `accessPenalty`，不建立另一套 route truth。
- **Locomotion Execution**：mode / posture transition、movement timing 與 execution 由 Locomotion owner 持有；Interaction witness 若要求 terminal posture，execution 消費同一 witness。
- **Dynamic Congestion**：只從 current occupancy / movement context 派生 next-edge cost；不保存 persistent congestion truth。
- **Player-readable Entity View 與 Debug Inspector 共用同一 authoritative simulation state**；Presentation 只投影，不建立 competing truth。
- `slot reservation` 是 World-level temporary coordination state；Debug projection 可以顯示 reservation，但不得把 Agent-private preference / habit 誤投影成公共所有權。

## Core invariants

- 同一事實只有一個 authoritative truth；UI / Inspector / Memory 只能引用或派生。
- World fact 存在不代表所有 Agent 都知道；Agent-private state 不直接改寫另一 Agent 的 private state。
- action / intent / observation / memory / relationship 分層。
- Runtime hook 順序與 same-tick visibility 是 simulation semantics；未知、重複、缺失 registration 明確失敗。
- 導航使用 canonical movement geometry；互動使用 canonical Interaction Geometry；accessibility / ranking / replan / execution 共用同一 authority。
- Furniture footprint、Surface、Slot、Object location/support 各自分工；不以 entity coarse position 取代 interaction stance。
- Current floor Spatial Node 是 coarse `spaceId + surfaceId + x/y/z` identity；不保存 persistent sub-tile Agent position。

`src/release.js` 是 overall current runtime marker 的唯一 production owner。Subsystem generation 只在自己的 contract 改變時前進。