# Architecture — Current Runtime Contract

本文件描述目前 `main` 的跨 subsystem 工程契約。它不是逐版 changelog；歷史演進請查 Git history / PR。

目前 runtime marker：`11.15.1-relationship-target-preference`。

版本升級邊界、patch/minor 使用方式與 current marker 同步清單見 [`versioning.md`](versioning.md)。

目前架構已超過早期 v11.10 單檔 core 模型：`engine.js` 仍持有 canonical core simulation，但 Spatial、Intent、Social Bid、Memory、Appraisal、Affect、Relationship、Memory→Deliberation、Social Outcome 與 presentation 都以 extension runtime 接入。正常 app lifecycle 由 `runtime-hook-pipeline.js` 明確排序，不以 script-wrapper 疊接順序作為正式語義。

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
- directional `relationships[counterpartId]`
- requester-private waiting / wait-end experience
- responder-local `observedSocialBids`

一個 Agent 的 private state 不得直接取消、改寫或偽造另一個 Agent 的 private state。跨 Agent 影響必須經 World Event、observable stimulus、perception / observation 等正式邊界。

Relationship 同樣遵守方向性 private truth：`A.relationships[B]` 與 `B.relationships[A]` 是兩份可能不同的 Agent-private state，不建立共享 `pairRelationship` 或全域 relationship registry。

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

動物互動使用 canonical `interactWithAnimal` Intent 與 `petAnimal` Action。是否能撫摸某 target 由 species profile / affordance 與可達性等實際條件判斷，不依 Cat / Dog / Rabbit 等物種名稱建立平行 Action kind。

### Canonical Action construction

Concrete Action construction 由 core `E.buildAction(agent, choice)` 統一持有。Initial deliberation、hard replan、soft reconsideration 與 Memory→Deliberation correction 不得再保存平行的 Action construction switch。

Factory 只建立 Action shape；candidate utility、target policy、Intent lifecycle、plan event、responder scoring 不屬於 factory 責任。

Caller 已明確選定的 `targetAgent / targetObject / targetTile / job / destination / carrier` 必須優先保留；不得因 factory fallback 靜默換掉 explicit social target。

### Canonical decision baseline

Core `E.baseUtilityForAction(agent, actionKind)` 持有既有 core candidate 的 deterministic species-aware base utility。Initial chooser 與 soft reconsideration 必須共用這一層 baseline，不得各自保存平行的 Human / Cat needs formula。

Initial chooser 可以在 canonical baseline 上加入 selection noise；這層 noise 不屬於 base utility。Soft reconsideration 刻意不重用 chooser noise，而是在同一 baseline 上套用 minimum hold、switch margin、derived commitment、protected workflow 與 shared derived influence，避免角色只因 evaluator 換了一把評分尺就在 world / needs 幾乎未變時推翻剛建立的 Intent。

Canonical baseline provider 不接管所有 candidate policy。Candidate availability、target selection、Social Bid responder-specific utility、Memory-derived target influence 與 subsystem-specific provenance 仍由各自 owner 負責；只有兩條 deliberation path 共用的 deterministic base motivation 屬於 core baseline ownership。

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

Human talk response 與目前 Pet response 都由 responder 自己的 state 決定。v11.15.1 Relationship 只接入 initiator-side social target preference；Human `talkEngagementScore`、animal `petResponseScore` 與 responder candidate policy 仍未直接讀 Current Affect、Relationship 或 target-specific Memory influence。

## 5. Memory / Appraisal / Affect / Relationship

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
100 Base Appraisal
200 Social Response Appraisal
300 Human Social Appraisal
350 Relationship Consolidation
400 Affect Update
```

Relationship 必須讀 specialized historical Appraisal 的最終結果，不自行回頭解析 raw event payload 判斷「好／壞」。精確 implementation hook ID 仍由 runtime registry / `docs/tick-pipeline.md` 記錄。

### Current Affect

Affect 是短生命期 Agent-private current state，與 Need / Appraisal / Memory / Relationship 分層。它可以由新 appraisal 更新並隨 tick decay，但目前不直接進入 Human / animal responder scoring。

### Memory → Deliberation / Relationship Target Preference

Target-related episodic history 以 bounded derived influence 進入 initiator-side social candidate；目前 canonical social intents 為 `socialize / interactWithAnimal / seekSocialContact`。

Relationship 在 v11.15.1 也只作 initiator-side target ranking signal，不改 action-level social motivation：

```text
relationshipTargetDelta = 8 × familiarity × affinity

