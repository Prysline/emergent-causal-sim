# v10.4 架構說明

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

Agent、Container、Source 具有：

```text
position: { x, y }
```

`location` 與 `position` 同時存在；角色逐格移動時，跨過 Zone 邊界才同步更新 `location`。

## v10.3 tick / phase 邊界

`action-guard.js` 避免同一個 tick 中連續完成多個物理階段：

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

因此 `physical co-location` 可以成立；多 Agent 同格只記錄到 `debug.validation.crowdingTiles`，不是 invariant violation。

v10.4 修正了一個與此原則衝突的舊分支：如果 plan 已經有明確 `__spatialGoal`（例如預約的沙發 slot），另一名 Agent 暫時經過目的 Tile 時，該目標仍保留。Soft crowding 只增加 A* 成本，不會因為一瞬間有人站在目的地就把已預約 slot 偷換成 Zone 任意位置。

真正不可達的 A* 路徑回 `[]`，不再用 `[start]` 假裝有路。

目前仍不是完整多人交通系統：角色沒有協商讓路、門口 reservation、交換位置動畫或長時間 crowding 後果。

## 持有物位置：單一有效來源

Portable Container 同時有 `heldBy` 與 `position`，但 v10.3 起明確區分語意：

```text
heldBy == null
→ container.position 是物件的落地／桌面位置

heldBy != null
→ 有效物理位置 = holder.position
→ container.position 不再被視為第二份必須完全同步的真實座標
```

`SimSpatial.objectPosition(containerId)` 在持有中直接回傳持有者位置。

## v10.4 Furniture：Footprint 與 Use Slot

`furniture.js` 現在把「家具本身在哪裡」與「角色實際使用哪個位置」分開。

家具可包含：

```text
id / name / kind / zone
footprint[]
displayAt
blocksMovement
supportsObjects
canRest / canSleep / canExit
restQuality
slots[]
```

每個 slot 可包含：

```text
id
furnitureId
label
position {x,y}
allowKinds[]
canRest
canSleep
mealSeat
restQuality
```

語意區分：

```text
footprint
→ 家具的物理占地與視覺連續範圍

slot
→ 一個角色可以實際占用／預約的使用位置
```

目前實例：

- `diningTable`：2×2 footprint、blocking、可承載物件，沒有角色使用 slot。
- 四張餐椅：每張單格 footprint + 1 個 human slot。
- `sofa`：2 格 footprint，但仍是 1 件 furniture；有 `sofa:left`、`sofa:right` 兩個 human slot。
- `frontDoor`：邊界上的 blocking exit furniture。

餐椅 B 已恢復 v10.1 最初的自然位置 `(7,1)`；之前移到 `(5,0)` 是為了配合單點 `mealTray` 的暫時 workaround，v10.4 已移除。

### Slot ownership / reservation

角色實際坐著時：

```text
seatedOn = furnitureId
seatSlot = slotId
posture = {
  kind: 'sitting',
  furnitureId,
  slotId
}
```

前往座位時則用：

```text
__slotTarget = slotId
```

`seatSlot` 是 exclusive use：同一 slot 同時只能有一名使用者；但同一件多座位家具可以有不同使用者。例如：

```text
阿真   seatSlot = sofa:left
老周   seatSlot = sofa:right
```

是合法狀態。

## State validator：v10.4 Slot invariant

`state-validator.js` 現在檢查：

- Agent 必須有 Tile 座標。
- `position` 所在 Zone 必須與 `location` 一致。
- `agent.held ↔ container.heldBy` 必須雙向一致。
- `carrying.amount` 必須有效。
- `seatSlot` 必須存在，角色必須真的站在該 slot position。
- `seatedOn` 必須與 slot 的 `furnitureId` 一致。
- 同一 slot 不可被兩名角色同時占用。
- 同一 slot 不可被兩名角色同時預約。
- `__eatAfterSeat / __restAfterSlot` 必須具有對應 `__slotTarget`。
- `supply.workerId ↔ supplyTask` 必須一致，且同時最多一個補給工作。

同一件多座位 furniture 被多人使用本身不再是錯誤。

## Meal seating

`seating.js` 已改成 slot-based state machine。

人類開始 `eat` plan 時：

```text
hunger >= 82
→ 不特地找座位，直接吃

否則
→ 找 mealSeat slot
→ slot 必須目前可用
→ 現階段還必須能從該 slot 直接和 mealTray interaction
→ 預約 slot
→ Spatial Grid 逐格移動到 slot
→ 記錄 seatedOn + seatSlot
→ 恢復原始 eat plan
```

