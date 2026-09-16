# Emergent Causal Simulator

湧現式因果模擬器。這個專案用少量可組合的底層規則，觀察角色、物件、資源、記憶與環境如何自行形成沒有被作者逐條寫死的因果鏈。

目前 runtime marker：**v11.14.0・Player Resident View / Debug Inspector Split**（`11.14.0-player-resident-view-debug-inspector`）。

> README 只保存目前架構概要；跨 subsystem 工程契約見 [`docs/architecture.md`](docs/architecture.md)，Interaction Geometry 細節見 [`docs/interaction-geometry.md`](docs/interaction-geometry.md)。版本演進以 Git history / PR 為準，不在 README 堆逐版 changelog。

## 核心原則

### 一個事實只保留一份 authoritative truth

- World Event 只有一份 canonical event，保存在 `state.events / state.causes`。
- Agent 的位置、Action、posture、held container、Needs 等各有自己的正式欄位，不建立可失同步的 mirror state。
- Action type 的唯一正式欄位是 `action.kind`；舊 `action.intent` compatibility 已移除。
- `Agent.activeIntent` 是 Agent-private 短期目的，與 `action.kind` 分工不同；`action.intentId` 只作 Action → Active Intent linkage。
- Social Bid 是可觀察的 World Event；requester waiting、responder Intent、episodic memory、Affect 都是各 Agent 自己的 private state，不建立共享心理 lifecycle registry。
- Episodic Memory 保存 Agent-local observable projection，不複製完整 World Event，也不把另一個 Agent 的 private state當成可觀察資訊。

## 目前已具備

### Spatial / Physical world

- Room、Tile、Furniture Surface、Local Position 與 Spatial Node。
- A* traversal、dynamic blocker、supported contact、surface environment / liquid。
- Interaction Geometry 依 affordance + target data 決定合法接觸位置。
- Container / Source / Surface Environment 的實體資源 transfer、Serving、Carry Load、Restock、External Supply。

### Agent decision / action

- Needs、fatigue / sleepNeed 分離、species circadian profile、rest / sleep / wake stimulus。
- canonical `action.kind` Action state machine。
- Agent-private Active Intent。
- hard replan / emergency preemption。
- soft reconsideration / hysteresis。
- canonical `E.buildAction(agent, choice)`，initial deliberation、replan、reconsideration 與 Memory correction 共用同一 concrete Action construction path。
- decision-option provider extension point，subsystem 可提出 candidate，但仍由 core chooser 與其他需求共同競爭。

### Social agency

- Social Bid / responder-local observation / requester-private waiting 分離。
- Human talk response：engage / brief / decline / no response 是不同結果。
- Pet response：accept / tolerate / avoid 由 responder 自己的 state 決定。
- requester timeout 不會遠端取消 responder-private Intent；late response 與先前 wait-end experience 可以同時成立。
- 已移除舊 `pendingInteraction / cat_request / accepted / catRequestExpired` responder compatibility bridge。

### Memory / appraisal / affect

- bounded Agent-local episodic memory。
- minimal observable snapshot + source-event provenance。
- historical Appraisal；re-observation 不會用現在狀態靜默重寫過去的評估。
- short-lived Affect。
- salience / recurrence / recency retention。
- 第一版 target-aware Memory → Deliberation influence，只影響 initiator-side social candidate；Current Affect、Relationship 與 responder-specific Memory 尚未直接進入 responder scoring。
- requester-private `privateSocialOutcome` 可記錄「當時沒有得到立即回應」，但不推定 counterpart 故意忽略、討厭或拒絕。

### Presentation

- Player Resident View 與 Debug Inspector 共用同一 authoritative simulation state。
- UI 不得改寫 canonical event text。
- core 保有 `E.actionLabel` ownership；presentation 透過 action-label resolver 派生 readable status。
- recent social presentation 直接從 bounded canonical events + event creation `tick` 推導，不保存第二份 `recentSocialByAgent` lifecycle cache。

## Runtime lifecycle

正常 app runtime 由 `src/runtime-hook-pipeline.js` 持有 `E.tick / E.reset / E.onEpisodicMemoryCreated`。

正式 phases：

```text
beforeTick
afterTick
afterReset
episodicMemoryCreated
```

Subsystem 使用具名 hook + explicit order，不再靠「最後載入的 wrapper 包住前一個 wrapper」決定跨系統語義。Script load order可以決定 registration 發生時間，但不能充當 lifecycle semantic contract。

## 目前 active integration debt：Memory event observation

PR #42 已移除 presentation 對 `E.addEvent` 的覆寫，但 `memory-runtime-v1130.js` 目前仍以 `E.addEvent` wrapper 立即觀察 extension-emitted event；core lexical `addEvent(...)` 則主要由 `memory.capture-events → memory.process-events` marker sweep 處理。

這不是可以直接刪除的死碼：

- `memory.capture-events` 位於 `beforeTick` order 600；
- `memory.process-events` 位於 `afterTick` order 500；
- `humanSocial.prepare` 在 capture 以前建立 `talkOffer`；
- Pet / Human response runtime 在 process 之後建立 response events；
- core lexical events則落在 sweep 可涵蓋的區段。

因此目前是 **wrapper + sweep 的混合 observation contract**。下一步不是直接把所有事件都改成立即 observe，也不是全部延到 tick 尾端，而是先以 regression 鎖定 pre-core / core lexical / post-process / tick 外 direct API 的既有 timing，再設計不需要覆寫 `E.addEvent` 的正式 event-created / observation lifecycle。

特別重要：core `tick()` 會先推進 `state.tick` 再執行 Agent，canonical `event.tick` 是事件建立時間 provenance。未來即使 observation 延後，也不能用較晚的 processing tick 靜默改寫歷史時間；同時也不能讓 core Agent loop 中途突然取得舊 runtime 同 tick 看不到的 Memory / Appraisal / Affect。

詳細 contract 見 [`docs/architecture.md`](docs/architecture.md)。

## 測試與驗證

State regression 目前涵蓋：

- syntax / base state invariant；
- sleep / social / logistics / spatial / surface environment；
- Action terminology / canonical construction；
- Active Intent / Social Bid / replan / soft reconsideration；
- Episodic Memory / Appraisal / Affect / salience；
- Human / Pet responder agency；
- Memory → Deliberation / requester social outcome；
- Runtime Hook Pipeline；
- presentation observability contract。

另有 Chromium Browser QA 驗證 Social Response、Human Social Response、Memory、Resident View、mobile controls 與 UI state-inert behavior。Regression 優先鎖 authoritative state、truth boundary、causal linkage 與 deterministic invariants，而不是要求 emergent simulation 每次都走唯一固定劇情。

## 執行

本專案可直接由靜態 HTTP server 提供 `index.html` 與 `src/` 資源；GitHub Pages 用於目前部署驗證。
