# Emergent Causal Simulator

湧現式因果模擬器：以少量、底層且可組合的規則，產生可追溯的因果鏈與湧現行為。

目前 runtime marker：`11.57.1-slot-approach-arrival`。

Current release 修正 Furniture Slot 使用者把 chooser-time approach winner 誤當成跨 tick 唯一抵達位置的問題。`sleep`、`rest` 與 Human `meal` 仍使用 canonical `slotApproachNodes()` 作為目前合法的 approach truth；`bestSlotApproachNode()` 選出的 winner 只作 ephemeral navigation witness。Action execution 若途中已站在同一 target Slot 的另一個 current legal approach，會停止追逐舊 witness並進入 settle / sit；實際 settle 仍在下一個 core tick 重驗 activity capability、Pose fit、availability / reservation 與 current approach。Furniture Definition、Slot `approachEdges`、Spatial / Route geometry 與 Sleep conflict policy 都沒有因此改變；Spatial、Sleep Slot Conflict、Deliberation、Furniture 等既有 subsystem generation 不假升版。

`11.57.0-sleep-animal-conflict` 建立的 preferred Sleep Slot Human / Animal resolution policy 仍維持 current contract：wake success 與實際 Slot release 分離，同一 sleep conflict episode 會依「wake 後 occupancy 持續」等因果結果抑制重複喚醒，而不是使用 retry counter；awake Animal 的 move-away interaction 會先經可觀察 World Bid，再由 Animal 自己形成 departure Intent / Movement Action。Sleeping Animal relocation candidate 僅使用 requester 可取得的 observation、公開 embodiment contract、canonical Slot / Physical legality、objective sleep quality 與 relocation cost，不讀 occupant-private Usage preference 或 hidden instance physical state。

Direct Object Unification 的 current contract 維持不變：所有具體 physical item 只存在於 canonical `entities.objects / state.objects`；Resource Container 以 Object 上的 `resourceContainer:true` capability 表達。`Agent.held` 仍是唯一 held physical Object relation，ordinary Object 與 Resource-container Object 共用 generic Object handling / Physical traversal / intentional nearby-placement lifecycle；既有 bulk food 仍暫時存在 Resource-container Object 的 `contents.food`，Object containment / bookshelf 與 Food Object migration 都不屬本 release。

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

- **Object Domain**：具體 physical item 的 canonical identity 只在 `state.objects`；`resourceContainer:true` 是可組合 capability，不是平行 entity taxonomy。Generic physical handling 由 `SimObjectHandling` 持有，Resources 只消費 Resource-container capability。
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