# Architecture — v11.5 Unified Core + Sleep / Bed

> 本文件描述目前正式架構。v10.4 以前的 wrapper / patch 設計只存在 Git history，不再是現行執行模型。v11.2 起在 Unified Core 上新增玩法；v11.3 納入角色主動資源轉移的物理條件；v11.4 統一負重；v11.5 把 Sleep / Bed 正式接入 Furniture Slot、posture、fatigue 與同一個 action state machine。全程維持單一 `engine.tick()`，沒有 Sleep 專用 wrapper。

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
- **Furniture Slot**：坐、躺、休息、睡眠等家具使用都落在實際 slot；真正 exclusive 的是 slot。
- **Container contents**：食物、水、酒等資源存在真正容器／Tile endpoint 中；移動資源不複製另一份語意狀態。
- **Carry Load**：重量由 Resource 與 Container 當下資料推導，不保存第二份 `currentLoad`。

## 2. 現行模組

```text
src/
├─ world.js            初始世界、Tile、家具、slot、物件、角色與重量資料
├─ spatial.js          純空間函式：A*、Room、interaction、局部環境、rest/sleep target
├─ engine.js           唯一 tick 與所有 action phase／資源／恢復／睡眠／補給／用餐／轉移／負重
├─ state-validator.js  純 invariant 檢查，不包裝 tick
└─ ui.js               地圖、Inspector、時間線與操作 UI
```

歷史 patch layer（`action-guard / recovery / supply / seating / rest-surface / spatial-ui / furniture-ui` 等）已移除。Sleep 也不新增 `sleep.js` 或另一層 tick wrapper。

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

外圈是牆，左側有大門位置。餐桌、食物櫃、水龍頭等固定實體會影響 walkability；水桶自 v11.3 起是可攜 Container，因此不再把所在 Tile 永久封鎖。

### 3.2 Room

Room 由 `spatial.recomputeRooms()` 對 Floor Tile 做 flood fill。目前小屋只有一個主室；未來加入隔間牆或門後，可自然形成多 Room。

Room 可聚合 floor area、boundary walls / doors、furniture list、simplified room value、average local noise、average local comfort。

### 3.3 Activity Area / Zone

`state.activityAreas` 目前保留空資料結構，但 simulation 不使用。若未來加入醫療區、工作區、餐廳、禁區等，只能影響用途／政策／允許事項，不能憑空改變環境噪音、舒適或物理可達性。

## 4. 局部環境

舊 `zone.baseNoise` 與 `zone.restQuality` 已移除。

### Noise

噪音來自帶座標的 `noiseEvents`，依距離衰減；跨 Room 時可有額外衰減。

### Comfort

`comfortAt(position)` 綜合附近 Rest Surface 品質、Tile 液體、crowding 與 local noise。角色 persistent `wellbeing.comfort` 代表累積狀態；`comfortAt()` 代表當下環境。

## 5. Furniture / Slot

Furniture 拆成：

```text
footprint  → 物理占地、阻擋、承載
slots      → 角色實際使用位置
```

Slot 可提供：

```text
canRest
canSleep
mealSeat
restQuality
sleepQuality
restPosture
allowKinds
```

目前雙人沙發與雙人床各有兩個獨立 slot。雙人床 slot 只允許 `human`；沙發 sleep slot 同時允許 `human / cat`。

真正 exclusive 的是 slot，而不是整張 furniture，因此兩名角色可以合法同時使用一張雙人家具的不同位置。

## 6. Interaction contract

所有實體互動使用：

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

### 7.1 v11.5 睡眠

```text
chooseSurface
→ move
→ settle
→ sleeping × N
→ sleepWake / finish
```

`chooseSurface` 只看 `canSleep` slot。`sleepTargets()` 同時考慮可達性、slot availability、sleep quality、noise 與 crowding；目前床的 sleep quality 高於沙發，因此正常情況會偏好床。

Sleep 在 `startAction()` 取得較強 commitment：

```text
commitment.strength = strong
```

v11.5 的實際行為差異是：短休仍會在開始幾 tick 遇到高噪音時重新找位置；正式睡眠不會因單次噪音自動中斷，noise 只降低 `sleepEfficiency`。這不代表未來永遠不能被吵醒，只代表「噪音吵醒」尚未定案。

進入 `sleeping` 前會確認：

```text
slot exists
AND slot.canSleep
AND slotAllows(agent)
AND Agent.position == slot.position
```

若角色仍手持 portable Container，settle 時會先 `releaseHeld()`，再躺下。

自然醒條件目前是：

```text
sleepTicks >= minSleepTicks
AND fatigue <= targetFatigue
```

另有 90 tick safety cap，防止 action 在異常數值下永久卡住。人類預設 `minSleepTicks=18 / targetFatigue=12`；貓為 `12 / 10`。

醒來會留下 `sleepWake` event 並結束 action，但 posture 可保持 `lying`，代表「醒了但仍躺著」；下一次需要移動時 `moveToward()` 才會先 `standUp()`。

### 7.2 v11.2 人類用餐

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

`plateA / plateB` 是一般 portable Container。吃完後 `releaseHeld()` 會把空盤留在角色當下 Tile，不會自動回桌面。

