## 11.48 carrying-state re-deliberation integration

Post-pickup placement invalidation now enters an explicit Deliberation carrying context before physical fallback. Deliberation may adopt a fresh `carryAgent` placement plan or stationary wait while canonical `agentCarries` stays unchanged. Every adopted replacement gets a new Decision identity and may link to the prior decision through `priorDecisionId`. Domain policy may register semantic placement proposals; Agent Carry neutral recovery placement supplies the generic safety proposal. Spatial / Route / Physical remain geometry / accessibility / legality authorities. `recoveryBlocked` stays the anti-orphan safety net and recovery completion never becomes original relocation success.

# Agent carry / relocate v1

本文件描述 Agent carry / relocate 的 current runtime contract。`11.45.0-agent-carry-relocate` 建立 v1 底層能力；`11.46.0-sleep-carry-integration` 將 sleeping occupant 路徑接入 Sleep preferred Slot conflict。forced relocation / combat / restraint 仍不在目前範圍；awake cooperative carry 已由 11.47 Social Bid responder contract 接入。

## Canonical truth

- Agent carry 使用獨立的 World relation：`state.agentCarries`。
- relation 以 carried Agent id 為 key，保存 `carrierId / carriedAgentId / method / responderMode / establishedTick`；carrier → carried reverse lookup 必須由同一份 relation 推導，不保存 competing mirror。
- `responderMode` 記錄 carry relation 建立當下的 responder mode，屬於 establishment provenance，不是之後 responder 當前狀態的 mirror。
- Agent carry 不使用 Container 專用的 `Agent.held`。
- relation 成立期間，carried Agent 的 ordinary `position` 為 `null`，posture 為專用 `carried`；不得同時保存 floor / Slot occupancy truth。
- carried Agent 的可觀察 Spatial Node / position 由 relation 指向的 carrier 投影；投影不是第二份 persistent position。

## v1 capability

唯一 carry method 是 `twoArmCarry`。

Human default capability：

- `massCapacity = 35 kg`
- `handsRequired = 2`

Cat 沒有 `twoArmCarry` capability。

mass feasibility 與 hands / geometry / traversal feasibility 分開判斷。v1 不建立 individual strength subsystem。

被抱起的 Agent 必須空手；若 `carried.held != null`，`twoArmCarry` 為 infeasible。v1 不自動放下對方持有的 Container，也不定義 nested carried load。完整 nested load composition 保留為未來能力。

## Responder boundary

v1 支援：

- cooperative awake responder；caller 必須明確提供 cooperative input。
- sleeping responder。

sleeping 不是 consent。awake 且沒有 cooperative input 時不得建立 carry relation。forced relocation、resistance、combat、restraint、damage 與 generic incapacitated resolution 均不屬於 v1。

carry relation 一旦合法建立，`responderMode` 保留建立當下 provenance；若 responder 之後的 canonical state 改變（例如由 sleeping 變成 awake），不得把舊 `responderMode` 當成新的當前狀態 truth。v1 仍不因此建立 resistance / forced-relocation resolution。

## Candidate-time vs execution-time feasibility

`SimAgentCarry.candidateAttemptability(...)` 是 read-only candidate-time query，只能消費 carrier/requester 自身 truth、explicit Agent-context observation，以及未來可由 responder 自己產生的 cooperation evidence。它不得偷讀 target hidden mass、`held`、既有 carry relation 或 body geometry。真正建立 relation 前仍必須由 `canEstablishCarry(...)` 以完整 World truth 再驗證，因此 candidate 可以存在，而 execution 仍可能因 hidden physical truth 合法失敗。

## Lifecycle

Engine 的明確 `carryAgent` Action 保持分階段 lifecycle：

`approach / pickup interaction` → `pickup` → `carry established` → `existing locomotion` → `legal placement` → `place / release` → `relation cleared` → `placement completion`

canonical events 至少區分：

- `agentPickup`
- `agentCarryEstablished`
- `agentPlacementComplete`

不得以單一 teleport action 取代 lifecycle。carry relation 有效時 carried Agent 不自行執行 ordinary Action step；carry 本身不得直接改寫 carried Agent 的 private Intent / Memory / Relationship。

