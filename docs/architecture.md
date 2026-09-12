# Architecture — v11.2 Unified Core + Serving / Plate

> 本文件描述目前正式架構。v10.4 以前的 wrapper / patch 設計只存在 Git history，不再是現行執行模型。v11.2 開始在 Unified Core 上新增玩法，但仍維持單一 `engine.tick()` 與單一 action state machine。

## 1. 核心原則

本專案的目標是用少量可組合規則形成可追蹤的湧現因果，而不是替每個情境寫事件腳本。

現行單一真相：

- **Agent.position**：角色物理位置唯一真相。
- **Tile**：物理世界最小空間單位。
- **Room**：由牆、邊界與門的拓撲自動推導，不是手工環境加成區。
- **Furniture / Object / Agent**：局部 affordance、噪音、舒適與互動來源。
- **Activity Area / Zone**：若未來需要，只能作為用途／行政 overlay；不直接提供噪音、休息品質或抵達判定。
- **Agent.action**：唯一行動狀態；沒有 `plan` 與 action wrapper 並存。
- **Agent.posture**：`standing / sitting / lying` 是正式世界狀態，UI 只讀取，不自行猜測。
- **Container contents**：食物、水、酒等資源都存在真正容器／Tile endpoint 中；移動資源不複製另一份語意狀態。

## 2. 現行模組

```text
src/
├─ world.js            初始世界、Tile、家具、物件、角色資料
├─ spatial.js          純空間函式：A*、Room、interaction、局部環境
├─ engine.js           唯一 tick 與所有行動 phase／資源／恢復／補給／用餐
├─ state-validator.js  純 invariant 檢查，不包裝 tick
└─ ui.js               地圖、Inspector、時間線與操作 UI
```

歷史 patch layer（`action-guard / recovery / supply / seating / rest-surface / spatial-ui / furniture-ui` 等）已移除。功能已收回正式 core，而不是另外包裝 `tick()`。

## 3. 空間模型

### 3.1 Tile

12×8 map 具有實際地形：

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

Room 由 `spatial.recomputeRooms()` 對可形成室內空間的 Floor Tile 做 flood fill。目前小屋只有一個主室；未來加入隔間牆或門後，可自然形成多 Room。

Room 可聚合：floor area、boundary walls / doors、furniture list、simplified room value、average local noise、average local comfort。

### 3.3 Activity Area / Zone

`state.activityAreas` 目前保留空資料結構，但 simulation 不使用。若未來加入醫療區、工作區、餐廳、禁區等，只能影響用途／政策／允許事項，不能憑空改變環境噪音、舒適或物理可達性。

## 4. 局部環境

舊 `zone.baseNoise` 與 `zone.restQuality` 已移除。

### Noise

噪音來自帶座標的 `noiseEvents`，依距離衰減；跨 Room 時有額外衰減空間。

### Comfort

`comfortAt(position)` 綜合附近 Rest Surface 品質、Tile 液體、crowding 與 local noise。角色 persistent `wellbeing.comfort` 代表累積狀態；`comfortAt()` 代表當下環境。

## 5. Furniture / Slot

Furniture 拆成：

```text
footprint  → 物理占地、阻擋、承載
slots      → 角色實際使用位置
```

雙人沙發有兩個獨立 slot；真正 exclusive 的是 slot，不是 furniture id。

Slot 可提供 `canRest / canSleep / mealSeat / restQuality / allowKinds`。

## 6. Interaction contract

所有實體互動都使用：

```text
interactionPositions(target)
bestInteractionPosition(agent, target)
isAtInteraction(agent, target)
```

Target 類型：`object / source / agent / furniture / slot / tile`。

因此不再有 `Agent.location === Object.location` 這類 prerequisite。

## 7. Action lifecycle

只有 `Agent.action`。每個 tick 對每名 Agent 最多做一個 atomic transition：

```text
無 action
→ 選擇 action，tick 結束

有 action、尚未抵達
→ A* 前進最多一格，tick 結束

已抵達
→ 推進一個 phase，tick 結束
```

典型喝水：

```text
chooseVessel → toVessel → take → toSource → fill → drink → finish
```

典型短休：

```text
chooseSurface → move → settle → resting × N → finish
```

典型補給：

```text
toDoor → exit → work × N → returnPantry → deposit → finish
```

### v11.2 人類用餐

```text
prepare
→ toDish
→ takeDish
→ toFood
→ serve
→ chooseSeat
→ toSeat / standEat
→ sit
→ eatingPlate
→ finish
```

`plateA / plateB` 是一般 portable Container，不是特殊事件物件。盛盤使用真正的 `transferResource('food', 'mealTray', plateId, amount)`。

吃完後 `releaseHeld()` 會把空盤留在角色當下 Tile，因此盤子位置是世界狀態的一部分，不會自動回桌面。

### 直接進食 fallback

```text
prepare
→ toDirectFood
→ claimDirect
→ eatingDirect
→ finish
```

適用於：

- 橘子
- 人類非常餓
- 沒有可用 serving dish

## 8. Movement / crowding

A*：

