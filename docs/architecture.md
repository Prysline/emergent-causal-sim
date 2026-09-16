# Architecture — Current Runtime Contract

本文件描述目前 `main` 的跨 subsystem 工程契約。它不是逐版 changelog；歷史演進請查 Git history / PR。

目前 runtime marker：`11.14.0-player-resident-view-debug-inspector`。

目前架構已超過早期 v11.10 單檔 core 模型：`engine.js` 仍持有 canonical core simulation，但 Spatial、Intent、Social Bid、Memory、Appraisal、Affect、Memory→Deliberation、Social Outcome 與 presentation 都以 extension runtime 接入。正常 app lifecycle 由 `runtime-hook-pipeline.js` 明確排序，不以 script-wrapper 疊接順序作為正式語義。

## 1. Truth boundaries

### World Truth

World Truth 包含真正發生、可被引用的物理／世界事實，例如：

- canonical World Event：`state.events / state.causes`
- Agent / Object 的物理位置
- Container / Source / Surface Environment 的實際 resource contents
- posture、held container、reservations
- Action 正在如何執行的 state machine
- Spatial topology、Surface / Contact / interaction geometry

Canonical World Event 只有一份。Memory、UI、Inspector 都只能引用或投影它，不建立第二份 World Event truth。

### Agent-private Truth

不同 Agent 各自擁有：

- `activeIntent`
- `episodicMemories[]`
- historical appraisal annotation
- current Affect
- requester-private waiting / wait-end experience
- responder-local `observedSocialBids`

一個 Agent 的 private state 不得直接取消、改寫或偽造另一個 Agent 的 private state。跨 Agent 影響必須經 World Event、observable stimulus、perception / observation 等正式邊界。

### Observed Information

「World 中存在某事」不代表所有 Agent 都知道。Episodic Memory 只保存該 Agent 實際可觀察到的 minimal projection；Social Bid responder 也只能從自己的 observed bid refs 建立 candidate。

## 2. Canonical Action / Active Intent

### Action

`action.kind` 是 Action type 的唯一正式欄位。

舊 `action.intent` alias、Action migration layer 與 `action.normalize-*` lifecycle 已移除。若 runtime 出現 legacy `{ intent: ... }` Action，Validator 應視為 invalid state，而不是自動修補。

`action.intentId` 只表示 Action → Active Intent linkage，不是 Action type mirror。

### Active Intent

`activeIntent.kind` 表示「角色為什麼正在做這件事」；`action.kind` 表示「角色正在怎麼做」。兩者不可合併成同一欄位。

現行 Intent lifecycle 包含：

- initial deliberation
- action-bound Active Intent
- hard replan / emergency preemption
- soft reconsideration / hysteresis
- requester-private `awaitResponse`
- responder-private `respondSocialBid`

### Canonical Action construction

Concrete Action construction 由 core `E.buildAction(agent, choice)` 統一持有。Initial deliberation、hard replan、soft reconsideration 與 Memory→Deliberation correction 不得再保存平行的 Action construction switch。

Factory 只建立 Action shape；candidate utility、target policy、Intent lifecycle、plan event、responder scoring 不屬於 factory 責任。

Caller 已明確選定的 `targetAgent / targetObject / targetTile / job / destination / carrier` 必須優先保留；不得因 factory fallback 靜默換掉 explicit social target。

## 3. Decision option providers

Subsystem 若需要把正式 observation / private state 衍生出的 candidate 接入 core chooser，使用 decision-option provider。

Provider contract：

- 只提出 candidate，不直接建立 Action。
- 不直接建立 Active Intent / World Event。
- 不修改 Agent persistent/private state。
- candidate 與 core needs / logistics options 一起競爭。
- 可以附最小 provenance，供 candidate 被選中後的 subsystem settlement 使用。

Social Bid responder 是目前正式使用者：Human 對 Cat `socialAffection` 的 response candidate 直接由 responder-local `observedSocialBids` 產生，不再使用 `pendingInteraction / cat_request / accepted / catRequestExpired` compatibility bridge。

## 4. Social Bid / response agency

Social Bid 是 observable World Event，不是共享心理 lifecycle entity。

Requester 與 responder 分別持有自己的 private state：

```text
World Event: Social Bid
├─ requester: awaitResponse / private wait-end experience
└─ responder: observedSocialBids / optional respondSocialBid Intent
```

必須維持：

