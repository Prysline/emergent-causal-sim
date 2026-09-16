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

Factory 只建立 Action shape；candidate utility、target policy、Intent lifecycle、plan event、responder scoring不屬於 factory 責任。

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

Human talk response 與 Pet response 都由 responder 自己的 state 決定。目前 responder scoring 尚未直接讀 Current Affect、Relationship 或 target-specific Memory influence。

## 5. Memory / Appraisal / Affect

### Episodic Memory

每個 Agent 保存 bounded `episodicMemories[]`。

Generic observed-event memory 保存最小 provenance / projection，例如：

- `sourceEventId`
- `observedTick / lastObservedTick`
- `observed.action`
- `actorId / targetId`
- `positionRef`

不複製完整 raw event data，不把 debug、utility、另一個 Agent 的 private state帶進 memory。

同一 Agent 對同一 `sourceEventId` 只建立一個 episode；再次處理更新 access metadata，不重複建立 historical event memory。

### Historical Appraisal

Appraisal 是 Agent-private historical annotation。第一次形成後，不因角色之後的 Need / Affect 改變而靜默重寫過去評估。

`episodicMemoryCreated` 正式 hook ordering：

```text
appraisal.base
→ appraisal.social-response
→ appraisal.human-social
→ affect.from-appraisal
```

### Current Affect

Affect 是短生命期 Agent-private current state，與 Need / Appraisal / Memory 分層。它可以由新 appraisal 更新並隨 tick decay，但目前不直接進入 Human / Cat responder scoring。

### Memory → Deliberation

目前只讓 target-related episodic history 以 bounded derived influence 進入 initiator-side social candidate，例如 `socialize / interactWithCat / seekSocialContact`。

Memory influence 不保存成另一份 persistent relationship truth。

### Private Social Outcome

`socialWaitEnded` 是 requester-private lifecycle event，generic observable Memory 刻意排除它。`social-outcome-memory-runtime-v1135.js` 將合法 no-response experience 建成 `privateSocialOutcome`，再做 requester-private appraisal / affect / retention。

這條路徑不是 generic World Event observation，後續 event-observation cleanup 不得順手把兩者混成同一 truth boundary。

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

### Current simulation ordering

`beforeTick`：

```text
100  socialOutcome.capture-events
200  memoryDeliberation.capture-idle
300  humanSocial.prepare
400  socialResponse.capture-pet-offers
500  affect.decay
600  memory.capture-events
700  intent.soft-reconsideration
800  intent.replan-preemption
900  socialBid.prepare
1000 intent.reconcile-before
1100 spatial.capture
```

接著只執行一次 core `tick()`。

`afterTick`：

```text
100 spatial.effects
200 intent.reconcile-after
300 socialBid.settle
400 intent.recover-aborts
500 memory.process-events
600 socialResponse.resolve-pet-offers
700 humanSocial.resolve
800 memoryDeliberation.correct-initial
900 socialOutcome.process
```

UI / Resident View 可以在更晚的 presentation hooks render，但不得改 simulation truth 或取代 pipeline dispatcher。

為 isolated legacy test harness 保留的「沒有 pipeline 時 fallback wrapper」不代表正常 app contract；正常 app 不得退回以 wrapper stacking 決定 lifecycle。

## 7. Event creation / observation ownership

這是目前仍未完成的主要 integration debt。

### 7.1 Canonical event creation

Core `engine.js` 的 event creator 會建立 canonical event 並寫入：

```text
state.events
state.causes
```

PR #42 後 canonical event envelope 保存 `event.tick`，表示事件建立時的 simulation tick。

Presentation 不得覆寫 `E.addEvent` 來改 canonical event text。Event text / data 應由真正產生事件的 simulation subsystem 負責。

### 7.2 現行 hybrid observation model

目前 generic Memory 有兩條 event-observation path：

1. **exported API wrapper**
   - `memory-runtime-v1130.js` 暫時包住 `E.addEvent`。
   - extension 呼叫 `E.addEvent(...)` 後會同步 `observeEventForMemories(...)`。

2. **marker sweep**
   - `memory.capture-events`：beforeTick order 600 保存當時 newest event marker。
   - `memory.process-events`：afterTick order 500 掃描 marker 之後的新 events。
   - core 內部呼叫 closure lexical `addEvent(...)`，不經 exported wrapper，因此主要靠 sweep 被 generic Memory 看見。

這兩條路徑目前互補，而非完全重複。

### 7.3 Observation window

#### Pre-capture exported event

`humanSocial.prepare` 在 beforeTick 300，可建立 `talkOffer`。

它早於 `memory.capture-events` 600。若只刪除 wrapper，capture 時 `talkOffer` 已經存在並可能成為 marker，後面的 sweep 不會再處理它。

所以這類事件目前是 **wrapper-only observation**。

#### Capture → process window

Marker capture 之後、`memory.process-events` 500 之前的事件可被 sweep 涵蓋，例如：

