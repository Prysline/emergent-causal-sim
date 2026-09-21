# Architecture — Current Runtime Contract

本文件描述目前 `main` 的跨 subsystem 工程契約。它不是逐版 changelog；歷史演進請查 Git history / PR。

目前 runtime marker：`11.22.0-spatial-z-identity`。

版本升級邊界、patch/minor 使用方式與 current marker 同步清單見 [`versioning.md`](versioning.md)。

目前架構已超過早期 v11.10 單檔 core 模型：`engine.js` 仍持有 canonical core simulation，但 Spatial、Physical、Intent、Social Bid、Memory、Appraisal、Affect、Relationship、Memory→Deliberation、Social Outcome 與 presentation 都以 extension runtime 接入。正常 tick/reset lifecycle 由 `runtime-hook-pipeline.js` 明確排序；initial-state lifecycle 由 `world.js` 的 named initializer pipeline明確排序。兩者都不以 script-wrapper 疊接順序作為正式語義。

## 1. Truth boundaries

### World Truth

World Truth 包含真正發生、可被引用的物理／世界事實，例如：

- canonical World Event：`state.events / state.causes`
- Agent / Object 的物理位置
- Agent authoritative Physical Profile：`mass / volume / bodyGeometry / locomotionCapabilities / locomotionProfiles`
- authored passage geometry：Furniture `spatial.under` 與可選 `map.passageConstraints`
- Container / Source / Surface Environment 的實際 resource contents
- posture、held container、reservations
- Action 正在如何執行的 state machine
- Spatial topology、Surface / Contact / interaction geometry

Canonical World Event 只有一份。Memory、UI、Inspector 都只能引用或投影它，不建立第二份 World Event truth。

### World Authoring / Initialization boundary

Current default world 的 authored instance truth 由 `SimWorldAuthoring.DEFAULT_WORLD_AUTHORING` 持有；目前 contract generation 是 `authoringSchema: "world-authoring-v2"`。現行 loader asset 暫時沿用 `src/world-authoring-v1.js` 檔名，但 authoring contract truth 只由 `SimWorldAuthoring.VERSION / authoringSchema` 決定，不能從檔名推斷。這個 generation 與 current simulation runtime marker 分離。

Authoring package 保存「這個 world instance 開場是什麼」：map terrain / material、Furniture instance / footprint / slot / concrete under-clearance、Container / Source instance config與初始內容物／位置、Resident identity / traits / opening Needs / wellbeing / status與 initial placement。它不保存可由 geometry/runtime推導的 `walkable / crawlOnly / roomId / map.rooms / roomRevision / tile.furnitureIds / slot.furnitureId / PassageProfile / MovementEnvelope / route / crowding` 等第二份 truth。

`src/world-initializer.js` 是 authoring → runtime compatibility adapter；`src/world.js` 則是唯一 `SimWorld.createInitialState(seed)` lifecycle owner。Base authoring package先由 initializer 編譯成既有 `state.map / furniture / containers / sources / agents` shape，再由 `world.js` 的 named initial-state pipeline依 explicit order執行 subsystem initializer。任何需要參與開場 state 建構的 subsystem extension / schema 都只能呼叫 `registerInitialStateInitializer(id, handler, order)`，不得再用 `const baseCreateInitialState = W.createInitialState` 疊 wrapper。duplicate initializer ID、缺少 canonical pipeline都必須 loud failure；exact registry / order由 `tests/initial-state-pipeline.mjs` 鎖定。

Slice E 起 authoring positions 的 `z` 已正式進入 runtime Spatial identity。Initializer可編譯 multi-layer authoring成單一 flattened `map.tiles` index；z=0保留 legacy-compatible `x,y` key，non-zero z使用 `x,y,z`，不建立 alias雙份 truth。Runtime position / Spatial Node以 `z ?? 0` 比較，same XY different Z不共享 occupancy / crowding / contact / route identity。Horizontal neighbor與surface transition仍只在同 z；本 slice不新增 stair / ramp / vertical edge，因此沒有 concrete vertical structure時跨 Z route必須 unreachable。

Slice C 在同一 `world-authoring-v1` generation 上補齊 authoring-time validation / canonical serialization與獨立 Editor surface，不建立新的 runtime schema generation。Canonical world truth仍是 authoring document本身；Editor session 的 `currentZ`、selected tool / furniture / cell、dirty baseline等只屬 ephemeral UI state，不可輸出到 authoring JSON。Z-level切換只改 presentation，不得改 canonical document fingerprint。

Slice D 將 authoring contract 升為 `world-authoring-v2`，並建立 pure `SimWorldAuthoring.deriveHorizontalTopology(authoring, {z})`。它從 authored terrain/opening、Furniture footprint / under-clearance、fixed Container / Source blocker 派生 structural openness、static blocker、furniture membership、cardinal adjacency、connected components與 under-clearance diagnostics；結果只存在 query/preview/compiler 邊界，不 serialize 成第二份 world truth。`doorway` 是 authored opening：本身提供 floor-level structural openness；blocking door / Furniture / fixed entity 可再依 concrete geometry 關閉通行。Runtime compatibility `tile.walkable / tile.furnitureIds` 仍可存在，但只能由 compiler 產生，Editor 不直接 author。Initializer placement diagnostics與 Editor derived preview共用同一 geometry interpretation。

