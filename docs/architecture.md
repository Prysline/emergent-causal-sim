# Architecture — v11 Unified Core

> 本文件描述目前正式的重構架構。v10.4 以前的 wrapper / patch 設計只存在 Git history，不再是現行執行模型。

## 1. 核心原則

本專案的目標是用少量可組合規則形成可追蹤的湧現因果，而不是替每個情境寫事件腳本。

v11 重新確立以下單一真相：

- **Agent.position**：角色物理位置唯一真相。
- **Tile**：物理世界最小空間單位。
- **Room**：由牆、邊界與門的拓撲自動推導，不是手工環境加成區。
- **Furniture / Object / Agent**：局部 affordance、噪音、舒適與互動來源。
- **Activity Area / Zone**：若未來需要，只能作為用途／行政 overlay；不再直接提供噪音、休息品質或抵達判定。
- **Agent.action**：目前唯一行動狀態；沒有 `plan` 與 action wrapper 並存。
- **Agent.posture**：`standing / sitting / lying` 是正式世界狀態，UI 只讀取，不自行猜測。

## 2. 現行模組

```text
src/
├─ world.js            初始世界、Tile、家具、物件、角色資料
├─ spatial.js          純空間函式：A*、Room、interaction、局部環境
├─ engine.js           唯一 tick 與所有行動 phase／資源／恢復／補給
├─ state-validator.js  純 invariant 檢查，不包裝 tick
└─ ui.js               地圖、Inspector、時間線與操作 UI
```

已移除：

```text
action-guard.js
recovery.js / recovery-ui.js
supply.js / supply-ui.js
furniture.js / furniture-ui.js
seating.js
rest-surface.js
spatial-ui.js
styles/v101.css
styles/v103.css
```

這些功能沒有單純刪除，而是收回正式 core：

- exertion / recovery → `engine.js`
- supply loop → `engine.js`
- furniture / slot 定義 → `world.js`
- seating / rest surface → `engine.js` 的 action phase
- path / Room / environment → `spatial.js`
- Inspector enhancer → `ui.js`

## 3. 空間模型

### 3.1 Tile

12×8 map 現在具有實際地形：

```text
terrain: floor | wall | doorway
material
walkable
staticBlockedBy
surface.contents
roomId
furnitureIds
```

外圈是牆，左側有大門位置。餐桌、食物櫃、水桶、水龍頭等會真的影響 walkability。

### 3.2 Room

Room 不由名稱或用途決定，而是 `spatial.recomputeRooms()` 對可形成室內空間的 Floor Tile 做 flood fill。

目前小屋只有一個主室；未來加入隔間牆或可開關門後，可自然形成多 Room。

Room 可提供聚合資訊：

- floor area
- boundary walls / doors
- furniture list
- simplified room value
- average local noise
- average local comfort

目前 room value 使用簡化的 floor / wall material value + furniture value；不是嘗試完整複製 Dwarf Fortress 公式。

### 3.3 Activity Area / Zone

`state.activityAreas` 目前保留空資料結構，但 simulation 不使用。

未來如果加入：

- 醫療區
- 工作區
- 餐廳
- 禁區
- 垃圾傾倒區

它們應只改變「行為用途／政策／允許事項」，不能憑空改變環境噪音、舒適或物理可達性。

## 4. 局部環境

舊版 `zone.baseNoise` 與 `zone.restQuality` 已移除。

### 4.1 Noise

噪音來自帶座標的 `noiseEvents`：

```text
position
amount
ttl
kind
```

`noiseAt(position)` 依距離衰減；若未來 Room 分裂，不同 Room 的聲音會有額外衰減。

### 4.2 Comfort

`comfortAt(position)` 目前綜合：

- 附近 Rest Surface 品質
- 所在 Tile 是否有液體
- crowding
- local noise

它是**局部讀值**，不是 Zone 固定屬性。

角色的 persistent `wellbeing.comfort` 仍存在，代表累積狀態；`comfortAt()` 則代表當下環境。

## 5. Furniture / Slot

Furniture 拆成兩種資訊：

```text
footprint  → 物理占地、阻擋、承載
slots      → 角色實際使用位置
```

例如雙人沙發：

```text
sofa footprint
├─ (9,2)
└─ (10,2)

slots
├─ sofa:left
└─ sofa:right
```

兩名角色可以使用同一件家具的不同 slot；真正 exclusive 的是 slot，而不是 furniture id。

Slot 可以提供：

```text
canRest
canSleep
mealSeat
restQuality
allowKinds
```

v11 中沙發允許 human / cat；因此貓休息時可以真的坐／蜷在沙發，也可以選乾燥地板並進入 `lying` posture。

## 6. Interaction contract

行動不再詢問：

```text
Agent.location === Object.location ?
```

所有實體互動都使用：

```text
interactionPositions(target)
bestInteractionPosition(agent, target)
isAtInteraction(agent, target)
```

Target 類型包括：

```text
object
source
agent
furniture
slot
tile
```

因此角色和杯子即使剛好位於舊版不同 Zone 的邊界兩側，只要 Tile 上物理可互動，就可以直接拿取。

## 7. Action lifecycle

