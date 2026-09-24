# Emergent Causal Simulator

湧現式因果模擬器。這個專案用少量可組合的底層規則，觀察角色、物件、資源、記憶、關係與環境如何自行形成沒有被作者逐條寫死的因果鏈。

目前 runtime marker：**v11.29.0・Shared Horizontal Geometry Foundation**（`11.29.0-horizontal-geometry-foundation`）。

> README 只保存目前架構概要；跨 subsystem 工程契約見 [`docs/architecture.md`](docs/architecture.md)，版本升級規則見 [`docs/versioning.md`](docs/versioning.md)，Interaction Geometry 細節見 [`docs/interaction-geometry.md`](docs/interaction-geometry.md)。版本演進以 Git history / PR 為準，不在 README 堆逐版 changelog。

## 核心原則

### 一個事實只保留一份 authoritative truth

- World Event 只有一份 canonical event，保存在 `state.events / state.causes`。
- Current default world 的 authored truth 由 `SimWorldAuthoring.DEFAULT_WORLD_AUTHORING` 持有，schema generation 為 `world-authoring-v7`，並以 `furnitureCatalogVersion: "furniture-definitions-v7"` pin 住 system-owned `SimFurnitureDefinitions` Catalog。Map 明確保存 `cellSizeMeters: 1`、每層 floor Cell 與格線 `boundaries`；Door、off-map Exit 與 vertical `structures` 都是獨立 root entity。Container / Source、Resident opening state 與 compact Furniture Instance 仍由同一 authoring package 持有，`SimWorldInitializer` 將它編譯成 runtime state。
- `world-authoring-v7` 的 Furniture Instance 仍只保存 `id / definitionId / origin / orientation / optional name`。`furniture-definitions-v7` 以 south 作 Definition canonical frame；directional Furniture 的 `orientation` 表示正面／主要 facing，床使用 head → foot，無自然正面的 Furniture 以 `orientationSemantics:"frame"` 保留 quarter-turn local-frame transform 而不假裝存在 facing。公尺制 Furniture-local 3D AABB `spatial.solids` 仍是實體 obstruction 的唯一 authored truth；Surface 以 `onSolid:{key,face:'top'}` 引用 solid top face，Slot 另以 stable `<instanceId>:<slotKey>` + rotated `approachEdges` 表達使用位置與進出候選。
- Resident opening placement 支援 `exact` 與 explicit `furnitureSlot` anchor。`SimWorldInitializer.analyzeInitialPlacements(...)` 分開回傳 hard errors 與 diagnostic-only 問題：missing/conflicting/blocked slot 或 position 會拒絕初始化；密室、無出口、資源不可達與非 exclusive node overlap 只提示，不自動搬人或修改世界。
- Agent 的位置、Action、posture、held container、Needs 等各有自己的正式欄位，不建立可失同步的 mirror state。
- Agent 的 `physical.mass / volume / bodyGeometry / locomotionCapabilities / locomotionProfiles` 是 Physical Foundation 的 authoritative state；`MovementEnvelope` 由 `SimPhysical.getMovementEnvelope(agent, mode)` 即時計算，不保存第二份 envelope cache。
- **Furniture Orientation**：Definition canonical orientation 為 `south`。有 facing 語意的家具以 Instance `orientation` 表示正面方向；椅子／沙發由背向正面，床由床頭指向床尾。沒有自然正面的 Furniture 仍可用同一 `orientation` 做 local-frame quarter-turn，但 Editor 只顯示「局部框架旋轉」而不畫 facing arrow。`origin` 保持 resolved footprint 的 NW／左上 placement anchor；explicit `supportId` Container follower 與 slot-bound Resident 都沿用同一 shared local↔world transform 與 stable `<instanceId>:<slotKey>` reference。
- authored passage geometry 由 canonical Furniture geometry、格線 boundary、vertical Structure 與低階 compatibility edge constraint 持有；`PassageProfile` 由 `SimSpatial.getPassageProfile(state, fromNode, toNode)` 即時計算，不建立第二份 passage cache。正常 Editor 不 author `walkable / crawlOnly / PassageProfile / manual traversal flags`。
- Action type 的唯一正式欄位是 `action.kind`；舊 `action.intent` compatibility 已移除。
- `Agent.activeIntent` 是 Agent-private 短期目的，與 `action.kind` 分工不同；`action.intentId` 只作 Action → Active Intent linkage。
- Social Bid 是可觀察的 World Event；requester waiting、responder Intent、episodic memory、Affect 都是各 Agent 自己的 private state，不建立共享心理 lifecycle registry。
- Episodic Memory 保存 Agent-local observable projection，不複製完整 World Event，也不把另一個 Agent 的 private state 當成可觀察資訊。
- Relationship 也是 Agent-private directional state：`A → B` 與 `B → A` 分開保存，只承接 A 自己的 historical appraisal consolidation，不建立共享 pair score。