### 7.3 v11.3 水桶補水

```text
toBucket
→ takeBucket
→ toTap
→ fill
→ finish / drop bucket at actual position
```

角色必須真的拿起水桶並搬到水龍頭 interaction position。完成時用 `releaseHeld()` 將水桶留在實際補水位置。

### 7.4 直接進食 fallback

```text
prepare
→ toDirectFood
→ claimDirect
→ eatingDirect
→ finish
```

適用於橘子、人類非常餓，或沒有可用 serving dish。

## 8. Movement / crowding

A*：

- 真正不可達 → `[]`
- 其他 Agent 所在 Tile → soft cost，不是 hard block
- 濕地 → 額外 cost
- 多 Agent 可以短暫共用 Tile

因此：`physical co-location ≠ exclusive use`。

### 8.1 v11.4 Carry Load / Resource Weight

負重使用 simulation 內部單位，不對應公斤。

資料來源：

```text
Resource.loadPerUnit
Container.emptyLoad
```

即時計算：

```text
resourceLoad(resource, amount)
= amount × Resource.loadPerUnit

containerLoad(container)
= Container.emptyLoad
+ Σ(resource amount × loadPerUnit)

carriedResourceLoad(agent.carrying)
= carrying.amount × loadPerUnit

effectiveCarryLoad(agent)
= held Container load
+ carrying Resource load
```

不保存 `Container.currentLoad`；內容物被盛出、飲用、補充或灑出後，下一次讀取 `containerLoad()` 就會反映新重量。

`moveToward()` 只讀 `effectiveCarryLoad()`：

```text
base movement exertion
+ load-derived exertion
```

舊版固定 held surcharge 與 `carrying.amount × .0015` 專用公式已移除。

目前負重影響 movement exertion；既有 `applyExertion()` 再把活動成本傳到 fatigue / thirst / hunger。v11.5 仍未加入 Strength、硬負重上限、超重禁止搬運、負重降速或 inventory。

`Agent.carrying` 目前仍可代表抽象搬運中的資源包；未來若把物流改成 basket / box 等真實 Container，可直接沿用 `containerLoad()`。

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
slot:bed:left
object:mealTray
object:plateA
object:waterBucket
```

Agent 前往座位或床位時先 reservation；正式進入 `sitting / lying` posture 後 reservation 釋放，exclusive truth 改由 posture slot occupancy 表達。

## 10. Serving / Plate

餐盤是：

```text
portable: true
servingDish: true
canEatFrom: true
contents.food
emptyLoad
```

人類一般偏好「拿盤 → 盛一份 → 找座位 → 吃」。座位優先 `mealSeat`，其次其他 `canRest` slot；沒有合適座位才站著吃。

橘子不進入拿盤／盛盤流程。牠會從所有 `canEatFrom` 且仍有 food 的 Container 中挑可接近來源；餐盤若正被其他 Agent 持有則不可直接取食。

`foodStock()` 統計所有 Container 的 `contents.food`，避免盛盤造成總庫存假性下降。

因 v11.4 加入內容重量，裝有食物的餐盤自然比空盤具有更高 `containerLoad()`。

## 11. Posture / Rest / Sleep

正式 state：

```text
Agent.posture = {
  kind: standing | sitting | lying,
  slotId,
  furnitureId
}
```

合法例子：

```text
standing + no slot
sitting + chair/sofa slot
lying + bed/sofa slot
lying + no slot  // 例如橘子在地板短休
```

規則：

- 移動會先 `standUp()`。
- `sitting` 必須有合法 slot。
- `lying` 可以有 furniture slot，也可以是無 slot 的地板躺姿。
- lying furniture slot 必須至少具 `canRest` 或 `canSleep`。
- `sleeping` action 必須是 `lying + canSleep slot`。
- UI 不根據 action 名稱自行猜姿勢。

### Short Rest

`restTargets()` 使用 `canRest`。一般座椅以 sitting 休息；床使用 `restPosture:'lying'`，因此短休也可躺床。

`restRecoveryInfo()` 依 standing / floor / sitting surface / lying surface 分開計算品質，並乘上 local noise 與角色 `recoveryRate`。

### Sleep

`sleepTargets()` 只使用 `canSleep`。`sleepRecoveryInfo()` 使用：

```text
local noise
× sleepQuality / restQuality fallback
× recoveryRate
```

同一張床、同一角色下，sleep recovery 明確高於 short-rest recovery。

目前沒有獨立 `sleepNeed` 或 `sleepDebt`；睡眠由高 fatigue 觸發。這是 v11.5 刻意的最小閉環，不應解讀為最終睡眠模型。

## 12. Resources / spill / wet floor

地面液體直接存在 `Tile.surface.contents`。A*、滑倒、貓踩濕、倒水失敗都讀真正 Tile。

`transferResource()` 是底層資源 primitive，只負責 endpoint 之間的數量轉移；`spillHeldAt()` 等物理結果可以直接使用它。

### 12.1 Actor-mediated resource transfer

v11.3 的 `actorCanTransfer(agent, fromId, toId)` 是角色主動資源轉移的共同前置條件：

```text
角色必須位於來源的合法 interaction position
AND
目的 Container 必須由角色持有，或位於角色可直接操作的位置
AND
若來源也是 Container，不能正被其他角色持有
```

因此水龍頭 → 手持杯子、水龍頭 → 手持水桶、mealTray → 手持餐盤合法；遠端補水或從別人手上的容器抽取資源非法。

目前 `spillHeldAt()` 仍主要處理液體；餐盤中的固體食物尚未納入跌倒／掉落散落規則。

## 13. Supply loop

食物勞動閉環保留為普通 `supplyFood` action。移動、出門、工作、返家、走到 pantry、入庫全部走同一 action contract。

v11.4 後，兩種既有食物搬運都納入重量：

```text
pantry → a.carrying(food, amount) → mealTray
外出補給 → a.carrying(food, produced) → pantry
```

amount 越大，`carriedResourceLoad()` 越高，同距離返程或室內搬運就產生更高 movement exertion。`carrying` 的物流實體化仍是未來候選。

## 14. Target lifecycle / commitment

v11.1 基礎 Target Lifecycle：

```text
target missing
→ 立即取消

