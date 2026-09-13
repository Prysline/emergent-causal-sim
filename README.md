# Emergent Causal Simulator

湧現式因果模擬器。用少量可組合規則觀察角色、物件、資源與環境如何自行形成因果鏈。

目前版本：**v11.10・Sleep Social Stimulus / Response**。

v11.10 延續 v11.9 的 `fatigue / sleepNeed / circadian` 睡眠模型，進一步把「發起社交行動」、「對睡眠中的目標造成刺激」、「目標是否醒來」與「目標是否回應」拆開。普通人類聊天不再把 sleeping 人類當成候選；摸睡著的貓與貓打擾睡著的人仍可發生，但接觸只形成可觀測的 stimulus，依睡眠需求、自然醒傾向、已睡時間與刺激強度推導喚醒機率，再用 seeded roll 決定是否醒來。醒來不等於回應；`petCat` 也不再固定宣告貓有回蹭，只有貓真正執行自己的親近行動時才會描述牠的主動反應。

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

Derived circadianSleepBias / sleepPropensity / naturalWakeDrive
→ 世界時間 + 物種 profile + 個體相位即時推導，不另存第二份 truth

Social stimulus
→ 發起者行動產生 touch / sound 等刺激
→ sleeping target 依 derived wake chance + seeded roll 決定是否醒來
→ 醒來與回應分離

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

## v11.10 Sleep Social Stimulus / Response

### 社交 action 不再等同雙方完整互動

現行 social interaction 明確分成：

```text
initiator action
→ 接近 target
→ 實際發生接觸／聲音
→ 若 target 正在 sleeping：形成 stimulus
→ 推導 wakeChance 並 seeded roll
→ 可能醒來，也可能繼續睡
→ 是否回應由 target 後續 action 決定
```

因此「摸到貓」不再自動代表「貓回蹭」，「貓來撒嬌」也不再自動代表睡著的人已經醒來並接收到請求。

### 普通聊天避開 sleeping target

一般 `talk` 是需要雙方清醒的對話行為：

- human decision 不會把正在 `sleeping` 的 human 列入普通聊天候選；
- 若目標在發起者走過去的途中睡著，行動會中止，而不是站在床邊繼續把它當正常聊天；
- 尚未加入 `selfTalk / mutter`。未來若需要自言自語，應是獨立 action，而不是把普通 talk 對睡著的人當 fallback。

### 摸睡著的貓

`petCat` 仍可選到 sleeping cat，因為「摸睡著的貓」本身是合理的物理／社交行為。

```text
人摸貓
→ 人獲得少量 social relief
→ 實際 touch event
→ 若貓清醒：可得到 social / comfort 效果
→ 若貓 sleeping：只形成較低幅度 comfort + touch stimulus
→ wakeChance + roll
→ 沒醒：繼續睡，明確記錄沒有明顯回應
→ 醒來：只結束 sleep；不自動生成回蹭
```

原先固定文字「摸了摸牠；牠靠過去蹭了幾下」已移除。現在 `petCat` 只敘述發起者真的做出的摸觸；貓的主動蹭只應來自貓自己的 action 或未來明確的 response action。

### 貓打擾睡著的人

Cat `seekHuman` 可以把 sleeping human 當目標。貓會真的靠近、喵叫、蹭碰，這些是**貓自己的行動**，因此可以被描述；但人的反應不再預設存在。

目前 `seekHuman` 使用較強的 `touch+sound` stimulus：

```text
貓靠近、喵叫、碰觸
→ contact event
→ 若人 sleeping：計算 wakeChance
→ 沒醒：不建立 cat_request，記錄「沒有得到立即回應」
→ 醒來：才建立短期 cat_request，讓人之後自行決定是否摸貓
```

所以「被打擾醒來」與「選擇回應貓」是兩件事。

### Interaction wake chance 是 derived value

沒有新增 persistent `sleepDepth` / `arousal` state。第一版互動喚醒機率由現有睡眠資料即時推導：

```text
wakeChance
← stimulus intensity
← naturalWakeDrive
← remaining sleepNeed
← 是否仍在最低睡眠時間以前
```

高 sleepNeed、剛入睡時，輕摸可能完全不足以叫醒；sleepNeed 已低、接近自然醒時，相同刺激更容易喚醒。實際結果使用 simulation 的 seeded RNG，因此同一 seed 可重現。

互動 disturbance event 保存：

```text
stimulusIntensity
stimulusKind
wakeChance
wakeRoll
```

若真的喚醒，`sleepWake` event 會把造成喚醒的接觸事件列入 causeIds，讓因果鏈可由 Inspector / event tree 追查。

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