## 目前已具備

### Spatial / Physical world

- **Geometry-derived Horizontal Topology / HorizontalConnection**：`src/horizontal-geometry.js` 是不讀 Agent／Crowding／Route state 的 shared pure horizontal geometry owner。它從 floor Cell、格線 Boundary／Door、fixed blocker、resolved Furniture metric solids 與低階 Passage constraint snapshot 派生無向、Agent-independent 的 `HorizontalConnection`；cardinal distance 為 1m、diagonal distance 為 `sqrt(2)m`，斜向使用 B+ 保守局部幾何並區分 `candidate / blocked / unsupported`。`SimWorldAuthoring.deriveHorizontalTopology(authoring, {z})` 會額外投影 ephemeral `horizontalConnections`，但既有 `cells[].adjacent / componentId / components` 仍維持 cardinal compatibility，不把 diagonal 塞進 legacy topology。Slice 1 尚未讓 production Route 枚舉斜向，因此目前 runtime 移動行為保持既有 cardinal／Structure semantics。
- Room、Tile、Furniture Surface、Local Position 與 Spatial Node。Room 目前只保存由拓樸推導的 identity / membership / area 等結構資料，不再保存沒有 gameplay consumer 的 legacy `value` aggregate。
- A* traversal、dynamic blocker、supported contact、surface environment / liquid。
- Interaction Geometry 依 affordance + target data 決定合法接觸位置。
- Container / Source / Surface Environment 的實體資源 transfer、Serving、Carry Load、Restock、External Supply。
- **Physical Profile Foundation**：每個 Agent 保存獨立 `mass / volume / bodyGeometry` 與 locomotion capability/profile；Human / Cat 現行模板只提供 coarse MVP default，不把物種名稱當作永久通行規則。
- **Physical / Passage canonical units**：絕對 physical 數值統一採 SI contract：`mass`＝kg、`volume`＝m³；`bodyGeometry`、MovementEnvelope、Furniture `spatial.solids.bounds`、Structure / Boundary clearance、Passage option 的 `clearanceHeight / clearanceWidth` 均使用 m；locomotion factors、`speedFactor` 與 Crowding ratio/weights 保持無量綱。
- Physical locomotion baseline 已由舊 `standing` 正名為 `walk`，與 Agent `posture.kind = 'standing'` 分離。Human 第一批支援 `walk / kneelCrawl / proneCrawl`；Cat 本 slice 只定義 `walk`，不硬套 Human 姿勢名稱。
- `SimPhysical.getMovementEnvelope(agent, mode)` 依個體 geometry + locomotion profile 產生 derived `clearanceHeight / clearanceWidth / clearanceLength / speedFactor`；profile 可提供 absolute clearance override。
- **Passage Profile + multi-mode feasibility**：`SimSpatial.getPassageProfile(...)` 由 Furniture solids/free intervals、Boundary / Door、Structure 與可選 low-level edge constraint 派生位置化 `options[]`。每個 option 保留自己的 interval、`clearanceWidth`、`clearanceHeight` 與 constraint provenance；Physical feasibility 只在同一 option 同時容納 MovementEnvelope 時成立。
- `SimSpatial.traversalFeasibility(...)` 將各 supported mode 的 MovementEnvelope 與 Passage `options` 比較，回傳 `feasible / failedAxes` 與真正使用的 `effectiveOption / effectiveClearanceWidth`；它不替 Route 選 mode、不讀心理狀態，也不修改 Agent posture。
- **Locomotion Execution + Posture Transition**：production route planning 現以 `mode:'auto'` 在 Agent 支援且 passage-feasible 的 locomotion modes 間規劃；Human 可實際執行 `walk / kneelCrawl / proneCrawl`，Cat 目前仍只有 `walk`。
- Route search state 現包含 **Spatial Node + locomotion mode**。`traversalCost` 第一順位會計入環境／Surface edge cost、Locomotion-owned mode burden、mode-transition burden 與 Crowding cost；只有第一順位相同時，才以 executable `travelTime`、transition 次數與 mode rank 作 deterministic tie-break。這不是 personality preference。
- posture 與 locomotion mode 維持分離但正式接線：`walk → standing`、`kneelCrawl → kneeling`、`proneCrawl → prone`。mode 改變必須先消耗 **1 tick posture transition**，不能在 pathfinder 中免費瞬間變形。
- current occupancy validity 與 walk-entry feasibility 正式分開：`nodeWalkable(...)` 仍回答 walk 能否進入 node；`nodeLocomotionAccessible(...)` 回答 node 結構上能否被目前 locomotion posture 佔據。Validator 使用後者，避免合法跪爬／匍匐停在低矮 passage 時被誤判為「站立不可通行」。
- `speedFactor` 現真正影響 execution timing：每條 edge 的 movement ticks 為 `ceil(1 / speedFactor)`。現行預設因此為 walk 1 tick、kneelCrawl 2 ticks、proneCrawl 3 ticks；個體 profile override 會同步改變 route `travelTime` 與實際抵達時間。
- `agent.locomotion = { mode, phase }` 保存 current execution state；`phase` 為 `idle / transition / moving`。多 tick edge 的剩餘進度只存在 current Action 的 `locomotionStep`，不建立 route cache。
- crawl 抵達後不會自動站起；posture 是 authoritative state，下一次需要不同 locomotion mode 時再支付 transition。這避免角色在仍可能低矮的空間裡被免費強制站立。
- **Route Semantics Split** 仍維持：`pathDistance` 是 physical-feasible topology distance、`traversalCost` 是 objective burden、`travelTime` 是真實 current execution timing；`pathCost` 只保留 traversal-cost compatibility alias。Human current objective mode burden 為 walk `+0/edge`、kneelCrawl `+1/edge`、proneCrawl `+2/edge`，每次 locomotion mode 切換再 `+1`；這些 cost 常數不從 `speedFactor` 換算。
- A* / resource / interaction / nearest target / social access consumer 現可認得 executable crawl route；`accessPenalty` 仍由 `traversalCost` 派生，沒有改 Memory / Relationship 心理公式尺度。
- **Dynamic Congestion**：`SimCrowding.getCrowdingProfile(state, agent, fromNode, toNode, mode)` 由 ordinary floor occupancy、XYZ movement direction、MovementEnvelope width 與該 mode 真正選中的 Passage `effectiveClearanceWidth` 即時計算；不保存 persistent cache，也不修改 PassageProfile。slot-bound Agent 不算 ordinary floor occupant；其未來動態 body obstruction留給 PoseEnvelope。
- Crowding 第一版只形成 **soft congestion cost + movement slowdown**，不 hard-block 通行。狹窄處錯身的額外時間代表側身、錯步、短暫停頓與調整移動方式，而不是宣稱兩個名義身寬相加超過通道寬度就物理上不能過。
- 普通無障礙 1m grid edge 會形成真實 1m Passage option；較窄 Furniture / Boundary / Structure option 使用實際 width。Crowding 不再把「沒有舊 scalar clearanceWidth」解讀成 width unknown，也不由 tile 人數推導硬 capacity。方向 severity 仍為 `same < stationary/unknown < opposite`。
- route planning 使用當下 congestion snapshot，`traversalCost` 加入 `congestionCost`，`travelTime` 加入 crowding delay；core movement 每次開始下一條 edge 前重新規劃，所以人群散開／聚集後的 actual travel time 可以不同於較早的 estimate。
- 舊 floor `occupiedCount × 5/2.5` 固定 penalty 在 v11.20 production 停用；`bestInteractionPosition()` 也不再額外先按 occupancy 排序，避免同一擁擠被 double count。
- Dynamic Congestion 仍**沒有加入 behavioral willingness / aversion**。因此目前擁擠只改變客觀 route burden / movement timing；Relationship、personality、courtesy、yielding 等主觀或社交規則不參與。第一版也不禁止 Agent spatial overlap、不做 edge reservation / 誰先走 / deadlock / collision；PoseEnvelope/static fit、turn clearance、Anatomy / Injury / Collision 仍未加入。

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
- 動物互動使用 canonical `interactWithAnimal` Intent 與 `petAnimal` Action；目前可撫摸目標由 species profile / affordance 判斷，不依 Cat / Dog 等物種名稱拆分平行 Action。

