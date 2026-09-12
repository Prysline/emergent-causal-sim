# v10 架構說明

## 空間分層

v10 不以 Tile 取代 Zone，而是建立兩層空間：

### Zone / Room：語意層

Zone 繼續負責：

- 行動選擇與需求判斷。
- 噪音、休息品質等區域屬性。
- 「去哪裡吃飯／休息／補水」這類高階決策。

因此 Agent 仍有 `location: zoneId`。

### Tile / Coordinate：物理層

Spatial Grid 目前是 `12 × 8`。每格記錄：

```text
x / y
zone
walkable
staticBlockedBy
contents
```

Agent、Container、Source 另外具有：

```text
position: { x, y }
```

`location` 與 `position` 同時存在；角色逐格移動時，跨過 Zone 邊界才同步更新 `location`。

## 行動 gate

舊 engine 在 `startPlan()` 後同一 tick 可能立刻執行 action。v10 不直接重寫整個 decision engine，而是在 `spatial.js` 為 Agent 的 `plan` 加入空間 prerequisite gate。

流程：

```text
plan 已存在
→ spatial.js 判斷目前 phase 需要的物理目標
→ 把物件／Agent／Zone 轉成 interaction tile
→ 還沒抵達：plan 對底層 engine 暫時呈現 spatial sentinel
→ A* 前進一格
→ 抵達：解除 gate
→ 原本 engine 繼續 eat / drink / talk / refill / rest ...
```

這讓既有行動鏈與 v9 補給模組可以保留，同時避免「畫面沿格子走，但核心已經把行動做完」的假 spatialization。

目前已接的目標類型：

- `eat` → 現成食物旁的 interaction tile。
- 人類飲水／飲酒 → 飲用容器、來源旁的 interaction tile。
- 貓喝水 → 水桶旁。
- 補充食物／水桶 → 對應物件旁。
- `talk / petCat / seekHuman` → 目標 Agent 的鄰接格。
- `rest / wander` → 目標 Zone 內的可行 tile。
- `cleanFloor` → 該 Zone 最濕的 tile。
- v9 supply 的出入口／食物櫃移動沿用 `wander` plan，因此自然進入 A*。

## A* 與 occupancy

A* 使用四方向移動。固定物件所在格標為不可通行；其他 Agent 所在格加入高成本，濕地也會增加成本，因此有其他路線時可以自然繞開。

目前 occupancy 還不是完整多人交通模擬：Agent 不會協商讓路，也沒有狹窄門口 reservation。第一版只處理「實際位置會影響路徑成本」。

## Surface 過渡

既有 engine 使用 `floor:<zone>` 聚合地面內容。v10 為了不一次重寫所有清理／蒸發／因果規則，暫時保留它作相容層，同時新增每格 `tile.contents`。

同步原則：

```text
Zone surface 增加
→ 投影到事件附近 tile

Zone surface 因清理／蒸發減少
→ 從該 Zone 的濕 tile 同步扣除
```

此外 Spatial Grid 自己處理局部接觸：

- A* 讀取單格濕度成本。
- 貓踩到濕 tile 才把液體轉到 paws。
- 人踩到濕 tile 才做局部滑倒檢查。

等這層穩定後，再考慮反過來由 tile surface 聚合出 Zone summary，最後移除 Zone surface 的物理權威性。

## UI

`spatial-ui.js` 不改 decision state，只把 `state.spatial` 畫成 CSS Grid。空 tile 不放任何字元；CSS 背景與極淡邊界提供格線，避免 `⬜` 搶走視覺焦點。

空 Tile 可以直接開 Tile Inspector；角色、容器與來源沿用原本 `data-entity` Inspector 流程，並補上 `(x,y)`。

## Rest / Sleep 的位置

v10 先處理空間底層，**尚未**把短休拆成正式 `shortRest / sleep`，也尚未放入可睡眠床位。下一輪若做睡眠，床會被建模為通用 Rest Surface affordance，而不是把 `bed` 名稱寫死進行動規則。

建議順序：

1. 先實玩 v10，確認逐格移動速度、路徑與手機可讀性。
2. 再加家具 footprint / interaction tiles 與床。
3. 拆 `shortRest` / `sleep` commitment。
4. 最後才考慮 wake conditions（噪音、極端需求、鬧鐘、行程、trait）。