target offMap
→ 強烈中斷

target 暫時無合法 interaction position
→ 等待／重試
→ 超過等待上限放棄
```

v11.5 Sleep 使用 `commitment.strength:'strong'` 作為正式 action metadata，但完整的跨 action `commitment strength / maxDistance / interruptPriority` 系統仍未實作。

## 15. Validator

`state-validator.js` 是純檢查器，不包裝 tick，也不修正 state。

目前檢查：舊 state 不得回流、Agent Tile 合法、Room 推導、posture / slot / position / furniture 一致、slot kind allowlist、lying slot affordance、sleeping 必須在 canSleep slot、容器不可雙重持有、reservation 合法、supply ownership 一致、carrying 合法；crowding 只記 debug。

負重不另外保存 state，因此沒有 `currentLoad` 同步 invariant；Regression 直接驗證所有重量函式都由當下資料推導。

## 16. UI observability

單一 `ui.js` 直接讀正式 state 與 derived functions：

- 地圖直接顯示 Furniture footprint，床有獨立 furniture 樣式。
- Furniture Inspector 會顯示每個 slot 是否可休息／用餐／睡眠及當前 occupant / reservation。
- Agent action label 會顯示睡眠尋找位置、前往位置或熟睡中。
- Agent action card / Inspector 顯示 posture 與負重。
- Container Inspector 顯示 `emptyLoad` 與即時計算的 `containerLoad()`。
- 最近活動若該 exertion 帶負重，顯示當時 load。

UI 不建立自己的負重、睡眠或 posture cache。

## 17. Regression

`tests/v11-state-regression.mjs` 包含：

- 3 Seed × 800 tick invariant 長跑
- deterministic replay
- 每 tick 最多走一格
- 舊 Zone 邊界跨界取杯
- 貓短休 posture
- 雙人沙發不同 short-rest slot
- **雙人床兩名 human 同時 sleeping，且必須使用不同 bed slot**
- **雙人床不可用時，human sleep 可改選 canSleep sofa slot**
- **同床同角色：sleep recovery > short-rest recovery**
- **高噪音只降低 sleep efficiency，不在 v11.5 自動新增 wake rule**
- **sleep 必須真正進入 sleeping phase；充分恢復後自然醒並留下 `sleepWake` event**
- soft co-location
- 盛盤／右側餐椅／橘子盤中進食／直接進食 fallback
- 補水必須曾實際持有水桶並搬到水龍頭
- 沒拿水桶時不得遠端 fill
- 橘子不得喝其他角色持有的水桶
- 同角色同路程：滿水桶負重與 exertion > 空水桶
- 搬 40 單位食物負重與 exertion > 搬 10 單位食物
- Container 內容物改變後 `containerLoad()` 立即改變
- 不得保存 `currentLoad`
- `effectiveCarryLoad = held Container + carrying Resource`
- 舊 `carrying.amount * .0015` 特判不得回流
- 補給必須實際走到 pantry 才入庫
- A* 不可達回 `[]`
- offMap 社交目標強烈中斷
- UI 分隔符與 Inspector slot layout regression
- index 不可載入已刪 wrapper
- 不得新增 `window.SimSleep` 等獨立 Sleep runtime

GitHub Actions 另對所有 `src/*.js` 執行 `node --check`，並在 `main / refactor/** / fix/** / feature/**` 分支執行 regression。

## 18. 尚未實作／未定案

- 睡眠固定作息、鬧鐘、獨立 `sleepNeed / sleepDebt`
- 飢餓／口渴醒來、正式噪音吵醒、其他 wake priority
- Strength、硬負重上限、超重禁止搬運、負重降速
- 把抽象 food `carrying` 改為 basket / box 等真正 Logistics Container
- 盤子收拾、清洗、髒污與餐具循環
- 固體食物從餐盤跌落／散落到 Tile 的通用規則
- 可開關門、跨 Room 的噪音／溫度傳播
- 正式貨幣與經濟
- 通用 interaction commitment strength / maxDistance / interruptPriority