`world-authoring-v1 → v2` migration 是 explicit compatibility boundary：legacy default dining-table 原本由 Spatial runtime ID hardcode提供的 `.72m` under-clearance，migration 會一次性寫入正式 Furniture geometry；v2 runtime 不再以 `diningTable` ID hidden fallback補值。`map.passageConstraints` 保留給 regression / low-level compatibility override，不是正常 Editor主要操作面。

Slice D.1C 起，`editor.html` 除 authoring helper / mutation / presentation code外，會載入 pure `world-initializer.js` 與 `editor-preview-bridge.js`，只用於 runtime compatibility preflight與同 origin browser-session handoff；它仍不載入 `world.js`、Spatial、Engine或 runtime Validator。Editor 可呼叫 authoring-side `deriveHorizontalTopology(...)` 做 derived preview，也可用 `SimWorldInitializer.analyzeRuntimeCompatibility(...)` 驗證 current runtime 是否可接受同一 canonical document，但不得複製 runtime traversal owner。這讓 multi-layer authoring可合法 import / export / round-trip；Slice E 起 runtime compatibility preflight也接受可編譯的 multi-layer document，Simulator則以 z-aware identity與 layer filter呈現。Editor presentation仍不能建立 vertical traversal truth。

Slice D.1A 將 Editor 的 presentation surface 擴充為 Scene Inspector。Furniture、Container、Source、Resident 清單與地圖 typed marker都由 canonical authoring document即時投影；sidebar 選取、map marker選取與 Inspector focus共用同一個 ephemeral `selection` owner，不建立 serialized scene registry。Furniture placement target仍是 Editor operation state；選取 furniture只更新 target，不會偷改 active authoring tool。Resident marker位置可從 exact placement 或唯一 furnitureSlot anchor解析，但這仍是 authoring-side presentation，不啟動 runtime initializer。主模擬器只新增通往 `editor.html` 的入口；Editor→Simulator world handoff仍留在 D.1C。

Slice D.1B1 新增 pure `src/editor-authoring-mutations.js` 作為 **Editor canonical mutation ownership boundary**。它不保存 world state，也不是 simulation subsystem；Furniture / Container / Source / Resident lifecycle operation只接收 canonical authoring document，clone candidate、套用單一 operation、呼叫 `SimWorldAuthoring.validateAuthoring(...)`，candidate valid才回傳可 commit document。`editor-ui.js` 只保存 `selection / selectedTool / selectedFurnitureId / pendingOperation` 與 structured operation result 等 ephemeral state，不得複製 move / delete / duplicate semantics。Furniture support follower、explicit support choice、deterministic duplicate ID、guarded delete與 Resident explicit placement transition都屬 authoring mutation contract；Editor仍不載入 runtime Initializer / Spatial / Engine / Validator。

Slice D.1B2 在此 owner 上增加 **desktop Furniture Pointer drag presentation path**。`dragState`、movement threshold、full-footprint ghost、explicit support follower ghost與 valid-invalid preview 都是 ephemeral Editor state；pointer move 只呼叫 `SimEditorAuthoringMutations.moveFurniture(...)` 取得同一 candidate / validation projection，不寫 canonical document。pointerup/drop 再呼叫同一 `moveFurniture` 取得正式 candidate並 commit；click/tap placement與 drag-drop 必須產生相同 semantic fingerprint。Touch/mobile保留既有 click/tap placement，不新增平行 movement semantics。

Slice D.1C 建立 **Editor → Simulator explicit preview bootstrap boundary**。`SimEditorPreviewBridge` 只在明確 `?preview=editor` 時讀取同 origin `sessionStorage` handoff；沒有 query flag 的一般 simulator load 永遠使用 `DEFAULT_WORLD_AUTHORING`。`world.js` 的 `createInitialStateFromAuthoring(authoring, seed)` 與既有 `createInitialState(seed)` 共用同一 canonical named initializer pipeline；Engine 在頁面啟動時只捕捉一次有效 preview snapshot，因此 Reset deterministic 重建同一 snapshot，不形成可持久污染 default world 的 hidden override。

Slice E 建立 **Runtime Spatial Z Identity**：base `SP.key / same / manhattan / clonePos`、`normalizeNode / nodeKey / nodeSame / routeStateKey`、Tile storage、Room derivation、Surface Environment endpoint、Memory spatial refs與 simulator map presentation共用同一 z semantics。Simulator `currentZ` / layer selector是 ephemeral presentation state；切層不得改 pathfinding或simulation truth。`SimSpatial.SPATIAL_IDENTITY_VERSION = 11.22.0-spatial-z-identity`；既有 Passage / Route / Locomotion / Crowding generation只有消費新的 node identity，未各自換代。

`SimWorld.WIDTH / HEIGHT` 暫時保留給現有 Spatial consumer，但值由 canonical default authoring package派生；舊 `FURNITURE_DEFS / OBJECT_START / AGENT_START` 不再是 `SimWorld` public authoring owner。

Resident initial placement 在 current authoring contract內支援兩種 mode：`exact` 與 explicit `{kind:'furnitureSlot', id}` anchor。Anchor resolution 必須 deterministic；anchor 需存在且唯一、允許該 resident kind，並要求明確 `initial.posture.kind`。posture 指向不同 slot / furniture、exclusive slot double assignment、blocked / missing exact node 都是 hard error。

