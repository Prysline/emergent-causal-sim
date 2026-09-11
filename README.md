# 因果湧現模擬器 v7.1

這是一個用來驗證「少量底層規則能否互相組合，產生未直接寫死的因果鏈」的瀏覽器模擬 sandbox。

v7.1 是 correctness / behavior pass，建立在 v7 的視覺觀測層上，先修正語意與行為邊界，再進入新的模擬系統：

- `needs` 只保留「高值＝需求更迫切」的飢餓、口渴、疲勞、社交與理毛需求；舒適、安全感改到 `wellbeing`，高值代表較好。
- 橘子的 `cleanliness` 改名為 `groomingNeed`，符合實際數值方向。
- 人類可以主動前往找橘子；橘子主動蹭人後會留下短暫互動請求，由人決定是否回應。
- 「可直接飲用」改成容器 affordance。杯子和酒瓶都能直接喝，但杯子有較高行為偏好；杯子被占用時可能直接拿酒瓶喝。
- 物理容納能力與「角色願不願混用」分離；極度口渴時才會降低對混用容器的排斥。
- Inspector 顯示散裝 `carrying` 與待回應互動。
- RNG 改為 seeded PRNG；輸入相同 Seed 後重置，可重播相同模擬序列。
- 因果事件採有界保留，避免 `causes` 永久無限制累積。

## 執行

直接開啟 `index.html` 即可。若瀏覽器限制本機多檔載入，可在專案目錄執行：

```bash
python -m http.server 8000
```

然後開啟 `http://localhost:8000/`。

## 結構

```text
emergent-causal-sim/
├─ index.html
├─ README.md
├─ styles/
│  └─ app.css
├─ src/
│  ├─ world.js   # 資源定義與初始世界資料
│  ├─ engine.js  # tick、需求、行動鏈、移動、資源轉移、因果
│  └─ ui.js      # 地圖、時間線、Inspector、控制器
└─ docs/
   └─ architecture.md
```

## 目前仍屬 MVP 的限制

- 空間是節點拓樸，不是真正 XY 導航。
- `access` 尚未控制多角色同時使用；目前主要仍是 binary lock。
- 火爐尚未形成完整熱／火災系統。
- 食物與酒仍是有限初始庫存，尚未形成補給／經濟閉環。
- Inspector 的「最近事件」仍以結構化欄位與名稱匹配為主，尚未建立正式 entity-event index。
- 時間線摘要仍使用事件類型與文字規則過濾；未來可在 engine 內正式標註 event importance。
