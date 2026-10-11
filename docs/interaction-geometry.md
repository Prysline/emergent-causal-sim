# Interaction Geometry — Current

12×8 Tile grid 仍負責真正的移動與 coarse 站位；Interaction Geometry 負責回答：**這個 Agent 要用某個 affordance 操作某個 target 時，哪些 canonical stance / posture witness 是合法的？**

## 正式分工

```text
Tile / A*
→ 角色真正移動與 coarse floor 站位

Furniture footprint
→ 家具實際占地

Furniture Surface
→ support region 與合法 Surface contact geometry

Furniture Slot
→ 坐、躺、睡等精確 occupancy 位置 / posture；不建立第二份 Surface reach

Interaction port
→ 固定設備可從哪些 Tile 操作

Support reach
→ 非 pickup affordance 可依承載 Furniture 派生既有 contact 候選

Affordance rule
→ 非 pickup affordance 可讓同一 target 使用不同 geometry
```

同一事實只能有一個 authority。尤其是 Surface contact：**Furniture / Surface 決定哪裡可以接觸；Slot 只證明 Agent 實際佔據哪個 stance，不能宣告「這張椅子可碰哪張桌子／哪一側」。**

## API

```text
interactionGeometry(state, target, agent, affordance)
interactionWitnesses(state, target, agent, affordance)
interactionPositions(state, target, agent, affordance)
bestInteractionPositionResult(state, agent, target, affordance)
bestInteractionPosition(state, agent, target, affordance)
isAtInteraction(state, agent, target, affordance)
```

`interactionWitnesses(...)` 是 ephemeral derived query。一般 geometry 仍可只有 `{ position }`；需要 terminal posture 的 geometry（目前第一個 consumer 是 Floor `pickup`）可另外回 `{ position, requiredMode, requiredPosture }`。這些 witness 不保存到 simulation state，也不形成 cross-tick route cache。

`bestInteractionPositionResult(...)` 是 additive richer-result API，至少回傳 `{ position, traversalCost }` 或 `null`；需要 terminal interaction posture 時可同時帶 `interactionMode / requiredMode / requiredPosture`。既有 `bestInteractionPosition(...)` 保持 **position-only** compatibility contract，winner 的 `position` 與 richer result 一致。

`traversalCost` 必須包含該 winner 真正需要支付的 terminal posture transition burden；不能讓 ranking 認為已抵達同格就是 0-cost，execution 才臨時發現還要跪下／趴下。richer result 只重用同一次同步 winner scoring 的派生結果，不建立 persistent / cross-tick cache，也不代表 action execution 可以沿用完整 route plan。

## Action consumer contract

Interaction Geometry 不只屬於 Action 的最後移動階段。只要 consumer 正在判斷「能否接近某個互動目標」或比較互動目標的客觀 access cost，initial chooser、Intent deliberation、hard replan、Memory target evaluation 與 Action execution 都必須使用同一份 geometry / witness：

- Object / Source / Agent 不得直接以 entity `position` 做 interaction reachability / ranking shortcut；
- slot-bound **target** Agent 的 coarse `position` 仍是 Slot anchor，social contact 必須走 `socialReach → agentContactNodes() → slotApproachNodes()`；
- slot-bound **actor** 的 coarse `position` 也不是 locomotion route origin。Interaction winner scoring 必須從合法 `slotEgressNodes()` 做 multi-source access query；execution 離座時選同一 target-compatible egress。若 actor 在目前 Slot stance 已經能直接滿足 target 的 canonical Interaction Geometry，該 current-contact 是 0-cost candidate，不得為了 route query 強迫 egress；
- target ranking 若只需要 winner + 客觀成本，優先使用 `bestInteractionPositionResult(...)` 已算出的 canonical `traversalCost`；
- Action 真正移動／轉姿勢時仍重新查詢當下 geometry，不把較早的 winner 或 route 永久快取；
- `isAtInteraction(...)` 必須驗證完整 witness；只有位置相同但 required posture 不符，不能視為已可執行；
- Furniture Slot 的坐／躺／睡／用餐 settle 是獨立 Slot contract：先 route 到合法 Slot approach，再 settle；不能把 Slot anchor 當 ordinary floor route destination。

ordinary floor exact target（例如清理某格地板）不是 interaction target，仍可直接走正式 floor Route。

目前主要 mode：

- `occupy`：非 pickup affordance 可要求占據指定位置；不因八方向 Contact 自動擴張。
- `reach`：同 Node 或 local-neighbor Contact；floor / cross-surface local reach 支援 cardinal + diagonal。
- `supportReach`：非 pickup affordance 可使用承載家具的 local contact 外圍與合法 Surface node；沿用同一 Contact corner rule。
- `groundContact`：Floor `pickup`；同一 Floor Spatial Node，並可附 terminal low-posture witness。
- `surfaceContact`：Supported `pickup`；從 object **目前所在的 canonical Surface cell** 派生 local / exterior Surface contact stance。
- `port`：只允許資料指定的 interaction port。
- `slotApproach`：Furniture Slot 的 approach / settle / egress 候選；Slot 本身不是 ordinary floor traversal target。
- `socialReach`：Agent 間同格／local-neighbor Contact；slot-bound target 由 Slot approach/contact geometry 派生。
- `tileContact`：直接和 Tile 接觸。
- `heldReach`：目標被 Agent 持有時依 holder 位置推導。