`SimWorldInitializer.analyzeInitialPlacements(authoring)` 是 authoring-time analysis surface，回傳 `hardErrors / diagnostics / resolvedPlacements`，但 diagnostics 不寫入 runtime state。sealed room、no-exit route、食物／飲水／睡眠 target 不可達，以及 current overlap contract仍允許的 same-node overlap都屬 diagnostic-only；Initializer不得為了「合理」自動搬人、開門、補出口或修改 geometry。

Initializer 的 hard validation只判斷自己擁有的 authoring/reference/base-floor occupancy facts。Physical / locomotion / posture 的正式 runtime invariant仍由既有 Spatial / Physical / Validator owners負責，不在 initializer 複製第二套 subsystem rule。

Physical / Passage contract 同樣遵守 single-source rule：Agent 保存可重用的物理事實；`MovementEnvelope` 是由 `SimPhysical.getMovementEnvelope(agent, locomotionMode)` 根據 profile 即時計算的 derived geometry；`PassageProfile` 則由 `SimSpatial.getPassageProfile(state, fromNode, toNode)` 根據既有 Spatial geometry 即時計算。兩者都不保存 persistent cache。未來 Anatomy 可替換 envelope 的推導來源，但 Spatial 仍只消費 canonical Physical interface，不直接知道 limb tree。

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

Social Bid responder 是目前正式使用者：Human 對 animal `socialAffection` 的 response candidate 直接由 responder-local `observedSocialBids` 產生，不再使用 `pendingInteraction / cat_request / accepted / catRequestExpired` compatibility bridge。

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

Human talk response 與目前 Pet response 都由 responder 自己的 state 決定。v11.15.2 起，兩條 responder policy 可額外讀**responder 自己對 requester 的 directional Relationship**；Relationship runtime 只提供 unitless `relationshipSignal = familiarity × affinity`，Human / animal responder subsystem 各自決定自己的 bounded scaling。目前兩者 cap 都是 `±0.18`，但這不是共享 scoring owner。

Responder bias 的正式邊界：

- Human 只讀 human responder → human requester；animal pet response 只讀 animal responder → human requester。反方向 Relationship 不得滲入。
- `familiarity > 0` 但 `affinity = 0` 時 Relationship response delta 必為 0；熟悉本身不是正向意願。
- Human `talkResponseUtility` 是 responder-specific candidate utility，因此可隨 final response score bounded 改變；general `E.baseUtilityForAction(...,'talk')` 不讀 Relationship。
- animal pet response 只改 accept / tolerate / avoid band，不建立另一套一般 Action motivation。
- Current Affect 與 target-specific Memory influence 仍未直接進 responder scoring。
- responder score decomposition 不寫入 World Event、不保存 Agent cache；canonical World Event 只描述實際發生的 response outcome。

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

Relationship 在 v11.15.1 起作 initiator-side target ranking signal，不改 action-level social motivation：

```text
relationshipTargetDelta = 8 × familiarity × affinity

targetPreference = memoryUtilityDelta
                 + relationshipTargetDelta
                 - accessPenalty

finalUtility = baseUtility + memoryUtilityDelta
```

正式邊界：

- `relationshipTargetDelta` bounded `[-8,+8]`；`familiarity=0` 或 `affinity=0` 時為 0。
- 負向 Relationship 只降低 target preference，不從 eligibility 移除 target。
- Relationship 不加入 `finalUtility`，因此不直接提高／降低是否選擇 social Action。
- target-preference signal 不修改 current-intent utility、soft-switch threshold 或 commitment；也不直接持有 responder score ownership。
- Memory influence 與 Relationship 都是 derived decision signals，不互相寫回，也不保存 persistent preferred-target mirror。

### Relationship → Responder Bias

v11.15.2 新增另一個**獨立 consumer**，不是把 target-preference delta 重用成 responder utility：

```text
relationshipSignal = familiarity × affinity

Human finalTalkResponseScore
  = clamp(baseTalkResponseScore
        + relationshipSignal × TALK_RELATIONSHIP_RESPONSE_CAP)

Animal finalPetResponseScore
  = clamp(basePetResponseScore
        + relationshipSignal × PET_RELATIONSHIP_RESPONSE_CAP)
```

目前兩個 cap 都是 `0.18`，但 constant 與 policy ownership 分開。Relationship subsystem 只輸出 bounded directional signal，不決定 Human / animal response threshold，也不建立 response Action / Intent / Event。

這個 consumer 只在 responder 已經面對特定 requester 時成立；它不回灌一般 social Action utility、不改 initiator target ranking 公式、不改 current-intent utility / switch threshold / commitment。World Event 不保存 `baseResponseScore / relationshipResponseDelta / finalScore` 等 private decomposition；Debug 可從 authoritative Relationship + responder policy 即時計算。