如果當下可直接取食的 seat slot 已被占用／預約，就允許站著吃，不會等待到有位為止。

### 為何四張餐椅不是四張都能坐著吃

目前 `mealTray` 仍有單一 Tile 位置 `(5,1)`，而 `slotCanInteract()` 目前只認同同格或四方向相鄰。因此餐椅恢復自然布局後，只有真的能從座位直接碰到餐盤的 slot 才能在現有模型中「坐著取食」。

這是刻意留下的限制，不再以移動家具位置修補。

較自然的後續解法：

```text
Serving / Plate
食物來源 → 盛一份到可攜盤子 → 帶到任意座位 → 吃 → 留下空盤
```

或把桌面物件的 interaction 擴展成整張 `supportId` 桌子的合法 perimeter。兩者目前都尚未實作。

## Rest Surface

v10.4 新增 `rest-surface.js`，人類短休不再只選 Zone。

流程：

```text
rest plan
→ 找 canRest slot
→ 綜合：原本 target Zone / path / 暫時 crowding / restQuality
→ 預約 __slotTarget
→ 逐格走到 slot
→ seatedOn + seatSlot
→ 恢復原本 rest plan
→ 持續逐 tick 恢復
```

如果預約 slot 途中變得不可用，會找另一個可用 slot；如果完全沒有 Rest Surface 可用，才退化成 standing rest。

雙人沙發兩個 slot 獨立，因此一個人坐左側，不會把整張 sofa 宣告成已占滿；另一個人仍能使用右側。

### Rest Surface 與恢復效率

`recovery.js` 現在把休息效率拆成：

```text
baseEfficiency
= Zone restQuality + 即時 noise

surfaceMultiplier
= 目前 posture / Rest Surface 品質

restEfficiency
= baseEfficiency × surfaceMultiplier
```

目前人類：

- 坐在 `canRest` slot 上：依 slot / furniture `restQuality` 得到約 0.9～1.15 的 surface multiplier。
- 沒有 Rest Surface、站著休息：`surfaceMultiplier = 0.72`。

貓暫時不套用人類家具的 standing penalty。

完整睡眠仍未實作；沙發的 `canSleep` 目前仍只是 affordance。

## Regression / CI

`.github/workflows/state-regression.yml` 執行 `tests/state-regression.mjs`。

目前包含：

- Seed `20260911 / 7 / 42` 各 800 tick，每 tick 驗證 invariant。
- 移動 tick 不得同時吃掉食物。
- 拿杯子的同一 tick 不得同時取水。
- 真正無路時 A* 必須回 `[]`。
- 狹窄路徑只有經過其他 Agent 所在 Tile 才可通行時，A* 仍必須找到路。
- Agent 共用 Tile 本身不算錯誤，但要出現在 crowding debug。
- 持有物有效位置由 holder 決定。
- 餐椅 B 必須在原始 `(7,1)`。
- sofa 必須有左右兩個獨立 slot。
- 兩人使用不同 sofa slot 必須合法，同一 slot 重複占用必須報錯。
- 兩名人類同時休息時，應可分配到 sofa 左右 slot。
- sofa seated rest 的恢復效率必須高於 standing rest。
- 唯一直接可取食 meal slot 已占用時，另一名角色允許站著吃。
- Spatial / Furniture UI 不再靠 `MutationObserver` 維護 Inspector selection。

## Inspector selection

v10.3 起主 UI 使用單一 selection state：

```text
{ type, id }
```

Tile、Furniture、Agent、Container、Source、Surface、Zone、Event 都走同一條 selection / renderInspector 流程；Spatial / Furniture UI 只提供 renderer / map enhancer。

Furniture Inspector 目前仍以 furniture / footprint 為主要顯示單位；slot occupancy 尚未拆成獨立 Inspector 面板。Agent 行動標籤與 runtime validator 已能區分 slot。

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

## Sleep 的位置

v10.4 已完成短休對 Rest Surface slot 的選擇與恢復倍率，但尚未正式加入 `sleep`。

目前：

```text
short rest
→ Rest Surface slot
→ sitting
→ 逐 tick fatigue recovery
```

尚未加入：

```text
sleep commitment
bed
sleep debt
sleep need / efficiency
wake conditions
alarm / schedule
early-riser trait
```

沙發資料具備 `canSleep`，但這仍只代表物件 affordance，不代表睡眠行為已存在。