targetPreference = memoryUtilityDelta
                 + relationshipTargetDelta
                 - distancePenalty

finalUtility = baseUtility + memoryUtilityDelta
```

正式邊界：

- `relationshipTargetDelta` bounded `[-8,+8]`；`familiarity=0` 或 `affinity=0` 時為 0。
- 負向 Relationship 只降低 target preference，不從 eligibility 移除 target。
- Relationship 不加入 `finalUtility`，因此不直接提高／降低是否選擇 social Action。
- Relationship 不修改 current-intent utility、soft-switch threshold、commitment 或 responder score。
- Memory influence 與 Relationship 都是 derived decision signals，不互相寫回，也不保存 persistent preferred-target mirror。

Initial core chooser 建立的 `system + phase:'plan'` event 是**同 tick provisional private-cognition plan**，以 `data.planLifecycle='initialProvisional'` 明示其 creation payload 尚可能在 afterTick 800 Memory-to-Deliberation Correction 被 normalization。Correction 只能改寫同一 tick、同 actor、`type:'system'`、同 lifecycle marker 且 action 對應 initial pick 的既有 canonical plan event；不得新增第二筆 correction event，也不得回頭改寫較舊 plan 或其他 plan-shaped event。Event ID / cause identity 保持不變，event-created consumer 若讀取 creation payload 必須把它視為 provisional，而不是 immutable final plan。Plan event 仍屬 private cognition / non-episodic，不進 generic Episodic Memory。

### Private Social Outcome

`socialWaitEnded` 是 requester-private lifecycle event，generic observable Memory 刻意排除它。`social-outcome-memory-runtime-v1135.js` 將合法 no-response experience 建成 `privateSocialOutcome`，再做 requester-private appraisal / relationship consolidation / affect / retention。

這條路徑不是 generic World Event observation，不得和 generic event-created observation 混成同一 truth boundary。合法 private no-response Relationship evidence 只可更新 requester → counterpart；counterpart 不會因 requester 的 private timeout 被遠端改寫。

### Relationship Foundation

Relationship 是比 episodic memory 更慢、更持久的 Agent-private dyadic summary。第一版 persistent entry 僅保存：

```text
agent.relationships[counterpartId] = {
  familiarity: 0..1,
  affinity: -1..1,
  lastUpdatedTick
}
```

語義：

- **Familiarity**＝累積直接相處歷史；只升不降，第一版不做時間衰退。熟悉不等於喜歡。
- **Affinity**＝該 Agent 長期累積下來，和 counterpart 相處時的主觀 experience 整體偏正向或負向；不是 friendship / trust / love / hate label。
- `A → B` 與 `B → A` 各自獨立；同一 encounter 可以因 subjective appraisal 不同而往不同方向變化。
- Relationship 是 historical appraisal consolidation，不是目前 hot memory 的即時計算 mirror；來源 memory 被 pruning 後，已 consolidated state 不倒退。
- 不保存 contributing memory ID list、relationship history、confidence、friendshipScore、trust 等第二份或過度語義化 state。

第一版 audited relational evidence：

- 完整 Human conversation：requester 只從 `acceptTalk` consolidation；responder 只從完成的 `talk` consolidation，避免 `talkOffer → acceptTalk → talk` 重複計分。
- `briefTalkReply / declineTalk`：direct target 可依既有 shallow negative appraisal 更新；actor 自己只有 neutral actor-side appraisal 時只增加 Familiarity，不自行產生負面 Affinity。
- `petAnimal`：actor / target 均可依自己的 historical appraisal consolidation。
- `avoidPet`：actor / target 均可 consolidation，因此同一 observable event 可以讓動物正向、人類負向。
- `privateSocialOutcome.socialNoResponse`：只 requester → counterpart，且使用較低 encounter weight。
- `talkOffer / petOffer / acceptPet / toleratePet` 等 proposal / intermediate response 不直接 consolidation。
- 非 relational event、bystander observation、單純 `agency === other` 都不足以建立 Relationship evidence。

Foundation consolidation 公式保持 bounded / diminishing return：Familiarity 越高，同等 episode 的增幅越小；Affinity 正向 evidence 朝 +1、負向 evidence 朝 -1 推進，但既有極端值仍可被反方向重要 experience 拉回。v11.15.1 只把這份 directional slow state讀入 initiator-side target preference；不因此取得 action-level motivation、responder 或 interruption ownership。

### Deferred architecture cleanup｜private experience lifecycle

Ordinary observed episodic memory 會經 `episodicMemoryCreated` dispatcher；`privateSocialOutcome` 目前仍由專用 requester-private path 建立並直接 Appraise / Affect / prune。因此 Relationship Foundation 使用**同一 `E.consolidateRelationshipFromMemory(...)` policy、兩個 invocation point**：ordinary path 在 hook order 350，private outcome path 在自己的 appraisal 完成後呼叫同一 policy。

若未來有更多 subsystem 同時需要消費 observed episode 與 private experience，再考慮建立共同的「new episodic experience ready / post-appraisal」lifecycle boundary。這是已知 deferred architecture cleanup，目前不阻塞 Relationship Foundation，也不因存在就自動算 Integration Debt。

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

**Pipeline abstraction rule:** Architecture diagrams and ordering summaries use lifecycle responsibility labels。Concrete implementation hook IDs stay in source、`docs/tick-pipeline.md` 的 exact registry tables 與 `tests/runtime-hook-pipeline.mjs`；action-specific names 不得變成 architecture stage name。

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

UI / readable Inspector 可以在更晚的 presentation hooks render，但不得改 simulation truth 或取代 pipeline dispatcher。

Runtime hook extension 不再保留「沒有 pipeline 時 fallback wrapper」。任何需要 `registerRuntimeHook` 的 extension 若未先載入 `runtime-hook-pipeline.js` 必須 loud failure；focused Node test 也必須在 `engine.js` 後、任何 hook extension 前載入同一 production pipeline。正常 app 與 test 不再存在第二套 wrapper-stacking lifecycle。

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
        │    → Appraisal → Relationship → Affect
        │
        └─ during core Agent loop
             → enqueue event reference in Memory-local FIFO
             → afterTick 500 Memory Observation Process
             → episodicMemoryCreated
             → Appraisal → Relationship → Affect
```