Initial core chooser 建立的 `system + phase:'plan'` event 是**同 tick provisional private-cognition plan**，以 `data.planLifecycle='initialProvisional'` 明示其 creation payload 尚可能在 afterTick 800 Memory-to-Deliberation Correction 被 normalization。Correction 只能改寫同一 tick、同 actor、`type:'system'`、同 lifecycle marker 且 action 對應 initial pick 的既有 canonical plan event；不得新增第二筆 correction event，也不得回頭改寫較舊 plan 或其他 plan-shaped event。Event ID / cause identity 保持不變，event-created consumer 若讀取 creation payload 必須把它視為 provisional，而不是 immutable final plan。Plan event 仍屬 private cognition / non-episodic，不進 generic Episodic Memory。

### Private Social Outcome

`socialWaitEnded` 是 requester-private lifecycle event，generic observable Memory 刻意排除它。`src/systems/memory/social-outcome.js` 將合法 no-response experience 建成 `privateSocialOutcome`，再做 requester-private appraisal / relationship consolidation / affect / retention。

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

Foundation consolidation 公式保持 bounded / diminishing return：Familiarity 越高，同等 episode 的增幅越小；Affinity 正向 evidence 朝 +1、負向 evidence 朝 -1 推進，但既有極端值仍可被反方向重要 experience 拉回。v11.15.1 先把這份 directional slow state 接入 initiator-side target preference；v11.15.2 再讓 responder-specific policy讀取同一 directional truth 的 unitless signal。兩者都不讓 Relationship subsystem 取得一般 action-level motivation、interruption 或 response-event ownership。

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

Simulation `runtime-hook` manifest只涵蓋會改變模擬語意的 hooks，並可在 UI 載入前 finalize。UI / readable Inspector 的 refresh / reset 改走獨立 `runtime observer` lifecycle：observer 一律在該次 simulation `afterTick` / `afterReset` hooks 全部完成後才執行，保留 deterministic ID / order，但不參與 simulation schedule completeness，也不得改 simulation truth 或取代 pipeline dispatcher。

Runtime hook extension 不再保留「沒有 pipeline 時 fallback wrapper」。任何需要 `registerRuntimeHook` 的 extension 若未先載入 `runtime-hook-pipeline.js` 必須 loud failure；focused Node test 也必須在 `engine.js` 後、任何 hook extension 前載入同一 production pipeline。正常 app 與 test 不再存在第二套 wrapper-stacking lifecycle。`registerRuntimeObserver` 則是同一 dispatcher 提供的 read-only/post-simulation observer boundary，可在 simulation hook manifest finalize 後由 Presentation 註冊；它不能重新打開或改寫 finalized simulation hook set。

Physical / Passage Profile Slice 2 沒有新增 runtime hook 或 tick phase；它提供同步 derived geometry / feasibility query，A* 只在既有 traversal expansion 中讀 `walk` feasibility。

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

Presentation 不再參與 initial-state schema，也不再持有 `SimWorld.PRESENTATION_SCHEMA_VERSION`。Current Presentation marker 與 interaction labels 由 `SimUI.PRESENTATION_VERSION / SimUI.interactionLabel(...)` 持有，marker直接跟隨 canonical `SimRelease.VERSION`；這只描述 UI/presentation contract，不寫入 runtime state，也不成為 simulation schema owner。

Presentation refresh/reset 使用上節的 runtime observer boundary。現行 observer relative order保留：afterTick `uiObservability.render-mobile-summary` → `residentView.schedule` → `relationshipView.schedule`；afterReset `uiObservability.reset` → `residentView.reset` → `relationshipView.reset`。這些 observer 永遠在完整 simulation phase之後執行。

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
- Debug Inspector 顯示精確 `Familiarity / Affinity / lastUpdatedTick`，並可顯示 social target ranking 的 `memoryUtilityDelta / relationshipTargetDelta / accessPenalty / targetPreference` decomposition；
- v11.15.2 Debug 另可即時計算 Human / animal responder 的 `base response score + Relationship response delta → final score / response band`。這是 derived observability，不保存 `talkResponseScore / petResponseScore / relationshipResponseDelta` mirror，也不把 private score decomposition寫入 World Event。

### Physical Profile Debug projection

v11.17.0 Physical / Passage Slice 2 在 Debug 顯示精確 `mass / volume / bodyGeometry` 與每個 supported locomotion mode 的即時 `MovementEnvelope`。Physical UI 直接讀 authoritative profile 與 `SimPhysical.getMovementEnvelope(...)`；不建立 `movementEnvelope` presentation mirror，也不把 coarse MVP template 描述成 Anatomy 級測量結果。`posture: standing` 與 locomotion `walk` 保持不同語意；Player-readable behavior 文案目前不使用這些數字推論人格、身材評價或「願不願意 crawl」。

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
1026 Physical Profile Debug Projection
1050 Entity Readable / Debug Layer
```

這些數字只表示 **Inspector composition order**，不是 simulation Runtime Hook Pipeline 的 phase/order；Architecture 圖仍應以 lifecycle responsibility 描述，不把 UI section 名稱提升為 simulation stage。

Agent selection 由 order 1000 Resident layer 持有 player-readable tabs / Action / Intent / Explanation；order 1025 Relationship layer 與 order 1026 Physical layer 在 Agent shell 已建立後補入各自 read-only / Debug projection；order 1050 Entity Readable layer 對 Agent 不建立第二個 shell，只統一玩家入口標籤。Container / Source / Furniture / Tile / Room / Event 則由 order 1050 將已完成 decorators 的 base Inspector DOM 包入 Readable / Debug shell。所有 layer 都直接使用 base UI 傳入的 `selected` context，不解析 `.inspect-title` 猜 entity，也不以 `MutationObserver` 搬運重建後的 DOM。

Resident afterTick 1100 `residentView.schedule` / Relationship afterTick 1150 `relationshipView.schedule` 只負責 presentation refresh；afterReset 700 / 750 同理。Physical / Passage Slice 2 是靜態 profile + 同步 derived projection / query，沒有取得 simulation runtime hook ownership。這些 presentation hooks 不取得 simulation lifecycle ownership。非 Agent Entity Readable layer 依 base Inspector 的既有 render cadence 即時重投影，不另建 runtime lifecycle。

`ui-spatial-observability.js` 對 map/actions 的 derived DOM sync 可以保留自己的 observer；**Inspector 不在該 observer ownership 內**。任何後續 Inspector extension 應註冊具名 decorator，而不是重新觀察 `#inspector`。

