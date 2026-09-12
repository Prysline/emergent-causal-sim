# v10.2 架構說明

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

## 行動 gate

舊 engine 在 `startPlan()` 後同一 tick 可能立刻執行 action。`spatial.js` 以 prerequisite gate 阻擋這件事：

```text
plan 已存在
→ 判斷目前 phase 的物理目標
→ 轉成 interaction tile
→ 尚未抵達時，底層 engine 暫時只看到 spatial sentinel
→ A* 前進一格
→ 抵達後解除 gate
→ 原本 eat / drink / talk / refill / rest ... 繼續
```

因此角色不是「畫面上在走，但核心早就做完」。

## A* 與 occupancy

A* 使用四方向移動。固定物件與 blocking furniture footprint 不可通行；其他 Agent 所在格加入較高成本；濕 Tile 也提高成本。

目前 occupancy 仍不是完整多人交通模擬：角色不會協商讓路，也沒有狹窄門口 reservation。

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
- `chairNW / chairNE / chairSW / chairSE`：單格可占用餐椅，其中 A / B 是目前用餐優先座位。
- `sofa`：2 格 footprint、可占用、可短休，保留 `canSleep` affordance。
- `frontDoor`：邊界上的 blocking exit furniture。

桌面物件使用：

```text
container.supportId = 'diningTable'
```

表示「物件位於桌面」與「角色可走格」分開；角色不需要踩進物件所在格。

## Furniture Inspector / footprint UI

`furniture-ui.js` 會在每個家具 footprint Tile 上疊一層低對比、可點擊的連續 footprint。

- 同一家具相鄰格會移除內側視覺邊界，讓 2 格沙發、2×2 餐桌看起來是一件家具。
- 不再逐格顯示「桌面」文字。
- 點 footprint 任一格會開 Furniture Inspector。
- Furniture Inspector 顯示 Zone、Footprint、占用者、承載物件與 affordance。
- Agent Inspector 若角色目前坐著，會補上 `坐在：<家具>`。

`spatial-ui.js` 的 Tile click handler 會主動略過 `[data-furniture]`，避免先吃掉 furniture click event。

## Meal seating：v10.2

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

若：

- 飢餓 ≥ 82；
- 沒有空位；
- 前往途中座位被占用且無替代座位；

則角色可直接站著吃。

為了不與現有單點 mealTray interaction 衝突，目前兩張 `mealSeat` 放在 mealTray 的合法 interaction tile 上。這是過渡做法；後續更理想的是讓桌面物件透過 `supportId` 取得整張桌子的 interaction perimeter，而不是只依物件本身單一座標。

### 座位 reservation

同一 tick 多人要吃飯時，`seating.js` 會把：

```text
seatedOn
__seatTarget
plan.__seatId
```

視為已占用／預約資訊，避免兩個人同時選同一張椅子。

## 為什麼目前沒有「坐著吃比較省疲勞」

現有 `eat` action 本身沒有 `applyExertion`。因此若現在為了讓坐著看起來有優勢，先硬加一筆「站著吃的疲勞成本」再讓座位打折，會製造沒有其他系統依據的假差異。

目前只實作：

- 座位偏好。
- 座位占用／預約。
- `seatedOn` posture state。

未來若加入閱讀、製作、長時間社交、休閒等多 tick 靜態活動，再讓 `seatedOn / seat quality / posture` 影響持續活動成本會更合理。

## Supply correctness

v9 外出補給在 v10.1 後已改為讀取精確 furniture interaction：

```text
外出
→ 必須到 frontDoor interaction position
→ 才進入外部工作

返程
→ 必須到 foodPantry interaction position
→ 才能 depositFood()
```

只進入 doorway / pantry Zone 不再足夠。

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