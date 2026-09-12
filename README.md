# 因果湧現模擬器 v10

這是一個用來驗證「少量底層規則能否彼此組合，形成未直接寫死的因果鏈」的瀏覽器 simulation sandbox。

v10 的主題是 **Spatial Grid**。前一版只有 Zone graph：角苲知道自己在「餐桌區」或「水槽區」，但同一 Zone 裡沒有真正的位置差異。v10 保留 Zone 作為語意層，同時加入 Tile / Coordinate 作為物理層。

## v10：Zone + Tile 雙層空間

目前空間同時包含：

- `Zone / Room`：餐桌區、水槽區、食物櫃旁、休息角、火爐旁、出入口。AI 仍用 Zone 判斷「哪裡適合做什麼」。
- `Tile / Coordinate`：12×8 格，Agent、容器與資源來源都有 `(x,y)`。
- `walkable`：固定物件所在格可以阻擋通行。
- `occupancy`：尋路會讀取其他 Agent 的實際格子，避免把「同 Zone」當成同一點。
- `A*`：移動會逐格尋路到目標物件旁的 interaction tile，或目標 Zone 內的可行格。
- `surface contents`：每格都有獨立內容物資料；既有 Zone 地面資源會同步投影到單格，供顯示、尋路成本與局部接觸使用。

因此現在的移動概念是：

```text
需求／行動目標
→ 找到語意目標（Zone / 物件）
→ 轉換成 interaction tile
→ A* 尋路
→ 每 tick 前進一格
→ 抵達後才允許原本的互動行動繼續
```

不是只把地圖畫成格子；Spatial Grid 會阻擋原本的行動鏈，直到角色實際走到互動位置。

## 單點污染

v10 先保留既有 Zone surface 作相容層，同時同步一份 tile surface：

- 新的灑出液體會投影到實際事件附近的 tile。
- 蒸發／清理造成的 Zone surface 減少會同步回 tile。
- A* 會提高濕地格的移動成本，因此角色可能繞開濕地。
- 橘子若真的踩到有液體的 tile，腳掌才會沾到該液體。
- 人踩到濕 tile 時會進行局部滑倒風險檢查；若手上拿著液體容器，可能再把液體灑到腳下。

這仍是過渡架構：Zone surface 尚未完全移除；後續若 Spatial Grid 穩定，再讓 tile surface 成為唯一物理來源。

## 視覺

空地不再用 `⬜` 等字元填滿。Tile 只用低對比 CSS 底色與細邊界；Zone 用很淡的底色色差與小標籤區分；角色與物件才使用高辨識圖示。

點空白 Tile 可在 Inspector 查看：座標、Zone、是否可通行、固定阻擋、目前角色與該格表面內容物。角色／容器／來源 Inspector 也會補上 Tile 座標。

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
│  └─ spatial.css      # v10 格狀地圖視覺
├─ src/
│  ├─ world.js
│  ├─ engine.js
│  ├─ recovery.js
│  ├─ supply.js
│  ├─ spatial.js       # v10 座標、A*、occupancy、tile surface、行動 gate
│  ├─ ui.js
│  ├─ recovery-ui.js
│  ├─ supply-ui.js
│  └─ spatial-ui.js    # v10 CSS Grid 地圖與 Tile Inspector
└─ docs/
   └─ architecture.md
```

## 尚未加入

v10 **沒有**加入完整睡眠系統、床位互動、鬧鐘／行程表、貨幣、價格、正式職業、門或可開關障礙。Rest Surface / bed 會等 Spatial Grid 本身穩定後再接，避免同一版同時改兩個核心系統。

目前家具 footprint 仍只先用單格固定物件驗證阻擋；多人讓路、門、不同尺寸家具與完整 tile-only surface 會是後續空間層的下一步。