## 9. Spatial / Physical / resources / sleep invariants

### Spatial

- Agent 與可定位 Object 透過 Spatial API 回答 node。
- floor environment 由 floor surface contents 持有；家具 Surface Environment 由 Surface Cell contents 持有。
- Interaction Geometry 依 affordance + target data 推導合法操作位置。
- dynamic blocker / Contact / supported contact 不建立重複 location truth。

詳見 [`interaction-geometry.md`](interaction-geometry.md)。

### Physical Profile + Passage Profile / Multi-mode Feasibility

v11.17.0 在 v11.16.0 individual Physical Profile 基礎上加入 multi-mode MovementEnvelope 與 edge-derived PassageProfile：

```text
agent.physical
├─ mass
├─ volume
├─ bodyGeometry { height, width, length }
├─ locomotionCapabilities
└─ locomotionProfiles

SimPhysical.getMovementEnvelope(agent, mode)
→ { clearanceHeight, clearanceWidth, clearanceLength, speedFactor, sourceMode }

SimSpatial.getPassageProfile(state, fromNode, toNode)
→ { clearanceHeight, clearanceWidth, ... }

SimSpatial.traversalFeasibility(state, agent, fromNode, toNode)
→ { passage, modes: { [mode]: { feasible, failedAxes } } }
```

正式邊界：

- mass、volume、body geometry 分開保存，不用單一 `bodySize` 取代；default Human / Cat profile 是 coarse MVP template，clone 成每個 Agent 自己的 state，個體可 override；
- **canonical unit contract**：`mass` 使用 kg、`volume` 使用 m³；所有 Physical / MovementEnvelope / Passage 的絕對長度（`bodyGeometry.{height,width,length}`、`clearanceHeight / clearanceWidth / clearanceLength`、Furniture `spatial.under.clearance / clearanceWidth`、`map.passageConstraints` 的 clearance）使用 m。locomotion geometry factors、`speedFactor`、Crowding width ratio / direction weights 等為無量綱。這是 schema-level meaning，不在每個 persistent value 上重複保存 `unit` 欄位；若未來外部 protocol 需要自描述 payload，再在 protocol boundary 做明確 unit/version envelope，而不是污染 Agent state；
- `MovementEnvelope` 與 `PassageProfile` 都是 derived output，不保存 persistent cache；
- Physical locomotion baseline 由舊 `standing` 正名為 `walk`，與 Agent `posture.kind='standing'` 分離；Validator 會拒絕 legacy standing locomotion alias；
- Human 第一批 supported modes 為 `walk / kneelCrawl / proneCrawl`；Cat 本 slice 只定義 `walk`，不假定所有 body plan 共享 Human mode 名稱；
- locomotion profile 可用各軸 factor 或 absolute clearance override；Spatial 不自行推導 torso thickness / Anatomy；
- PassageProfile 第一版只正式比較 `clearanceHeight / clearanceWidth`。某軸沒有明確限制時為 `null = unconstrained`；不發明每格固定公尺數，也不把 body length 誤當成直線 passage length requirement；
- passage geometry 可來自 canonical Furniture `spatial.under.clearance / clearanceWidth` 與可選 edge-local `map.passageConstraints`；前者由 `world-authoring-v2` 正式持有，後者只保留 low-level compatibility / regression override，Spatial 將這些 world facts 收斂成 canonical edge query；
- `traversalFeasibility` 只回答 physical feasibility，不回傳 `bestMode / recommendedMode / utility`，不讀 Relationship、Memory、traits、goal pressure，也不修改 posture；
- **v11.17 當時**的 production A* 仍只以 `walk` mode 擴展路徑，但每條 edge 已消費 `walk` Passage feasibility。因此該 slice 的 crawl-query 可行不代表 routing 會自動 crawl；v11.19+ current production 已由後述 Locomotion Execution contract 接上 mode-aware routing / execution；
- v11.17 isolated single-passage fixture 鎖住四種情況：normal 可 walk、low 可 kneel/prone 但 walk blocked、lower 僅 prone、height 足夠但 width blocked；在該 focused harness 的 walk-only execution boundary 下，low/lower 情況的另一側水源仍不可達；
- Static fit 與 Traversable 概念仍分離，但本 slice **不實作 PoseEnvelope / static occupancy API**；不能拿 MovementEnvelope 假裝靜態 body bounds；
- `clearanceLength / turn clearance / maneuverability`、locomotion execution / posture transition、`pathDistance / traversalCost / travelTime` 分家、crowding、Anatomy / Injury / Collision 都延後；
- 「能不能過」由 Physical + Spatial 決定；未來「願不願意為某目標趴著過」屬行為／動機選擇層，不能回寫 physical feasibility，也不能把真實 traversal / exertion burden 抹成 0。