### Social agency

- Social Bid / responder-local observation / requester-private waiting 分離。
- Human talk response：engage / brief / decline / no response 是不同結果。
- Pet response：accept / tolerate / avoid 由 responder 自己的 state 決定。
- **Relationship → Responder Bias**：Human responder 與 animal responder 可讀自己對 requester 的 directional Relationship，形成 bounded responder-specific score modifier；不讀 requester → responder 的反方向關係。
- responder bias 只修正既有 responder policy。Human `talkResponseUtility` 可因 responder-specific response score 改變，但一般 `E.baseUtilityForAction(...,'talk')`、initiator social Action utility、current-intent utility、soft-switch threshold 與 commitment 不變。
- requester timeout 不會遠端取消 responder-private Intent；late response 與先前 wait-end experience 可以同時成立。
- 已移除舊 `pendingInteraction / cat_request / accepted / catRequestExpired` responder compatibility bridge。

### Memory / appraisal / affect / relationship

- bounded Agent-local episodic memory。
- minimal observable snapshot + source-event provenance。
- historical Appraisal；re-observation 不會用現在狀態靜默重寫過去的評估。
- short-lived Affect。
- salience / recurrence / recency retention。
- 第一版 target-aware Memory → Deliberation influence，只影響 initiator-side social candidate。
- requester-private `privateSocialOutcome` 可記錄「當時沒有得到立即回應」，但不推定 counterpart 故意忽略、討厭或拒絕。
- **Relationship Foundation**：每個 Agent 以 `relationships[counterpartId]` 保存 `familiarity 0..1 / affinity -1..1 / lastUpdatedTick`；Familiarity 表示累積相處歷史，Affinity 表示長期主觀相處經驗偏正／偏負，兩者都不等於 friendship / trust / love / hate。
- Relationship 只由 audited direct relational experience 的 historical Appraisal consolidation 更新；`talkOffer / petOffer / acceptPet / toleratePet` 等 proposal / intermediate response 不重複計分。
- 一次 encounter 對每個 Agent 最多 consolidation 一次，但雙方可使用不同 subjective outcome：完整 Human conversation 中 requester 使用 `acceptTalk`，responder 使用 `talk`；`avoidPet` 則可讓人與動物從同一 observable event 得到相反方向的 Affinity evidence。
- `privateSocialOutcome` 只可更新 requester → counterpart；counterpart 不會因 requester 的 private timeout 被遠端改寫 Relationship。
- Relationship 是 persistent slow state，不因來源 episodic memory 後續被 pruning 而倒退；第一版不做時間衰退，也不保存 contributing-memory history。
- **v11.15.1 Relationship Target Preference**：`relationshipTargetDelta = 8 × familiarity × affinity`，只影響 `socialize / interactWithAnimal / seekSocialContact` 的「找誰」。`targetPreference = memoryUtilityDelta + relationshipTargetDelta - accessPenalty`；`accessPenalty` 由 `traversalCost` 派生，數值尺度與 v11.17 的舊 weighted-route penalty 保持 parity；action-level `finalUtility` 仍不加入 Relationship。負向 Relationship 不構成 hard ban。
- **v11.15.2 Relationship Responder Bias**：Relationship 提供單一 directional downstream signal `relationshipSignal = familiarity × affinity`（bounded `[-1,+1]`）；Human talk 與 animal pet responder subsystem 各自將它縮放為 response-score delta。目前兩者各自 cap 為 `±0.18`，但 ownership 分離，未要求未來永遠同係數。
- Familiarity 本身不是正向意願：`affinity = 0` 時 responder Relationship delta 必為 0。Human 只讀 human responder → requester；animal 只讀 animal responder → human requester。
- responder score decomposition 不寫入 World Event、不保存 Agent cache；World truth 只保留實際發生的 accept / brief / decline / tolerate / avoid 等結果。Current Affect 與 responder-specific Memory 仍未直接進入 responder scoring。
- ordinary successful resource-transfer consequence 是明確 non-episodic outcome；成功 `pour` 仍由來源 action episode 表達，失敗 `spill` 則可作為獨立 observable physical effect。

