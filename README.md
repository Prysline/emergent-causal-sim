# Emergent Causal Simulator

湧現式因果模擬器：以少量、底層且可組合的規則，產生可追溯的因果鏈與湧現行為。

目前 runtime marker：`11.58.0-object-containment`。

Current release 建立 Object containment v1：Object 以 `containedBy` 保存唯一 canonical containment relation，Furniture Definition 以 `objectContainment:true` 宣告 capability；Contained Object 不保存自己的 `position`，Spatial 由 containing Furniture 推導 effective location。第一個 consumer 是 Bookshelf，提供最基本 `Held ↔ Contained` lifecycle 與必要 Editor / Presentation projection；不加入 autonomous storage policy、nested containment、capacity / packing 或 generic storage framework。

Object containment v1 建立 Object-side `containedBy: furnitureId` canonical relation；第一代只允許 `objectContainment:true` Furniture target，Bookshelf 是第一個 consumer。Held / Contained / Supported / Free 為互斥的 derived location classification；Contained Object 不保存自己的 `position`，effective location 由 Spatial 經 Furniture 推導，Furniture 不保存反向 canonical `contents[]`。`Held ↔ Contained` 只提供底層 canonical lifecycle，不加入 housekeeping / habit / autonomous storage policy；既有 bulk food / Resource Container 語意維持不變。

前一個 `11.57.1-slot-approach-arrival` 已修正 Furniture Slot-use arrival：chooser-time approach winner 只作 ephemeral navigation witness；`sleep`、`rest` 與 Human `meal` execution 以 current `slotApproachNodes()` 判斷是否已抵達任一合法 approach。

## Current authority navigation

- [`docs/architecture.md`](docs/architecture.md)：跨 subsystem 現行工程契約
- [`docs/versioning.md`](docs/versioning.md)：版本與 marker ownership
- [`docs/interaction-geometry.md`](docs/interaction-geometry.md)：Interaction Geometry / Pickup 詳細契約
- [`docs/tick-pipeline.md`](docs/tick-pipeline.md)：runtime hook ordering
- [`docs/agent-carry-relocate.md`](docs/agent-carry-relocate.md)：Agent Carry
- [`docs/mental-regulation.md`](docs/mental-regulation.md)：Mental Regulation
- [`docs/daily-life-routine.md`](docs/daily-life-routine.md)：Daily Life Routine
- [`docs/reading-activity.md`](docs/reading-activity.md)：Reading Activity
- [`docs/development-workflow.md`](docs/development-workflow.md)、[`docs/pr-preflight.md`](docs/pr-preflight.md)：工程流程 / preflight

11.53 以前累積在 README / Architecture / Versioning 的全文 snapshot 保留於 `docs/archive/`，只供追溯，不是現行規格。

## Current subsystem boundary index

- **Object Domain**：具體 physical item 的 canonical identity 只在 `state.objects`；`resourceContainer:true` 與 Furniture-side `objectContainment:true` 都是可組合 capability，不建立平行 entity taxonomy。Object containment 的 canonical relation 只在 child Object 的 `containedBy`；Furniture 的 reverse contents 只能投影。Generic physical handling 由 `SimObjectHandling` 持有，Resources 只消費 Resource-container capability。
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