### Route Semantics Split

v11.18.0 將原本名為 `SP.pathDistance()`、實際卻直接回傳 weighted route cost 的語意拆開：

```text
SimSpatial.planRoute(state, agent, goal, {
  mode: 'walk',
  objective: 'traversalCost' | 'pathDistance'
})
→ {
  path,
  mode,
  objective,
  pathDistance,
  traversalCost,
  travelTime
}
```

正式邊界：

- `pathDistance`＝所描述 path 的 topology edge count；standalone `SP.pathDistance(...)` 搜尋 physical-feasible shortest topology route。
- `traversalCost`＝`traversalEdgeCost` 累積的客觀 route burden；包含既有 floor wet / occupancy、Surface move cost、Surface transition cost。standalone `SP.traversalCost(...)` 搜尋最低 traversal-cost route。
- `travelTime`＝current executable movement time。v11.18.0 仍是 walk-only、一 edge 一 movement tick，因此 selected route 的 `travelTime === pathDistance`；這是 execution contract，不代表兩者永久同義。
- A* compatibility surface 仍以 `traversalCost` 作 route objective，既有 gameplay/resource/interaction/nearest target consumers 也遷移到 `traversalCost`，因此本 slice 不偷偷改 route preference / AI balance。
- 舊 `SP.pathCost(...)` 暫時只作 traversal-cost compatibility alias；新 consumer 不應再把它當 distance。
- v11.19.0 起 production `planRoute(...,{mode:'auto'})` 可在 supported + passage-feasible modes 間規劃；explicit `mode:'walk'` 仍可作 focused / compatibility query。mode choice只依 objective route facts與 deterministic execution tie-break，不等於 behavioral willingness。
- `speedFactor` 已接入 execution timing：edge movement ticks = `ceil(1 / speedFactor)`，posture/mode change另加 1 transition tick；Debug、route `travelTime`與 core movement共用同一 timing truth。
- social target ranking 的舊 `distancePenalty` 已正名為 `accessPenalty`，source 改讀 `traversalCost`；公式尺度與 v11.17 保持 parity，Relationship / Memory target ordering 不因 semantic cleanup 偷換心理模型。
- deterministic regression 必須能同時存在「4-edge 但 wet / cost 14.5」與「6-edge dry / cost 6」兩條 route：standalone `pathDistance=4`、`traversalCost=6`，default plan / A* 選 6-edge route，而 selected plan 回報 `pathDistance=6 / traversalCost=6 / travelTime=6`。

### Locomotion Execution + Posture Transition

v11.19.0 把 v11.17 的 multi-mode physical feasibility 與 v11.18 的 route metrics正式接到 core movement execution，但仍不加入主觀 willingness：

- **authoritative state 分層**：`agent.posture.kind` 仍是角色當下姿勢；`agent.locomotion = { mode, phase }` 只描述 current locomotion execution，`phase ∈ { idle, transition, moving }`。MovementEnvelope 仍是 derived truth，不持久化。
- **mode → posture**：目前 canonical mapping 為 `walk → standing`、`kneelCrawl → kneeling`、`proneCrawl → prone`。既有 `sitting / lying` 仍由休息／睡眠系統擁有，不改名成 locomotion mode。
- **explicit transition**：locomotion mode要求的 posture 與目前 posture不同時，先消耗 1 tick transition；該 tick 不同時位移。不能在 route search或 edge traversal 中免費變形。
- **mode-aware route graph**：production `planRoute(...,{mode:'auto'})` 的 search state 是 `Spatial Node + locomotion mode`；每條 candidate edge以 `traversalFeasibility(...).modes[mode]` 驗證。舊 focused harness若未載入 Locomotion subsystem，仍保留 walk-only compatibility。
- **objective 與 tie-break**：route primary objective仍是 `traversalCost`，以維持既有 AI balance；primary cost同分時才以 executable `travelTime`、transition數、mode rank作 deterministic tie-break。這些都是客觀 execution facts，不是人格偏好。
- **timing truth**：`edgeMoveTicks = ceil(1 / speedFactor)`；現行 Human default因此 walk=1、kneelCrawl=2、proneCrawl=3 ticks/edge。route `travelTime` 為所有 edge move ticks + posture-transition ticks之和，並由同一 execution state machine實際兌現。
- **execution boundary**：core `moveToward()` 仍是單一 movement owner；所有既有 Action透過 `moveToExact / moveToInteraction` 共用同一 locomotion lifecycle，不建立 crawl-specific Action type。multi-tick edge進度暫存在 current Action 的 `locomotionStep`，不是 persistent route cache。
- **occupancy vs walk feasibility**：`SP.nodeWalkable(...)` 保留「walk 是否可進入該 node」語意；`SP.nodeLocomotionAccessible(...)` 只判 node 結構上是否可被 locomotion state佔據。`spatial.node` Validator使用後者，避免低姿勢合法停留被 walk-only clearance誤判。這不是 PoseEnvelope/static-fit；current occupancy仍不宣稱有完整靜態 body bounds。
- **arrival semantics**：crawl抵達後 posture不自動改回 standing；完成 Action只清除 active locomotion phase。下一次需要其他 mode時再支付 transition，避免在低矮幾何中出現免費站立。
- **observability / validation**：Locomotion Debug顯示 posture、active mode、phase、speedFactor、edge ticks與 pending edge；Validator檢查 locomotion phase、posture/mode一致性與 pending step timing，不建立第二份 UI truth。
- **心理層明確未接線**：v11.19 只會依 objective route facts選擇 physically executable mode。Relationship、Memory、traits、goal pressure、discomfort / embarrassment / dirt aversion尚未參與「願不願意爬」；它們未來只能影響 behavioral choice，不能回寫 Physical feasibility或把客觀 travel time變成零。
- **仍未包含**：PoseEnvelope/static fit、length / turn clearance / maneuverability、Anatomy / Injury / Collision，以及新的 exertion-by-mode model。Dynamic Congestion 已由下一節接線；現有 exertion仍維持 per-edge parity，避免本 slice偷改 energy balance。