只有通過 audited relational evidence gate 的 episode 才實際更新 Relationship；其他 episode 在 Relationship hook 中直接 no-op。

這保留兩個重要事實：

1. beforeTick / afterTick extension 與 tick 外 direct `E.addEvent` 仍可在原本時點形成 Memory / Appraisal / Relationship / Affect；
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
- Social Response Resolve 600：response event 的合法 Memory / Appraisal / Relationship / Affect 在後續 consumer 前完成；
- Human Social Resolve 700：response event 的合法 Memory / Appraisal / Relationship / Affect 早於 Memory-to-Deliberation Correction 800；
- deferred path 使用 canonical `event.tick` 保存 creation-time provenance；
- same-source event 對同一 Agent 仍 exactly-once 建立 episode / Appraisal / Relationship consolidation / Affect。

### 7.5 Private social outcome boundary

`privateSocialOutcome` 仍是 requester-private experience path，不是 generic World Event observation。Event-created lifecycle cleanup 不改這條 truth boundary；Relationship 只在 requester 自己的 private memory 形成後做 requester-local consolidation。

## 8. Presentation ownership

### Canonical event text

Event producer 自己決定 canonical event text。UI 只能 render，不得攔截 event creator 後改字。

### Action label

Core 保持 `E.actionLabel` ownership。Presentation 若要補 readable status，使用具名 action-label resolver；resolver 是 derived projection，不得建立 Action / Intent / Event 或修改 simulation state。

### Recent social status

`recentSocialByAgent` cache 已移除。Recent response / recent talk 由 bounded canonical events + `event.tick` 推導。

### Resident current-activity semantic layers

Agent readable view 的「現在」固定分成三層 read-only projection：

