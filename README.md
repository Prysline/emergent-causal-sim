# Emergent Causal Simulator

湧現式因果模擬器。用少量可組合規則觀察角色、物件、資源與環境如何自行形成因果鏈。

目前版本：**v11.2・Serving / Plate**。

> v11 先移除 v7～v10.4 累積的 wrapper／patch，重新建立單一空間、行動與狀態契約；v11.2 開始在這個 core 上重新增加玩法，而不再新增包裝 `tick()` 的補丁層。

## 核心方向

```text
Tile / terrain     = 物理世界
Room               = 由牆、邊界、門的拓撲自動推導
Furniture / object = affordance、局部舒適與互動來源
Agent.position     = 角色位置唯一真相
Agent.action       = 唯一行動 state machine
Activity Area      = 未來可選用途 overlay，不提供環境魔法加成
```

舊版六個 `Zone` 不再負責噪音、休息品質、是否抵達物件或行動 prerequisite。局部環境由真正的 Tile、家具、液體、角色與噪音事件決定。

## v11.2：Serving / Plate

用餐現在不再把「食物來源」和「實際吃飯位置」綁在同一個 interaction point。

人類一般用餐流程：

```text
想吃東西
→ 找可用餐盤
→ 拿起餐盤
→ 到現成食物旁盛一份
→ 找座位
   ├ 餐椅優先
   ├ 餐椅不可用時可選其他可坐家具（例如沙發）
   └ 沒有合適座位時站著吃
→ 吃完
→ 空盤留在實際用餐位置
```

餐盤本身只是普通 portable Container：

```text
servingDish: true
canEatFrom: true
contents.food
```

因此盤子不會自動回餐桌。角色在哪裡吃完，盤子就留在哪裡；未來其他角色可以受到盤子位置與內容物影響。

橘子不會主動拿餐盤，但會把任何 **可直接進食且仍裝有食物、沒有被別人拿在手上** 的容器視為食物來源。因此人類留下的盤中食物，橘子可以就近跑去吃。

保留的 fallback：

- 人類非常餓時可以直接在食物來源旁吃，不強迫先找盤子。
- 沒有可用餐盤時仍可直接吃。
- 橘子始終直接吃來源，不會進入拿盤／盛盤流程。

同時，家庭食物總量改為統計所有 Container 中的 `food`，避免食物從 `mealTray` 轉進餐盤後被誤判成庫存消失。

## v11 / v11.1 核心狀態

- 12×8 Tile map 加入實體邊界牆與大門。
- Room 由 floor topology 自動 flood fill；目前小屋自然形成一個主室。
- `zone.baseNoise` / `zone.restQuality` 已移除；改用 `noiseAt(position)`、`comfortAt(position)`。
- 所有互動只看合法 interaction position，不再要求 Agent 與物件 `location` 相同。
- 角色只有 `action`，每 tick 最多移動一格或推進一個 phase。
- `posture` 是正式 state：`standing / sitting / lying`。
- 家具 footprint 與 slot 分離；雙人沙發可同時容納兩名角色。
- 手持容器只有 `Agent.held` 一份 truth；短期 exclusive 使用統一放進 `state.reservations`。
- 地面液體直接存在 `Tile.surface.contents`。
- 食物外出補給保留，但整合進普通 `supplyFood` action。
- Inspector、地圖、Room、家具 slot、補給資訊全部由單一 `ui.js` 呈現。
- v11.1 加入 Target Lifecycle 基礎：entity missing / offMap 會強烈中斷；持續無法接近也不會永久等待。

## 現行檔案

```text
index.html
src/
├─ world.js
├─ spatial.js
├─ engine.js
├─ state-validator.js
└─ ui.js
styles/
├─ app.css
├─ spatial.css
└─ mobile.css
tests/
└─ v11-state-regression.mjs
docs/
└─ architecture.md
```

歷史 patch layer（`action-guard.js`、`recovery.js`、`supply.js`、`seating.js`、`rest-surface.js`、各 UI enhancer 等）已從現行 tree 移除，仍可由 Git history 追溯。

## 現有行為

- 人類與貓的需求與加權決策
- Seeded RNG / deterministic replay
- 食物、水、酒與通用容器
- Serving / Plate 與可攜餐盤
- 橘子可直接吃盤中食物，但不拿盤子
- 酒瓶可直接喝，杯子仍具較高偏好
- A* Tile movement 與 soft crowding
- 局部濕地、滑倒、灑出、貓踩濕與舔毛攝入
- 人類主動找貓／橘子主動撒嬌／延後回應後追貓
- Target Lifecycle 基礎中斷
- exertion / fatigue / recovery trait
- 家具 slot 與 Rest Surface
- 食物勞動補給閉環
- 時間線、Inspector、Room / Tile debug

## Room 與 Activity Area

### Room

物理拓撲產物。牆、邊界與門決定哪些 Floor Tile 屬於同一個房間，可用於聲音衰減、未來溫度／煙霧傳播、Room value 與房間聚合資訊。

### Activity Area / Zone

未來若需要，可以作為制度或用途標記，例如醫療區、餐廳、工作區、禁區或垃圾傾倒區；Area 本身不能讓一塊空地因為被標成休息區就更舒服。

## 狀態與測試

GitHub Actions 會執行：

```text
node --check src/*.js
node tests/v11-state-regression.mjs
```

Regression 包含：

- 3 Seed × 800 tick invariant 長跑
- deterministic replay
- atomic movement / phase
- 跨舊 Zone 邊界取杯
- 貓休息 posture
- 雙人沙發 slot
- soft co-location
- 人類盛盤 → 找座位 → 吃完 → 空盤留在用餐位置
- 拿餐盤後可使用餐桌右側座位，不再受 `mealTray` 單點限制
- 橘子可吃盤中食物，但 `held` 必須保持空
- 沒有餐盤／非常餓時直接吃 fallback
- supply 必須實際走到 pantry 才入庫
- A* unreachable → `[]`
- offMap 社交目標強烈中斷
- index 不可再載入舊 wrapper

## 下一步候選

1. **Sleep / Bed**：在現有 Rest Surface 上加入較強 commitment、睡眠需求與 wake conditions。
2. **Room topology**：加入真正隔間牆、可開關門，測試噪音／未來溫度跨 Room 傳播。
3. **Dish lifecycle / cleanup**：盤子已可被留在任意位置；是否加入收盤、清洗、髒污，等實際觀察後再決定。
4. **Activity Area**：只有在需要制度化用途時才新增。
5. **Material / Quality**：讓家具與 Room value 有更完整的材質／品質來源。
6. **經濟系統**：等工作與物資閉環成熟後再決定是否加入貨幣。

`interaction commitment strength / maxDistance / interruptPriority` 仍保留為未來 memo。

完整狀態契約請見 [`docs/architecture.md`](docs/architecture.md)。
