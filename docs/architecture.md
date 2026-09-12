# v10.3 架構說明

## 空間分層

v10+ 不以 Tile 取代 Zone，而是維持兩層空間。

### Zone / Room：語意層

Zone 繼續負責：

- 行動選擇與需求判斷。
- 噪音、休息品質等區域屬性。
- 「去哪裡吃飯／休息／補水」這類高階決策。

Agent 仍保留 `location: zoneId`。

### Tile / Coordinate：物理層

Spatial Grid 是 `12 × 8`。每格記錄：

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

## v10.3 tick / phase 邊界

v10.3 新增 `action-guard.js`，避免同一個 tick 中連續完成多個物理階段。

```text
每 Agent 每 tick

1. 若需要移動
   → 最多移動一格
   → 本 tick 不再推進下一個 interaction phase

2. 若已在合法 interaction position
   → 最多推進一個 action phase

3. phase 在本 tick 改變
   → 新 phase 留到下一 tick
```

因此不再出現「這一 tick 剛走到杯旁，同一 tick 又拿杯、去水源、倒水」這種壓縮行為。

## A*、occupancy 與 soft crowding

A* 使用四方向移動。固定物件與 blocking furniture footprint 不可通行；濕 Tile 會提高移動成本。

Agent occupancy 採 **soft crowding**，不是一格一人：

```text
其他 Agent 在某 Tile
→ 該 Tile path cost 增加
→ 有合理替代路線時通常會繞開
→ 沒有替代路線時仍可穿過／共用
```

因此：

- `physical co-location` 可以成立。
- `agent_tile_overlap` 不再是 invariant violation。
- `validateState()` 會把多 Agent 同格記到 `crowdingTiles`，供 debug / 之後的擁擠系統使用。
- 真正互斥的是 ownership / reservation，例如同一張單人椅不能被兩人同時 `seatedOn`。

真正不可達的 A* 路徑回 `[]`，不再用 `[start]` 假裝有路。

目前仍不是完整多人交通系統：角色沒有協商讓路、門口 reservation、交換位置動畫或長時間 crowding 後果。

## 持有物位置：單一有效來源

Portable Container 同時有 `heldBy` 與 `position`，但 v10.3 明確區分語意：

```text
heldBy == null
→ container.position 是物件的落地／桌面位置

heldBy != null
→ 有效物理位置 = holder.position
→ container.position 不再被視為第二份必須完全同步的真實座標
```

`SimSpatial.objectPosition(containerId)` 會在持有中直接回傳持有者位置。Validator 檢查的是 `agent.held ↔ container.heldBy` ownership 是否一致，以及有效位置是否正確，而不是要求持有期間的快取欄位每 tick 完全相同。

## State validator

`state-validator.js` 是 v10.3 的 runtime invariant 層。每 tick 可檢查：

- Agent 必須有 Tile 座標。
- `position` 所在 Zone 必須與 `location` 一致。
- `agent.held ↔ container.heldBy` 必須雙向一致。
- `carrying.amount` 必須有效。
- `seatedOn` 必須指向存在家具，且角色真的在該 footprint。
- 同一 seat 不可被兩名角色同時宣告占用。
- `supply.workerId ↔ supplyTask` 必須一致，且同時最多一個補給工作。

多 Agent 同 Tile 不列入 issue；改記：

```text
debug.validation.crowdingTiles
```

## Regression / CI

`.github/workflows/state-regression.yml` 會執行 `tests/state-regression.mjs`。

目前測試包含：

- Seed `20260911 / 7 / 42` 各 800 tick，每 tick 驗證 invariant。
- 移動 tick 不得同時吃掉食物。
- 拿杯子的同一 tick 不得同時取水。
- 真正無路時 A* 必須回 `[]`。
- 狹窄路徑只有經過其他 Agent 所在 Tile 才可通行時，A* 仍必須找到路。
- Agent 共用 Tile 本身不算錯誤，但要出現在 crowding debug。
- 持有物有效位置由 holder 決定。
- Spatial / Furniture UI 不再靠 `MutationObserver` 維護 Inspector selection。

## Inspector selection

v10.2 曾同時存在：

```text
ui.js selected
spatial-ui.js selectedTile
Furniture 直接覆寫 Inspector DOM
```

這會造成「先點 Tile，再點家具沒反應」與 observer 反覆覆寫。

v10.3 改成主 UI 單一 selection state：

