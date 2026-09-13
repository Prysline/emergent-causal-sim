# Emergent Causal Simulator

湧現式因果模擬器。用少量可組合規則觀察角色、物件、資源與環境如何自行形成因果鏈。

目前版本：**v11.8・Logistics Container / Basket**。

v11.8 延續 v11.7 的 Core Consolidation，不新增第二套物流模型，而是把最後仍抽象存在的 `Agent.carrying` 完全淘汰。現在室內搬運與外出補給都必須透過真正的 portable Container：角色會去拿物流籃、把資源裝進籃中、帶著實際重量移動、到目的地做實體 resource transfer，最後把空籃留在卸貨位置。

## 核心模型

```text
World data
→ Entity capability / role / policy

Tile / terrain
→ 物理移動基礎

Room
→ 由牆、邊界與門的拓撲自動推導

Furniture footprint
→ 物理占地

Furniture slot
→ 坐、躺、睡、出口等精確使用位置

Interaction Geometry
→ affordance + target data 決定操作位置

Container
→ 資源實際存在、容量、空重與搬運載體

Agent.position
→ 角色位置唯一真相

Agent.held
→ 角色目前實際持有的 portable Container 唯一真相

Agent.action
→ 唯一 action state machine

Agent.posture
→ standing / sitting / lying 正式世界狀態

state.reservations
→ 暫時 exclusive 使用
```

舊版六個環境 `Zone`、`location`、`plan`、`Agent.carrying`、wrapper tick 與 UI enhancer 都不再是現行架構。

## v11.8 Logistics Container / Basket

### 物流資源必須存在真正 Container

World 新增一般 portable `logisticsContainer`：

```text
role: logisticsContainer
portable: true
capacity
emptyLoad
transportResources
contents
```

目前場景使用一個搬運籃，但 Engine 不認 `basket` ID，只會尋找符合 capability、資源相容、仍有容量、且未被其他 Agent 持有／預約的物流容器。

### 室內補貨

`mealTray` 的 food restock 不再使用抽象 `carryResource`：

```text
現成食物不足
→ 找 foodReserve
→ 找可搬 food 的 logisticsContainer
→ 預約並走去拿物流籃
→ 拿起
→ 前往食物來源
→ foodReserve → basket.contents.food
→ 帶著有實際重量的籃子前往 readyFood destination
→ basket → destination
→ 放下空籃
```

水桶補水仍使用既有 `carryContainer`：水桶本身就是要被補充的 portable Container，因此不需要另外套物流籃。

### 外出補給

角色不再空手離家後憑空產生一份 `Agent.carrying`：

```text
食物總庫存不足
→ 找 externalSupplyDestination
→ 找可用 logisticsContainer
→ 去拿籃子
→ 帶著籃子走到出口
→ 外出工作
→ 新取得的 food 寫入 basket.contents.food
→ 帶著裝滿食物的籃子回到出口
→ 前往 pantry
→ basket → pantry
→ 放下空籃
```

若外出途中因身體狀況太差提前返回，角色仍帶著原本的物流容器回到出口；action 中止時容器會留在角色實際位置，不會瞬移或消失。

### Carry Load 現在只有一條 truth

```text
Container load
= emptyLoad
+ Σ(contents × Resource.loadPerUnit)

Agent effectiveCarryLoad
= held Container load
```

`Agent.carrying` 與 `carriedResourceLoad()` 已移除。裝有 40 單位食物的籃子自然比裝 10 單位食物的籃子重，movement exertion 直接讀同一套 Container load。

## v11.7 Core Consolidation 基準仍保留

Engine 不寫死 `waterBucket / tap / mealTray / foodPantry / orange / frontDoor` 等 entity ID。World 透過 roles、restock policy、preferredResource、`interactions[affordance]`、slot capability 與 resource capability 描述場景；Spatial 負責 topology、dynamic blocker 與 Interaction Geometry；Validator 是純函式；UI 只讀正式 state 與 structured event refs。

同一個物件可以因不同 affordance 使用不同距離規則，例如：

```text
water bucket
pickup    → occupy
drinkFrom → reach
```

固定設備可以使用 `interactionPorts`，桌上物件則由 `supportId` 推導 `supportReach`。

## 現行模組

```text
src/
├─ world.js            世界初始資料、capability、policy、家具、容器與角色
├─ spatial.js          A*、Room、dynamic blocker、interaction geometry、局部環境
├─ engine.js           唯一 tick、decision、action lifecycle、resource verbs、物流流程
├─ state-validator.js  純 invariant validation
└─ ui.js               地圖、Inspector、時間線與操作 UI
```

沒有 action / recovery / seating / rest / sleep / logistics 專用 wrapper runtime。

## 已有玩法

- 人類與貓的需求、社交與移動。
- 食物、水、酒與真正 Container contents。
- 醉酒、協調、灑出、濕地、滑倒、貓腳掌沾液體與舔毛攝入。
- Serving / Plate：人類拿盤、盛食物、找座位；貓可直接吃附近盤中食物。
- Physical Transfer：角色必須真的接近來源／目的容器。
- Carry Load：負重完全由實際 held Container 與 contents 推導。
- Logistics Container：室內 bulk restock 與外出補給都使用真正物流容器。
- Rest / Sleep / Bed：短休、正式睡眠、雙人床 slot、沙發 fallback、自然醒。
- Room / local noise / comfort。
- Seeded deterministic replay、causal timeline、Inspector。
- Desktop / mobile RWD。

## 測試

GitHub Actions 在 PR 與 `main` 上執行：

```text
node --check src/*.js
node tests/v11-state-regression.mjs
node tests/interaction-geometry.mjs
node tests/refill-water-geometry.mjs
```

v11.8 regression 除玩法回歸外，也直接禁止以下架構退化：

- Engine 出現目前世界的具體 entity ID。
- `Agent.carrying` 或 `carriedResourceLoad()` 回流。
- `supply.workerId` 回流。
- Validator 修改 Engine API 或 simulation state。
- World 初始化以 entity ID 白名單處理 blocker。
- `planLabel` 等 legacy compatibility alias 回流。
- 舊 wrapper module 回流。

詳細規則見 [`docs/architecture.md`](docs/architecture.md) 與 [`docs/interaction-geometry.md`](docs/interaction-geometry.md)。
