# 因果湧現模擬器 v10.4

這是一個用來驗證「少量底層規則能否彼此組合，形成未直接寫死的因果鏈」的瀏覽器 simulation sandbox。

目前版本主題是 **Furniture Slots / Rest Surface**。v10 保留 Zone 作為語意層、Tile / Coordinate 作為物理層；v10.1 加入家具 footprint 與精確 interaction position；v10.2 讓家具與座位真正進入行為；v10.3 整理 tick、Inspector selection、A* 與 ownership invariant；v10.4 再把「家具占地」與「可使用的位置」拆成不同資料，讓雙人沙發、餐椅與短休開始共享同一套 slot / posture / reservation 邏輯。

## Zone + Tile 雙層空間

目前空間同時包含：

- `Zone / Room`：餐桌區、水槽區、食物櫃旁、休息角、火爐旁、出入口。AI 仍用 Zone 判斷「哪裡適合做什麼」。
- `Tile / Coordinate`：12×8 格，Agent、容器與資源來源都有 `(x,y)`。
- `walkable`：固定物件與家具 footprint 可阻擋通行。
- `occupancy`：Agent 可以短暫共用同一 Tile；有人所在的格子會增加 A* 成本，但不是絕對不可通行。
- `A*`：移動逐格尋路到目標物件、家具或明確 slot；真正無路可走時回傳空路徑。
- `surface contents`：每格有獨立內容物資料；既有 Zone 地面資源仍暫時作相容層。

行動概念：

```text
需求／行動目標
→ 找到語意目標（Zone / 物件 / 家具）
→ 必要時選擇明確使用 slot
→ 轉換成 interaction tile / slot position
→ A* 尋路
→ 每 tick 最多前進一格
→ 移動 tick 不同時推進下一個 interaction phase
→ 抵達後下一 tick 才繼續原本互動
```

## v10.3 State Correctness 基礎

### 每 tick 行動邊界

`action-guard.js` 讓同一名 Agent 在一個 tick 內最多完成「移動一格」或「推進一個 action phase」。例如拿到杯子的同一 tick 不會又立刻走去水源、倒水並喝下。

### 單一 Inspector selection

Tile、Furniture、Agent、Container 等 Inspector 共用主 UI 的單一 selection state；Spatial / Furniture UI 不再靠 `MutationObserver` 各自覆寫 Inspector DOM。這修正了「先點 Tile，再點家具沒反應」以及座標列重複等同類問題。

### Soft crowding

Tile 不是獨占槽位：

```text
physical co-location
→ 允許多個 Agent 暫時位於同一 Tile
→ A* 對擁擠 Tile 加成本，通常會優先繞開
→ 沒有合理替代路徑時仍可通過

exclusive use
→ 家具使用 slot、持有物、補給工作等資源仍不可重複 ownership
```

v10.4 另外修正一個漏口：角色已預約明確 slot 時，即使另一個 Agent 暫時經過該 Tile，也不會把目標偷偷退回 Zone 的任意空格。Soft crowding 只提高成本，不取消已保留的合法目的地。

### 持有物位置語意

當容器有 `heldBy` 時，它的**有效物理位置**由持有者的 `Agent.position` 決定；`container.position` 保留作未持有／落地位置資料，不再要求持有期間逐 tick 維持一份完全相同的第二座標。

### State validator + CI

`state-validator.js` 每 tick 可檢查：

- `position ↔ location` 是否一致。
- `agent.held ↔ container.heldBy` 是否互相一致。
- furniture slot occupation / reservation 是否矛盾。
- `seatedOn ↔ seatSlot ↔ posture` 是否一致。
- `supply.workerId ↔ supplyTask` 是否一致。
- 搬運數量是否有效。
- 同 Tile 多 Agent 只記為 `crowdingTiles` debug 資訊，不視為錯誤。

GitHub Actions 會執行固定 Seed regression。目前包含 3 個 Seed × 800 tick，以及移動 phase guard、不可達路徑、soft co-location、持有物有效位置、Furniture Slot / Rest Surface 與 UI observer 檢查。

## v10.4 Furniture Slots / Rest Surface

### Footprint 與 slot 分離

家具現在明確分成兩種空間資料：

```text
footprint
→ 這件家具實際占哪些 Tile

slots
→ 哪些位置可以被角色使用
→ 每個 slot 可各自占用／預約
```

例如雙人沙發仍是一件家具、占兩格，但有兩個獨立使用位置：

```text
sofa:left  → (9,1)
sofa:right → (10,1)
```

因此兩個人可以同時坐在同一張沙發的不同位置；只有兩人同時宣稱同一個 slot 才是 invariant violation。

角色坐下時目前使用：

```text
seatedOn = furnitureId
seatSlot = slotId
posture = sitting
```

前往中的預約則使用 `__slotTarget`，避免兩名角色同時選中同一個單人 slot。

### 餐椅恢復自然布局

先前為了讓第二名角色也能從單點 `mealTray` 直接取食，餐椅 B 曾從原本的右側 `(7,1)` 暫時移到 `(5,0)`。v10.4 已移除這個 workaround，餐椅恢復原始配置：

