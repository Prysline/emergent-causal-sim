# 因果湧現模擬器 v8.1

這是一個用來驗證「少量底層規則能否互相組合，產生未直接寫死的因果鏈」的瀏覽器模擬 sandbox。

v8.1 建立在 v8 的 exertion / action cost 上，進一步把「當日活動統計」與「當下疲勞」拆清楚，並讓休息變成受角色特質與環境影響的逐 tick 恢復。

目前活動負荷已接到：

- 區域間移動。
- 拿著容器移動；容器內容越多，負荷略升。
- 搬運散裝資源；搬運量越大，移動負荷越高。
- 從食物櫃取出補充食物與整理到餐桌。
- 補水桶。
- 清理地面液體。
- 橘子舔毛有很小的活動成本。

角色會記錄 `metrics.exertionToday` 與 `metrics.lastExertion`。`exertionToday` 現在明確定義為**今日活動量統計**，跨日歸零但休息時不下降；真正的當下疲勞仍是 `needs.fatigue`。

角色新增 `exertionSensitivity` 與 `recoveryRate`：同樣活動可以造成不同疲勞，而同樣休息時間也可以恢復不同幅度。休息改為逐 tick 恢復，並乘上區域休息品質與即時噪音計算的 `restEfficiency`。疲勞不會因跨日自動歸零。

目前仍沒有加入睡眠債；若之後需要「睡不夠隔天容易累」再新增 `sleepDebt / sleepNeed / sleepEfficiency`。

v7.1 的修正仍保留：

- `needs`（高＝更迫切）與 `wellbeing`（高＝較好）分離。
- `groomingNeed` 取代語意相反的 `cleanliness`。
- 人可以主動找橘子；橘子蹭人後，人可以回應或忽略。
- 酒瓶與杯子都能直接飲用；`canDrinkFrom` 是 affordance，`drinkPreference` 是行為偏好。
- seeded PRNG：相同 Seed 可重播相同模擬。
- 因果事件採有界保留。

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
│  ├─ world.js   # 資源、角色、容器與初始世界資料
│  ├─ engine.js       # tick、需求、行動鏈、移動、exertion、資源與因果
│  ├─ recovery.js     # v8.1 疲勞成本、休息恢復與跨日統計語意
│  ├─ ui.js           # 地圖、時間線、Inspector、控制器
│  └─ recovery-ui.js  # v8.1 體力特質與恢復觀測補充
└─ docs/
   └─ architecture.md
```

## 尚未加入

v8.1 **沒有**加入工作、薪資、貨幣、購物或完整睡眠系統。食物與酒仍是有限初始庫存，因此補給閉環仍是下一個設計決策，而不是這版偷偷預設的系統。

其他 MVP 限制：空間仍是節點拓樸；`access` 尚未真正控制多人同時使用；火爐尚未形成熱／火災系統；事件尚未建立正式 entity-event index。
