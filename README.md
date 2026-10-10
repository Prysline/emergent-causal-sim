# Emergent Causal Simulator

湧現式因果模擬器：以少量、底層且可組合的規則，產生可追溯的因果鏈與湧現行為。

目前 runtime marker：`11.54.0-pickup-interaction-geometry`。

Current release 將 portable-object `pickup` 收回 current canonical support/location：Floor object 需同一 Floor Spatial Node + 合法 Human low posture；Furniture-supported object 使用實際 Surface cell 與 Surface-owned contact geometry；Slot 只提供 Agent current occupancy witness，不建立 Chair → Table reach。

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

## Core invariants

- 同一事實只有一個 authoritative truth；UI / Inspector / Memory 只能引用或派生。
- World fact 存在不代表所有 Agent 都知道；Agent-private state 不直接改寫另一 Agent 的 private state。
- action / intent / observation / memory / relationship 分層。
- Runtime hook 順序與 same-tick visibility 是 simulation semantics；未知、重複、缺失 registration 明確失敗。
- 導航使用 canonical movement geometry；互動使用 canonical Interaction Geometry；accessibility / ranking / replan / execution 共用同一 authority。
- Furniture footprint、Surface、Slot、Object location/support 各自分工；不以 entity coarse position 取代 interaction stance。
- Current floor Spatial Node 是 coarse `spaceId + surfaceId + x/y/z` identity；不保存 persistent sub-tile Agent position。

`src/release.js` 是 overall current runtime marker 的唯一 production owner。Subsystem generation 只在自己的 contract 改變時前進。