因此角色可以「身體已經休息夠了，但仍然沒睡夠」，也可以「剛睡飽但做了大量體力活動，所以只想躺一下」。被動 fatigue drift 已大幅降低，避免把單純清醒時間重複算進 fatigue；`applyExertion()` 仍是活動疲勞的主要來源。

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

### Rest 與 Sleep

`rest`：找 `canRest` surface → 坐／躺／蜷著清醒休息 → fatigue 降低，sleepNeed 仍累積。

`sleep`：sleepNeed + circadian bias 形成睡眠傾向 → 找 `canSleep` slot → sleeping 時 fatigue 與 sleepNeed 都降低 → 依 sleepNeed、時段與中斷條件自然醒。

Wake conditions 包含自然醒、極端口渴、極端飢餓、強烈局部噪音、最大睡眠時間與睡眠位置失效。醒來不等於起床；Sleep action 結束後仍可維持 `lying`，真正移動時才 `standUp()`。

## v11.8 Logistics Container / Basket

World 使用真正 portable `logisticsContainer` 搬運 bulk resource。室內 food restock 與外出補給都必須先取得容器，把資源實際放入 `Container.contents`，負重由 `emptyLoad + contents × loadPerUnit` 即時推導，再於目的地做 physical transfer。`Agent.carrying` 已完全移除。

水桶補水仍使用 `carryContainer`：水桶本身就是可攜目的容器，因此不另外套物流籃。

## v11.7 Core Consolidation 基準仍保留

Engine 不寫死 `waterBucket / tap / mealTray / foodPantry / orange / frontDoor` 等 entity ID。World 透過 roles、restock policy、preferredResource、`interactions[affordance]`、slot capability 與 resource capability 描述場景；Spatial 負責 topology、dynamic blocker 與 Interaction Geometry；Validator 是純函式；UI 只讀正式 state 與 structured event refs。

同一個物件可以因不同 affordance 使用不同距離規則，例如：

```text
water bucket
pickup    → occupy
drinkFrom → reach
```

## 現行模組

```text
src/
├─ world.js            世界初始資料、species profile、capability、policy、家具、容器與角色
├─ spatial.js          A*、Room、dynamic blocker、interaction geometry、局部環境
├─ engine.js           唯一 tick、decision、sleep/social derived logic、action lifecycle、resource verbs、物流流程
├─ state-validator.js  純 invariant validation
└─ ui.js               地圖、Inspector、時間線與操作 UI
```

沒有 action / recovery / seating / rest / sleep / social-response / logistics 專用 wrapper runtime。

## 已有玩法

- 人類與貓的需求、社交與移動。
- fatigue / sleepNeed 分離，物種節律、個體相位覆寫與 derived sleep propensity。
- 短休、正式睡眠、雙人床 slot、沙發 fallback、自然醒、口渴／飢餓／噪音喚醒。
- 睡眠中社交刺激：摸睡著的貓、貓打擾睡著的人可能喚醒，也可能無反應。
- 普通聊天只選清醒的人；醒來與回應分離。
- 食物、水、酒與真正 Container contents。
- 醉酒、協調、灑出、濕地、滑倒、貓腳掌沾液體與舔毛攝入。
- Serving / Plate、Physical Transfer、Carry Load、Logistics Container。
- Room / local noise / comfort。
- Seeded deterministic replay、causal timeline、Inspector。
- Desktop / mobile RWD。

## 測試

GitHub Actions 在 PR 與 `main` 上執行：

```text
node --check src/*.js
node tests/v11-state-regression.mjs
node tests/sleep-pressure.mjs
node tests/social-sleep-interaction.mjs
node tests/logistics-invariants.mjs
node tests/interaction-geometry.mjs
node tests/refill-water-geometry.mjs
```

`social-sleep-interaction` regression 直接驗證：

- 普通人類 talk 不把 sleeping human 列為候選；
- 高 sleepNeed、剛入睡的貓可在被輕摸後繼續睡；
- `petCat` 不再固定生成貓回蹭文字；
- sleeping cat 未醒時會留下無回應與 wake chance / roll 的結構化事件；
- cat 可以打擾 sleeping human；只有真的喚醒後才建立可回應的 `cat_request`；
- 互動喚醒保留 contact event → sleepWake 的 cause chain；
- 清醒貓被摸時也不會由 `petCat` action 自動虛構 reciprocal rub。

既有睡眠、3 Seed × 800 tick、deterministic replay、物流守恆、Interaction Geometry、portable water restock 與 architectural regression 仍共同執行。

詳細規則見 [`docs/architecture.md`](docs/architecture.md) 與 [`docs/interaction-geometry.md`](docs/interaction-geometry.md)。