## Carry-local geometry

`twoArmCarry` 不 author 第二份 carried geometry truth；由 carried Agent authoritative `physical.bodyGeometry` deterministic 派生：

```text
carryLocal.height = carried.width
carryLocal.width  = max(carried.width, carried.height × 0.60)
carryLocal.length = max(carried.length, carried.height × 0.40)
```

`0.60 / 0.40` 屬於 carry method calibration，不屬於 species / body plan。

`SimPhysical.getEffectiveTraversalEnvelope(state, carrier, mode)` 是 traversal consumer 共用入口，逐軸合成 carrier movement envelope、held Container（若有）與 carried Agent envelope。Agent carry v1 的 `twoArmCarry` 已使用兩隻手，因此 current Human 不可能同時維持另一個需要 hands 的 carried Container。

Passage / Route / Locomotion 不各自重算 Agent carry geometry；它們繼續消費 Physical 的同一 effective traversal query。

## Movement scope

- `walk`：允許。
- `step`：沿用既有 Surface maneuver geometry + hand feasibility。
- `jump`：`twoArmCarry` 明確 unsupported。
- `kneelCrawl` / `proneCrawl` / `climb`：v1 不支援；可由既有 hand/mode feasibility 排除，不建立第二套重複規則。

Passage、Route 與 Locomotion generation 本 slice 不假升；它們的 ownership / algorithm contract 未改，只是透過既有 Physical query 消費新的 effective geometry。

## Post-pickup recovery

carry relation 一旦建立，原 placement 若失效，`carryAgent` 不得直接 abort 並留下 orphan relation。Action 先把原 relocation outcome 記為 failed，再尋找 bounded nearby legal neutral floor recovery。若當下沒有合法 floor，進入 `recoveryBlocked`：同一 Action、同一 canonical relation 繼續存在，按 deterministic retry cadence 重驗。不得 teleport、不得清 relation 後回普通 Deliberation、不得偷偷改成另一個 comfort Slot，也不得借用 Social Bid `awaitResponse`。recovery 成功只代表 physical safety completion，不得記成原 relocation success。

## Placement / release

v1 只支援：

- legal floor node；
- existing Slot legality。

floor placement 必須通過現有 node accessibility / occupancy。Slot placement重用 `slotAllows / slotAvailable / slotPoseFits / slotApproachNodes` 等既有 legality；不得 fallback 到 entity position。Surface free placement 不在 v1。

release posture 必須依**放下當下**的 responder canonical state + Physical legality 決定，而不是照抄 relation 建立時的 `responderMode`。若 responder 在 release 當下仍 sleeping，只能在合法條件下落到 `lying`；若當下已 awake，則依合法 placement posture 落地。release posture 是 objective physical consequence，不替 responder 建立新的 Intent。

## Validation invariants

Validator 必須鎖定：

- relation key / ids 有效；
- carrier / carried 唯一且 v1 不形成 carry chain；
- method / capability / mass / hands 合法；
- carried Agent 沒有 competing ordinary position / Slot occupancy；
- carried posture 必須有 relation，relation 必須有 carried posture；
- projected position 與 carrier 同源；
- carried Agent 不得持有 Container；
- `responderMode` 必須是合法的 establishment provenance，但不得要求它持續等於 responder 當前 canonical state；
- carry geometry 必須可由 authoritative bodyGeometry 推導。

## Version boundary

本 slice 應提升：

- overall release / Presentation projection：`11.46.0-sleep-carry-integration`
- Agent Carry：`11.46.0-sleep-carry-integration`
- Spatial candidate-selection：`11.46.0-sleep-carry-integration`
- Spatial Traversal / Route search：維持 `11.38.0-carried-handling-risk`
- Deliberation / Decision Evidence / Sleep Slot Conflict：`11.46.0-sleep-carry-integration`
- Physical：維持 `11.45.0-agent-carry-relocate`
- Embodiment Capabilities：維持 `embodiment-capabilities-v5`

本 slice 不應為形式一致而提升：World Authoring、Furniture Catalog、Spatial Passage、Route、Locomotion、Contact、Crowding、Sleep conflict / Deliberation 等未改 contract 的 generation。