### Dynamic Congestion

v11.20.0 將既有粗略的「目的 node occupancy 固定 penalty」收斂為 derived Dynamic Congestion（動態擁擠）contract：

- **ownership**：Crowding 不擁有 physical feasibility。MovementEnvelope vs PassageProfile 仍是個體能否通過某 edge 的唯一物理可行性 truth；其他 Agent 永遠不修改 PassageProfile。
- **derived / uncached**：`SimCrowding.getCrowdingProfile(state, agent, fromNode, toNode, mode)` 只讀當下 world state，即時計算 next-edge congestion；不寫入 `state.crowding / state.congestion` 等 persistent mirror。
- **soft consequence only**：第一版不產生 hard block。多 Agent 在狹窄處相遇時，側身、錯步、短暫停頓與調整移動方式被抽象為 `congestionCost` 與 movement delay，不建立 collision / reservation / yielding semantics。
- **width approximation**：known `PassageProfile.clearanceWidth` 存在時，mover 的 MovementEnvelope width 與附近 Agent 的 effective width 形成 maneuvering-space pressure；另一人的寬度只以 crowding-specific approximation 參與，不宣稱兩個人體矩形必須完整並排，也不得冒充 PoseEnvelope / Static fit。
- **unknown width**：passage width 為 `null` 時，只依 occupant count、movement direction 等已知資訊形成 soft penalty，不推導「一格最多幾人」等虛假 physical capacity。
- **direction severity**：第一版 deterministic weight 為 `same=.65 / stationary=1 / unknown=1 / opposite=1.7`，因此同向 < 靜止／未知 < 逆向。這是客觀交通阻力，不含 Relationship / personality / courtesy。
- **first-pass pressure formula**：每名附近 Agent 先提供 base occupant pressure `.35`；若 width 已知，再加入 `max(0, widthRatio-.75) × 1.5` 的 narrowness pressure；最後乘 direction weight。這些都是 MVP approximation constants，不是人體工程學常數。
- **route cost**：`congestionCost = congestionPressure × 2.5`，加入 objective `traversalCost`。舊 floor `occupiedCount × 5/2.5` 在 Crowding runtime 存在時停用。
- **movement slowdown**：`delayTicks = floor(congestionPressure × 2)`；effective edge ticks = locomotion base edge ticks + delay ticks。Debug 的 `speedMultiplier` 由 base / effective ticks 派生。離散 tick 會量化小幅 slowdown，因此 direction severity即使已反映在 pressure / cost，也不保證每個單一 occupant情況都產生不同整數 tick。
- **planning vs execution**：route planning 讀當下 congestion snapshot；core `moveToward()` 每 tick 會重新 `planRoute(...)`，新 edge 開始時使用該次 step 的 crowding-adjusted `moveTicks`。因此較早的 estimated `travelTime` 與 actual travel time 可因人群移動不同；multi-tick edge開始後不在中途重算同一 edge。
- **interaction target**：`bestInteractionPosition()` 在 Crowding runtime 存在時不再額外先按 raw occupancy 排序，而讓 canonical route/crowding cost負責 crowded position preference，避免 double count。
- **deliberate non-goals**：第一版不禁止 Agent spatial overlap、不做 edge reservation、movement claim、誰先走、yielding、deadlock resolution、collision，也不加入 behavioral willingness / aversion。若後續實測「穿過彼此」本身成為產品問題，再另開 contention slice，不在本版預先引入 arbitration。

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
- Physical Profile individual ownership、positive dimensions / mass / volume、multi-mode MovementEnvelope no-cache boundary、`standing → walk` terminology、default Spatial behavior parity 與 individual geometry override；
- Passage Profile height / width validity、`null = unconstrained`、explicit edge constraint 與 per-mode `failedAxes`；
- v11.17 isolated Passage focused harness仍不得因 feasibility query 自動 crawl；production v11.19+ mode-aware execution則由 Locomotion contract另行鎖定；
- Dynamic Congestion direction severity、known-vs-unknown width、soft-no-block、planning snapshot vs execution refresh、legacy occupancy double-count removal；
- canonical Action terminology / construction；
- Intent interruption semantics；
- Social Bid requester / responder agency；
- event creation ownership / event-created consumer registry；
- event / memory provenance；
- bounded Memory / retention；
- Appraisal historical stability；
- Affect provenance；
- Relationship directional ownership / audited evidence / boundedness；
- Relationship target-preference boundedness、action-utility isolation 與 generic animal affordance eligibility；
- Relationship responder-bias directionality、bounded Human / animal score delta、reverse-direction isolation、World Event privacy 與 derived Debug observability；
- runtime hook ordering；
- state-inert presentation；
- deterministic long-run Validator 0。

