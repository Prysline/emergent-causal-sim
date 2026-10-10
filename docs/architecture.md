# Architecture — Current Runtime Contract

本頁是跨 subsystem 的**現行入口**。若與 current implementation / regression 衝突，以已實作且經測試的行為為準；`docs/archive/` 只供歷史追溯。

目前 runtime marker：`11.54.0-pickup-interaction-geometry`。

本 release 只改 Pickup Interaction Geometry；未改 subsystem 保持原有 authority / generation。

## Truth boundaries

- Canonical World Event 只有 `state.events / state.causes` 一份；Memory / UI / Inspector 只能引用或投影。
- World fact 不等於 Agent knowledge；跨 Agent 決策只能消費合法 observation / evidence。
- Agent-private cognition / memory / affect / relationship 不直接改寫另一 Agent 的 private state。
- `state.agentCarries` 與 Container-only `Agent.held` 分離；action / intent / observation / memory / relationship 不互相充當 mirror state。

## World / Spatial / Physical

Current World Authoring = `world-authoring-v13`；Furniture Catalog = `furniture-definitions-v12`。

Current Spatial Node identity = `spaceId + surfaceId + x/y/z`。`z` 是 World spatial dimension；Furniture `topElevation` 是 local geometry，兩者不得混為同一真相。

- Structural Floor 是 World support，不是 Furniture / ordinary Entity，也不建立 `supportId:'floor'`。
- Furniture metric `spatial.solids` 是 canonical obstruction geometry；eligible top face 派生 runtime Surface。
- Slot 是 occupancy / posture identity，不是 generic reach authority。
- Physical Profile 持有 body / locomotion capability；MovementEnvelope / PoseEnvelope 即時計算。
- Passage / Route / Locomotion 分別持有 edge geometry、route search、mode / transition burden與 execution。
- Current floor node 沒有 persistent `localX/localY`。

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

## Interaction Geometry / Pickup v1

詳細 contract：[`interaction-geometry.md`](interaction-geometry.md)。

- `pickup` 不由 Object type 或 authored `interactions.pickup` 永久決定。
- Floor：同一 Floor Spatial Node + legal low-posture witness；Human 優先 `kneelCrawl → kneeling`，必要時 `proneCrawl → prone`。
- Supported object：使用 object actual Surface cell 與 Surface-owned contact geometry，不擴張成整個 Furniture perimeter。
- Slot-bound actor：Slot 只證明 current stance；符合 Surface contact 才能直接 interaction，否則 normal egress / movement。
- ranking 的 terminal mode/posture burden與 execution使用同一 ephemeral witness；`isAtInteraction(...)` 驗完整 witness。
- support / holder / position 改變後即時重算；不跨 tick 保存無失效規則的 pickup route / witness。

本 slice 不新增 limb reach / IK、crouch、persistent sub-tile coordinate、chair→table mapping、Nav Cell 或 generic high-fidelity reach framework。

## Lifecycle / detailed owners

Runtime hook ordering：[`tick-pipeline.md`](tick-pipeline.md)。其餘 subsystem detailed authority 由各 current doc 與 regression 持有；本頁不複製其完整版本歷史。

Historical snapshot：`docs/archive/architecture-through-11.53.md`。該頁不是 current authority。