- **Action＝角色現在具體在做什麼。** 來源是 live Action；Resident 可以把 raw phase ID、工程座標等轉成玩家可讀文字，但 Debug 仍保留完整 Action phase / spatial goal。
- **Intent＝這個行動服務的短期目的。** 來源是 canonical `activeIntent.kind`；Resident label 必須覆蓋正式 Intent kind，不得另造 `satisfyThirst / cleanEnvironment / restockFood` 之類 presentation-only 假 kind 來猜測目的。
- **Explanation＝為什麼此刻選擇這個行動。** 只在 final decision evidence 與 live Action 的 decision tick / action kind 對齊時顯示；應描述需求壓力、環境觸發或其他已存在證據，而不是只把 Intent 換句話重述一次。
- **Explanation wording 優先自然直接。** 若同一份 evidence 可以忠實寫成「因為肚子餓了／因為口渴／因為累了／因為想睡了／因為想找人說說話」，就不要翻成「需求已經變得明顯／比較明顯／累積得比較明顯」等 engine threshold 語言。精確 Need 數值與 qualitative band 屬於 Needs / Debug；Explanation 只做玩家理解用投影。若沒有可靠的具體日常原因，使用保守抽象描述或直接省略，不為了口語化自行補心理敘事。

三層都不能寫回 simulation state，也不能成為 Deliberation / Memory / Affect / Relationship 的輸入。完整 candidate score、utility、switch threshold、commitment cost、Memory delta、raw phase / coordinates 等工程資訊留在 Debug Inspector。

### Relationship readable projection

Resident overview 額外顯示 Relationship 的 read-only 長期摘要。Readable 層只把 authoritative `familiarity / affinity` 轉成保守文字：

- Familiarity 顯示「還不太熟／有些熟悉／熟悉／很熟悉／非常熟悉」等相處歷史程度；
- 低 Familiarity 時不顯示 Affinity 判斷，避免一兩次 encounter 就產生「很喜歡／很討厭」式過度敘事；
- 有足夠 Familiarity 時，Affinity 只描述「相處大致中性／愉快／不順」等 experience trend，不使用 friendship / trust / love / hate label；
- Debug Inspector 顯示精確 `Familiarity / Affinity / lastUpdatedTick`，並可顯示 social target ranking 的 `memoryUtilityDelta / relationshipTargetDelta / distancePenalty / targetPreference` decomposition；UI 不保存 relationship 或 preferred-target mirror。

### Entity Readable View

Player-readable Inspector 不再只覆蓋 Agent。現行 selectable entity 的 readable surface 包含 `agent / container / source / furniture / tile / room / event`；所有 readable 內容都只從當下 authoritative state / canonical event 即時投影，與 Debug Inspector 共享同一份 truth。

- **Container：** 玩家層可顯示名稱、可理解位置／持有人／承載家具、內容物、容量與已存在 capability；raw entity ID、Tile 座標、empty/current load、restock strategy 等工程欄位留在 Debug。
- **Source：** 顯示資源來源名稱、位置、提供的資源與可理解供應狀態；roles、interaction Port、raw ID 留在 Debug。
- **Furniture：** 顯示位置、可理解用途、**實際正在使用的 Agent**、承載物件與聚合後的表面內容；Footprint、Surface cell、slot position / raw ID 與 reservation 留在 Debug。`slotReservedBy` 是行動規劃／reservation truth，不等同「正在使用」，不得在玩家層誤寫成已發生事實。
- **Tile / Room：** 顯示地形／房間名稱、是否可通行、當前 occupants / furniture、可理解的表面內容或空間摘要；raw coordinate、blocker provenance、noise/comfort diagnostic、derived topology metrics 留在 Debug。
- **Event：** 玩家層以 canonical event text / time 與可解析的相關實體為主；raw event data、entity refs、cause tree 等 causal/debug provenance 留在 Debug。

Readable View 不保存 `playerContents / readableFurnitureState / entityReadableState` 等 mirror，不得回寫 simulation state，也不能成為 decision / Memory / Affect input。若 authoritative state 沒有足夠資訊，就省略該描述，而不是補造用途、心理狀態或因果敘事。

### Inspector render / decorator lifecycle

