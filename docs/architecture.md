# v10.1 架構說明

## 空間分層

v10.1 不以 Tile 取代 Zone，而是維持兩層空間：

### Zone / Room：語意層

Zone 繼續負責：

- 行動選擇與需求判斷。
- 噪音、休息品質等區域屬性。
- 「去哪裡吃飯／休息／補水」這類高階決策。

因此 Agent 仍有 `location: zoneId`。

### Tile / Coordinate：物理層

Spatial Grid 目前是 `12 × 8`。每格記錄：

```text
x / y
zone
walkable
staticBlockedBy
contents
furnitureIds
```

Agent、Container、Source 另外具有：

```text
position: { x, y }
```

`location` 與 `position` 同時存在；角色逐格移動時，跨過 Zone 邊界才同步更新 `location`。

## 行動 gate

舊 engine 在 `startPlan()` 後同一 tick 可能立刻執行 action。Spatial layer 不直接重寫整個 decision engine，而是在 `spatial.js` 為 Agent 的 `plan` 加入空間 prerequisite gate。

```text
plan 已存在
→ spatial.js 判斷目前 phase 需要的物理目標
→ 把物件／Agent／Zone 轉成 interaction tile
→ 還沒抵達：plan 對底層 engine 暫時呈現 spatial sentinel
→ A* 前進一格
→ 抵達：解除 gate
→ 原本 engine 繼續 eat / drink / talk / refill / rest ...
```

這讓既有行動鏈與 v9 補給模組可以保留，同時避免「畫面沿格子走，但核心已經把行動做完」的假 spatialization。

## v10.1 家具層

`furniture.js` 在 Spatial Grid 初始化後加入具體家具 footprint。家具目前不是純 UI：它會直接修改 tile 的 `walkable / staticBlockedBy / furnitureIds`。

第一版家具：

```text
餐桌 diningTable
footprint: (5,1) (6,1) (5,2) (6,2)
blocksMovement: true
supportsObjects: true

餐椅 chairNW / NE / SW / SE
各一格
occupiable: true
canRest: true

沙發 sofa
footprint: (9,1) (10,1)
occupiable: true
canRest: true
canSleep: true  # 只有 affordance，sleep system 尚未實作

大門 frontDoor
footprint: (0,6)
blocksMovement: true
canExit: true
```

現成食物、兩個杯子與酒瓶現在具有桌面 support 關係，位置固定在餐桌 footprint 上；角色不能直接走進餐桌格，而是停在桌邊 interaction tile。餐椅保持可占用，因此桌邊互動可以自然落在座位格。

`furniture.js` 也提供：

```text
interactionGoal(targetId, agentId)
isAtInteraction(agentId, targetId)
furnitureAtTile(tileId)
```

供補給與後續家具互動共用。

## v10.1 補給精確位置修正

v9 的補給 state machine 原本用：

```text
worker.location === doorway
worker.location === pantry
```

判斷「已經出門」與「已經到食物櫃」。在加入 Tile 後，這會讓角色只要跨進對應 Zone 就提前完成空間行為。

v10.1 改為：

```text
去補給
→ A* 走到 frontDoor 的 interaction tile
→ 才進入外出工作 phase

補給完成返家
→ A* 搬食物到 foodPantry 的 interaction tile
→ 才執行 depositFood()
```

所以「位於食物櫃旁 Zone」不再代表「已經碰到食物櫃」。

補給仍沿用 `wander` plan，但會額外寫入：

```text
__spatialGoal
__spatialGoalZone
__supplyTarget
```

讓既有 `bestZoneTile()` 可以鎖定家具／物件旁的精確格，而不必為 supply 重寫另一套 pathfinding。

## A* 與 occupancy

A* 使用四方向移動。固定物件與 `blocksMovement` 家具所在格不可通行；其他 Agent 所在格加入高成本，濕地也會增加成本，因此有其他路線時可以自然繞開。

餐椅與沙發屬於 `occupiable`：其 Tile 仍可通行／站立，因為這些格子代表角色可以坐入的位置，不是純障礙。

目前 occupancy 還不是完整多人交通模擬：Agent 不會協商讓路，也沒有門口 reservation。

## Surface 過渡

既有 engine 使用 `floor:<zone>` 聚合地面內容。Spatial Grid 暫時保留它作相容層，同時新增每格 `tile.contents`。

```text
Zone surface 增加
→ 投影到事件附近 tile

Zone surface 因清理／蒸發減少
→ 從該 Zone 的濕 tile 同步扣除
```

Spatial Grid 自己處理局部接觸：

- A* 讀取單格濕度成本。
- 貓踩到濕 tile 才把液體轉到 paws。
- 人踩到濕 tile 才做局部滑倒檢查。

後續再考慮由 tile surface 聚合出 Zone summary，最後移除 Zone surface 的物理權威性。

## UI

`spatial-ui.js` 把 `state.spatial` 畫成 CSS Grid。空 tile 不放任何字元；CSS 背景與極淡邊界提供格線。

`furniture-ui.js` 在 Spatial map 上補家具 footprint 與 Furniture Inspector。桌子、大門等 blocker 也會回填到 Tile Inspector 的「固定阻擋」。

`v101.css` 處理：

- 長行動文字換行與 action card 防爆版。
- 阿真／老周的穩定辨識色。
- 餐桌、椅子、沙發、大門的低對比家具視覺。

## Rest / Sleep 的位置

v10.1 已有沙發 `canRest / canSleep` affordance，但**尚未**把短休拆成正式 `shortRest / sleep`，也尚未加入床。

建議後續順序：

1. 實玩 v10.1，確認家具 footprint、桌邊互動、大門與補給返程都符合直覺。
2. 補 furniture reservation / 多人讓路等空間競爭。
3. 加入床或其他 Rest Surface。
4. 拆 `shortRest` / `sleep` commitment。
5. 最後才考慮 wake conditions（噪音、極端需求、鬧鐘、行程、trait）。