# Activity Continuity v1 — Current Contract

Activity Continuity 回答：「一段已經真正開始、但尚未自然完成的 Activity，被較長 interruption 打斷後，是否仍是同一段 unfinished episode，以及它如何重新進入正常決策。」

Current subsystem generation：`activity-continuity-v1`。第一個 production consumer 只有 `read`。

## Truth boundary

Canonical owner 是 Agent-private `agent.activityEpisode`，不是 World state、Active Intent、Memory 或舊 Action 的副本。v1 每個 Agent 最多只有一個 current episode slot；不建立 stack、queue 或 generic scheduler。

- `Action` 仍回答角色現在具體如何執行，並在 ongoing read 時唯一持有 live `feedbackUnits / feedbackGoal` progress。
- `Intent` 仍回答角色現在為什麼做；suspended episode 不保存成 old Active Intent。
- `activityEpisode` 只回答「這段已開始的 Activity 是否仍未自然結束」，以及在沒有 live Action 時保存恢復所需的 bounded continuity payload。
- World Event 只記錄可觀察 transition；其他 Agent 不因 World Event 存在而自動知道 actor 的 private suspended state。

## Lifecycle

v1 lifecycle：

- `ongoing`：同一 episode 有 matching live `read` Action。episode 只保存 identity、target 與 `boundActionStartedTick`；progress canonical truth 在 Action。
- `suspended`：合法 interruption 已清除原 Action，但 episode 尚未自然完成。此時 episode 暫時持有 `suspendedProgress`；沒有第二份 live Action progress。
- `completed`：domain-defined natural read completion；terminal，不能 resume。
- `abandoned`：episode suspended 後，正常 Deliberation 選了另一個 ordinary Activity；terminal。
- `invalidated`：原 target 已永久不存在或不再提供 `read` affordance；terminal。暫時不可達不等於 invalidated。

Terminal episode 可以留在 Agent-private current slot 作當下 canonical lifecycle evidence；之後新的 realized Activity 可以建立新的 episode 並取代它。不建立 episode history registry；歷史由既有 World Event / Memory contract 負責。

## Start boundary

`read` 在 plan、approach 或剛建立 Action 時都不算已開始 continuity episode。只有 `feedbackUnits > 0`，也就是至少發生一次 realized reading feedback 後，才建立 episode。

這避免把「正走去書旁邊但還沒讀」誤算成 unfinished Activity，也與 Learned Habit 對 realized experience 的邊界一致。

## Progress ownership transfer

同一進度任何時刻只能有一個 canonical owner：

1. `ongoing`：live Action 持有 `feedbackUnits / feedbackGoal`；episode 的 `suspendedProgress = null`。
2. emergency suspension：在 Action 被清除前，將進度原子轉移到 episode `suspendedProgress`，並清除 `boundActionStartedTick`。
3. resume：Deliberation 建立全新的 concrete `read` Action 後，把 `suspendedProgress` 移回新 Action，再清掉 episode 的 suspended copy。
4. completion / abandonment / invalidation：terminal episode 不保存 progress copy。

因此 continuity 不保存 stale path、reservation、phase、interaction witness 或整份舊 Action。

## Emergency interruption seam

v1 只把 `read` 加入既有 `EMERGENCY_PREEMPTIBLE` policy；soft reconsideration 仍不包含 `read`，hard replan contract 不變。

Activity Continuity 使用 named runtime hook `beforeTick` order 790，在既有 `intent.replan-preemption` order 800 之前檢查 canonical `emergencyChoice`，並只在 `buildAction` 能建立該 emergency Action 時 suspend realized read。800 隨後仍由既有 Interruption owner完成 Action cleanup、建立 emergency Intent / Action 與 `intentPreempt` event。

這表示 suspend 不會因一個不可執行的 emergency proposal 提前發生，也不會重寫 hard replan owner。

## Resume decision

`suspended` 不是 auto-resume。Activity Continuity 以 normal Decision Option Provider 提供同一 `targetObject` 的 `read` option，仍由既有 chooser / Deliberation 與其他 candidates 一起比較。