只有 `Agent.action`。

每個 tick 對每名 Agent 最多做一個 atomic transition：

```text
無 action
→ 選擇 action，tick 結束

有 action、尚未抵達
→ A* 前進最多一格，tick 結束

已抵達
→ 推進一個 phase，tick 結束
```

沒有 getter sentinel、沒有 action guard wrapper、沒有同 tick「走到 → 拿起 → 再走向水源」。

典型喝水：

```text
chooseVessel
→ toVessel
→ take
→ toSource
→ fill
→ drink
→ finish
```

典型短休：

```text
chooseSurface
→ move
→ settle
→ resting × N ticks
→ finish
```

典型補給：

```text
toDoor
→ exit
→ work × N ticks
→ returnPantry
→ deposit
→ finish
```

## 8. Movement / crowding

A*：

- 真正不可達 → `[]`
- 其他 Agent 所在 Tile → soft cost，不是 hard block
- 濕地 → 額外 cost
- 多 Agent 可以短暫共用 Tile

因此：

```text
physical co-location ≠ exclusive use
```

同 Tile 合法，但同一 slot / 同一手持容器 / 同一 supply worker 不可重複 ownership。

## 9. Ownership / reservation

v11 刪除多份雙向 truth。

### 手持容器

唯一 truth：

```text
Agent.held = containerId
```

Container 不再保存 `heldBy`。`holderOf(containerId)` 由 Agent state 推導。

### Slot / Object claim

暫時 exclusive 使用統一放在：

```text
state.reservations
```

例如：

```text
slot:sofa:left
object:mealTray
```

坐下後 slot occupancy 由 `Agent.posture.slotId` 表示，不需要另一份 `seatSlot / seatedOn` state。

## 10. Posture

```text
Agent.posture = {
  kind: standing | sitting | lying,
  slotId,
  furnitureId
}
```

- 移動會先站起來。
- 坐 slot 才進 `sitting`。
- 貓在合法地板休息會進 `lying`。
- UI 不根據 action 名稱猜姿勢。

## 11. Rest / recovery

休息效率不再讀 Zone：

```text
local noise
× Rest Surface quality / floor / standing multiplier
× Agent.recoveryRate
```

`exertionSensitivity` 與 `recoveryRate` 仍保持分離。

若局部噪音在休息初期大幅升高，角色可以重新選 Rest Surface。

完整 sleep 仍未實作；`canSleep` 只是 affordance 預留。

## 12. Resources / spill / wet floor

地面液體直接存在：

```text
Tile.surface.contents
```

不再維護 Zone surface 相容層。

因此：

- A* 只避開真正有液體的 Tile
- 人只在踩到該 Tile 時做滑倒判定
- 貓只在踩到該 Tile 時沾上 paws
- 倒水失敗直接把液體轉移到角色所在 Tile

## 13. Supply loop

v9 食物勞動閉環保留，但已整合成普通 action：

```text
supplyFood
```

只有 `state.supply.workerId` 是工作 ownership；移動、出門、工作、返家、走到 pantry、入庫全部走相同 action contract。

因此「還沒走到食物櫃就入庫」不再需要專門 Spatial patch。

## 14. Social commitment

目前保留簡單 `pendingInteraction` 與 action commitment：

- 橘子可主動找人撒嬌。
- 人若接受「摸橘子」行動，橘子之後走開，人仍可能追上去完成。

`interaction commitment strength` 已列為未來設計 memo，但 v11 尚未加入距離／時間／強烈中斷正式規則。

## 15. Validator

`state-validator.js` 是純檢查器，不包裝 tick，也不修正 state。

目前檢查：

- 舊 `zones / surfaces / plan / location / seatSlot / seatedOn` 不得回流
- Agent 必須位於合法 Tile
- Floor Tile 必須有 derived roomId
- posture / slot / position 一致
- 容器不可被兩人同時持有
- reservation 指向合法資源
- supply worker 與 action 一致
- carrying 數值合法
- crowding 只記 debug，不當作 error

## 16. Regression

`tests/v11-state-regression.mjs` 包含：

- 3 個 Seed × 800 tick invariant 長跑
- deterministic replay
- 每 tick 最多走一格
- 舊 Zone 邊界跨界取杯
- 貓休息必須產生正式 posture
- 雙人沙發不同 slot
- soft co-location
- 無餐椅時站著吃
- 補給必須實際走到 pantry 才入庫
- A* 不可達回 `[]`
- index 不可載入已刪 wrapper

GitHub Actions 另對所有 `src/*.js` 執行 `node --check`。

## 17. 尚未實作／未定案

- Serving / Plate：盛盤後帶到其他位置吃
- 完整 sleep / bed / wake conditions
- 自動 Room 分割後的門開關與聲音／溫度傳播
- Activity Area / Zone 的正式用途政策
- material / quality 對家具與 Room value 的完整資料模型
- 火、溫度、乾燥與材質
- 正式貨幣與經濟
- interaction commitment strength / max distance / interrupt priority

新增上述功能時，優先擴充既有 `Tile → affordance → action phase`，不要再新增包裝 `tick()` 的 patch module。
