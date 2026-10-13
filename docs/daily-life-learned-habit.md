# Daily Life Learned Habit v1

Current subsystem marker：`daily-life-learned-habit-v1`。

## 目的

Learned Habit 是 Agent-private 的 Daily Life 慢速摘要，回答「這個 Agent 在某種粗粒度時間情境下，通常傾向做哪類 Activity」。它必須來自 Agent **自己真正發生過、並形成 private experience 的行為**，而不是 Intent、計畫或尚未執行的方案。

v1 的因果流為：

```text
canonical realized World Event
→ actor 自己形成 episodic memory
→ episodicMemoryCreated
→ bounded activity-experience classifier
→ Agent.learnedHabits
→ 對既有合法 Decision Option 提供 bounded contribution
```

它不建立第二份 World Event、Action、Active Intent、schedule engine、target preference 或 generic experience database。

## Canonical state

Learned Habit 唯一 canonical truth 是 Agent-private `agent.learnedHabits`。

每筆 summary 以 `activityKind + daily-time-bucket` 為 key，只保存：

```text
activityKind
context.kind = daily-time-bucket
context.value = night | morning | daytime | evening
strength            0..1
experienceCount
lastExperienceTick
lastSourceMemoryId
```

不得保存 exact Object / Furniture / Agent target identity、exact position、Room、任意 World snapshot，或另一 Agent 的 private state。Validator 對額外 summary field 明確失敗，不允許偷偷把 target knowledge 混進 Activity Habit。

時間 bucket 固定且 deterministic：

- `night`：00:00–05:59
- `morning`：06:00–11:59
- `daytime`：12:00–17:59
- `evening`：18:00–23:59

歷史 context 由 canonical source event 當時的 event time 派生；之後查詢不得用目前時鐘回寫過去 context。

## Qualifying experience

`episodicMemoryCreated` 是 delivery seam，因為它先證明「這個 Agent 已經真的形成自己的 private experience」。Learned Habit 的小型 classifier 再沿 `memory.sourceEventId` 回到同一筆 canonical World Event，判斷該 Activity 是否已跨過最低 realized-execution threshold。

v1 僅支援三種 Activity：

- `read`：source event 為 `action:'read'` 且 `feedbackUnits > 0`。
- `eat`：source event 為 `action:'eat'`、不是 `phase:'start'`，且實際 consumed `amount > 0`。
- `talk`：source event 為已完成 interaction 的 `action:'talk'`。

Intent adoption、`phase:'plan'`、movement / approach、`wait`、`abort`、`eat phase:'start'` 都不形成 Learned Habit。Agent 觀察另一 actor 的事件，也不能因此更新自己的 Learned Habit。

v1 刻意採 activity-specific classifier，不建立 universal success / failure taxonomy。Habit formation 不要求 positive appraisal 或「喜歡」；只要求目前支援的 Activity 確實跨過 realized execution threshold。

明確暫不支援：`wander`、`rest`、`sleep`、`restockContainer`、`externalSupply` 與其他 Activity。未來只有在各自 qualifying experience boundary 足夠具體、能避免 double count 或 lifecycle ambiguity 時才升格。

## Consolidation / decay

v1 對目前三種 Activity 使用同一 deterministic profile：

```text
GAIN = 0.20
HALF_LIFE = 5040 ticks
MAX_DECISION_DELTA = 10
```

Current core 每 tick 推進 2 分鐘，因此 `5040 ticks` 等於 7 simulation days。

Effective strength 採 lazy derivation：

```text
effective = storedStrength × 0.5 ^ (ageTicks / 5040)
```

新的 qualifying experience 依下式 consolidation：

```text
next = effective + 0.20 × (1 - effective)
```

第一次 experience 因此只建立 `0.20` 的弱 summary；反覆 experience 逐步強化且永不超過 `1`。v1 不新增 per-tick global decay sweep，也不另加 recurrence bonus。

## Deliberation integration

Learned Habit **不**再註冊一個 Decision Option Provider。Current provider contract 會把不同 provider 回傳的 option 個別 append；若 Learned Habit 再註冊 provider，會製造額外 Activity candidate，而不是合併理由。

因此 v1 的 integration boundary 是：core chooser 與既有 providers 先產生合法 option；Engine 只對這些**已存在**的 `read / eat / talk` option 查詢 `SimDailyLifeLearnedHabit.decisionContributionForOption(...)`，取得 bounded `scoreDelta + contributor`。

Contribution：

```text
habitDelta = effectiveStrength × 10
```

Decision Evidence 以 `kind:'learnedHabit'` contributor 保留 provenance。Learned Habit 只能調整 existing option 的 score；不得：

- 建立新 option；
- 改寫 option target；
- 讓 infeasible Activity 變 feasible；
- 建立 Action / Active Intent；
- 繞過 target-selection legality。

Routine、Mental Regulation、Need 與 Learned Habit 因此可以共同支持同一既有 candidate。Current architecture 原本就可能讓不同 provider 各自提出自己的 `read` option；v1 不順便重構 generic candidate composer，但保證 Learned Habit 自己不新增 duplicate candidate。

## Truth boundary

- **Daily Life Learned Habit**：在這個 coarse time context，我通常傾向做哪類 Activity。
- **Usage Habit**：既然已要做某 Activity，我習慣使用哪個 target。
- **Routine**：DAY 0 / authored 的 soft temporal anchor。
- **Episodic Memory**：有限的 Agent-private historical episode。
- **Decision Evidence**：某次 adopted decision 的 frozen reason snapshot。

這些 truth 不得合併。Learned Habit 消費 existing private experience，但 canonical owner 仍屬 Daily Life；它不把自身 state 塞回 Memory，也不複製 Usage Habit 的 target identity。

## Runtime ordering

Learned Habit 在 `episodicMemoryCreated` phase 註冊 `dailyLifeLearnedHabit.consolidate`，order `50`，早於 Appraisal order `100`。此順序代表 v1 Habit formation 不依賴 appraisal valence，同時又保證輸入已經是完成建立的 canonical episodic memory。

Hook 必須進 finalized runtime-hook manifest；unknown、duplicate、missing 或 late registration 仍由既有 pipeline 明確失敗，不依賴 script wrapper / 隱式載入順序。

## Presentation boundary

v1 新增 canonical Agent-private state 與 `learnedHabit` Decision contributor，但**不新增另一份 Presentation truth**。Resident View / Debug Inspector 若顯示 adopted Decision Evidence，仍應引用既有 canonical evidence；Map rendering 對純 cognition state 為 N/A。

本 slice 不建立 dedicated Habit UI。未來若增加玩家可讀 Habit projection，必須直接投影 `agent.learnedHabits`，不得從目前 World target opportunity 反推並持久化 exact target identity。