```text
{ type, id }
```

Tile、Furniture、Agent、Container、Source、Surface、Zone、Event 都走同一條 selection / renderInspector 流程；Spatial / Furniture UI 只提供 renderer / map enhancer，不再私自維護 Inspector 狀態。

## Furniture layer

`furniture.js` 在 Spatial Grid 之上提供家具資料與 interaction helper。

家具基本資料可包含：

```text
id / name / kind / zone
footprint[]
displayAt
blocksMovement
occupiable
supportsObjects
canRest
canSleep
canExit
mealSeat
restQuality
```

目前實例：

- `diningTable`：2×2 footprint、blocking、可承載物件。
- `chairNW / chairNE / chairSW / chairSE`：四張單格可占用餐椅，皆可作目前的 meal seat 候選。
- `sofa`：2 格 footprint、可占用、可短休，保留 `canSleep` affordance。
- `frontDoor`：邊界上的 blocking exit furniture。

Furniture interaction 也採 soft crowding：interaction goal 會優先選沒人的格子，但如果所有合法位置都有人，物理上仍可共用；座位本身是否能被使用，則由 seating reservation / occupancy 額外控制。

桌面物件使用：

```text
container.supportId = 'diningTable'
```

表示「物件位於桌面」與「角色可走格」分開；角色不需要踩進物件所在格。

## Meal seating

`seating.js` 是目前第一個真正使用 `occupiable furniture` 的行為模組。

人類角色開始 `eat` plan 時：

```text
若 hunger < 82
→ 尋找 mealSeat
→ 排除被其他角色占用或已預約的座位
→ 先建立 temporary seat-move plan
→ Spatial Grid 把角色逐格送到該餐椅
→ 抵達後記錄 seatedOn
→ 恢復原始 eat plan
```

若飢餓 ≥ 82、沒有空位，或途中失去可用座位，角色仍可站著吃。

### 座位 reservation

同一 tick 多人要吃飯時，`seating.js` 會把：

```text
seatedOn
__seatTarget
plan.__seatId
```

視為已占用／預約資訊，避免兩個人同時選同一張單人椅。

目前更理想但尚未完成的方向，是讓桌面物件透過 `supportId` 取得整張桌子的 interaction perimeter，而不是只依物件本身單一座標。這樣四張餐椅都能更自然地成為真正的餐桌座位。

## 為什麼目前沒有「坐著吃比較省疲勞」

現有 `eat` action 本身沒有 `applyExertion`。因此若現在為了讓坐著看起來有優勢，先硬加一筆「站著吃的疲勞成本」再讓座位打折，會製造沒有其他系統依據的假差異。

目前只實作：

- 座位偏好。
- 座位占用／預約。
- `seatedOn` / `posture` 狀態。

未來若加入閱讀、製作、長時間社交、休閒等多 tick 靜態活動，再讓 `posture / seat quality` 影響持續活動成本。

## Supply correctness

外出補給使用精確 furniture interaction：

```text
外出
→ 必須到 frontDoor interaction position
→ 才進入外部工作

返程
→ 必須到 foodPantry interaction position
→ 才能 depositFood()
```

只進入 doorway / pantry Zone 不足以完成空間 prerequisite。

## Surface 過渡

既有 engine 仍使用 `floor:<zone>` 聚合地面內容；Spatial Grid 同時維護 `tile.contents`。

```text
Zone surface 增加
→ 投影到事件附近 Tile

Zone surface 因清理／蒸發減少
→ 從該 Zone 的濕 Tile 同步扣除
```

Spatial Grid 自己處理局部接觸：

- A* 讀取單格濕度成本。
- 貓踩到濕 Tile 才把液體轉到 paws。
- 人踩到濕 Tile 才做局部滑倒檢查。

後續目標仍是讓 Tile surface 成為主要物理來源，Zone 只保留 summary。

## Rest / Sleep 的位置

目前仍只有短休模型；尚未正式拆成 `shortRest / sleep`。

沙發資料已具備 `canRest / canSleep / restQuality`，但 `canSleep` 目前只是 affordance，**不代表睡眠系統已實作**。

較自然的後續順序：

1. 讓 `rest` 真正選擇 Rest Surface／座位，而不是只選 Zone。
2. 座位品質影響持續休息恢復。
3. 再拆 `shortRest / sleep` commitment。
4. 最後才加入 wake conditions、sleep debt、鬧鐘／行程與 trait。