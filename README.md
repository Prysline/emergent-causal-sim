# 因果湧現模擬器 v7

這是一個用來驗證「少量底層規則能否互相組合，產生未直接寫死的因果鏈」的瀏覽器模擬 sandbox。

v7 的重點不是增加新規則，而是把 v6 從單檔 HTML 拆成可維護結構，並改善可觀測性：

- 空間圖成為主要入口。
- 角色、容器、資源來源、地面、區域、事件共用 Inspector。
- 杯子等物品可點擊查看位置、持有人、容量、內容物、屬性與最近事件。
- 時間線預設顯示摘要，完整階段紀錄仍可切換查看。
- 模擬核心與 UI 分離，之後可以重做顯示層而不改模擬規則。

## 執行

直接開啟 `index.html` 即可。若瀏覽器限制本機多檔載入，可在專案目錄執行：

```bash
python -m http.server 8000
```

然後開啟 `http://localhost:8000/`。

## 結構

```text
emergent-sim-v7/
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
- 火爐尚未形成完整熱／火災系統。
- Inspector 的「最近事件」以結構化欄位與名稱匹配為主，尚未建立正式 entity-event index。
- 時間線摘要目前使用事件類型與文字規則過濾；未來可在 engine 內正式標註 event importance。
