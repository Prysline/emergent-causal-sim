# Architecture — Current Runtime Contract

本頁是跨 subsystem 的**現行入口**。若與 current implementation / regression 衝突，以已實作且經測試的行為為準；`docs/archive/` 只供歷史追溯。

目前 runtime marker：`11.55.0-nearby-placement`。

本 release 新增 intentional held-container nearby placement；Pickup Interaction Geometry、Route、Locomotion、Physical 等未改 contract 的 subsystem generation 保持不變。

## Truth boundaries

- Canonical World Event 只有 `state.events / state.causes` 一份；Memory / UI / Inspector 只能引用或投影。
- World fact 不等於 Agent knowledge；跨 Agent 決策只能消費合法 observation / evidence。
- Agent-private cognition / memory / affect / relationship 不直接改寫另一 Agent 的 private state。
- `state.agentCarries` 與 Container-only `Agent.held` 分離；action / intent / observation / memory / relationship 不互相充當 mirror state。

## Resident Action / Intent / Explanation

這三層不能互相取代：

- **Action＝角色現在具體在做什麼**：由 canonical Action runtime 持有目前執行中的具體行為與進度。
- **Intent＝這個行動服務的短期目的**：`Agent.activeIntent` 是 Agent-private 短期目的；`action.intentId` 只作 Action → Intent linkage。
- **Explanation＝為什麼此刻選擇這個行動**：Presentation 只從 canonical Decision Evidence / state 投影可讀原因，不保存第二份 decision truth。**Explanation wording 優先自然直接**，不得為了玩家文案重算或改寫 simulation reasoning。

`Entity Readable View`、Resident View 與 Debug Inspector 都是 canonical simulation state 的 projection；不得把 presentation wording、summary 或 inferred relationship state 寫回 World / Agent truth。

## Relationship Foundation

Relationship 是 Agent-private directional state；`A → B` 與 `B → A` 分開保存，不建立 shared pair score。Relationship consolidation 只承接該 Agent 自己合法取得的 appraisal / experience evidence。

**Relationship → Responder Bias**：responder decision 可以消費 responder 自己的 canonical relationship state 作 bounded influence；Relationship 不直接替 responder建 Action、Intent 或 response outcome，也不把另一 Agent 的 private state變成共享真相。

## World / Spatial / Physical

Current World Authoring = `world-authoring-v13`；Furniture Catalog = `furniture-definitions-v12`。

Current Spatial Node identity = `spaceId + surfaceId + x/y/z`。`z` 是 World spatial dimension；Furniture `topElevation` 是 local geometry，兩者不得混為同一真相。

- Structural Floor 是 World support，不是 Furniture / ordinary Entity，也不建立 `supportId:'floor'`。
- Furniture metric `spatial.solids` 是 canonical obstruction geometry；eligible top face 派生 runtime Surface。
- Slot 是 occupancy / posture identity，不是 generic reach authority。
- Current floor node 沒有 persistent `localX/localY`。

### Physical Profile + Passage Profile / Multi-mode Feasibility

Physical Profile 持有 body / locomotion capability。`MovementEnvelope` / `PoseEnvelope` 都由 canonical profile 即時計算，不保存第二份 geometry cache。

`PassageProfile` 由 current edge / opening / structure geometry 即時計算；它描述 passage candidates 與 clearance context，不把 derived feasibility 寫回 Furniture、Tile 或 Agent state。`traversalFeasibility` 以 Agent 的 Physical capability / MovementEnvelope 消費同一 PassageProfile，回答可用 mode / maneuver；未知或不相容 geometry 必須明確失敗，不以 silent fallback 猜測可走。

### Route Semantics Split

Route consumer 必須區分：

- `pathDistance`：topology / metric path distance，不含個體 mode burden。
- `traversalCost`：目前 Agent 在 canonical geometry 下的 objective movement / transition burden。
- `travelTime`：可執行 movement plan 的時間成本。
- `accessPenalty`：Deliberation / target ranking 對 canonical accessibility burden 的 projection；不得用舊 `distancePenalty` 建第二套 route truth。

