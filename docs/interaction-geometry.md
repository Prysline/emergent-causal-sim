# Interaction Geometry — Current

12×8 Tile grid 仍負責真正的移動與站位；Interaction Geometry 負責回答：**這個 Agent 要用某個 affordance 操作某個 target 時，哪些 Tile 是合法操作位置？**

## 正式分工

```text
Tile / A*
→ 角色真正移動與站位

Furniture footprint
→ 家具實際占地

Furniture slot
→ 坐、躺、睡、出口等精確使用位置

Interaction port
→ 固定設備可從哪些 Tile 操作

Support reach
→ 家具承載物從哪些外圍 Tile 可及

Affordance rule
→ 同一 target 在不同動作下可使用不同 geometry
```

## API

```text
interactionGeometry(state, target, agent, affordance)
interactionPositions(state, target, agent, affordance)
bestInteractionPositionResult(state, agent, target, affordance)
bestInteractionPosition(state, agent, target, affordance)
isAtInteraction(state, agent, target, affordance)
```

`bestInteractionPositionResult(...)` 是 additive richer-result API，回傳 `{ position, traversalCost }` 或 `null`。其中 `position` 與既有 `bestInteractionPosition(...)` 的 winner 完全一致，`traversalCost` 是該 winner 在同一次 batched interaction-position scoring 已計算出的 canonical traversal cost。

既有 `bestInteractionPosition(...)` 保持 **position-only** public contract，作為 compatibility wrapper；不得改成物件回傳。richer result 只重用同步 winner scoring 的已派生結果，不建立 persistent / cross-tick cache，也不代表 action execution 可以沿用完整 route plan。

## Action consumer contract

Interaction Geometry 不只屬於 Action 的最後移動階段。只要 consumer 正在判斷「能否接近某個互動目標」或比較互動目標的客觀 access cost，initial chooser、Intent deliberation、hard replan、Memory target evaluation 與 Action execution 都必須使用同一份 geometry：

- Object / Source / Agent 不得直接以 entity `position` 做 interaction reachability / ranking shortcut；
- slot-bound **target** Agent 的 coarse `position` 仍是 Slot anchor，social contact 必須走 `socialReach → agentContactNodes() → slotApproachNodes()`；
- slot-bound **actor** 的 coarse `position` 也不是 locomotion route origin。Interaction winner scoring 必須從合法 `slotEgressNodes()` 做 multi-source access query；execution 離座時選同一 target-compatible egress。若 actor 在目前 Slot posture 已經能直接 interaction，該 current-contact 仍是 0-cost candidate且不得強制 egress；
- target ranking 若只需要 winner + 客觀成本，優先使用 `bestInteractionPositionResult(...)` 已算出的 canonical `traversalCost`；
- Action 真正移動時仍重新查詢當下 geometry，不把較早的 winner 或 route 永久快取；
- Furniture Slot 的坐／躺／睡／用餐 settle 是獨立 Slot contract：先 route 到合法 Slot approach，再 settle；不能把 Slot anchor 當 floor route destination。

ordinary floor exact target（例如清理某格地板）不是 interaction target，仍可直接走正式 floor Route。

目前 mode：

- `occupy`：必須占據指定位置；不因八方向 Contact 自動擴張。
- `reach`：同 Node 或 local-neighbor Contact；floor / cross-surface local reach 現支援 cardinal + diagonal。
- `supportReach`：承載家具的 local contact 外圍與合法 Surface node；沿用同一 Contact corner rule。
- `port`：只允許資料指定的 interaction port。
- `slotApproach`：Furniture Slot 的 approach / settle / egress 候選；Slot 本身不是 ordinary floor traversal target。
- `socialReach`：Agent 間同格／local-neighbor Contact；slot-bound target 由 Slot approach/contact geometry 派生。
- `tileContact`：直接和 Tile 接觸。
- `heldReach`：目標被 Agent 持有時依 holder 位置推導。

## 8-direction local Contact 與 Slot corner

Traversal 與 Contact 是不同問題。Diagonal floor traversal 的 B+ `HorizontalConnection / TraversalManeuver` 不得直接當成 `canContactDiagonal`。

對原本允許 local-neighbor 的 Contact mode，兩個 diagonal cells 之間以 shared corner 的兩條 L 型局部接觸路徑判定：

- 任一條路徑的兩段 cardinal side 都保有可確認 corner opening → diagonal Contact candidate。
- 單側 solid Boundary / closed Door 或 Furniture occlusion 只封掉其中一條路徑時，另一條仍開放即可接觸。
- 兩條路徑都被 Boundary / Door / Furniture 聯合封死 → blocked。
- 第一版遇到無法安全確認 opening 的局部幾何 → conservative reject；不把模糊 geometry 當成可接觸。
- `port / occupy / tileContact` 不因八方向 Contact 自動擴張；它們維持各自專屬 geometry contract。

Slot 不新增 `approachCorners`。Definition / resolved Slot 仍只保存 cardinal `approachEdges`。Diagonal corner 由兩個 incident sides 推導，例如 northwest = north + west；兩側都 authored/legal，且 outside corner 對兩個 side approach floor nodes 的 Passage × current MovementEnvelope 都可行時，才加入 direct diagonal settle / egress candidate。只有一側合法時必須先 route 到該 cardinal side；approach 與 egress 使用完全相同的 corner candidate source。

## Affordance-specific geometry

Entity 可以直接描述：

```js
interactions: {
  pickup: { mode: 'occupy' },
  drinkFrom: { mode: 'reach' }
}
```

因此一個大水桶可以要求「拾取時走進同 Tile」，但喝水時仍允許站在旁邊。v11.6 雖然已經把 `affordance` 放進 API，v11.7 才正式讓它參與 geometry rule selection。

## Interaction port

Source 可以描述：

```js
interactions: {
  fill: { mode: 'port' }
},
interactionPorts: [
  {
    id: 'tap:west',
    position: { x: 5, y: 5 },
    edge: 'east',
    affordances: ['fill']
  }
]
```

`edge` 仍是 interaction metadata，不是第二套 pathfinding coordinate。

## Support reach

若 Container 有 `supportId` 且沒有更明確 affordance rule，Spatial 會從承載 Furniture 的完整 footprint 外圍與 slot 推導合法位置。桌面物件不再只認自己的單點座標。

## Dynamic blocker

Interaction Geometry 與 pathfinding 共用同一份實體世界。Tile 本身不保存 fixed object blocker cache；`blockerAt()` 每次依目前家具、fixed Container、Source 位置推導，因此物件移動後 interaction 與 pathfinding 不會讀到不同年代的空間狀態。

## 空間解析度策略

目前不提高 pathfinding resolution。只有當問題已經不是「從哪裡操作」，而是：

- 角色站位本身無法表達桌邊多人位置；
- 狹窄通道需要真正的擦身與堵路；
- 家具比例持續失真；
- 一格移動代表的實際距離過長；

才重新評估更細的 physical grid。