### Presentation

- Player-readable Entity View 與 Debug Inspector 共用同一 authoritative simulation state；Readable View 不建立第二份玩家狀態。
- Agent 的「現在」分成三層：Action 表示角色正在具體做什麼；Intent 表示這個行動服務的短期目的；Explanation 只在 final decision evidence 與 live Action 對齊時說明為什麼此刻選了它。
- Agent Action 會把 raw phase 名稱與工程座標轉成玩家可讀描述；完整 phase / spatial goal 仍留在 Debug。
- Agent Intent label 必須覆蓋 canonical Intent kind，不得用不存在的 presentation-only kind 造成 fallback；Explanation 不應只是重述 Intent。
- Player Explanation 優先使用可由同一 evidence 直接支持的日常說法，例如「因為肚子餓了」「因為口渴」「因為累了」「因為想睡了」「因為想找人說說話」；不把 engine threshold 翻成「需求已經變得明顯」之類系統語言。精確需求強度仍留在 Needs / Debug；若沒有可靠的具體原因，使用保守抽象描述或省略，不自行補心理敘事。
- Resident overview 可讀 Relationship 只顯示保守的熟悉／相處趨勢文字；低 Familiarity 時不強行替 Affinity 下結論。Debug 才顯示精確 Familiarity / Affinity / lastUpdatedTick，並可拆解 social target ranking 的 Memory / Relationship / access penalty，以及 route 的 path distance / traversal cost / travel time。
- Relationship Debug 也可即時計算 responder `base score + Relationship delta → final score / response band`；這只是 authoritative Relationship + responder policy 的 derived observability，不建立 `talkResponseScore / petResponseScore / relationshipResponseDelta` persistent mirror。
- Physical Debug 顯示 authoritative `mass / volume / bodyGeometry` 與所有 supported locomotion mode 的即時 `MovementEnvelope`；UI 不保存 `movementEnvelope` mirror，也不把第一版 coarse geometry 宣稱為 Anatomy 級精度。`posture: standing` 與 locomotion `walk` 在 Debug 文案中保持不同語意。
- Container / Source / Furniture / Tile / Room / Event 也有玩家可讀投影：優先顯示名稱、位置、內容物、容量、持有人、實際用途／使用者、表面內容、空間中的居民／家具與 canonical event text 等直接可理解資訊。
- 非居民 Readable View 不直接顯示 raw entity ID、工程座標、Footprint、interaction Port、Surface cell、slot reservation、cause tree 或其他 debug provenance；這些仍留在 Debug Inspector。家具 readable status 只顯示實際使用者，不把 reservation 當成已發生事實或玩家可見心理資訊。
- readable entity projection 只從現有 Container / Source / Furniture / Spatial / Event truth 即時推導，不新增 `playerContents`、`readableFurnitureState` 等 persistent mirror。
- stale / mismatch decision evidence 不顯示 Explanation，raw utility / score / threshold / Memory delta 仍留在 Debug。
- UI 不得改寫 canonical event text。
- core 保有 `E.actionLabel` ownership；presentation 透過 action-label resolver 派生 readable status。
- recent social presentation 直接從 bounded canonical events + event creation `tick` 推導，不保存第二份 `recentSocialByAgent` lifecycle cache。
- Resident View「最近發生的事」對 owner-private event 顯示獨立「私人」badge；正文保持原事件文字，公開 event 不顯示 badge。這只是 Presentation 投影，不改 private / owner、Memory 或 Relationship truth。
- `ui.js` 是 Inspector base render owner；Spatial / Intent / Memory / Appraisal / Affect / Retention / Memory→Deliberation / Social Outcome / Resident / Relationship / Physical / Entity Readable 使用具名且排序明確的 Inspector decorator，不再以 MutationObserver 充當 Inspector completion lifecycle。