Navigation、target accessibility、ranking、replan 與 execution 必須消費同一 canonical movement / Interaction Geometry，不得用 entity coarse position 或 UI projection 取代 route target。

### Locomotion Execution + Posture Transition

Locomotion 持有 locomotion mode、posture transition burden、movement timing 與 execution。Route / Interaction witness 若要求 terminal mode / posture，execution 必須完成並驗證同一 witness；不能 ranking 時假設 kneeling/prone 成本、執行時卻略過 transition。

### Dynamic Congestion

Dynamic Congestion 只從 current occupancy / movement context 派生 next-edge delay / burden；不保存 persistent congestion truth，也不改寫 PassageProfile、Route topology 或 Agent-private preference。consumer 仍以當下 canonical route geometry 重算。

## Object support / effective location

```text
holder exists
→ effective location follows holder

else supportId exists
→ supportId → Furniture → unique canonical support Surface
→ object.position retains x/y/z and selects actual Surface cell

else
→ object.position → structural Floor Spatial Node
```

Current `supportsObjects:true` Furniture 必須恰好有一個 canonical support Surface；0 或 >1 明確失敗。Normal held lifecycle 與 `supportId` 互斥；Furniture / Surface 不保存反向 `objects[]` mirror。

### Intentional nearby placement v1

當 lifecycle-driven release 需要放下 held Container 時，Spatial candidate-selection 是唯一 nearby placement query owner：

- 只考慮 `supportsObjects:true` 且能解析到唯一 canonical support Surface 的 Furniture。
- v1 不建立新的 move-to-place action；候選必須是 Agent **目前所在 node 已可依既有 `supportContactNodes(...)` 接觸**的 Surface，避免把物件瞬移到幾步外的家具。
- 同一目前可接觸 Surface 內，以 actor 與 Surface cell 的 locality 排序，之後用 stable `supportId / surfaceId / nodeKey` tie-break；不加入 personality、habit、home、housekeeping 或 furniture preference。
- winner 寫 `container.position + supportId` 並清除 `Agent.held`；沒有合法 winner 時寫 actor current canonical Floor node 並保持無 `supportId`。
- accidental movement `containerDrop` 是另一條 handling consequence authority，仍落在 completed-edge current node，不經 nearby placement。

這一版只把 soft reconsideration 的既有 synchronous release 接上共用 helper；其他 release lifecycle 若未明確納入，不因共用函式存在而自動改語意。

## Interaction Geometry / Pickup v1

詳細 contract：[`interaction-geometry.md`](interaction-geometry.md)。

- `pickup` 不由 Object type 或 authored `interactions.pickup` 永久決定。
- Floor：同一 Floor Spatial Node + legal low-posture witness；Human 優先 `kneelCrawl → kneeling`，必要時 `proneCrawl → prone`。
- Supported object：使用 object actual Surface cell 與 Surface-owned contact geometry，不擴張成整個 Furniture perimeter。
- Slot-bound actor：Slot 只證明 current stance；符合 Surface contact 才能直接 interaction，否則 normal egress / movement。
- ranking 的 terminal mode/posture burden 與 execution 使用同一 ephemeral witness；`isAtInteraction(...)` 驗完整 witness。
- support / holder / position 改變後即時重算；不跨 tick 保存無失效規則的 pickup route / witness。

本 slice 不新增 limb reach / IK、crouch、persistent sub-tile coordinate、chair→table mapping、Nav Cell 或 generic high-fidelity reach framework。

## Lifecycle / detailed owners

Runtime hook ordering：[`tick-pipeline.md`](tick-pipeline.md)。其餘 subsystem detailed authority 由各 current doc 與 regression 持有；本頁不複製其完整版本歷史。

Historical snapshot：`docs/archive/architecture-through-11.53.md`。該頁不是 current authority。