- core tick 內的 lexical world events；
- `spatial.effects`（afterTick 100）；
- `socialBid.settle`（300；private event仍受 Memory filter 排除）；
- `intent.recover-aborts`（400）。

Exported `E.addEvent` event 若在這段先被 wrapper observe，sweep 再遇到時由 `sourceEventId` dedupe，不能重複建立 episode / appraisal / Affect。

#### Post-process exported event

`memory.process-events` 500 之後仍有正式 event producer：

- `socialResponse.resolve-pet-offers`（600）
- `humanSocial.resolve`（700）

這裡會產生 `petOffer / acceptPet / toleratePet / avoidPet / petCat` 與 `acceptTalk / briefTalkReply / declineTalk / talk`。

它們目前依賴 wrapper 立即形成 Memory / Appraisal / Affect。若只刪 wrapper，下一 tick 的 capture 會在這些事件已存在的情況下重新設 marker，因此不是保證「晚一 tick 才記住」，而可能完全漏掉 generic observation。

#### Tick 外 direct API

Memory / Appraisal focused regression 也會直接呼叫 `E.addEvent(...)`，並立刻 assertion Memory / Appraisal。這表示 isolated harness 現在同樣具有同步 observation behavior。

### 7.4 Timing 不是 API implementation detail

core `tick()` 會先 `state.tick++`，再逐一執行 Agent。

因此：

- pre-core event 可能使用舊 tick；
- core / afterTick event 使用新 tick；
- `event.tick` 是 creation-time provenance。

若未來 observation 改為 queue / checkpoint 後才處理，不得直接用較晚的 processing `state.tick` 偷換事件發生時間。

更重要的是，**不能簡單把所有 core event 都改成立即 Memory observe**。Core Agent 在同一 tick 中依序執行；若第一個 Agent 的 lexical event 立刻觸發 Memory → Appraisal → Affect，後面的 Agent 可能讀到舊 runtime 要到 core 完成後才出現的心理 state，導致同 tick decision semantics 改變。

反過來，把所有 observation 都延到 tick 尾端也不等價。Social responses 現在在 afterTick 600/700 建立後即可形成 Memory / Appraisal / Affect，而 `memoryDeliberation.correct-initial` 位於 800。

### 7.5 Cleanup target

下一個 integration slice 應先建立 deterministic timing regression，至少涵蓋：

```text
pre-core exported event
a core lexical event
post-process exported event
tick 外 direct E.addEvent
event.tick → observedTick provenance
same-event dedupe / one appraisal / one Affect application
```

之後再決定正式機制。可以評估 core-owned event-created notification + controlled observation queue/checkpoint，或其他等價設計；目前 **沒有**預先決定「所有 eventCreated 都立即執行 Memory」就是答案。

Done condition：

- Memory 不再 `E.addEvent = ...`；
- event creation API ownership 穩定；
- pre/core/post/direct 四種 producer 都不漏 observation；
- 不重複建立 memory / appraisal / Affect；
- preserve current same-tick semantics；
- deferred observation 保留 canonical `event.tick` provenance；
- `privateSocialOutcome` 仍保持 requester-private 專用路徑；
- State regression + Memory / Social Browser QA 全綠。

## 8. Presentation ownership

### Canonical event text

Event producer 自己決定 canonical event text。UI 只能 render，不得攔截 event creator 後改字。

### Action label

Core 保持 `E.actionLabel` ownership。Presentation 若要補 readable status，使用具名 action-label resolver；resolver 是 derived projection，不得建立 Action / Intent / Event 或修改 simulation state。

### Recent social status

`recentSocialByAgent` cache 已移除。Recent response / recent talk 由 bounded canonical events + `event.tick` 推導。

### Resident View / Debug Inspector

Player Resident View 與 Debug Inspector 都是同一 authoritative simulation state 的 projection。View / tab switch 必須 state-inert。

Resident View 目前仍使用 DOM shell / MutationObserver 將既有 Inspector surfaces 組成 player/debug presentation；這是獨立 presentation architecture debt，不與 Memory event-observation cleanup 混成同一 slice。

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
- event / memory provenance；
- bounded Memory / retention；
- Appraisal historical stability；
- Affect provenance；
- runtime hook ordering；
- state-inert presentation；
- deterministic long-run Validator 0。

對 emergent behavior，不用「最後必須固定做某個 Action」代替 causal invariant。Focused causal story / counterfactual A/B 應只改目標變數，鎖住真正的因果差異。

## 11. Current integration priority

目前最高優先度的架構整合債是 **Memory event observation / event-created lifecycle contract**。

在完成 timing regression 與正式 event observation ownership 前，不要：

- 直接刪除 Memory `E.addEvent` wrapper；
- 把所有 core event 改成立即 psychological observation；
- 把所有 observation 無條件延到 tick 尾端；
- 把 `privateSocialOutcome` 混入 generic observable-event memory；
- 順手重寫 Resident View DOM architecture；
- 順手把 Current Affect / Relationship / Memory 接進 responder scoring。

這些是不同 contract，應分開驗證與合併。
