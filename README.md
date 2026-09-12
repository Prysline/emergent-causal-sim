# 因果湧現模擬器 v10.1

這是一個用來驗證「少量底層規則能否彼此組合，形成未直接寫死的因果鏈」的瀏覽器 simulation sandbox。

v10 建立 Zone + Tile 雙層空間；v10.1 進一步補上家具 footprint、精確出口／入庫位置與可讀性修正，讓「走到某個 Zone」不再等於「已經碰到那個物件」。

## Zone + Tile 雙層空間

目前空間同時包含：

- `Zone / Room`：餐桌區、水槽區、食物櫃旁、休息角、火爐旁、出入口。AI 仍用 Zone 判斷「哪裡適合做什麼」。
- `Tile / Coordinate`：12×8 格，Agent、容器與資源來源都有 `(x,y)`。
- `walkable`：固定物件與部分家具 footprint 可以阻擋通行。
- `occupancy`：尋路會讀取其他 Agent 的實際格子。
- `A*`：移動會逐格尋路到 interaction tile，而不是只切換 Zone。
- `surface contents`：每格有獨立內容物資料，供局部污染、尋路成本與接觸使用。

```text
需求／行動目標
→ 找到語意目標（Zone / 物件）
→ 轉換成 interaction tile
→ A* 尋路
→ 每 tick 前進一格
→ 抵達後才允許原本的互動行動繼續
```

## v10.1：家具與精確互動位置

目前新增第一版家具層：

- **餐桌**：2×2 footprint，四格不可通行；現成食物、白色杯子、藍色杯子與酒瓶放在桌面格上，角色不再直接踩在物品所在格。
- **四張餐椅**：各佔一格，但屬於可占用座位；桌邊互動可以自然落在椅子位置。
- **沙發**：兩格可占用座位，具 `canRest` 與預留的 `canSleep` affordance；完整睡眠系統仍未實作。
- **大門**：位於出入口邊界的明確單點。外出補給必須先走到大門 interaction position，不能只進入「出入口」Zone 就算出門。

食物補給返程也改成精確判定：角色即使已經進入「食物櫃旁」Zone，只要還沒走到食物櫃 interaction tile，食物就不會入庫。

## 單點污染

v10 先保留既有 Zone surface 作相容層，同時同步一份 tile surface：

- 新的灑出液體會投影到實際事件附近的 tile。
- 蒸發／清理造成的 Zone surface 減少會同步回 tile。
- A* 會提高濕地格的移動成本，因此角色可能繞開濕地。
- 橘子若真的踩到有液體的 tile，腳掌才會沾到該液體。
- 人踩到濕 tile 時會進行局部滑倒風險檢查。

Zone surface 仍是過渡相容層；後續若 Spatial Grid 穩定，再讓 tile surface 成為唯一物理來源。

## 視覺與觀測

空地不使用 `⬜` 等字元填滿。Tile 只用低對比 CSS 底色與細邊界；Zone 用淡色色差與小標籤區分。

v10.1 另外修正：

- 行動卡長文字會換行，不再把三欄版面撐爆。
- 阿真與老周使用不同穩定色彩識別；角色 icon 不變，但卡片、chip 與地圖標記有不同 accent。
- 家具可從格狀地圖點選查看 footprint 與 affordance。
- Tile Inspector 會正確顯示餐桌／大門等家具造成的固定阻擋。

## v9 / v8.1 基礎仍保留

- 食物低庫存會觸發「外出補給食物」勞動閉環。
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
│  └─ v101.css         # v10.1 行動卡、角色色彩、家具視覺
├─ src/
│  ├─ world.js
│  ├─ engine.js
│  ├─ recovery.js
│  ├─ supply.js        # v10.1：大門／食物櫃精確 interaction 判定
│  ├─ spatial.js
│  ├─ furniture.js     # 家具 footprint、座位、support、interaction goal
│  ├─ ui.js
│  ├─ recovery-ui.js
│  ├─ supply-ui.js
│  ├─ spatial-ui.js
│  └─ furniture-ui.js  # 家具地圖與 Inspector
└─ docs/
   └─ architecture.md
```

## 尚未加入

v10.1 **沒有**加入完整睡眠系統、床、鬧鐘／行程表、貨幣、價格、正式職業、可開關門狀態。

家具目前先處理餐桌、餐椅、沙發與大門；多人真正讓路、家具 reservation、不同高度／遮擋、門的開關狀態與完整 tile-only surface 仍是後續空間層工作。