```text
A (4,1)    餐桌 2×2    B (7,1)
C (4,2)                 D (7,2)
```

家具配置不再為單一 interaction point 扭曲。

### 短休現在真的使用 Rest Surface

人類開始 `rest` 時會優先尋找 `canRest` slot，而不是只走進休息 Zone 就直接站著恢復：

```text
想休息
→ 尋找可用 Rest Surface slot
→ 考慮原本偏好的 Zone、路徑、暫時擁擠與 restQuality
→ 預約 slot
→ 逐格走到 slot
→ sitting
→ 持續休息
```

如果原本 slot 被占用，會嘗試換到其他可用 slot。雙人沙發的左右位置彼此獨立，所以一人坐左側後，另一人仍可坐右側。

如果沒有任何可用 Rest Surface，人類仍允許退化成站著／停下來休息，而不是完全不能恢復；但站立休息的恢復效率較低。坐在 `canRest` 家具上時，slot 的 `restQuality` 會成為恢復效率的一部分。完整睡眠仍未加入。

## 吃飯與座位

人類想吃飯且飢餓未達緊急值時，仍會偏好坐下；但現在家具 layout 不再為 mealTray 單點限制妥協。

目前規則：

```text
hunger >= 82
→ 很餓，不特地找座位，直接吃

有可用而且能直接碰到 mealTray 的 meal slot
→ 優先坐下

直接可用的座位被占用／不存在
→ 允許站著吃
```

目前 `mealTray` 仍是一個單點 interaction，因此恢復自然餐椅布局後，不是四張餐椅都能直接坐著從餐盤取食。這是刻意保留的現況，而不是再搬動家具繞過限制。

下一個較自然的擴充是 **Serving / Plate**：角色先把一份食物盛進可攜帶盤子，再拿去餐椅、沙發或其他位置吃。盤子系統尚未實作。

## 家具與 footprint

目前家具：

- 2×2 餐桌：阻擋通行並承載現成食物、杯子與酒瓶。
- 4 張餐椅：每張有 1 個 human slot，可短休並標記為 `mealSeat`。
- 2 格沙發：1 件家具、2 個 human slot，可短休；資料上保留 `canSleep` affordance，但完整睡眠系統尚未實作。
- 大門：固定在邊界 Tile，外出補給必須走到門的 interaction position，進入「出入口」Zone 本身不算出門。

家具 footprint 使用低對比連續底帶顯示。點 footprint 任一格都可開 Furniture Inspector；slot 的精確 occupancy 目前主要由 runtime state / Agent plan label 與 validator 觀測，UI 尚未做成獨立 slot 面板。

## 單點污染

- 新灑出的液體會投影到事件附近 tile。
- 蒸發／清理造成的 Zone surface 減少會同步回 tile。
- A* 會提高濕地格移動成本。
- 橘子真的踩到濕 tile 才會沾到液體。
- 人踩濕 tile 才做局部滑倒檢查。

## v9 / v8.1 基礎仍保留

- 食物低庫存會觸發外出補給食物；返程必須走到食物櫃 interaction position 才能入庫。
- `metrics.exertionToday` 是今日活動量，不是疲勞槽。
- `needs.fatigue` 才是當下疲勞。
- `exertionSensitivity` 與 `recoveryRate` 分離。
- 休息逐 tick 恢復並受角色恢復倍率、環境與目前 Rest Surface 影響。
- 人貓雙向互動、飲用 affordance / preference、Seeded PRNG、有界因果事件仍保留。

## 執行

直接開啟 `index.html`。若瀏覽器限制本機多檔載入，可在專案目錄執行：

```bash
python -m http.server 8000
```

再開啟 `http://localhost:8000/`。

## 結構

```text
emergent-causal-sim/
├─ index.html
├─ README.md
├─ .github/workflows/
│  └─ state-regression.yml
├─ tests/
│  └─ state-regression.mjs
├─ styles/
│  ├─ app.css
│  ├─ mobile.css
│  ├─ spatial.css
│  ├─ v101.css
│  └─ v103.css
├─ src/
│  ├─ world.js
│  ├─ engine.js
│  ├─ recovery.js
│  ├─ supply.js
│  ├─ spatial.js
│  ├─ furniture.js       # footprint / slots / interaction helper
│  ├─ action-guard.js    # 每 tick 移動／phase 邊界
│  ├─ seating.js         # 用餐 slot 偏好／預約／站立 fallback
│  ├─ rest-surface.js    # Rest Surface slot 選擇／預約／坐下
│  ├─ state-validator.js # runtime invariant / crowding / slot debug
│  ├─ ui.js              # 單一 Inspector selection state
│  ├─ spatial-ui.js
│  └─ furniture-ui.js
└─ docs/
   └─ architecture.md
```

## 尚未加入

v10.4 **沒有**加入 Serving / Plate、完整睡眠系統、床位互動、鬧鐘／行程表、sleep debt、貨幣、價格、正式職業，也沒有啟用通用 sitting/posture 的活動能耗倍率或完整多人讓路協商。

接下來較自然的方向是：用 **Serving / Plate** 解開「食物來源位置」與「實際吃飯位置」；或者在目前已成立的 Rest Surface slot 上繼續拆 `shortRest / sleep`。