對 emergent behavior，不用「最後必須固定做某個 Action」代替 causal invariant。Focused causal story / counterfactual A/B 應只改目標變數，鎖住真正的因果差異。

## 11. Current integration priority

Physical / Locomotion Current invariant：

- `agent.physical` 保存 individual authoritative profile；template 只是初始化來源，不是 runtime species hard-code；
- `MovementEnvelope` 只由 `SimPhysical.getMovementEnvelope(agent, mode)` derived，不建立 persistent mirror；`PassageProfile` 同樣由 Spatial edge geometry derived，不建立 cache；
- locomotion baseline 是 `walk`，不得再把 Agent posture `standing` 當成同一個 locomotion mode；
- Human 目前可查詢 `walk / kneelCrawl / proneCrawl` feasibility，Cat 目前只定義 `walk`；capability 只表示物理支援，不代表行為意願；
- Spatial production route 已支援 `mode:'auto'` 的 walk / kneelCrawl / proneCrawl execution；explicit walk-only query仍可供 focused compatibility。physical feasibility、mode execution 與 behavioral willingness仍分層；
- v11.18.0 建立 Route Semantics Split；v11.19.0 已把它接到 multi-mode execution：`pathDistance`＝physical-feasible shortest topology edge count、`traversalCost`＝最低客觀通行負擔、`travelTime`＝selected executable route 的真實 transition + movement ticks。A* primary objective仍為 traversal cost；
- mass / volume / geometry 的存在不代表 Base Simulation 自動產生 collision damage、structural failure、density/fluid 等高解析度後果；
- Physical feasibility 與 future behavioral willingness 分離：Relationship / traits 可以未來影響「是否願意承受某 locomotion 的主觀成本」，但不能把物理不可通行改成可通行，也不能抹掉真實 travel/exertion cost。

Relationship Current invariant：

- `relationships` 只存在 Agent-local directional map，不建立 global / pair registry；
- persistent entry 只保存 `familiarity / affinity / lastUpdatedTick`；
- Relationship 只 consolidate audited direct relational experience 的 historical Appraisal，不自行解析 raw event 或從 agency 推論好惡；
- proposal / intermediate response 不得造成同一 encounter 重複計分；
- requester-private no-response 只能更新 requester → counterpart；
- Memory pruning 不得抹除已 consolidated Relationship；
- v11.15.1 Relationship 只影響 initiator-side `socialize / interactWithAnimal / seekSocialContact` target ranking，使用 `8 × familiarity × affinity` bounded delta；
- v11.15.2 responder bias 只讀 responder → requester 的 `familiarity × affinity` unitless signal，由 Human / animal responder owner 各自縮放，目前 cap `±0.18`；反方向 Relationship 不得滲入；
- Relationship 不得加入一般 action-level social utility、不 hard-ban negative target、不修改 current-intent utility、soft-switch threshold 或 commitment；
- responder score decomposition 只可 derived render，不寫入 World Event 或 persistent Agent cache；
- 動物互動 canonicalize 為 `interactWithAnimal / petAnimal`，target eligibility 由 species profile / affordance 判斷，不依物種名稱拆 Action；
- player-readable Relationship 只是 authoritative state projection；Debug 可顯示精確數值、target-ranking decomposition 與 responder-score decomposition；任何 mode/tab switch 都必須 state-inert。

Memory event-observation 的 `E.addEvent` wrapper / marker-sweep integration debt 已由 core-owned event-created lifecycle 收斂；不得重新引入 extension-owned `E.addEvent` wrapper 或第二份 event lifecycle truth。Private experience lifecycle 的全面統一目前只記為 deferred architecture cleanup，不阻塞本 slice。

## 12. Validator rule ownership

`src/validation/registry.js` 是唯一 `validateState` aggregator owner。Semantic validator rule 不得捕捉或覆寫 `V.validateState`；每一層 invariant 使用 `V.registerValidationLayer(id, handler, order)` 以唯一 ID 與 explicit order 註冊。

正式 app 在所有 `validation/rules/` semantic validator rules 載入後由 `validation/manifest.js` finalize expected layer set。duplicate ID、duplicate order、missing expected layer、unexpected layer、finalize 後 late registration 都必須 loud failure；不得靠 `index.html` script load order 靜默決定 validation semantics。

每個 layer 接收 `(state, previousResult)` 並回傳下一個 validation result；既有 invariant logic 保持在原本 owner 檔案。Registry 只負責 ownership / ordering / completeness，不把 subsystem invariant 集中回單一巨型 validator。