## Runtime lifecycle

正常 app runtime 由 `src/runtime-hook-pipeline.js` 持有 `E.tick / E.reset / E.onEpisodicMemoryCreated`。

正式 phases：

```text
beforeTick
afterTick
afterReset
episodicMemoryCreated
```

Subsystem 使用具名 hook + explicit order，不再靠「最後載入的 wrapper 包住前一個 wrapper」決定跨系統語義。Script load order 可以決定 registration 發生時間，但不能充當 lifecycle semantic contract。所有會註冊 runtime hook 的 extension 都要求 production pipeline 已存在；目前沒有第二套 no-pipeline compatibility lifecycle。

Relationship 對 ordinary observed episodic memory 使用 `episodicMemoryCreated` order 350：specialized Appraisal 100～300 → Relationship consolidation 350 → Affect 400。Requester-private `privateSocialOutcome` 目前仍是專用建立路徑，在自己的 Appraisal 完成後呼叫同一 `E.consolidateRelationshipFromMemory(...)` policy，再進 Affect / prune；兩種 experience lifecycle 的全面統一保留為後續 architecture cleanup，不阻塞本 slice。

Physical / Passage Profile Slice 2 只提供同步 derived query，沒有新增 runtime hook，也不改 tick ordering。A* 只在既有 traversal neighbor expansion 時讀 `walk` feasibility。

