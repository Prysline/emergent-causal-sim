# 因果湧現模擬器 v10.3

這是一個用來驗證「少量底層規則能否彼此組合，形成未直接寫死的因果鏈」的瀏覽器 simulation sandbox。

目前版本主題是 **State Correctness**。v10 保留 Zone 作為語意層、Tile / Coordinate 作為物理層；v10.1 加入家具 footprint 與精確 interaction position；v10.2 讓家具與座位真正進入行為；v10.3 則整理 tick、Inspector selection、A* 與 ownership invariant，優先降低「模組彼此覆寫狀態」造成的隱性錯誤。

## Zone + Tile 雙層空間

目前空間同時包含：

- `Zone / Room`：餐桌區、水槽區、食物櫃旁、休息角、火爐旁、出入口。AI 仍用 Zone 判斷「哪裡適合做什麼」。
- `Tile / Coordinate`：12×8 格，Agent、容器與資源來源都有 `(x,y)`。
- `walkable`：固定物件與家具 footprint 可阻擋通行。
- `occupancy`：Agent 可以短暫共用同一 Tile；有人所在的格子會增加 A* 成本，但不是絕對不可通行。
- `A*`：移動逐格尋路到目標物件或家具的 interaction position；真正無路可走時回傳空路徑。
- `surface contents`：每格有獨立內容物資料；既有 Zone 地面資源仍暫時作相容層。

行動概念：

```text
需求／行動目標
→ 找到語意目標（Zone / 物件 / 家具）
→ 轉換成 interaction tile
→ A* 尋路
→ 每 tick 最多前進一格
→ 移動 tick 不同時推進下一個 interaction phase
→ 抵達後下一 tick 才繼續原本互動
```

## v10.3 State Correctness

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
→ 座位、持有物、補給工作等資源仍不可重複 ownership
```

因此「兩人站在水桶旁同一小塊空間」可以成立，但「兩人同時 seatedOn 同一張單人餐椅」仍是非法 state。

### 持有物位置語意

當容器有 `heldBy` 時，它的**有效物理位置**由持有者的 `Agent.position` 決定；`container.position` 保留作未持有／落地位置資料，不再要求持有期間逐 tick 維持一份完全相同的第二座標。

### State validator + CI

`state-validator.js` 每 tick 可檢查：

- `position ↔ location` 是否一致。
- `agent.held ↔ container.heldBy` 是否互相一致。
- 座位 occupation / reservation 是否矛盾。
- `supply.workerId ↔ supplyTask` 是否一致。
- 搬運數量是否有效。
- 同 Tile 多 Agent 只記為 `crowdingTiles` debug 資訊，不視為錯誤。

GitHub Actions 會執行固定 Seed regression。目前測試包含 3 個 Seed × 800 tick，以及移動 phase guard、不可達路徑、soft co-location、持有物有效位置與 UI observer 檢查。

## 家具與 footprint

目前家具：

- 2×2 餐桌：阻擋通行並承載現成食物、杯子與酒瓶。
- 4 張餐椅：可占用、可短休，四張皆可作 `mealSeat` 候選；角色會避開已占用或已預約的座位。
- 2 格沙發：可占用、可短休，資料上保留 `canSleep` affordance；完整睡眠系統尚未實作。
- 大門：固定在邊界 Tile，外出補給必須走到門的 interaction position，進入「出入口」Zone 本身不算出門。

家具 footprint 使用低對比連續底帶顯示，不再用「桌面」文字逐格標示。點 footprint 任一格都可開 Furniture Inspector，查看 Zone、Footprint、占用者、承載物件與 affordance。

## 吃飯與座位

人類想吃飯且飢餓未達緊急值時，會優先找可用餐椅；沒有空位或飢餓很急時仍可站著吃。

```text
人類想吃東西
→ 尋找未占用／未預約的 mealSeat
→ 走到座位
→ seatedOn = 該餐椅
→ 接回原本 eat plan
```

目前**沒有**為了製造座位差異而硬加「站著吃疲勞成本」。未來如果加入閱讀、製作、聊天、休閒等多 tick 靜態活動，再由 posture / seat quality 影響持續活動成本會更合理。

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
- 休息逐 tick 恢復並受環境休息效率影響。
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
│  ├─ furniture.js
│  ├─ action-guard.js    # 每 tick 移動／phase 邊界
│  ├─ seating.js
│  ├─ state-validator.js # runtime invariant / crowding debug
│  ├─ ui.js              # 單一 Inspector selection state
│  ├─ spatial-ui.js
│  └─ furniture-ui.js
└─ docs/
   └─ architecture.md
```

## 尚未加入

v10.3 **沒有**加入完整睡眠系統、床位互動、鬧鐘／行程表、貨幣、價格、正式職業，也沒有啟用通用 sitting/posture 能耗倍率或完整多人讓路協商。

接下來較自然的方向仍是：先讓短休真正選擇餐椅／沙發等 Rest Surface，再拆 `shortRest / sleep`；或先把餐桌 support / interaction perimeter 做完整，讓四張餐椅都能更自然地從整張桌面取用食物。