- requester timeout 不得遠端取消 responder Intent；
- responder 可以延後回應；
- late response 可以和先前 requester wait-end experience 共存；
- same-tick response-before-timeout ordering 由 regression 鎖定；
- brief reply、explicit decline、no response 是不同事實；
- no response 不得推論 intentional ignore / dislike / rejection。

Human talk response 與目前 Pet response 都由 responder 自己的 state 決定。目前 responder scoring 尚未直接讀 Current Affect、Relationship 或 target-specific Memory influence。

## 5. Memory / Appraisal / Affect

### Episodic Memory

每個 Agent 保存 bounded `episodicMemories[]`。

Generic observed-event memory 保存最小 provenance / projection，例如：

- `sourceEventId`
- `observedTick / lastObservedTick`
- `observed.action`
- `actorId / targetId`
- `positionRef`

不複製完整 raw event data，不把 debug、utility、另一個 Agent 的 private state 帶進 memory。

同一 Agent 對同一 `sourceEventId` 只建立一個 episode；再次處理更新 access metadata，不重複建立 historical event memory。

Generic episodic eligibility 是明確的 Memory policy，不得只靠「event 剛好沒有 `data.action`」來決定心理語義。普通成功 pour 的 episodic atom 是來源 `action:'pour'`；其 successful resource-transfer result 是該 action 的 non-episodic consequence，即使未來為 UI / event consistency 補上額外 action metadata，也不得因此自動多形成第二筆 episode。failed pour 若經 Spatial Effects 形成獨立 `action:'spill'` physical effect，則 `spill` 仍是另一個可觀察、可 Appraise 的 episodic event。

### Historical Appraisal

Appraisal 是 Agent-private historical annotation。第一次形成後，不因角色之後的 Need / Affect 改變而靜默重寫過去評估。

`episodicMemoryCreated` 正式 hook ordering：

```text
Base Appraisal
→ Social Response Appraisal
→ Human Social Appraisal
→ Affect Update
```

精確 implementation hook ID 仍由 runtime registry / `docs/tick-pipeline.md` 記錄。

### Current Affect

Affect 是短生命期 Agent-private current state，與 Need / Appraisal / Memory 分層。它可以由新 appraisal 更新並隨 tick decay，但目前不直接進入 Human / Cat responder scoring。

### Memory → Deliberation

目前只讓 target-related episodic history 以 bounded derived influence 進入 initiator-side social candidate，例如 `socialize / interactWithCat / seekSocialContact`。

Memory influence 不保存成另一份 persistent relationship truth。

### Private Social Outcome

`socialWaitEnded` 是 requester-private lifecycle event，generic observable Memory 刻意排除它。`social-outcome-memory-runtime-v1135.js` 將合法 no-response experience 建成 `privateSocialOutcome`，再做 requester-private appraisal / affect / retention。

這條路徑不是 generic World Event observation，不得和 generic event-created observation 合併成同一 truth boundary。

## 6. Runtime Hook Pipeline

正常 app runtime 由 `src/runtime-hook-pipeline.js` 持有：

- `E.tick`
- `E.reset`
- `E.onEpisodicMemoryCreated`

正式 phases：

```text
beforeTick
afterTick
afterReset
episodicMemoryCreated
```

Hook 必須有唯一 ID 與 explicit order；duplicate ID / unknown phase loud failure。

**Pipeline abstraction rule:** Architecture diagrams and ordering summaries use lifecycle responsibility labels. Concrete implementation hook IDs stay in source, the exact registry tables in `docs/tick-pipeline.md`, and `tests/runtime-hook-pipeline.mjs`; action-specific names must not become architecture stage names。

### Current simulation ordering

`beforeTick`：

```text
100  Requester Outcome Capture
200  Memory-to-Deliberation Baseline Capture
300  Human Social Prepare
400  Social Response Prepare
500  Affect Decay
700  Soft Reconsideration
800  Replan / Preemption
900  Social Bid Prepare
1000 Intent Reconcile
1100 Spatial Capture
```

接著只執行一次 core `tick()`。

`afterTick`：

```text
100 Spatial Effects
200 Intent Reconcile
300 Social Bid Settle
400 Abort Recovery
500 Memory Observation Process
600 Social Response Resolve
700 Human Social Resolve
800 Memory-to-Deliberation Correction
900 Private Social Outcome Process
```