## Memory event observation lifecycle

Core 保有 canonical event creation ownership。`E.addEvent` commit `state.events / state.causes` 後會發出具名 event-created notification；Memory 透過 listener 消費 notification，不覆寫 `E.addEvent`，也不再用 marker sweep 掃描 `state.events` 猜測新事件。

Observation 依 producer 邊界分流：

- pre-core / post-process / tick 外 direct API 等非 core Agent loop producer：event-created 後同步形成 eligible psychological observation；
- core sequential Agent loop 內建立的 event：Memory 只把 source event reference 排入 Memory-local ephemeral FIFO，在 `afterTick` order 500 `memory.process-events` 依 creation order flush；
- deferred processing 仍使用 source event 的 creation `event.tick` 作 `observedTick` provenance，不把 afterTick processing time 當成事件發生時間；
- same source event 維持 exactly-once episodic / Appraisal / Affect / Relationship consolidation；
- `system` plan 等 private cognition 仍是 non-episodic，event-created notification 不等於 generic Memory eligibility。

因此目前正式 contract 是 **core-owned event creation + event-created notification + Memory-controlled delivery**。舊 Memory `E.addEvent` wrapper、`memory.capture-events` 與 marker sweep 已移除；詳細 ordering / ownership contract 見 [`docs/architecture.md`](docs/architecture.md) 與 [`docs/tick-pipeline.md`](docs/tick-pipeline.md)。

## 測試與驗證

State regression 目前涵蓋：

- syntax / base state invariant；
- sleep / social / logistics / spatial / surface environment；
- Physical Profile 的 authoritative individual state、multi-mode derived MovementEnvelope、`standing → walk` terminology boundary、default behavior parity、individual geometry override、validator 與 no-cache boundary；
- Passage Profile 的 edge-derived height / width、`null = unconstrained`、normal / low / lower / width-only deterministic fixture，以及 **v11.17 isolated Passage focused regression** 所鎖的「crawl query 可行但當時 A* 不自動 crawl」subsystem boundary；current production v11.19+ 的 mode-aware crawl execution 由 Locomotion regression 另行驗證；
- Action terminology / canonical construction；
- Active Intent / Social Bid / replan / soft reconsideration；
- Episodic Memory / Appraisal / Affect / salience；
- Human / Pet responder agency；
- Memory → Deliberation / requester social outcome；
- Relationship Foundation 的 directional state、audited evidence gate、exactly-once consolidation、private-outcome boundary、Memory pruning independence 與 boundedness；
- Relationship Target Preference 的 bounded directional delta、Memory + Relationship + distance decomposition、負向不 hard-ban、action-utility isolation，以及 generic animal affordance target eligibility；
- Relationship Responder Bias 的 directional signal、Human / animal bounded response delta、reverse-direction isolation、general Action utility isolation、World Event privacy boundary 與 derived Debug observability；
- Runtime Hook Pipeline；
- presentation observability contract，包括 runtime / UI / app shell / README 的 current version consistency、Agent Action / Intent / Explanation semantic boundary、player Explanation 的自然語言原則、Relationship readable/debug 分層、Physical multi-mode Debug derived-state boundary，以及非居民 Entity Readable / Debug 分層。

另有 Chromium Browser QA 驗證 Social Response、Human Social Response、Memory、Resident View、Relationship、Physical multi-mode Debug、Entity Readable View、mobile controls 與 UI state-inert behavior。Regression 優先鎖 authoritative state、truth boundary、causal linkage 與 deterministic invariants，而不是要求 emergent simulation 每次都走唯一固定劇情。

## 執行

本專案可直接由靜態 HTTP server 提供 `index.html` 與 `src/` 資源；GitHub Pages 用於目前部署驗證。