## Pickup authority

`pickup` 是 current support/location-derived geometry，**不由 Object type 或 authored `interactions.pickup` 永久決定**。同一個杯子放桌上、掉到地上或已被持有時，Interaction Geometry 必須跟著 canonical current state 改變，不保存另一份「杯子天生可以從哪裡拿」的 truth。

### Floor pickup

當 portable object 的 current Spatial Node 是 Floor：

1. 合法位置只有 object 所在的**同一 Floor Spatial Node**；相鄰 cardinal / diagonal Tile 不是通用手臂 reach。
2. Human 必須採 current Physical / Locomotion 已支援且實際 fit 的低姿勢。
3. 第一版依序嘗試 `kneelCrawl → kneeling`；若 kneeling 不 fit 但 `proneCrawl → prone` fit，才使用 prone witness。
4. ranking 的 `traversalCost` 與 execution 使用同一 `requiredMode / requiredPosture`；姿勢切換不是免費 execution-only side effect。
5. 成功 pickup 後不強迫角色立即站回 standing；canonical posture 留待後續 locomotion / Action 需求改變時再處理。

這個 contract 不新增 crouch / bend / arm IK / limb length，也不把 floor Spatial Node 提升成 persistent sub-tile座標。

### Supported pickup

當 object 的 current position 由 `supportId` 解析到 Furniture Surface：

1. `supportId` 只指出 canonical support relation；實際 target node 必須是 object **目前所在的 Surface cell**。
2. pickup 由該 Surface cell 的 Surface-local / exterior Contact geometry 派生；不能退化成整個 Furniture footprint 周邊都可拿到任何 supported object。
3. standing Agent 以其實際 floor / Surface stance 與同一 contact geometry 比對。
4. seated Agent 若目前 `posture.slotId` 的實際 stance 已經對上同一 Surface 所允許的 contact candidate，可以直接 interaction；若沒有對上，就必須依正常 egress / movement 取得合法 stance。
5. 這不代表 Chair 提供 reach。Slot 不保存 table ID、contact side、reach radius 或 dining-table 特例。

因此 2×2 桌面不同 cell 上的物件可以有不同合法 contact stance；「同一張桌」本身不足以證明全部都可從任一桌邊取得。

### Support transition

`supportId` 被建立／移除或 object actual position 改變後，下次 geometry query 直接依新的 canonical state重算：

```text
杯子在桌面
→ surfaceContact

杯子掉到 floor
→ groundContact + same-node low posture

杯子被 Agent 持有
→ heldReach
```

不得跨 tick 保存沒有失效規則的 pickup route / witness，也不得讓初始化時寫入的 `pickup: reach / occupy` 繼續覆蓋新的 support state。

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

非 `pickup` affordance 仍可直接描述自己的 interaction rule，例如：

```js
interactions: {
  drinkFrom: { mode: 'reach' },
  fill: { mode: 'supportReach' }
}
```

這些 rule 只屬對應 affordance；不能被讀成 Object 的通用 reach truth。

`pickup` 刻意不再由 authored `interactions.pickup` 持有。Legacy / fixture 中若仍存在 `pickup:{mode:'occupy'|'reach'}`，runtime pickup query 必須忽略它並依 current support/location 派生；清理 legacy authoring metadata 是資料整潔問題，不得恢復成第二份 pickup authority。

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

`supportReach` 仍可服務既有**非 pickup** affordance。它從承載 Furniture 的 canonical geometry 派生 contact 候選，不建立另一份 object location truth。

對 `pickup` 不使用「完整 support footprint 外圍都可及」fallback；pickup 必須綁定 object 當下 actual Surface cell，否則會讓角色從桌子另一側拿到 coarse Surface 上任意物件。

## Support / holder invariant

Supported object 的 `supportId`、actual position與 derived Surface identity必須彼此一致：

- 被 Agent 持有的 Container 不得同時保留 `supportId`；
- `supportId` 必須解析到唯一 canonical support Surface；
- object actual position 必須落在該 Surface 的 `cells`；
- derived `objectNode(...)` 的 `surfaceId` 必須等於該 support Surface。

Validator 只檢查這些 canonical consistency invariant，不自行修補 state。

## Dynamic blocker

Interaction Geometry 與 pathfinding 共用同一份實體世界。Tile 本身不保存 fixed object blocker cache；`blockerAt()` 每次依目前家具、fixed Container、Source 位置推導，因此物件移動後 interaction 與 pathfinding 不會讀到不同年代的空間狀態。

## 明確不處理

本 release 不加入：

- metric limb reach、arm length、IK；
- crouch / bend 等新 posture；
- persistent sub-tile Agent position；
- Chair → Table mapping、Chair-owned contact side、seated reach radius；
- dining-table / cup / plate 等 type-specific pickup special case；
- Nav Cell / micro-grid；
- persistent / cross-tick interaction route cache。

## 空間解析度策略

目前不提高 pathfinding resolution。只有當問題已經不是「從哪裡操作」，而是：

- 角色站位本身無法表達桌邊多人位置；
- 狹窄通道需要真正的擦身與堵路；
- 家具比例持續失真；
- 一格移動代表的實際距離過長；

才重新評估更細的 physical grid。
