# Emergent Causal Simulator

湧現式因果模擬器。用少量可組合規則觀察角色、物件、資源與環境如何自行形成因果鏈。

目前版本：**v11.9・Sleep Pressure / Circadian Profile**。

v11.9 延續 v11.8 的 Logistics Container，不改動既有物理物流 contract，而是把原本同時承擔「活動累」與「沒睡夠」的 `needs.fatigue` 拆開。現在 `fatigue` 主要代表活動造成的短期身體疲勞；`sleepNeed` 代表清醒時間累積的睡眠需求。短休能有效恢復 fatigue，但角色只要仍醒著，sleepNeed 就不會因此消失；真正睡眠才會降低 sleepNeed。睡眠決策與自然醒則讀取物種預設的日夜節律、Agent 個體相位偏移、sleepNeed 與少量 fatigue，而不再用固定 fatigue 門檻把睡眠當成長版休息。

## 核心模型

```text
World data
→ Entity capability / role / policy

Species sleep profile
→ diurnal / nocturnal / crepuscular 預設節律與睡眠參數

Agent traits
→ 可覆寫 circadianPattern / circadianPhaseOffsetMinutes

Agent.needs.fatigue
→ 活動造成的短期身體疲勞

Agent.needs.sleepNeed
→ 清醒累積的睡眠需求

Derived circadianSleepBias / sleepPropensity
→ 世界時間 + 物種 profile + 個體相位即時推導，不另存第二份 truth

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

## v11.9 Sleep Pressure / Circadian Profile

### Fatigue 與 Sleep Need 正式分離

```text
fatigue
→ 搬運、步行、工作等活動增加
→ rest / sleep 都能降低

sleepNeed
→ 只要醒著就隨時間增加
→ rest 不會降低
→ sleeping 才會降低
```

因此角色可以「身體已經休息夠了，但仍然沒睡夠」，也可以「剛睡飽但做了大量體力活動，所以只想躺一下」。

被動 fatigue drift 已大幅降低，避免把單純清醒時間重複算進 fatigue；`applyExertion()` 仍是活動疲勞的主要來源。

### 節律由物種提供預設，Agent 可以偏移

目前 Species profile：

```text
human → diurnal（日行性）
cat   → crepuscular（晨昏性）
```

Engine 不直接寫 `if cat then ...` 決定作息，而是取得 Agent 的 effective sleep profile。Agent 未來可用：

```text
traits.circadianPattern
traits.circadianPhaseOffsetMinutes
traits.sleepRecoveryRate
```

覆寫預設。`circadianPhaseOffsetMinutes` 用來表達同一物種內的早型／晚型個體，而不是把晚睡型人類直接改成 nocturnal。

`circadianSleepBias` 只是一個 bias，不是 hard gate；sleepNeed 足夠高時，日行性角色白天仍可能睡。

### Sleep Propensity 是 derived state

```text
sleepPropensity
= sleepNeed
+ circadianSleepBias
+ 少量極端 fatigue contribution
```

它不保存進 Agent state，避免建立第二份睡眠真相。日夜 bias 直接由 `state.minute`、species pattern 與 Agent phase offset 推導。

### Rest 與 Sleep 不再只是恢復速率不同

`rest`：

```text
找 canRest surface
→ 坐／躺／蜷著清醒休息
→ fatigue 逐 tick 降低
→ sleepNeed 仍因清醒時間增加
→ 達到 fatigue 目標或休息上限後結束
```

`sleep`：

```text
sleepNeed + circadian bias 形成睡眠傾向
→ 找 canSleep slot
→ 躺下並進入 sleeping phase
→ fatigue 降低
→ sleepNeed 依 sleepQuality / noise / recovery profile 降低
→ sleepNeed 足夠低且時段清醒傾向回升時自然醒
```

午睡與整段主睡眠不拆成兩種 action；同一套 sleep 規則會依 sleepNeed 與時段自然產生不同長度。

### Wake conditions

正式睡眠現在可以因以下條件結束：

- sleepNeed 已降到自然醒範圍，且 circadian wake tendency 足夠；
- 極端口渴；
- 極端飢餓；
- 強烈局部噪音；
- species profile 的最大睡眠時間安全上限。

醒來不等於起床。Sleep action 結束後 Agent 可以繼續保持 `lying` posture；只有真正開始移動時才由 movement lifecycle `standUp()`。

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
├─ world.js            世界初始資料、species profile、capability、policy、家具、容器與角色
├─ spatial.js          A*、Room、dynamic blocker、interaction geometry、局部環境
├─ engine.js           唯一 tick、decision、睡眠壓力、action lifecycle、resource verbs、物流流程
├─ state-validator.js  純 invariant validation
└─ ui.js               地圖、Inspector、時間線與操作 UI
```

沒有 action / recovery / seating / rest / sleep / logistics 專用 wrapper runtime。

## 已有玩法

- 人類與貓的需求、社交與移動。
- fatigue / sleepNeed 分離，物種節律、個體相位覆寫與 derived sleep propensity。
- 短休、正式睡眠、雙人床 slot、沙發 fallback、自然醒、口渴／飢餓／噪音喚醒。
- 食物、水、酒與真正 Container contents。
- 醉酒、協調、灑出、濕地、滑倒、貓腳掌沾液體與舔毛攝入。
- Serving / Plate：人類拿盤、盛食物、找座位；貓可直接吃附近盤中食物。
- Physical Transfer：角色必須真的接近來源／目的容器。
- Carry Load：負重完全由實際 held Container 與 contents 推導。
- Logistics Container：室內 bulk restock 與外出補給都使用真正物流容器。
- Room / local noise / comfort。
- Seeded deterministic replay、causal timeline、Inspector。
- Desktop / mobile RWD。

## 測試

GitHub Actions 在 PR 與 `main` 上執行：

```text
node --check src/*.js
node tests/v11-state-regression.mjs
node tests/sleep-pressure.mjs
node tests/logistics-invariants.mjs
node tests/interaction-geometry.mjs
node tests/refill-water-geometry.mjs
```

v11.9 的睡眠 regression 直接驗證：

- human 預設 diurnal、cat 預設 crepuscular；
- nocturnal override 與 phase offset 會改變 derived circadian bias；
- 短休降低 fatigue，但不清除 sleepNeed；
- 高 fatigue / 低 sleepNeed 選短休；高 sleepNeed / 低 fatigue 仍能選睡眠；
- 自然醒不要求 fatigue 降到固定值，且醒來後仍可保持躺姿；
- 極端口渴與強烈噪音能中斷睡眠；
- 真正 sleeping 會降低 sleepNeed。

既有 v11.8 regression 仍禁止 Engine 綁定場景 entity ID、`Agent.carrying` 回流、重複 supply owner truth、Validator mutation 與其他 legacy architecture 退化。

詳細規則見 [`docs/architecture.md`](docs/architecture.md) 與 [`docs/interaction-geometry.md`](docs/interaction-geometry.md)。
