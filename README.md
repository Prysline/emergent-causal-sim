# Emergent Causal Simulator

湧現式因果模擬器。這個專案用少量可組合的底層規則，觀察角色、物件、資源、記憶與環境如何自行形成沒有被作者逐條寫死的因果鏈。

目前 runtime marker：**v11.14.3・Natural Player Explanations**（`11.14.3-natural-player-explanations`）。

> README 只保存目前架構概要；跨 subsystem 工程契約見 [`docs/architecture.md`](docs/architecture.md)，版本升級規則見 [`docs/versioning.md`](docs/versioning.md)，Interaction Geometry 細節見 [`docs/interaction-geometry.md`](docs/interaction-geometry.md)。版本演進以 Git history / PR 為準，不在 README 堆逐版 changelog。

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
- canonical `E.baseUtilityForAction(agent, actionKind)`，initial chooser 與 soft reconsideration 共用 species-aware deterministic baseline；initial selection noise 與 soft switching policy 分離。
- initial `system + phase:'plan'` event 是 private-cognition provisional record；同 tick Memory→Deliberation correction 只會 normalization 同一筆明確標記的 provisional plan，不新增第二筆 correction event。
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
- ordinary successful resource-transfer consequence 是明確 non-episodic outcome；成功 `pour` 仍由來源 action episode 表達，失敗 `spill` 則可作為獨立 observable physical effect。

### Presentation

- Player Resident View 與 Debug Inspector 共用同一 authoritative simulation state。
- Resident View 的「現在」分成三層：Action 表示角色正在具體做什麼；Intent 表示這個行動服務的短期目的；Explanation 只在 final decision evidence 與 live Action 對齊時說明為什麼此刻選了它。
- Resident Action 會把 raw phase 名稱與工程座標轉成玩家可讀描述；完整 phase / spatial goal 仍留在 Debug。
- Resident Intent label 必須覆蓋 canonical Intent kind，不得用不存在的 presentation-only kind 造成 fallback；Explanation 不應只是重述 Intent。
- Player Explanation 優先使用可由同一 evidence 直接支持的日常說法，例如「因為肚子餓了」「因為口渴」「因為累了」「因為想睡了」「因為想找人說說話」；不把 engine threshold 翻成「需求已經變得明顯」之類系統語言。精確需求強度仍留在 Needs / Debug；若沒有可靠的具體原因，使用保守抽象描述或省略，不自行補心理敘事。
- stale / mismatch decision evidence 不顯示 Explanation，raw utility / score / threshold / Memory delta 仍留在 Debug。
- UI 不得改寫 canonical event text。
- core 保有 `E.actionLabel` ownership；presentation 透過 action-label resolver 派生 readable status。
- recent social presentation 直接從 bounded canonical events + event creation `tick` 推導，不保存第二份 `recentSocialByAgent` lifecycle cache。
- `ui.js` 是 Inspector base render owner；Spatial / Intent / Memory / Appraisal / Affect / Retention / Memory→Deliberation / Social Outcome 使用具名且排序明確的 Inspector decorator，不再以 MutationObserver 充當 Inspector completion lifecycle。

## Runtime lifecycle

正常 app runtime 由 `src/runtime-hook-pipeline.js` 持有 `E.tick / E.reset / E.onEpisodicMemoryCreated`。

正式 phases：

```text
beforeTick
afterTick
afterReset
episodicMemoryCreated
```

Subsystem 使用具名 hook + explicit order，不再靠「最後載入的 wrapper 包住前一個 wrapper」決定跨系統語義。Script load order可以決定 registration 發生時間，但不能充當 lifecycle semantic contract。所有會註冊 runtime hook 的 extension 都要求 production pipeline 已存在；目前沒有第二套 no-pipeline compatibility lifecycle。

## Memory event observation lifecycle

Core 保有 canonical event creation ownership。`E.addEvent` commit `state.events / state.causes` 後會發出具名 event-created notification；Memory 透過 listener 消費 notification，不覆寫 `E.addEvent`，也不再用 marker sweep 掃描 `state.events` 猜測新事件。

Observation 依 producer 邊界分流：

- pre-core / post-process / tick 外 direct API 等非 core Agent loop producer：event-created 後同步形成 eligible psychological observation；
- core sequential Agent loop 內建立的 event：Memory 只把 source event reference 排入 Memory-local ephemeral FIFO，在 `afterTick` order 500 `memory.process-events` 依 creation order flush；
- deferred processing 仍使用 source event 的 creation `event.tick` 作 `observedTick` provenance，不把 afterTick processing time 當成事件發生時間；
- same source event 維持 exactly-once episodic / Appraisal / Affect projection；
- `system` plan 等 private cognition 仍是 non-episodic，event-created notification 不等於 generic Memory eligibility。

因此目前正式 contract 是 **core-owned event creation + event-created notification + Memory-controlled delivery**。舊 Memory `E.addEvent` wrapper、`memory.capture-events` 與 marker sweep 已移除；詳細 ordering / ownership contract 見 [`docs/architecture.md`](docs/architecture.md) 與 [`docs/tick-pipeline.md`](docs/tick-pipeline.md)。

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
- presentation observability contract，包括 runtime / UI / app shell / README 的 current version consistency、Resident Action / Intent / Explanation semantic boundary，以及 player Explanation 的自然語言原則。

另有 Chromium Browser QA 驗證 Social Response、Human Social Response、Memory、Resident View、mobile controls 與 UI state-inert behavior。Regression 優先鎖 authoritative state、truth boundary、causal linkage 與 deterministic invariants，而不是要求 emergent simulation 每次都走唯一固定劇情。

## 執行

本專案可直接由靜態 HTTP server 提供 `index.html` 與 `src/` 資源；GitHub Pages 用於目前部署驗證。