- 真正不可達 → `[]`
- 其他 Agent 所在 Tile → soft cost，不是 hard block
- 濕地 → 額外 cost
- 多 Agent 可以短暫共用 Tile

因此：`physical co-location ≠ exclusive use`。

## 9. Ownership / reservation

### 手持容器

唯一 truth：

```text
Agent.held = containerId
```

Container 不保存 `heldBy`。`holderOf(containerId)` 由 Agent state 推導。

### Reservation

暫時 exclusive 使用統一放在：

```text
state.reservations
```

例如：

```text
slot:sofa:left
object:mealTray
object:plateA
```

`holdContainer()` 也會尊重 object reservation，避免別人在角色前往拿取已 claim 的盤子時搶走同一物件。

## 10. Serving / Plate

### Container affordance

餐盤：

```text
portable: true
servingDish: true
canEatFrom: true
contents.food
```

`mealTray` 也是 `canEatFrom: true`，但不是 serving dish。

### 人類

一般情況偏好：

```text
拿盤 → 盛一份 → 找座位 → 吃
```

座位排序優先 `mealSeat`，之後才考慮其他 `canRest` slot（例如沙發）；完全沒有合適座位才站著吃。

這使原本在餐桌右側、無法直接接觸 `mealTray` 的餐椅重新成為正常用餐位置：角色拿著盤子後，不再要求 seat 必須靠近食物來源。

### 橘子

橘子不進入 `toDish / takeDish / serve`。牠會從所有 `canEatFrom` 且仍有 `food` 的 Container 中，挑可接近來源。

若餐盤放在地上、沙發旁或其他位置且裡面還有食物，橘子可以直接去吃；如果餐盤正被其他 Agent 拿在手上，則不視為可直接取食來源。

### 食物庫存

`foodStock()` 統計所有 Container 的 `contents.food`，避免食物從 `mealTray` 轉進餐盤後，使 supply system 誤判總庫存憑空下降。

## 11. Posture / Rest

`Agent.posture = { kind, slotId, furnitureId }`。

- 移動會先站起來。
- 坐 slot 才進 `sitting`。
- 貓在合法地板休息會進 `lying`。
- UI 不根據 action 名稱猜姿勢。

休息效率使用 local noise × Rest Surface / floor / standing multiplier × `recoveryRate`。

完整 sleep 仍未實作；`canSleep` 只是 affordance 預留。

## 12. Resources / spill / wet floor

地面液體直接存在 `Tile.surface.contents`。A*、滑倒、貓踩濕、倒水失敗都讀真正 Tile。

目前 `spillHeldAt()` 仍主要處理液體；餐盤中的固體食物尚未納入跌倒／掉落散落規則，這是後續可擴充點，不在 v11.2 範圍內。

## 13. Supply loop

食物勞動閉環保留為普通 `supplyFood` action。移動、出門、工作、返家、走到 pantry、入庫全部走同一 action contract。

## 14. Target lifecycle / social commitment

v11.1 已加入基礎 Target Lifecycle：

```text
target missing
→ 立即取消

target offMap
→ 強烈中斷

target 暫時無合法 interaction position
→ 等待／重試
→ 超過等待上限放棄
```

`interaction commitment strength / maxDistance / interruptPriority` 仍是未來 memo，尚未完整實作。

## 15. Validator

`state-validator.js` 是純檢查器，不包裝 tick，也不修正 state。

目前檢查：舊 state 不得回流、Agent Tile 合法、Room 推導、posture / slot / position 一致、容器不可雙重持有、reservation 合法、supply ownership 一致、carrying 合法；crowding 只記 debug。

## 16. Regression

`tests/v11-state-regression.mjs` 包含：

- 3 個 Seed × 800 tick invariant 長跑
- deterministic replay
- 每 tick 最多走一格
- 舊 Zone 邊界跨界取杯
- 貓休息 posture
- 雙人沙發不同 slot
- soft co-location
- 人類盛盤 → 坐下 → 吃完 → 空盤留在用餐位置
- 拿餐盤後可使用餐桌右側座位
- 橘子可吃盤中食物且不得拿起餐盤
- 非常餓／無 serving dish 的直接進食 fallback
- 補給必須實際走到 pantry 才入庫
- A* 不可達回 `[]`
- offMap 社交目標強烈中斷
- UI 分隔符與 Inspector slot layout regression
- index 不可載入已刪 wrapper

GitHub Actions 另對所有 `src/*.js` 執行 `node --check`，並在 `main / refactor/** / fix/** / feature/**` 分支執行 regression。

## 17. 尚未實作／未定案

- 完整 sleep / bed / wake conditions
- 盤子收拾、清洗、髒污與餐具循環
- 固體食物從餐盤跌落／散落到 Tile 的通用規則
- 自動 Room 分割後的門開關與聲音／溫度傳播
- Activity Area / Zone 的正式用途政策
- material / quality 對家具與 Room value 的完整資料模型
- 火、溫度、乾燥與材質
- 正式貨幣與經濟
- interaction commitment strength / max distance / interrupt priority

新增上述功能時，優先擴充既有 `Tile → affordance → action phase`，不要再新增包裝 `tick()` 的 patch module。