上述清單是 architecture view；精確 implementation hook ID / owner / order 對照請查 `docs/tick-pipeline.md`。

UI / Resident View 可以在更晚的 presentation hooks render，但不得改 simulation truth 或取代 pipeline dispatcher。

為 isolated legacy test harness 保留的「沒有 pipeline 時 fallback wrapper」不代表正常 app contract；正常 app 不得退回以 wrapper stacking 決定 lifecycle。

## 7. Event creation / observation ownership

### 7.1 Canonical event creation

Core `engine.js` 持有唯一 canonical event creator。正式 invariant：

```text
E.addEvent === E.CORE_ADD_EVENT
```

`addEvent` 先建立單一 World Event 並寫入：

```text
state.events
state.causes
```

Event envelope 保存 creation `event.tick`。事件 commit 後，core 才發送 event-created notification；extension 可以消費通知，但不得取代 event creator 或建立第二份 persistent event truth。

Core 提供具名 event-created listener registry；這是 runtime integration mechanism，不是 canonical state。

### 7.2 Memory delivery contract

Memory 註冊具名 consumer：

```text
memory.episodic-observation
```

Event-created notification **不代表所有 event 都立即造成心理 side effect**。正式分界是事件是否在 sequential core Agent loop 中產生：

```text
canonical event created
        │
        ├─ outside core Agent loop
        │    → Memory synchronous observation
        │    → episodicMemoryCreated
        │    → Appraisal → Affect
        │
        └─ during core Agent loop
             → enqueue event reference in Memory-local FIFO
             → afterTick 500 Memory Observation Process
             → episodicMemoryCreated
             → Appraisal → Affect
```

這保留兩個重要事實：

1. beforeTick / afterTick extension 與 tick 外 direct `E.addEvent` 仍可在原本時點形成 Memory / Appraisal / Affect；
2. core Agent 依序執行時，前一個 Agent 的 event 不會突然在 loop 中更新心理 state，讓後面的 Agent 讀到舊 runtime 原本要等 core 結束後才可見的心理結果。

### 7.3 Core-loop deferred FIFO

Deferred queue 只保存尚待 Memory observation 的 event reference：

- runtime-local；
- ephemeral；
- FIFO；
- reset 時清空；
- 不寫入 simulation state；
- 不建立第二份 World Event truth。

`Memory Observation Process`（afterTick 500）只 flush 這個 queue，不再掃描 `state.events` 猜測哪些 event 是新事件。

因此舊的：

- Memory `E.addEvent = ...` wrapper；
- beforeTick `memory.capture-events` marker；
- newest-event marker sweep；

都不再是 Current runtime contract。

### 7.4 Timing compatibility

PR #45 / #46 建立的 deterministic timing baseline 是這個 lifecycle 的 compatibility contract：

- tick 外 direct `E.addEvent`：同步 observation；
- pre-core Human social offer：core 執行前已合法形成 Memory；
- core-loop event：before afterTick 500 不得形成心理 projection，500 後才可見；
- Social Response Resolve 600：response event 的合法 Memory / Appraisal / Affect 在後續 650 probe 前完成；
- Human Social Resolve 700：response event 的合法 Memory / Appraisal / Affect 在 750 probe 前完成，且早於 Memory-to-Deliberation Correction 800；
- deferred path 使用 canonical `event.tick` 保存 creation-time provenance；
- same-source event 對同一 Agent 仍 exactly-once 建立 episode / Appraisal / Affect。

### 7.5 Private social outcome boundary

`privateSocialOutcome` 仍是 requester-private experience path，不是 generic World Event observation。Event-created lifecycle cleanup 不改這條 truth boundary。

## 8. Presentation ownership

### Canonical event text

Event producer 自己決定 canonical event text。UI 只能 render，不得攔截 event creator 後改字。

### Action label

Core 保持 `E.actionLabel` ownership。Presentation 若要補 readable status，使用具名 action-label resolver；resolver 是 derived projection，不得建立 Action / Intent / Event 或修改 simulation state。

### Recent social status

`recentSocialByAgent` cache 已移除。Recent response / recent talk 由 bounded canonical events + `event.tick` 推導。

### Inspector render / decorator lifecycle

Player Resident View 與 Debug Inspector 都是同一 authoritative simulation state 的 projection。View / tab switch 必須 state-inert。

