# Emergent Causal Simulator

湧現式因果模擬器。用少量可組合規則觀察角色、物件、資源與環境如何自行形成因果鏈。

目前版本：**v11.7・Core Consolidation**。

v11.7 不新增玩法，主要把 v11.1～v11.6 已完成的系統重新收斂成正式 core contract：World 只描述資料與 capability；Spatial 負責拓撲、阻擋與 interaction geometry；Engine 不再綁定目前場景的具體 entity ID；Validator 是純函式；UI 只讀正式 state 與 structured event refs。

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

Agent.position
→ 角色位置唯一真相

Agent.action
→ 唯一 action state machine

Agent.posture
→ standing / sitting / lying 正式世界狀態

state.reservations
→ 暫時 exclusive 使用
```

舊版六個環境 `Zone`、`location`、`plan`、wrapper tick 與 UI enhancer 都不再是現行架構。

## v11.7 Core Consolidation

### Engine 不認具體場景 ID

Engine 不再寫死 `waterBucket / tap / mealTray / foodPantry / orange / frontDoor` 等 entity ID。

目前場景透過資料描述：

```text
roles
restock policy
preferredResource
interactions[affordance]
slot capability
resource capability
```

例如補充系統不再分成特殊的「補水桶」與「補現成食物」executor，而是：

```text
Container.restock
→ resource
→ low threshold
→ strategy
→ sourceRole
```

Engine 依 policy 建立 `restockContainer` action。

### Interaction Geometry 真的使用 affordance

同一個物件可以因不同動作使用不同距離規則：

```text
water bucket
pickup    → occupy
 drinkFrom → reach
```

固定設備可以使用 `interactionPorts`，桌上物件則由 `supportId` 推導 `supportReach`。

### 阻擋不再 cache 在 Tile

`Tile.walkable` 只代表 terrain base。家具、固定容器與 Source 是否阻擋移動，由 `SimSpatial.blockerAt()` 根據目前世界實體即時計算；固定物件移動後不會留下 stale `staticBlockedBy`。

### Validator 純函式

```text
SimValidator.validateState(state)
```

只回傳 validation result，不修改 Engine namespace，也不把結果寫回 simulation state。

### Supply owner 單一真相

不再保存 `supply.workerId`。目前補給者由：

```text
Agent.action.intent === externalSupply
```

直接推導。

### Event 關聯使用 structured refs

事件會在 `event.data.entities` 保存 `agent:* / container:* / source:* / furniture:* / slot:*` refs。Inspector 的「最近相關事件」不再靠中文字串搜尋角色名或物件名。

## 現行模組

```text
src/
├─ world.js            世界初始資料、capability、policy、家具與角色
├─ spatial.js          A*、Room、dynamic blocker、interaction geometry、局部環境
├─ engine.js           唯一 tick、decision、action lifecycle、resource verbs
├─ state-validator.js  純 invariant validation
└─ ui.js               地圖、Inspector、時間線與操作 UI
```

沒有 action / recovery / seating / rest / sleep 專用 wrapper runtime。

## 已有玩法

- 人類與貓的需求、社交與移動。
- 食物、水、酒與真正 Container contents。
- 醉酒、協調、灑出、濕地、滑倒、貓腳掌沾液體與舔毛攝入。
- Serving / Plate：人類拿盤、盛食物、找座位；貓可直接吃附近盤中食物。
- Physical Transfer：角色必須真的接近來源／目的容器。
- Carry Load：Container contents 與抽象 hauling 共用重量公式。
- Rest / Sleep / Bed：短休、正式睡眠、雙人床 slot、沙發 fallback、自然醒。
- Room / local noise / comfort。
- 外出補給與室內 restock。
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

v11.7 regression 除玩法回歸外，也直接禁止以下架構退化：

- Engine 出現目前世界的具體 entity ID。
- `supply.workerId` 回流。
- Validator 修改 Engine API 或 simulation state。
- World 初始化以 entity ID 白名單處理 blocker。
- `planLabel` 等 legacy compatibility alias 回流。
- 舊 wrapper module 回流。

詳細規則見 [`docs/architecture.md`](docs/architecture.md) 與 [`docs/interaction-geometry.md`](docs/interaction-geometry.md)。