v1 bounded score：

```text
resume score = max(0,
  20
  + 20 * progressRatio
  - canonical readAccessPenalty
)
```

`progressRatio = feedbackUnits / feedbackGoal`。`readAccessPenalty` 直接使用現有 Reading / Interaction Geometry contract；continuity 不建立第二套路徑或距離成本。

這個 evidence 足以讓已有投入對「繼續」形成實際偏好，但不是 necessity：強 Need 或其他較高效用 ordinary Activity 可以勝出。若 suspended episode 後第一個 ordinary Deliberation 選擇別的 Activity，v1 將該 episode標成 `abandoned`，而不是建立長期 backlog。

如果其他既有 provider 恰好也選中同一 suspended book，仍視為恢復同一 episode；Decision Evidence 應保存真正勝出的 provider / contributors，而不是強迫把決策原因改寫成 continuity。

## Read target validity

同一 episode 綁定 exact Object identity。Resume 只對原 `targetObject` 成立：

- target missing → `invalidated`
- target 不再具 `read` affordance → `invalidated`
- target 暫時不可達 → episode 保持 `suspended`，但不產生 resume candidate
- target 再次可達 → resume candidate 可重新出現

Learned Habit 不保存 exact target identity；Activity Continuity 保存 exact target 是不同 truth，因為它描述同一段未完成 episode，而不是跨 episode 的習慣偏好。

## Hook ordering / same-tick visibility

新增 hooks：

- beforeTick 790 `activityContinuity.prepare-emergency-suspension`
- beforeTick 1250 `activityContinuity.capture-events`
- afterTick 75 `activityContinuity.settle`

Mental Regulation beforeTick 1200 仍先 capture pre-core read execution evidence；core 執行 read；Mental Regulation afterTick 50 仍先 settlement realized Need effects；Activity Continuity afterTick 75 才建立／完成 episode 或把剛由 chooser 建立的 resume Action 接回同一 episode。Spatial Effects 100 與後續 hooks 再執行。

新 Action 在 core chooser tick 只被建立、不會同 tick 執行，因此 afterTick 75 將 suspended progress 移回新 Action 不會漏掉或重複 realized read feedback。

## Events / causality

v1 emits structured World Events：

- `activityStarted`
- `activitySuspended`
- `activityResumed`
- `activityCompleted`
- `activityAbandoned`
- `activityInvalidated`

它們引用 `activityEpisodeId` / `activityKind` / target。`activityCompleted` 以 canonical domain `read` completion event 作 cause；continuity event 不取代原本 read completion truth。

## Presentation impact

Activity episode 是 Agent-private simulation state，不是 Map entity，因此 Map rendering = N/A。v1 不建立另一個 persistent Resident / Debug presentation owner；玩家可透過既有 current Action、Decision Evidence 與 Timeline World Events看到開始／中斷／恢復／完成的 observable transition。Presentation 不重新計算 episode truth。

後續若需要 dedicated Inspector projection，必須直接讀 canonical `agent.activityEpisode`，不能建立 mirror lifecycle。

## Explicit non-goals

v1 不做：

- 多 episode stack / resume queue
- arbitrary task scheduler
- soft-reconsideration read suspension
- `eat` / `sleep` / Conversation continuity
- stale Action / route / reservation resurrection
- cross-Agent shared Activity state
- automatic resume
- persistent episode history registry

## Validation obligations

Merge Gate 至少必須證明：

- Agent-private initializer 與 World truth boundary
- realized-read start boundary
- emergency suspension preserves same episode identity
- ongoing vs suspended progress 不雙寫
- resume 重新走 normal Deliberation
- stronger ordinary candidate 可讓 resume evidence 輸掉並 `abandoned`
- domain natural completion terminalizes同一 episode
- permanent target invalidation 與 temporary unreachability 分離
- initial-state / runtime-hook manifests 明確包含新 owner
- current version / docs / Browser presentation marker consistency