Base `ui.js` 是 `#inspector` 的唯一 render owner。它先提交 base Inspector DOM，再同步執行 `window.SimUI.registerInspectorDecorator(id, handler, order)` 註冊的 presentation decorators；decorator 不得以 `MutationObserver` 或 catch-all document click 猜測 Inspector 何時重畫完成。

現行 presentation-only decorator order：

```text
100  Spatial Observability
200  Spatial Environment
300  Active Intent
400  Episodic Memory
500  Historical Appraisal
600  Current Affect
700  Memory Retention
800  Memory → Deliberation
900  Requester Social Outcome Memory
1000 Resident View / Debug Layer
```

這些數字只表示 **Inspector composition order**，不是 simulation Runtime Hook Pipeline 的 phase/order；Architecture 圖仍應以 lifecycle responsibility 描述，不把 UI section 名稱提升為 simulation stage。

Resident View 是最後一層 presentation decorator：它直接接收 base UI 傳入的 selected entity context，將已完成 decorators 的 Debug Inspector 包入 Resident/Debug shell，不再解析 `.inspect-title` 找 Agent，也不再以 `MutationObserver` 搬運重建後的 DOM。afterTick 1100 `residentView.schedule` / afterReset 700 `residentView.reset` 仍只負責 presentation refresh/reset，不取得 simulation lifecycle ownership。

`ui-spatial-observability.js` 對 map/actions 的 derived DOM sync 可以保留自己的 observer；**Inspector 不在該 observer ownership 內**。任何後續 Inspector extension 應註冊具名 decorator，而不是重新觀察 `#inspector`。

## 9. Spatial / resources / sleep invariants

### Spatial

- Agent 與可定位 Object 透過 Spatial API 回答 node。
- floor environment 由 floor surface contents 持有；家具 Surface Environment 由 Surface Cell contents 持有。
- Interaction Geometry 依 affordance + target data 推導合法操作位置。
- dynamic blocker / Contact / supported contact 不建立重複 location truth。

詳見 [`interaction-geometry.md`](interaction-geometry.md)。

### Resources / logistics

- `Agent.held + Container.contents` 是搬運與資源位置的正式 truth。
- 舊 `Agent.carrying` 不存在。
- transfer / serving / restock / external supply 都必須遵守 physical resource conservation 與合法 Interaction Geometry。

### Sleep

- `fatigue` 與 `sleepNeed` 分離。
- circadian pattern / phase offset 是 bias，不是第二份 clock。
- sleeping target 的 stimulus、wake、response 是不同事實。
- wake 不自動等於 social response。

## 10. Validator / regression contract

Validator 是 pure invariant checker，不應修補 state 或改 Engine API。

Regression 優先鎖：

- Single Source of Truth；
- World / Agent-private / Observed Information boundary；
- canonical Action terminology / construction；
- Intent interruption semantics；
- Social Bid requester / responder agency；
- event creation ownership / event-created consumer registry；
- event / memory provenance；
- bounded Memory / retention；
- Appraisal historical stability；
- Affect provenance；
- runtime hook ordering；
- state-inert presentation；
- deterministic long-run Validator 0。

對 emergent behavior，不用「最後必須固定做某個 Action」代替 causal invariant。Focused causal story / counterfactual A/B 應只改目標變數，鎖住真正的因果差異。

## 11. Current integration priority

Memory event-observation 的 `E.addEvent` wrapper / marker-sweep integration debt 已由 core-owned event-created lifecycle 收斂。後續不得重新引入 extension-owned `E.addEvent` wrapper 或第二份 event lifecycle truth。

Resident View / Debug Inspector 原本的 DOM shell / MutationObserver coupling 已由 explicit Inspector render/decorator lifecycle 收斂。Current invariant：

- `ui.js` 是 Inspector base render owner；extension 只註冊具名 presentation decorator；
- Inspector decorator order 必須 deterministic，且不依賴 script observer race / DOM title parsing；
- Resident / Debug 仍是同一 authoritative state 的 projection，mode/tab switch 必須 state-inert；
- presentation state 不得寫回 canonical simulation state；
- map/actions 等其他 derived DOM observer 不得重新擴張成 Inspector ownership；
- 本次 cleanup 不改 responder scoring、Relationship、Memory influence 或 gameplay policy。

此 presentation debt 完成後，不在本文件提前指定下一個產品／玩法 slice；後續工作應重新以 Current Integration Debt 與 subsystem Active Design 為準。
