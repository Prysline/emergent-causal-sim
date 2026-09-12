# 因果湧現模擬器 v10.2

這是一個用來驗證「少量底層規則能否彼此組合，形成未直接寫死的因果鏈」的瀏覽器 simulation sandbox。

目前版本主題是 **Furniture Interaction**。v10 保留 Zone 作為語意層、Tile / Coordinate 作為物理層；v10.1 加入家具 footprint 與精確 interaction position；v10.2 讓家具更可觀測，並開始讓角色把座位當成真正可選擇的生活位置。

## Zone + Tile 雙層空間

目前空間同時包含：

- `Zone / Room`：餐桌區、水槽區、食物櫃旁、休息角、火爐旁、出入口。AI 仍用 Zone 判斷「哪裡適合做什麼」。
- `Tile / Coordinate`：12×8 格，Agent、容器與資源來源都有 `(x,y)`。
- `walkable`：固定物件與家具 footprint 可阻擋通行。
- `occupancy`：尋路會讀取其他 Agent 的實際格子。
- `A*`：移動逐格尋路到目標物件或家具的 interaction position。
- `surface contents`：每格有獨立內容物資料；既有 Zone 地面資源仍暫時作相容層。

行動概念：

```text
需求／行動目標
→ 找到語意目標（Zone / 物件 / 家具）
→ 轉換成 interaction tile
→ A* 尋路
→ 每 tick 前進一格
→ 抵達後才允許原本互動繼續
```

## 家具與 footprint

目前家具：

- 2×2 餐桌：阻擋通行並承載現成食物、杯子與酒瓶。
- 4 張餐椅：可占用、可短休；其中兩張標記為 `mealSeat`，是目前人類吃飯時的優先座位。
- 2 格沙發：可占用、可短休，資料上保留 `canSleep` affordance；完整睡眠系統尚未實作。
- 大門：固定在邊界 Tile，外出補給必須走到門的 interaction position，進入「出入口」Zone 本身不算出門。

家具 footprint 使用低對比連續底帶顯示，不再用「桌面」文字逐格標示。點 footprint 任一格都可開 Furniture Inspector，查看 Zone、Footprint、占用者、承載物件與 affordance。

## 吃飯與座位

v10.2 開始讓「坐下」成為角色行為，而不是只有地圖裝飾：

```text
人類想吃東西
→ 若飢餓未達緊急值，先尋找空的用餐座位
→ 座位被預約／占用時換另一張
→ 走到座位並坐下
→ 接回原本 eat plan
→ 從餐桌取得食物並進食
```

目前規則刻意保留彈性：

- 飢餓 ≥ 82 時不強迫先找座位。
- 沒有空位時可以站著吃。
- 兩名角色同時要吃飯時會避開彼此已預約的餐椅。
- Agent Inspector 會顯示目前坐在哪張椅子；離開該 Tile 後座位狀態會清除。

目前**沒有**為了製造座位差異而硬加「吃飯疲勞成本」。吃東西原本就沒有 `applyExertion`；未來如果加入閱讀、製作、聊天、休閒等多 tick 靜態活動，再由 posture / seat quality 影響持續活動成本會更合理。

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
├─ styles/
│  ├─ app.css
│  ├─ mobile.css
│  ├─ spatial.css
│  └─ v101.css          # v10.1+ 行動卡、角色色、家具 footprint 視覺
├─ src/
│  ├─ world.js
│  ├─ engine.js
│  ├─ recovery.js
│  ├─ supply.js
│  ├─ spatial.js
│  ├─ furniture.js      # 家具 footprint / affordance / interaction position
│  ├─ seating.js        # v10.2 用餐座位偏好與預約
│  ├─ ui.js
│  ├─ recovery-ui.js
│  ├─ supply-ui.js
│  ├─ spatial-ui.js
│  └─ furniture-ui.js   # Furniture Inspector 與 footprint 視覺
└─ docs/
   └─ architecture.md
```

## 尚未加入

v10.2 **沒有**加入完整睡眠系統、床位互動、鬧鐘／行程表、貨幣、價格、正式職業，也沒有啟用通用 sitting/posture 能耗倍率。

接下來較自然的方向是：讓短休真正選擇餐椅／沙發等 Rest Surface，再拆 `shortRest / sleep`；或先補多人讓路、家具 interaction perimeter 與更完整的座位使用規則。