Player-readable Entity View 與 Debug Inspector 都是同一 authoritative simulation state 的 projection。View / tab / readable-debug switch 必須 state-inert。

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
1025 Relationship Readable / Debug Projection
1050 Entity Readable / Debug Layer
```

這些數字只表示 **Inspector composition order**，不是 simulation Runtime Hook Pipeline 的 phase/order；Architecture 圖仍應以 lifecycle responsibility 描述，不把 UI section 名稱提升為 simulation stage。

Agent selection 由 order 1000 Resident layer 持有 player-readable tabs / Action / Intent / Explanation；order 1025 Relationship layer 在 Agent shell 已建立後補入 Relationship readable / Debug projection；order 1050 Entity Readable layer 對 Agent 不建立第二個 shell，只統一玩家入口標籤。Container / Source / Furniture / Tile / Room / Event 則由 order 1050 將已完成 decorators 的 base Inspector DOM 包入 Readable / Debug shell。所有 layer 都直接使用 base UI 傳入的 `selected` context，不解析 `.inspect-title` 猜 entity，也不以 `MutationObserver` 搬運重建後的 DOM。

Resident afterTick 1100 `residentView.schedule` / Relationship afterTick 1150 `relationshipView.schedule` 只負責 presentation refresh；afterReset 700 / 750 同理。這些 presentation hooks 不取得 simulation lifecycle ownership。非 Agent Entity Readable layer 依 base Inspector 的既有 render cadence 即時重投影，不另建 runtime lifecycle。

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
- Relationship directional ownership / audited evidence / boundedness；
- Relationship target-preference boundedness、action-utility / responder-policy boundary 與 generic animal affordance eligibility；
- runtime hook ordering；
- state-inert presentation；
- deterministic long-run Validator 0。

對 emergent behavior，不用「最後必須固定做某個 Action」代替 causal invariant。Focused causal story / counterfactual A/B 應只改目標變數，鎖住真正的因果差異。

## 11. Current integration priority

Relationship Current invariant：

- `relationships` 只存在 Agent-local directional map，不建立 global / pair registry；
- persistent entry 只保存 `familiarity / affinity / lastUpdatedTick`；
- Relationship 只 consolidate audited direct relational experience 的 historical Appraisal，不自行解析 raw event 或從 agency 推論好惡；
- proposal / intermediate response 不得造成同一 encounter 重複計分；
- requester-private no-response 只能更新 requester → counterpart；
- Memory pruning 不得抹除已 consolidated Relationship；
- v11.15.1 Relationship 只影響 initiator-side `socialize / interactWithAnimal / seekSocialContact` target ranking，使用 `8 × familiarity × affinity` bounded delta；
- Relationship 不得加入 action-level social utility、不 hard-ban negative target、不修改 responder score、current-intent utility、soft-switch threshold 或 commitment；
- 動物互動 canonicalize 為 `interactWithAnimal / petAnimal`，target eligibility 由 species profile / affordance 判斷，不依物種名稱拆 Action；
- player-readable Relationship 只是 authoritative state projection；Debug 可顯示精確數值與 target-ranking decomposition；任何 mode/tab switch 都必須 state-inert。

Memory event-observation 的 `E.addEvent` wrapper / marker-sweep integration debt 已由 core-owned event-created lifecycle 收斂；不得重新引入 extension-owned `E.addEvent` wrapper 或第二份 event lifecycle truth。Private experience lifecycle 的全面統一目前只記為 deferred architecture cleanup，不阻塞本 slice。

## 12. Validator rule ownership

`src/state-validator.js` 是唯一 `validateState` aggregator owner。Versioned validator extension 不得捕捉或覆寫 `V.validateState`；每一層 invariant 使用 `V.registerValidationLayer(id, handler, order)` 以唯一 ID 與 explicit order 註冊。

正式 app 在所有 versioned validator 載入後由 `state-validator-manifest.js` finalize expected layer set。duplicate ID、duplicate order、missing expected layer、unexpected layer、finalize 後 late registration 都必須 loud failure；不得靠 `index.html` script load order 靜默決定 validation semantics。

每個 layer 接收 `(state, previousResult)` 並回傳下一個 validation result；既有 invariant logic 保持在原本 owner 檔案。Registry 只負責 ownership / ordering / completeness，不把 subsystem invariant 集中回單一巨型 validator。