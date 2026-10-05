# Versioning Contract

本文件定義 Emergent Causal Simulator 的 current runtime marker 何時必須更新，以及哪些變更可以留在同一版本內。

## Current version

目前 current runtime marker：

`11.46.0-sleep-carry-integration`

玩家可見的 app 頁首 current-version display 使用短版 `v11.46.0`；`state.version`、`SimRelease.VERSION`、`SimWorld.VERSION` 與 `SimUI.PRESENTATION_VERSION` 使用完整 current marker。Current subsystem markers：Resources `11.39.0-carried-contents-loss`；Physical `11.45.0-agent-carry-relocate`；Agent Carry `11.46.0-sleep-carry-integration`；Spatial candidate selection `11.46.0-sleep-carry-integration`；Spatial Traversal / Route `11.38.0-carried-handling-risk`；Spatial Passage `11.39.1-surface-boundary-transition`；Deliberation / Decision Evidence / Sleep Slot Conflict `11.46.0-sleep-carry-integration`；Memory `11.42.0-usage-preference-sleep`；Usage Preference `11.42.0-usage-preference-sleep`；Affect `11.35.0-affect-responder-bias`；Horizontal Geometry `11.29.0-horizontal-geometry-foundation`；Spatial Identity `11.22.0-spatial-z-identity`；Contact `11.32.0-contact-slot-corner`；Locomotion `11.38.0-carried-handling-risk`；Dynamic Congestion `11.31.0-crowding-8-direction`。Embodiment Capabilities 為 `embodiment-capabilities-v5`；World Authoring = `world-authoring-v11`，Furniture Catalog = `furniture-definitions-v12`。未改 contract 的 Resources / Spatial Traversal / Spatial Passage / Route / Locomotion / Contact / Dynamic Congestion / Affect / Relationship / Surface Environment 與 Furniture Catalog 不跟著 overall minor 假升。

### Version-marker synchronization rule

任何 current runtime marker、subsystem generation、schema version、catalog generation 或其他硬編碼 current marker 的變更，在執行完整 regression 前都必須先做 repo-wide stale-marker audit。檢查範圍至少包含 production source、fixtures、Node regressions、Browser regressions、Presentation projection 與 current docs；不得只更新 production marker 後等待 CI 逐一暴露 stale assertion。

測試或 fixture 中的硬編碼版本值必須先判斷其語意再更新：若它是在驗證「current contract / current release / current schema」，則應與本次換代同步；若它是在驗證未變更 subsystem 的 own generation，則必須保留原值，不得因 overall marker 改變而形式性假升版。換言之，stale-marker audit 是**語意核對**，不是 repo-wide blind replace。

完成 marker / generation 變更後，PR 驗證記錄應能明確區分：哪些 marker 本次有換代、哪些 subsystem 明確未換代，以及 Node / Browser regression 中對應 current expectation 是否已同步。


### Current Sleep conflict × sleeping Agent carry integration release

`11.46.0-sleep-carry-integration` integrates the approved sleeping-occupant path without adding an awake-cooperation shortcut. Sleep conflict may propose `carryOccupant` only from an explicit Agent-context observation that reports a Human / Animal occupant as sleeping. Candidate-time `SimAgentCarry.candidateAttemptability(...)` uses requester-known state plus the passed observation and deliberately does not inspect target hidden mass, `held`, existing carry relation, or body geometry; canonical execution-time `canEstablishCarry(...)` remains the full World-truth legality gate.

Sleep owns relocation policy and exclusions: original conflict Slot is excluded; a compatible nearby sleep-capable Slot is preferred, with bounded nearby floor as fallback. It does not call the occupant's private Usage ranking. Usage Preference remains the only owner of assignment / claim / habit deltas; Sleep consumes `preferenceContributors(...)` and only interprets their bounded positive self-association total as insistence. Spatial / Route now owns generic candidate-node winner selection with deterministic objective → `pathDistance` → stable `nodeKey` ordering; Agent Carry floor approach delegates winner selection there.

Once pickup has established canonical `state.agentCarries`, placement failure cannot abort into an orphaned relation. The same `carryAgent` Action records the original relocation as failed, attempts neutral nearby floor recovery, and enters `recoveryBlocked` when no legal floor exists. `recoveryBlocked` preserves Action + relation and retries on a small deterministic cadence; it does not teleport, clear the relation, silently choose a comfort Slot, invoke Social Bid wait, or re-enter ordinary Deliberation. Safe recovery completion is distinct from original relocation success. Awake cooperative carry remains blocked on the future generic Social Bid responder contract.

Version impact：overall / Presentation、Agent Carry、Spatial candidate-selection、Deliberation / Decision Evidence / Sleep Slot Conflict → `11.46.0-sleep-carry-integration`。Spatial Traversal / Route search semantics remain `11.38.0-carried-handling-risk`。Physical remains `11.45.0-agent-carry-relocate`; Memory / Usage Preference remain `11.42.0-usage-preference-sleep`; Resources remains `11.39.0-carried-contents-loss`; Spatial Passage remains `11.39.1-surface-boundary-transition`; Locomotion remains `11.38.0-carried-handling-risk`; World Authoring remains `world-authoring-v11`; Furniture Catalog remains `furniture-definitions-v12`; Embodiment Capabilities remains `embodiment-capabilities-v5`.

### Current Agent carry / relocate release

`11.45.0-agent-carry-relocate` 完成 Agent carry / relocate v1。Canonical World relation 為 `state.agentCarries`，以 carried Agent id 為 key，與 Container-only `Agent.held` 分離；reverse lookup 只由 relation 派生，不保存第二份 truth。carry relation 存續期間 carried Agent 不保留 ordinary floor / Slot occupancy，raw `position=null`、`posture.kind='carried'`，可觀察位置只從 carrier 的 canonical position 投影。

第一版只提供 `twoArmCarry`：Human default mass capacity 35kg、需要 2 hands；Cat 沒有該 method。carried Agent 的 carry-local geometry從其 `bodyGeometry` 派生，Physical 以 axiswise max 將它與 carrier body MovementEnvelope 合成 `getEffectiveTraversalEnvelope(...)`，並把 Agent carry hand demand與既有 Container hand demand組合。Passage / Route / Locomotion繼續消費既有 Physical / geometry seam；walk與既有 step geometry可用，jump不支援，kneelCrawl / proneCrawl / climb因 two-arm carry佔用雙手而自然失去所需 support-hand feasibility。

Lifecycle 明確分為 approach / pickup interaction → pickup event → carry relation established → carrier locomotion → legal floor / Slot placement → release / placement-complete event。awake non-cooperative target不能建立 relation；sleeping不是 consent，只是 v1 可被搬運的 responder state之一。v1 要求 carried Agent `held == null`，不 auto-drop Container、不做 nested carried-load composition。forced carry / resistance / combat / restraint、drag / throw / piggyback / one-arm / joint carry、fall / drop-Agent / injury、Furniture relocation與 Sleep conflict自動整合都不在本 release。

Version impact：overall / Presentation、Physical、Agent Carry → `11.45.0-agent-carry-relocate`；Embodiment Capabilities → `embodiment-capabilities-v5`。Deliberation / Decision Evidence維持 `11.44.0-sleep-slot-conflict`；Memory / Usage Preference維持 `11.42.0-usage-preference-sleep`；Resources維持 `11.39.0-carried-contents-loss`；Spatial Passage維持 `11.39.1-surface-boundary-transition`；Spatial Traversal / Route / Locomotion維持 `11.38.0-carried-handling-risk`；World Authoring維持 `world-authoring-v11`；Furniture Catalog維持 `furniture-definitions-v12`；Contact / Crowding / Affect / Relationship等未改 subsystem generation不假升。本 release 沒有新增 runtime hook；Agent carry initial-state owner透過既有 named initializer pipeline註冊，Spatial projection只在 Agent Carry owner實際存在的 profile中載入。

### Current Sleep preferred Slot conflict release

`11.44.0-sleep-slot-conflict` 完成 fixed-Slot sleep conflict 第一版。被 Agent 佔用的 preferred Slot 仍維持 objective illegal，不回填到 `SP.sleepTargets()`；Spatial 只新增 `sleepTargetExclusion(...)` 供 conflict consumer 判斷 exclusion reason，不建立第二份 occupant / preference truth。assignment / claim / Memory-owned habit 仍由 Usage Preference 提供 bounded Association Reason，讓 Deliberation 比較 alternate legal target、有限期 occupancy wait、generic attention，以及對可觀察 Human 的 yield request / nonphysical drive-away。

occupant context 必須來自 `observeAgentContext(...)` decision-time snapshot；Animal 沒有 Human-only request shortcut。occupancy wait 是 sleep-conflict 自己的有限期 Action phase，無 reservation，並納入 soft reconsideration / emergency preemption；Social response wait 仍使用既有 Social Bid lifecycle，但 source 明確標記 `sleepSlotConflict`。no-response 不等於拒絕，也不自動升級 stimulus。

Human responder 保有 agency：yield request / drive-away 先形成 canonical observable Bid；responder-local evaluation 可 accept / refuse / delay。accept response 本身不直接改 responder posture / position / private state；只有 responder 自己建立 `yieldSleepSlot` Intent + departure Action 後才可能實際離開 Slot。wake、perceived、response、departure、Slot available 分開。Conflict Resolution Evidence 接在既有 Decision Evidence 下游，保存 preferred Slot、Association Reasons、decision-time Observation snapshot、候選／選擇與 prior conflict chain，不做 future-state backfill。

Version impact：overall / Presentation、Deliberation / Decision Evidence、Sleep Slot Conflict → `11.44.0-sleep-slot-conflict`。Memory / Usage Preference 維持 `11.42.0-usage-preference-sleep`；Social Bid lifecycle 維持 `11.12.2-social-bid-lifecycle`；World Authoring 維持 `world-authoring-v11`；Furniture Catalog 維持 `furniture-definitions-v12`；Resources / Physical / Spatial Traversal / Spatial Passage / Route / Locomotion / Contact / Crowding / Affect / Relationship 等未改 subsystem generation 不假升。本 release 新增 beforeTick 275 `sleepConflict.respond` hook，因此 hook order 與 same-tick responder visibility 屬本次 semantic contract。

### Current Attention + Agent-context observation release

`11.43.0-attention-observation` 完成 fixed-Slot sleep conflict 第一版的直接前置小 gate。Engine core 現以 `observeAgentContext(st, observer, target)` 單一持有 production 已存在的 coarse responder-context observability：observer / target 必須 on-map 且有 position，observer 不得 sleeping；若雙方都有 Room 必須同 Room，並維持 Manhattan distance ≤ 4。可觀察時只回傳 target identity、observed tick、Human / Animal classification、observed action kind、observed posture 的 snapshot；不可觀察時明確回傳 unavailable reason。Social Bid requester-private timeout 已改讀此 query，不再自己維護第二份 Room / distance / sleeping 判斷。

同一 release 新增通用 attention interaction contract：canonical event 只表達 `interactionPurpose:'gainAttention'` 與 caller 提供的 `stimulusKind / stimulusIntensity`。對 sleeping responder 可沿用既有 interaction wake consequence；但 stimulus、wake、attention captured、request understood、request accepted 與實際 responder 行為保持分離。helper 不會自動建立 Social Bid、`awaitResponse`、accept / reject、位移或強度升級；no-response 仍必須回到 requester Deliberation。

Version impact：overall / Presentation → `11.43.0-attention-observation`。Social Bid lifecycle generation 維持 `11.12.2-social-bid-lifecycle`；Deliberation / Decision Evidence、Memory、Usage Preference 維持 `11.42.0-usage-preference-sleep`；World Authoring 維持 `world-authoring-v11`；Resources / Physical / Spatial / Route / Locomotion / Contact / Crowding / Affect / Relationship 等未改 subsystem generation 均不假升。本 release 沒有新增或重排 runtime hook。

### Current Usage preference sleep release

`11.42.0-usage-preference-sleep` 完成家具／空間慣用與歸屬偏好的第一個 `sleep` implementation slice。World Authoring 升為 `world-authoring-v11`，新增獨立 `usageAssignments[]` 與 explicit `claimEligibility[]`；沒有 eligibility relation 的 Slot 預設不可形成 Runtime Claim。Runtime `usageClaims[]` 與 occupancy / reservation 分離，第一版每 Agent × sleep 最多一個 active primary claim、每 Slot × sleep 最多一個 primary claimant；temporary `offMap` 不釋放 claim。

Action-level sleep utility 不讀 target preference；`SP.sleepTargets()` 仍只產生 objective legal candidates。Sleep target selection 另組合 bounded assignment / claim / Memory-owned Usage Habit / species-activity contributor，使用 `effectiveScore = objectiveScore - boundedPreferenceDelta`，最後以 stable TargetRef fallback。Target Selection Evidence 是既有 Decision Evidence 的 downstream Agent-private immutable record，以 `parentDecisionId` 連回 action decision，reselection 用 `priorTargetDecisionId` 串接。

Memory generation 同步換代：角色自己的 structured sleep-start experience 以 saturation gain 整併 `usageHabits`，並以 lazy temporal decay 派生 effective strength；stale Habit 可保留，但不存在的 target 不會成為 live candidate。Presentation 只在 Agent Debug context 顯示 Usage Habit / Target Selection Evidence 並標示「私人」。

Version impact：overall / Presentation、Deliberation / Decision Evidence、Memory、Usage Preference → `11.42.0-usage-preference-sleep`；World Authoring → `world-authoring-v11`。Spatial Passage 維持 `11.39.1-surface-boundary-transition`；Resources 維持 `11.39.0-carried-contents-loss`；Spatial Traversal / Route / Locomotion 維持 `11.38.0-carried-handling-risk`；Physical 維持 `11.37.0-carried-container-feasibility`；Furniture Catalog 維持 `furniture-definitions-v12`。

### Previous Carried Container Drop release

`11.41.0-carried-container-drop` 完成 P1 Slice D｜Container Drop。它不新增新的 planning risk；execution 直接重用 Slice B 已存在的 Resources-owned objective `HandlingRisk.containerDrop`。只有真正完成的 movement edge 才進入 consequence：posture transition、multi-tick edge 中途、完成前 interruption、Route / maneuver planning與 replan 都不會 drop Container，也不消耗 drop occurrence RNG。

同一 completed edge 在 position commit 後先 snapshot movement 的 HandlingExposure / HandlingRisk，接著保留既有 `onEnterTile` 與 Slice C contents-loss ordering，最後才對 `containerDrop` 做一次獨立 seeded occurrence roll。成功時建立 canonical `containerDrop` World Event、`Agent.held = null`，Container actual position = completed-edge canonical destination node。Furniture Surface destination 保留 Surface identity，不降格成 same-XY floor。

Slice D v1 **沒有**新增 drop-impact contents-loss model。若同一 movement edge 本身已依 Slice C 發生 `spill` / `contentsDrop`，它先完成；Container drop 本身不再額外造成第二段 resource transfer，也不建立假的 parent-child 因果。未來若增加 drop-impact spill，必須另有客觀 exposure / amount contract，並由 `containerDrop` Event 作 parent cause。這一版同樣不做 Surface→floor 墜落、Container breakage / damage、bounce、collision response、continuous rigid-body / fluid physics。

一般持有 lifecycle 明確不是 accidental consequence：`releaseHeld()`、Action finish / abort、sleep settle 與 soft-reconsideration cleanup 仍只把 Container 留在角色當下 canonical position並清除 held relation；不建立 `containerDrop` Event、不讀 drop probability，也不消耗 consequence RNG。反過來，若 accidental drop 讓 `eat` / `drink` 等 execution phase 失去其 required held Container，phase 以 `Agent.held` canonical truth 判定失效並進入既有 abort lifecycle；本版不自動撿回、不自動 retry，也沒有專用 recovery planner。

Version impact：overall / Presentation → `11.41.0-carried-container-drop`。Resources 維持 `11.39.0-carried-contents-loss`；Spatial Passage 維持 `11.39.1-surface-boundary-transition`；Spatial Traversal / Route / Locomotion / Deliberation 維持 `11.38.0-carried-handling-risk`；Physical 維持 `11.37.0-carried-container-feasibility`；World Authoring `world-authoring-v10`、Furniture Catalog `furniture-definitions-v12`、Embodiment Capabilities `embodiment-capabilities-v4` 均不變。

### Current Surface boundary transition correctness patch

`11.39.1-surface-boundary-transition` 修正 floor ↔ derived Furniture Surface 的 Passage boundary correctness。先前 `surfaceTransitionProfile()` 只驗證相鄰與 Surface geometry，沒有把兩個 coarse Cell 之間的 canonical Boundary / Door permeability 納入 profile；因此 Surface → floor 方向可在 `wall` 或 closed Door 上產生 executable transition，造成角色從椅面等家具頂面直接跨牆落到另一側地板。

Current contract：Surface transition 仍由 Passage 產生 objective elevation / gap / support geometry，但同一 profile 必須引用 separating canonical boundary，並在 `wall` 或 closed Door 時回 `status:'blocked'` + 空 `options`；Surface → floor 與 floor → Surface 必須對稱服從同一 permeability。合法 opening 保留既有 maneuver feasibility。這不改 Physical maneuver calibration、Route scoring、Locomotion timing / execution、Contact corner semantics、World Authoring schema 或 Furniture Catalog。

Version impact：overall / Presentation → `11.39.1-surface-boundary-transition`；Spatial Passage → `11.39.1-surface-boundary-transition`。Resources 維持 `11.39.0-carried-contents-loss`，Spatial Traversal / Route / Locomotion / Deliberation 維持 `11.38.0-carried-handling-risk`，Physical 維持 `11.37.0-carried-container-feasibility`；其他 subsystem generation 不假升。

### Previous Carried Container execution contents-loss release

`11.39.0-carried-contents-loss` 完成 P1 Slice C｜Execution Contents Loss。planning 仍只產生 objective HandlingExposure / HandlingRisk，不修改 contents、Environment、Events，也不消耗 consequence RNG；execution 只有在 core movement edge 真正完成、position commit 後才 evaluate 一次。posture transition、multi-tick edge 中途、完成前 interruption與 replan 都不觸發 consequence。

Occurrence 直接使用 Resources-owned objective `HandlingRisk.contentsLoss` + canonical seeded RNG，沒有 trait / careful 二次調整。成功後 amount 與 occurrence 分離，採已核准 C2 deterministic calibration：`amountSeverity = 0.28 × sqrt(raw retention severity)`、`fillModifier = 0.5 + 0.5 × fillRatio`、`lossFraction = clamp01(amountSeverity × fillModifier)`；同一 Container 的所有 nonzero contents 共用該 fraction，不再抽第二個 amount / per-resource RNG。每個實際 loss 以 exact conservation 從 source Container 轉移到 current Spatial Environment `effectNode` endpoint；liquid 記錄 `spill`，solid 記錄 `contentsDrop` canonical World Event。既有 on-enter hazard 若已在同 completed edge 造成 carried-content consequence，normal handling 會明確跳過，避免 double consequence。

Version impact：overall / Presentation、Resources → `11.39.0-carried-contents-loss`。Locomotion HandlingExposure、Spatial Traversal / Route weighted-search、Deliberation weights、Physical / Spatial Passage、Surface Environment contract、World Authoring `world-authoring-v10`、Furniture Catalog `furniture-definitions-v12`、Embodiment Capabilities `embodiment-capabilities-v4` 均未改自身 contract，不假升。Slice D Container Drop 仍未實作。

### Previous Carried Container risk-curve correction

`11.38.1-carried-risk-curve` 修正 P1 Slice B 的 retention-risk 語意，使 planning 的 objective `contentsLoss` 與後續 execution occurrence probability 能共用同一風險解讀，而不再把 authored calibration anchor 誤作 0% / 100% outcome threshold。

World Authoring 升為 `world-authoring-v10`：portable Container 的 `contentRetention.{tilt,impact,oscillation}` 將舊 `safe / failure` 正名為 `lowRiskExposure / highRiskExposure`。兩者只表示風險曲線校準位置。第一版 raw retention severity 暫定：`exposure = 0 → 0`、`lowRiskExposure → 0.01`、`highRiskExposure → 0.80`；低錨點前與兩錨點間線性遞增，高錨點以上持續單調增加並漸近 1，有限 exposure 不因跨過 anchor 直接變成必然失敗。這組 1% / 80% 是 calibration，可依 reference fixtures 與實測調整，不是永久產品常數。

Resources generation 推進到 `11.38.1-carried-risk-curve`，並繼續以 retention severity × containment × derived fillRatio × resource phase / contents facts 派生每個 movement edge 的 objective `contentsLoss`。空內容與 sealed normal movement 等 canonical facts 仍可使 risk 精確為 0。Locomotion 的 HandlingExposure calibration、Route weighted-search contract、Deliberation weights 與 Decision Evidence ownership均未改自身 contract，因此維持 `11.38.0-carried-handling-risk`。

Version impact：overall / Presentation、Resources → `11.38.1-carried-risk-curve`；World Authoring → `world-authoring-v10`。Spatial Traversal / Route / Locomotion / Deliberation 維持 `11.38.0-carried-handling-risk`；Physical / Spatial Passage維持 `11.37.0-carried-container-feasibility`；Furniture Catalog / Embodiment Capabilities與其他未改 subsystem generation均不假升。Slice C execution contents loss / resource transfer仍未實作。

### Previous Carried Container handling-risk release

`11.38.0-carried-handling-risk` 完成 P1 Slice B｜Objective Handling Risk + Route / Deliberation。World Authoring 升為 `world-authoring-v9`：portable Container 的 generic `handling` contract 在既有 `carryGeometry / handsRequired` 之外新增 `containment: open|covered|sealed` 與 `contentRetention.{tilt,impact,oscillation}.{safe,failure}`；`fillRatio` 繼續由 `contents / capacity` derived，不建立 serialized mirror。這些欄位已由 Resources handling-risk consumer直接使用，不是 dead schema。

Locomotion 由 current mode / Surface maneuver / vertical direction / metric distance派生 objective `HandlingExposure { tilt, impact, oscillation }`；Resources 由 exposure + Container / contents facts派生 objective `HandlingRisk { contentsLoss, containerDrop }`。Route 新增 query-scoped weighted objective，在 search 期間直接消費 objective metrics與 caller weights，因此能真正發現「短而危險」與「較長但安全」兩條 route；canonical `traversalCost` 不吸收 handling risk。Deliberation 目前把 bounded `careful` contributor轉成 contents/drop weights；Route 不讀 trait / Need / Memory來源，也沒有 personality hard-ban。

若 handling risk 真正改變 winner，既有 Agent-private Decision Evidence freeze Container identity、使用的 weights、selected/baseline route metrics與 decision score，不保存 path nodes。planning-only query 不修改 Container contents / Spatial Environment / Events，亦不消耗 consequence RNG。Slice C contents loss、Slice D container drop、spill / environment consequence均未實作。

Version impact：overall / Presentation、Resources、Spatial Traversal / Route、Locomotion、Deliberation → `11.38.0-carried-handling-risk`；World Authoring → `world-authoring-v9`。Physical與Spatial Passage維持 `11.37.0-carried-container-feasibility`；Embodiment Capabilities維持 `embodiment-capabilities-v4`、Furniture Catalog維持 `furniture-definitions-v12`，Contact / Crowding / Affect / Relationship / Memory均不假升。

### Current derived Initializer / Editor reachability integration

8-direction Slice 6 將 Initializer resident opening diagnostics 從 legacy cardinal `cells[].adjacent` BFS 遷移到 shared `HorizontalConnection` + resident kind body-only `default-walk` envelope；Runtime Passage 與 Initializer共用 pure clearance-option fit seam。Editor 將 legacy component明確標為「基礎水平連通區」，並在選取情境投影 cardinal / diagonal `candidate / blocked / unsupported` 與 resident-specific default-walk reachability；Preview preflight仍只走 canonical Initializer，Simulator Preview仍使用真正 Runtime Spatial，沒有第二套 traversal truth。

這個 integration **本身不改 serialized World Authoring shape、不改 HorizontalConnection derived output、不改 Runtime Passage / Route / Locomotion execution semantics，也不建立 persistent resident reachability state**。它在完成時沒有造成版本提升；目前 overall / World Authoring 已因後續 Carried Containers Slice B 推進到 `11.38.0-carried-handling-risk` / `world-authoring-v9`。Furniture Catalog仍為 `furniture-definitions-v12`、Embodiment Capabilities仍為 `embodiment-capabilities-v4`，Slice 6 consumer migration本身仍不得被誤算成這些 generation 的升級理由。

### Previous Carried Container feasibility release

`11.37.0-carried-container-feasibility` 建立 P1 Slice A carried physical feasibility：portable Container author `carryGeometry / handsRequired`；Resources 成為 canonical carried-load / handling-profile owner；Physical 保持 body-only MovementEnvelope並派生 effective carried envelope；Passage / Route 使用相同 geometry與總 hand-demand gate。basket 0.55m / 2 hands 作為 body-fits-carried-does-not reference fixture，cup / plate / bucket / bottle 保留一手攜帶的非 blanket-ban 行為。

這是 simulation semantic / authoring contract 變更，因此 overall、Resources、Physical、Spatial Traversal、Spatial Passage、Route 推進到 `11.37.0-carried-container-feasibility`；World Authoring → `world-authoring-v8`，Embodiment Capabilities → `embodiment-capabilities-v4`。Locomotion、Crowding、Deliberation、Affect、Contact 等未改語意，不假升。PR #157 的 Map posture / mobile selection Presentation 行為保留；Presentation projection 仍由 canonical release owner顯示 current overall marker。HandlingRisk、`tilt / impact / oscillation` calibration、spill/drop consequence 尚未實作。

### Previous Map posture / mobile selection release

`11.36.1-map-posture-selection` 修正 Simulator runtime map 的 posture / overlap Presentation。Spatial observability直接讀 authoritative `agent.posture.kind` 投影 `kneeling → 跪`、`prone → 趴` compact marker，並以 `data-posture` 暴露同一 canonical posture 給 Browser QA；不從 Action text、locomotion wording、Furniture overlap或route反推姿勢。

同一 patch 退休把 coarse `covered / overhead` 幾何視覺化成 `.spatial-under-cover` opacity的作法。Current floor Spatial Node沒有 tile內 local offset / region identity，因此 same XY + overhead geometry仍不足以宣稱角色確定位於家具下方；真正 under-furniture occlusion必須等待 semantic owner提供足夠 local-position / region truth。

Mobile 同格選取維持單一 `SimUI` selection truth：Agent 的 map entity layer保持高於 `spatial-furniture-handle`，因此家具 secondary handle不得遮住可見角色的直接 hit target；家具 handle本身提高可見度並在 ≤720px viewport擴為18×18px，仍只屬 Presentation affordance，不成為 Furniture / Spatial truth。這是玩家可見 Presentation interaction / observability patch，因此只推進 overall runtime / `SimUI.PRESENTATION_VERSION` 到 `11.36.1-map-posture-selection`；Deliberation維持 `11.36.0-decision-evidence`，Physical / Spatial / Passage / Route / Locomotion、World Authoring、Furniture Catalog與其他未改 subsystem generation都不假升。

### Previous Decision Evidence release

`11.36.0-decision-evidence` 將 Resident Explanation 的可信來源從「Recent Decision 的 tick + Action kind 對齊」升格為 Deliberation-owned adopted final evidence。每個 Agent 新增單筆 private `decisionEvidence`；live Action 只保存 `decisionId` reference。Initial core decision在afterTick 800 Memory→Deliberation correction完成後，由新增的 `deliberation.finalize-decision-evidence` order 850 finalize；soft reconsideration、emergency preemption與 hard replan則在 replacement Action真正採納時建立新的 decision identity。Hard replan仍可保留同一 Intent ID，但 replacement Action不得沿用舊 Decision ID。

Core chooser / soft candidate現在攜帶 structured contributor metadata；Social target 的 Memory / Relationship / access decomposition只在 final selected target freeze。這些 capture不新增 RNG consumption，也不改既有 utility、target ranking、responder policy或 World Event truth。Resident View只從與 live Action精確對齊的 adopted evidence投影原因；Human wander在尚無 formal winner-relative selection evidence前不再輸出「沒有更急的事」；`respondSocialBid` 第一階段仍省略自主 Explanation。Debug Inspector可查看 frozen final contributor snapshot，current-derived diagnostics仍保持 derived。

這是新的 simulation semantic / state contract，因此 overall runtime / Presentation 與 Deliberation generation推進到 `11.36.0-decision-evidence`。Memory Deliberation公式與 generation維持 `11.13.4-memory-deliberation-influence`；Social Bid lifecycle、Affect、Relationship、Human / Animal responder policy、Action、Physical / Spatial / Route / Locomotion、World Authoring / Furniture Catalog均未改語意，不假升。

### Previous Presentation event truth release

`11.35.2-presentation-event-truth` 完成 Presentation Truth Boundary P2：timeline summary classification 不再解析 `event.text` 的自然語句或中文 regex，而改讀 structured event `type / data.action`；Human / animal social producer、core social fallback與相關 action event wording移除沒有 canonical evidence的「走近／蹲下／跑到／蹭／伸手／側身／低頭／手一晃」等 transition / gesture敘事，並將 initial provisional plan、wait、abort、sleep-start等文字收斂成現有 structured source可支持的保守描述。Requester-private no-response truth仍由既有 private `awaitResponse / socialWaitEnded` ownership持有，不混入 World disturbance wording。

本 patch不新增 event schema、posture / movement state、semantic hook、Memory / Affect / Relationship input，也不改 Social Bid / wake / responder behavior。精確 abort cause與其他若未來確實需要的事件級細節仍屬 semantic-owner design gap，不以 readable prose取代 structured evidence。因此只推進 overall runtime / `SimUI.PRESENTATION_VERSION` 到 `11.35.2-presentation-event-truth`；Affect維持 `11.35.0-affect-responder-bias`，Physical / Spatial Traversal / Spatial Passage / Route / Locomotion維持 `11.34.0-surface-traversal-maneuvers`，Contact維持 `11.32.0-contact-slot-corner`，Dynamic Congestion維持 `11.31.0-crowding-8-direction`，World Authoring / Furniture Catalog / Embodiment Capabilities亦不假升。

### Previous Presentation projection correctness release

`11.35.1-presentation-projection-correctness` 收斂 Presentation Truth Boundary 的第一階段 correctness：app 頁首 release label改由 canonical `SimRelease.VERSION`派生短版；Resident / Action / Debug對 `standing / sitting / lying / kneeling / prone`使用一致 projection，missing / unknown posture不再假裝成 standing；Furniture / Room Debug移除 retired `blocksMovement / value`與`room.value`；Tile Readable / Debug明確標示 `SP.walkable() / SP.blockerAt()`只是 base/static blocker，而不是完整 per-Agent traversal feasibility；Appraisal / Memory Retention hint同步 current Appraisal → Affect與 Memory → Deliberation ownership。這些變更只修正既有 canonical truth的玩家／Debug投影，不新增 simulation state、behavior input或semantic pipeline。

因此 overall runtime / `SimUI.PRESENTATION_VERSION`推進到 `11.35.1-presentation-projection-correctness`。Affect generation維持 `11.35.0-affect-responder-bias`；Physical / Spatial Traversal / Spatial Passage / Route / Locomotion維持 `11.34.0-surface-traversal-maneuvers`，Contact維持 `11.32.0-contact-slot-corner`，Dynamic Congestion維持 `11.31.0-crowding-8-direction`，World Authoring / Furniture Catalog / Embodiment Capabilities也不假升。本 release不包含 event producer transition wording migration或timeline `event.text` reverse parsing removal；那些仍屬後續 Presentation work。

### Previous Affect responder bias release

`11.35.0-affect-responder-bias` 將 Current Affect 第一次接到正式 responder behavior，而不擴大到 general Deliberation。Affect runtime提供 `affectResponseSignal = clamp(valence - frustration, -1, +1)`；Human talk與animal pet responder各自以`0.12` cap形成短期 response delta，再與既有 Relationship `0.18` delta並列後 clamp final score。只讀 responder自己的 Current Affect；requester Affect不滲入，`activation`第一階段保持 decision-neutral。

為了讓同一 tick的 Human responder candidate與final response讀到同一個 current-Affect phase，`affect.decay`從beforeTick order 500提前到250，位於 Memory→Deliberation baseline capture 200之後、Human Social prepare 300 / Animal Social prepare 400之前。沒有新增 runtime hook。General `E.baseUtilityForAction(...,'talk')`、initiator target ranking、soft-switch / commitment、Physical / Passage / Route feasibility都不變；World Event / Agent不保存 Affect responder decomposition，Debug只即時計算 `base + Affect + Relationship → final`。

這是新的 simulation semantic slice，因此 overall runtime與 Affect subsystem generation推進到 `11.35.0-affect-responder-bias`。Persistent `agent.affect` shape不變；Relationship、Human Social Response、Animal Social Response、Physical、Spatial Traversal、Passage、Route、Locomotion、Dynamic Congestion、World Authoring / Furniture Catalog generation都不假升。

### Previous Surface traversal maneuvers release

`11.34.0-surface-traversal-maneuvers` 將 Furniture top traversal從 Definition額外 author一份可走 Surface policy，收斂為客觀幾何／支撐事實到執行 maneuver的單一路徑。Furniture Catalog升為 `furniture-definitions-v12`：Definition只在 canonical solid top face author `faces.top.supportsBodyOccupancy:true`與可選 `surfaceKey / surfaceLabel`；resolver從同一 rotated solid bounds派生 runtime `spatial.surfaces[]`的 stable `id / sourceSolidKey / supportRegion / topElevation / cells`。legacy singular `spatial.surface`現在直接拒絕，Surface不再 author species `allowKinds`、`traversable`、`moveCost / transitionCost`或duplicate bounds。World Authoring Instance shape沒有改，仍為 `world-authoring-v7`，但current document以 `furnitureCatalogVersion:"furniture-definitions-v12"` pin新 Catalog。

Embodiment Capabilities升為 `embodiment-capabilities-v3`，新增 posture-specific support footprint與 Human / Cat Surface maneuver profile；Physical以 support footprint + full body / pose clearance判斷 Surface static fit。Passage只擁有 floor ↔ Surface的 objective elevation、gap、support-region edge geometry；Physical依個體 geometry產生 `step / climb / jump`上／下候選，同一 geometry可同時存在多個合法 candidate。

Locomotion現正式擁有 Surface traversal / maneuver burden、timing、candidate selection與execution；本 release只搬移既有 Human / Cat Surface burden calibration，沒有憑空新增 family-specific timing差異。Route將選中的 exact `surfaceManeuver`保存到 route step；Engine pending movement驗證並執行同一 maneuver identity。Contact保持獨立 occlusion owner；Surface Environment、support-object resolver、Initializer、Validator、Editor / Debug都消費同一 derived Surface enumeration。

因此 overall runtime、Physical、Spatial Traversal、Spatial Passage、Route與Locomotion generation一同推進到 `11.34.0-surface-traversal-maneuvers`。Contact仍為 `11.32.0-contact-slot-corner`、Dynamic Congestion仍為 `11.31.0-crowding-8-direction`、Surface Environment仍為 `11.11.4-surface-liquid-foundation`；沒有新增 continuous Surface local position、多角色／跨 Slot occupancy、turn clearance、sideways traversal或persistent / cross-tick Route cache。性能量測確認 default graph增加8個合法 derived Surface nodes後，single/batch feasibility與Passage query增量來自 graph expansion；focused geometry-query regression仍要求單次 Route search `traversalFeasibility.repeatedCalls = 0`。

### Previous Human drink vessel feasibility release

`11.33.5-drink-vessel-feasibility` 修正 11.33.4 need-plan parity中的兩個 Human drink邊界。第一，actor自己已持有的 portable `canDrinkFrom` vessel原本會被 `canDrinkResource()`與`chooseDrinkVessel()`當成「已被持有」而整個排除，即使 execution已具備直接飲用或帶去 refill的條件；現在 self-held vessel以0 pickup burden參與同一個 executable vessel plan。第二，內容低於直接飲用門檻的 vessel原本可能在 feasibility階段被同一 vessel自己當成 refill source，導致 Action建立後 execution用 `excludeId`排除它才 abort；現在 candidate plan在成立前就用相同 exclusion驗證真正可達的外部 source。

Human drink的 Decision / Intent / `E.buildAction()`與`chooseDrinkVessel()`共用同一套 vessel access / refill-source feasibility：availability保留 existence-only short-circuit，不為每次 deliberation重跑完整 vessel ranking；execution再在同一 feasibility上選出實際 winner。若 winner已是 `a.held`，直接進入 idempotent take / drink-or-refill lifecycle，不再繞回 pickup自己手上的容器。這是 observable behavior correctness patch，因此 overall runtime / Presentation marker升為 `11.33.5-drink-vessel-feasibility`；Spatial Traversal仍為 `11.32.1-slot-aware-route-origin`、Route仍為 `11.30.1-slot-aware-origin`、Contact仍為 `11.32.0-contact-slot-corner`，World Authoring / Furniture Catalog維持 v7 / v11。

### Previous Slot-aware actor route-origin release

`11.33.4-slot-aware-route-origin` 修正 actor本身位於 Furniture Slot時的 Route origin correctness。先前 PR #147已讓 slot-bound **target**不再把 Slot anchor當 interaction destination，但 actor-side `planRoute / pathDistances / bestInteractionPositionResult`仍從 `agent.position`起算；對 sitting / lying Slot occupant而言，該位置是 Furniture Slot coarse anchor，通常被 solid覆蓋，不是 ordinary locomotion node。因此角色實際可以 `standUp → slotEgressNodes → route`，target ranking卻會先得到 Infinity。Seed 20260911的橘子躺在小型寵物床時反覆「決定吃東西 → Action消失」就是此漂移的玩家可見重現。

Spatial Traversal現以 `routeOriginsForAgent(...)`收斂 actor origin：ordinary actor使用 current locomotion node；slot-bound actor使用當下合法 `slotEgressNodes()`作 multi-source route origins。Interaction winner、Slot target、ordinary target、Memory / Decision access queries因此讀同一組 origin。Action execution離座時以 `bestSlotEgressNode(..., goal)`使用與 target ranking相容的 egress；如果 current Slot posture已直接滿足 Interaction Geometry，仍保留0-cost current-contact，不強迫站起。multi-source origins在同一次 route search中求 winner，不為每個 egress重跑完整搜尋。

同一 release也收斂 Hunger / Drink feasibility parity。Core chooser、Intent utility與`E.buildAction()`共用 executable-plan feasibility：Cat direct eating / drinking必須有 reachable source；Human eating / drinking必須有可執行的 dish / vessel / resource chain。世界上單純存在 food / water不再足以建立 Action；直接進食在執行時失去所有 reachable source會明確 abort / bounded replan，而不是 silent `finishAction()`後下一 tick無限重選。explicit Cat drink target也必須由該 target本身通過 availability + interaction reachability。

這個 patch改變正式 actor-side Route semantics，因此 overall runtime推進到 `11.33.4-slot-aware-route-origin`、Spatial Traversal到 `11.32.1-slot-aware-route-origin`、Route Semantics到 `11.30.1-slot-aware-origin`。Contact仍為 `11.32.0-contact-slot-corner`、Physical仍為 `11.33.0-pose-envelope-static-fit`、Locomotion仍為 `11.30.0-distance-timing`；World Authoring / Furniture Catalog維持 v7 / v11，沒有新增 persistent route cache、Slot schema、Furniture schema或Surface feature semantics。

### Previous Place Description Projection release

`11.33.3-place-description-projection` 修正 11.33.2後仍存在的 presentation drift。11.33.2已讓 canonical `SimSpatial.describePlace()`不再從 coarse floor + overhead Furniture推論「餐桌下」，但 `src/ui/spatial/observability.js`仍會直接讀 `agentObservation.covered / overhead`，在 Action Card / map title再拼出「餐桌下／餐椅下」；同時 slot-bound Agent雖然已有精確 `posture.slotId`，`describePlace()`仍把其 coarse Slot anchor當一般 floor node描述。

本 patch將 place projection收斂為單一 owner：slot-bound Agent優先用 Furniture + Slot label（例如 `餐椅 B・座位`）；ordinary coarse floor仍使用「餐桌所在格的地面」等保守 wording；explicit Furniture Surface仍使用「餐桌桌面」等 Surface label。UI spatial observability不再自行附加「家具下」文案，map title直接消費 canonical `describePlace()`；Debug的 overhead wording改成「同格上方幾何／最低淨空」，只描述可觀測 geometry，不假裝知道 tile內 exact occupant offset。

這是 player-visible / observable wording correctness patch，因此 overall runtime / Presentation marker升為11.33.3。Furniture solids、MovementEnvelope、partial-tile free-space、Surface traversability、Slot occupancy、Spatial Identity schema、Route / Passage / Locomotion、World Authoring與Furniture Catalog均未改；Physical仍為 `11.33.0-pose-envelope-static-fit`、Spatial Traversal / Contact仍為 `11.32.0-contact-slot-corner`、World Authoring / Furniture Catalog仍為 v7 / v11。

### Previous Coarse Place Description release

`11.33.2-coarse-place-description` 修正 player-readable / observable place wording的精度邊界，不改 Spatial traversal geometry。Current Furniture-local metric solids允許角色在同一 authored tile內使用合法剩餘 floor free-space；但 floor Spatial Node仍只有 coarse `spaceId + surfaceId + x/y/z`，沒有 tile內 local offset / region identity。因此 `describePlace()`不再只因同一 coarse floor tile存在 overhead Furniture就輸出「餐桌下」等精確局部關係，而改為「餐桌所在格的地面」。若 Agent位於 explicit Furniture Surface，仍可依正式 Surface identity輸出「餐桌桌面」等精確 label。

這個 patch **保留** Human / Cat依 MovementEnvelope使用 partial-tile floor free-space的既有 physical semantics，也保留 `diningTable:surface`的 traversable Surface policy；沒有修改 Furniture solids、Surface allowKinds、Passage、Route、Locomotion、Spatial Identity schema或World Authoring。因玩家可見描述改變，overall runtime / Presentation current marker升為11.33.2；Spatial Traversal / Contact仍為 `11.32.0-contact-slot-corner`、Physical仍為 `11.33.0-pose-envelope-static-fit`、World Authoring / Furniture Catalog仍為 v7 / v11。

### Previous Action spatial-target consumer correctness release

`11.33.1-action-spatial-target-consumers` 修正 Slot / Interaction Geometry contract升級後仍殘留在部分 Action / Deliberation consumer的舊 route-target假設。Furniture Definition、Slot geometry、PoseEnvelope、Passage、Route與Contact owner都沒有改；改的是 downstream consumer必須真正使用既有 canonical spatial target。

Human用餐選座現在先以 `bestSlotApproachNode(..., objective:'traversalCost')`取得合法 approach，再 route到 approach並於 settle前重新驗證 activity、PoseEnvelope fit、Slot availability / reservation與current `slotApproachNodes()`；不再以 Slot coarse anchor作 ordinary floor route destination。因此有合法餐椅 approach時會實際坐下，只有所有合格座位都沒有可達 approach時才使用 `standForMeal` fallback。

Agent social target的 core nearest fallback、Intent deliberation、hard replan與Memory target evaluation現統一以 `Interaction Geometry`的`socialReach`判定可達性與access cost。slot-bound target Agent由 `agentContactNodes() → slotApproachNodes()`派生合法接觸點，不再對 `target.position`（Slot coarse anchor）直接查 Route。Object / Source類 target的既有 Interaction Geometry execution contract不變；Cat drink的 Intent / replan helper則同步把 resolved interaction position的ranking objective從`pathDistance`收斂為 canonical `traversalCost`，避免 Decision consumer使用第二套客觀 access尺度。

這個 patch改變玩家可觀察到的用餐與自主社交 target selection semantics，因此 overall runtime / Presentation current marker升為11.33.1；但沒有新增 persistent schema、Spatial public API或Furniture / World Authoring generation，所以 Physical仍為 `11.33.0-pose-envelope-static-fit`、Spatial Traversal / Contact仍為 `11.32.0-contact-slot-corner`、Route / Locomotion仍為11.30.0 line，World Authoring / Furniture Catalog仍為 v7 / v11。

### Previous PoseEnvelope static-fit release

`11.33.0-pose-envelope-static-fit` 正式建立第一階段 **PoseEnvelope（靜態姿勢包絡）**：Physical依每個 Agent的 current `bodyGeometry` + authoring-safe embodiment posture profile，即時計算 sitting / lying的 `height / width / length`，不保存 `physical.poseEnvelope` mirror。這個 contract與MovementEnvelope（移動包絡）分離；standing / kneeling / prone的 static profile未在本 slice提前補齊。

Furniture Catalog在 PoseEnvelope release當時換代為 `furniture-definitions-v8`。rest / sleep Slot必須提供 `usableSpace.width / length`，`height`可省略表示該軸不限制；第一版不自動旋轉 PoseEnvelope 90°。餐椅 seat為`0.50 × 0.65m`、沙發每 Slot為`0.90 × 0.70m`、雙人床每 Slot為`0.70 × 2.00m`。雙人床移除舊`allowKinds:['human']`尺寸代理；餐椅的 human-only `allowKinds`仍保留，明確證明種類門檻與物理尺寸門檻互相獨立。

同一 static-fit contract由 rest / sleep target selection、meal seat selection、真正 settle前recheck、sleeping state validity、`SimWorldInitializer` initial furnitureSlot placement與Validator共用。Slot occupancy仍由 `agent.posture.slotId`持有，slot-bound Agent仍不算 ordinary floor occupant。World Authoring Instance schema沒改，因此維持 `world-authoring-v7`；Spatial Traversal / Contact、Passage、Route、Locomotion、Dynamic Congestion也不因整體 release更新而假升。本 slice不加入 multi-slot occupancy、usable-surface packing、dynamic seated obstruction、turn clearance、sideways movement或8-direction Slice 6。

### Current Furniture Catalog generation

Furniture Catalog現為 `furniture-definitions-v12`。v9加入 `cabinet-tall`、v10加入 `stool-basic`、v11加入 `pet-bed-small`；v12把 top body-support eligibility收斂到各 solid的 `faces.top.supportsBodyOccupancy` metadata。current resolver會為 dining-table tabletop、chair seat、stool seat、double-bed body top與cabinet body top派生 Surface；未 author eligibility的 top face不會自動成為平台。

v12的 `supportRegion / topElevation / cells`必須由 canonical metric solid bounds派生；Definition-level legacy `spatial.surface`被拒絕。若 Furniture `supportsObjects:true`，Catalog validator要求恰好一個 derived body-support Surface，讓 `supportId` object resolution沒有歧義。

Furniture Instance canonical shape與 World Authoring schema沒有改，因此 World Authoring維持 `world-authoring-v7`；current authoring document只把 `furnitureCatalogVersion` pin到 v12。產品仍未正式公開，所以舊 Catalog generation不建立 production migration machinery；unsupported catalog version直接拒絕。

### Current Contact + Slot Corner release

`11.32.0-contact-slot-corner` 完成8-direction implementation的 **Slice 5｜Contact + Slot Corner Semantics**。原本允許 local-neighbor的`reach / socialReach`與相應 support / cross-surface local Contact現可產生 diagonal candidate，但 Contact保持自己的 shared-corner occlusion owner：diagonal endpoints之間的兩條 L型接觸路徑任一條仍保有可確認 corner opening即可成立，因此單側 wall / closed Door可以阻止身體 Traversal，卻不必阻止 Contact；只有兩條路徑都被 Boundary / Door / Furniture聯合封死才 blocked，無法安全確認 opening的局部幾何第一版保守拒絕。這個判定不呼叫 diagonal Traversal legality作 Contact truth。

Furniture Slot authored contract維持 cardinal `approachEdges`，沒有新增`approachCorners`或World Authoring / Furniture Catalog schema。Runtime只在兩個 incident approach sides都 authored/legal，且 outside corner對兩個 side approach floor nodes的Passage × current MovementEnvelope都可行時，派生 direct diagonal settle / egress candidate；approach與egress共用同一 candidate owner。Slot occupancy仍由`posture.slotId`持有，slot-bound Agent仍不算 ordinary floor occupant。

本 release沒有改 HorizontalConnection / PassageProfile、Route objective / metrics、Locomotion timing、Crowding、Physical MovementEnvelope public contract、Spatial Identity、World Authoring或Furniture Catalog，也沒有加入 PoseEnvelope、turn clearance、sideways / step-over、Initializer / Editor / Preview diagonal parity或persistent / cross-tick geometry cache。因此 overall runtime、Spatial Traversal與Contact generation推進到 `11.32.0-contact-slot-corner`；Spatial Passage維持 `11.29.0-horizontal-connection-passage`，Route / Locomotion維持11.30.0 line，Dynamic Congestion維持 `11.31.0-crowding-8-direction`，Physical維持 `11.17.0-passage-profile-multimode`，World Authoring / Furniture Catalog維持 v7。Presentation marker只因 canonical overall release跟隨更新，不代表新增 Presentation-owned simulation truth。

### Previous Completion-Aware Autoplay release

`11.31.1-autoplay-completion-aware` 將 simulator autoplay的 tick-source scheduling從固定`setInterval(stepOne,700)`改為 Presentation-owned completion-aware controller。名目 start-to-start cadence仍為約700ms：若完整同步`E.tick() → render()`在週期內完成，下一 callback只等待剩餘時間；若工作本身已超過700ms，不補跑或追趕 overdue callback，而是在完整 callback結束後先跨過兩個 browser `requestAnimationFrame` opportunities，再以零額外 cadence delay安排下一 tick。

Pause / Reset共用單一 cancellation owner，會取消 pending timeout / animation-frame並使 generation token失效；manual `step` / `step10`與autoplay仍互斥，完整 simulation tick不被切開或await。這只改玩家可觀察的 Presentation scheduling / responsiveness policy，不改 simulation state/schema、Route score、hook ordering、Crowding / Spatial / Locomotion semantics或RNG。

因此 overall runtime與Presentation marker推進到 `11.31.1-autoplay-completion-aware`。Dynamic Congestion generation仍為 `11.31.0-crowding-8-direction`；Spatial Traversal / Route / Locomotion / Passage / Physical、World Authoring與Furniture Catalog均維持既有 generation。

### Previous Crowding 8-direction release

`11.31.0-crowding-8-direction` 完成8-direction implementation的 **Slice 4｜Crowding 8-direction**。Crowding不新增第二套 diagonal geometry truth，而是直接消費 Slice 2已提供的`TraversalManeuver.primaryResource / influenceNodes`：cardinal horizontal與Structure使用兩個 endpoint，diagonal horizontal使用共享 grid corner周圍四個 floor nodes作 conservative broad phase；candidate依Agent ID去重，不建立 persistent `resource -> agents` index或cross-tick cache。

標準水平 moving-vs-moving direction relation正式擴充為0° / 45° / 90° / 135° / 180°。既有`same=.65`與`opposite=1.7`保留為兩端，45° / 90° / 135°以線性插值取得`.9125 / 1.175 / 1.4375`；`stationary=1`與`unknown=1`維持獨立語意。Structure / Z-aware movement保留原本 exact same / opposite / unknown判定，不把垂直流量硬套水平角度分類。

Passage × MovementEnvelope仍是 physical feasibility與mode-effective `effectiveClearanceWidth`的唯一 truth；Crowding沿用既有 width pressure、`congestionCost`與`delayTicks`。diagonal Crowding視為一次局部共享資源事件，不因 maneuver全長是`sqrt(2)`就再乘距離倍率；Crowding `edgeMoveTicks` helper則改用 maneuver `distanceMeters`取得Locomotion metric base timing，再加 congestion delay，與Slice 3 Route / execution timing保持一致。

本 release仍是 **soft-only**：不 hard-block、不禁止 overlap、不加入 reservation / yielding / priority / deadlock / collision，也不加入 behavioral willingness。Slice 5 Contact / Slot corner、Slice 6 Initializer / Editor / Preview diagonal parity、Static Posture Fit / PoseEnvelope、persistent heading / turn clearance、45° Furniture orientation與PR #116類query-scope optimization均不包含在本 release。

因此 overall runtime與Dynamic Congestion generation推進到 `11.31.0-crowding-8-direction`；Spatial Traversal維持 `11.30.0-metric-route-locomotion`，Spatial Passage維持 `11.29.0-horizontal-connection-passage`，Route維持 `11.30.0-metric-route`，Locomotion維持 `11.30.0-distance-timing`，Physical維持 `11.17.0-passage-profile-multimode`，World Authoring / Furniture Catalog維持 v7。

### Previous Metric Route + Locomotion release

`11.30.0-metric-route-locomotion` 完成8-direction implementation的 **Slice 3｜Metric Route + Locomotion Execution**。Production floor Route現正式枚舉 Slice 2已建立、且Passage status為`candidate`的 cardinal / diagonal `TraversalManeuver`；blocked / unsupported diagonal仍保守拒絕。Surface traversal、Structure connection與authored topology各自維持既有 ownership，不因 floor diagonal route偷改 schema。

Route metric正式改為公尺制：`pathDistance`累積每個 maneuver的`distanceMeters`，cardinal floor step為`1m`、diagonal為`sqrt(2)m`；`stepCount`另保存 graph edge count。環境 movement burden與Locomotion mode burden按公尺累積，mode transition burden仍按 transition計算；Dynamic Congestion的既有`congestionCost`本 slice保持獨立，不因 diagonal整段距離自動乘`sqrt(2)`。

Locomotion timing改由 `SimLocomotion.movementTiming(agent, mode, distanceMeters, movementCredit)`提供共同 truth。Route planning與Engine execution都依實際距離／`speedFactor`計算 movement requirement；同一 locomotion mode的連續 edge可以用 current Action內的 fractional movement credit承接前一 edge的離散 tick餘量，mode/posture transition則清除 credit。因此兩段 walk diagonal總長`2 × sqrt(2)m`可在3 movement ticks完成，而不是逐 edge各自ceil成4 ticks。這個 credit只存在 current Action，不是 route cache，也不跨 action／tick snapshot保存 derived route result。

本 release **不包含** Slice 4的8-direction Crowding resource / angle semantics、Slice 5的Contact / Slot corner semantics、Slice 6的Initializer / Editor / Preview diagonal reachability、persistent heading / turn clearance、45° Furniture orientation、World Authoring / Furniture Catalog schema change、Physical MovementEnvelope public contract change，亦沒有加入 persistent / cross-tick traversal cache或action-execution route-result reuse。

因此 overall runtime、Spatial Traversal、Route Semantics與Locomotion generation正式推進到11.30.0 line；Spatial Passage維持 `11.29.0-horizontal-connection-passage`，Physical維持 `11.17.0-passage-profile-multimode`，Dynamic Congestion維持 `11.28.0-effective-passage-width`，World Authoring / Furniture Catalog維持v7。Presentation marker只因 canonical `SimRelease.VERSION`跟隨 overall release，不代表本 slice新增 Presentation-owned simulation truth。

### Previous Interaction Winner Result Reuse release

`11.29.3-interaction-winner-result-reuse` 將 interaction-position winner scoring已經算出的 canonical `traversalCost`正式暴露為 additive Spatial result contract：新增 `bestInteractionPositionResult(...)`，回傳 `{ position, traversalCost }` 或 `null`；既有 `bestInteractionPosition(...)`保持 position-only compatibility contract，winner identity、candidate order、same-XY cross-surface filtering、Crowding-aware排序與tie-break全部不變。

Engine的 target-selection `targetTraversalCost()`在 richer API可用時直接消費 winner result的`traversalCost`，不再對同一 winner緊接著重跑一次 `SP.traversalCost(...)`。這只重用同一次同步 winner calculation的derived result；不建立 persistent / cross-tick cache，也不把 action-execution `moveToInteraction() → planRoute`納入 reuse。Browser performance regression鎖定 single tick inside-tick `traversalFeasibility = 5,385`、`step(10)` inside `16,345` / outside `2,682`，並保留 exact canonical state parity、page error = 0、console error = 0。

因新增正式 public Spatial result API，本 release推進 overall current marker，Spatial Traversal contract marker同步升為 `11.29.3-interaction-winner-result`。World Authoring `world-authoring-v7`、Furniture Catalog `furniture-definitions-v7`、Horizontal Geometry、Spatial Identity、Physical、Spatial Passage、Route、Locomotion、Dynamic Congestion與其他未改 subsystem generation均不假升。

### Previous Batch Step Yielding release

`11.29.2-batch-step-yielding` 把「10 步」的排程責任正式收斂到 Presentation / UI layer。單步 `step(1)`仍同步執行一個完整`E.tick()`後render；manual `step(10)`先建立 UI-only batch context與busy state，在第一個 tick前先讓出一次 browser event loop，之後每個**完整** tick之間再讓出一次。單一`E.tick()`內沒有`await`、partial render或cancellation checkpoint，因此 runtime hook ordering、same-tick visibility、RNG與canonical simulation semantics不變。

Intermediate manual-batch tick仍照既有 registry順序呼叫 Presentation afterTick observers，但`uiObservability.render-mobile-summary`、`residentView.schedule`、`relationshipView.schedule`會coalesce / defer真正 refresh；最後一個 tick才恢復正式 refresh，接著 `src/ui/core.js`做一次 core full render。Manual batch期間`step / step10 / play`、runtime layer、決策原因、scenario load與simulation-dependent workspace互動會被 UI-only busy / inert policy阻擋；Reset保留可用，先 invalidates batch generation，再reset回 canonical state，舊 continuation不得再執行 tick或stale final render。Autoplay期間則停用 manual step controls，仍保留 play作pause與Reset。

這是玩家可觀察的 Presentation / scheduling contract變更，因此 overall current marker與`SimUI.PRESENTATION_VERSION`跟隨 patch升版；World Authoring `world-authoring-v7`、Furniture Catalog `furniture-definitions-v7`、Horizontal Geometry、Spatial、Route、Locomotion、Dynamic Congestion、Physical與其他未改 subsystem generation均不假升。Interaction winner-result reuse仍是獨立延後候選，不屬本 release。

### Previous Slot Interaction Egress Fix release

`11.29.1-slot-interaction-egress` 修正家具 Slot姿勢離開後再前往一般互動目標時的 action lifecycle次序。若 Agent已在目標的有效 interaction position，仍可直接維持坐姿／躺姿互動；只有在目前不能直接互動且仍綁定 Slot時，`moveToInteraction()`才先透過既有`standUp() → slotEgressNodes()`離開 Slot，下一 tick再以合法 floor node執行`bestInteractionPosition()`與production Route查詢。這避免把家具 Slot的coarse anchor當成 Human可站立 floor route起點，進而把其實可達的 portable object誤判成「找不到能接近的位置」。

Focused regression使用 default world seed `20260912`，重現 Human從餐椅 Slot嘗試拿取落在`(4,5,0)`的`cupB`：修正前 route scoring全部為不可達、Agent留在 sitting；修正後先合法 egress，重新取得 pickup goal，並可繼續拿起杯子。問題在PR #119前的baseline已存在，因此不是8-direction Slice 2 regression。

本 patch改變玩家可觀察到的 simulation semantics，因此依版本規範升 overall current marker；但 World Authoring、Furniture Catalog、Horizontal Geometry、Spatial Traversal、Spatial Passage、Route、Locomotion、Dynamic Congestion、Physical與Spatial Identity contract均未改，各 subsystem generation維持原值。

### Previous Shared Horizontal Geometry Foundation release

`11.29.0-horizontal-geometry-foundation` 建立8-direction implementation的第一個可執行基礎，但**尚未啟用 production diagonal routing**。新增`src/horizontal-geometry.js`作為 Authoring／Runtime未來共用的 pure geometry owner：它不讀Agent、Crowding、Route cost或runtime global state，從adapter snapshot派生無向、Agent-independent `HorizontalConnection`。cardinal `distanceMeters = 1`；diagonal `distanceMeters = sqrt(2)`。斜向第一版採B+ conservative local geometry，同時考慮相關 cardinal Boundary／Door、Furniture metric solids、fixed blocker、explicit Passage constraint與shared-corner free-space，並以`candidate / blocked / unsupported`區分可證明 passage、可證明阻斷與第一版無法安全證明的情況。

`SimWorldAuthoring.deriveHorizontalTopology(...)`現額外回傳 ephemeral `horizontalConnections`，但 serialized World Authoring shape完全不變；`world-authoring-v7`與`furniture-definitions-v7`因此維持原 generation。legacy `cells[].adjacent / componentId / components`仍只表示 cardinal compatibility coarse topology，Initializer／Editor舊 consumer不會因 diagonal candidate被污染。Agent-specific MovementEnvelope feasibility不回寫 connection；focused regression同時鎖住 open corner、wall／Door、單／雙Furniture narrowing、complete cut、ambiguous `unsupported`、multi-region `unsupported`、canonical endpoint/resource與legacy cardinal parity。

本 release只落地 shared horizontal geometry foundation與Authoring projection；`SimSpatial.getPassageProfile`、Spatial Traversal neighbor generation、Route distance／step semantics、Locomotion execution timing、Dynamic Congestion、Contact與Slot corner semantics都尚未接 diagonal。因此 Spatial Traversal `11.28.0-furniture-local-geometry`、Spatial Passage `11.28.0-positioned-passage-options`、Route `11.24.0-route-locomotion-cost`、Locomotion `11.24.0-locomotion-objective-burden`、Dynamic Congestion `11.28.0-effective-passage-width`、Physical `11.17.0-passage-profile-multimode`與Spatial Identity `11.22.0-spatial-z-identity`均不假升。

### Previous Preview Boundary Presentation release

`11.28.2-preview-boundary-presentation` 修正 Simulator / Editor Preview對 World Boundary / Door canonical truth的呈現落差。Runtime map現直接從`state.map.boundaries`投影格線牆：`kind:"wall"`顯示為cell edge line，普通`kind:"opening"`不顯示實牆線；若opening boundary被root `state.doors`引用，則依Door `open / closed` state顯示不同的Door edge樣式。投影依目前runtime Z layer篩選，切換到沒有boundaries的layer不殘留其他層邊線。

這是 Presentation-only contract更新：不改 World Authoring `world-authoring-v7`、Furniture Catalog `furniture-definitions-v7`、runtime map / Door schema、Spatial topology / Passage / Route / Locomotion / Crowding semantics，也不新增第二份wall truth。舊`.sim-tile.terrain-wall / terrain-doorway`樣式暫保留給低階 compatibility fixture，但 canonical Simulator wall presentation只讀`state.map.boundaries / state.doors`。因正式玩家可見 Simulator surface改變，overall current marker升patch；`SimUI.PRESENTATION_VERSION`與current-marker-owned UI version依既有規則跟隨 release marker。

### Previous Furniture Facing Semantics release

`11.28.1-furniture-facing-semantics` 修正 Furniture orientation contract的語意不一致。Furniture Catalog升為`furniture-definitions-v7`：Definition canonical orientation改為`south`；directional Furniture以`orientationSemantics:"facing"`表示Instance `orientation`是正面／主要 facing，床的 facing定義為head → foot；沒有自然正面的 Furniture以`orientationSemantics:"frame"`保留quarter-turn local-frame transform，但Editor不顯示 facing arrow。

World Authoring升為`world-authoring-v7`。Furniture Instance shape仍是`id / definitionId / origin / orientation / optional name`，但同一個orientation value的compatibility semantics已改變，因此不能沿用v6 generation。Default world為保留既有實際擺法，dining table / sofa改為`south`、bed改為`north`，四張餐椅維持既有east / west facing。New Furniture Instance預設explicit `south`。

Editor的`↑ → ↓ ←`只代表 directional Furniture的facing；frame-only Furniture顯示0° / 90° / 180° / 270° local-frame rotation。這次不新增45° Furniture orientation，也不改Spatial Traversal / Passage、Route、Locomotion、Physical、Spatial Identity或Dynamic Congestion generation。產品尚未正式公開，因此v6 → v7 / Catalog v3 → v4不建立production migration；unsupported generation仍由current import boundary拒絕。

### Previous Furniture Local Geometry release

`11.28.0-furniture-local-geometry` 將 Furniture physical obstruction從 whole-tile `spatial.floor.mode / spatial.under`收斂為 Furniture-local公尺制3D AABB `spatial.solids`。Furniture Catalog升為`furniture-definitions-v6`；Surface以`onSolid:{key,face:'top'}`派生coarse cells，Slot保留stable `<instanceId>:<slotKey>`並新增rotated `approachEdges`。World Authoring Instance shape未改，因此維持`world-authoring-v6`。

Spatial Traversal升為`11.28.0-furniture-local-geometry`，由floor-start solids、單一格內free region與directional edge intervals派生partial-tile traversal；同tile多個disconnected floor regions仍拒絕。Spatial Passage升為`11.28.0-positioned-passage-options`，同一edge可有多個位置化`options`，避免把不同位置的最大寬度與高度拼成虛構passage。Dynamic Congestion升為`11.28.0-effective-passage-width`，讀目前locomotion mode真正選中的`effectiveClearanceWidth`。

Slot occupancy同步改成`route to approach → settle → occupy slot`；slot-bound Agent的coarse anchor不算ordinary floor occupancy，離開必須先選合法且未被其他ordinary Agent佔用的egress，無可用egress時不得teleport或清掉slot posture。Default bed改為2×2、`origin:{x:8,y:5,z:0}, orientation:'south'`；四張餐椅朝向餐桌；老周 opening placement由`(7,3)`改為`(7,4)`。

本 release不加入8-direction、sideways / step-over / jump / climb、movable-furniture metric translation、PoseEnvelope / static fit、45° Furniture orientation、Nav Cell / micro-grid或continuous Agent local position。Physical、Route、Locomotion、Spatial Identity等未改contract的generation維持原值。

### Previous Room Value Legacy Removal release

`11.27.2-room-value-legacy-removal` 移除沒有 gameplay consumer的legacy Room value aggregate。Spatial `recomputeRooms()`仍負責Room topology、identity、membership、boundary / Furniture集合與area，但不再把floor material、boundary material、Furniture legacy `value`與Door parity constant混成`room.value`。Furniture Catalog同步換代為`furniture-definitions-v5`：Definition移除`compatibility.roomValueContribution`，shared resolver不再投影runtime Furniture `value`。Default Door也移除只為歷史 parity存在的`compatibility.roomValueContribution: 18`，`313.6` regression改為明確鎖定Room / Furniture不再帶legacy `value`。

這次不建立新的經濟／資產、品質、prestige、美學或舒適度模型；既有`comfortAt()`與Room topology / memory / social room-membership consumer都保持原 ownership。World Authoring的canonical Instance shape沒有改，因此維持`world-authoring-v6`；Furniture Definition / resolver contract有實質改變，所以Catalog換代為`furniture-definitions-v5`。Spatial Traversal / Passage、Route、Locomotion、Physical、Spatial Identity、Dynamic Congestion、Relationship與Memory subsystem generation均不跟著假升。由於runtime derived state shape與Catalog contract改變，overall current marker推進一個patch。

### Previous Resident Private Badge release

`11.27.1-resident-private-badge` 將 Resident View「最近發生的事」中的owner-private event從正文前綴「自己的經驗・」改為獨立「私人」badge。事件正文仍直接使用canonical event text；公開事件不顯示badge，private event仍只有owner本人可在自己的Resident View看見。

這是純Presentation / observability contract更新：不改World Event的`visibility / owner` truth、不改requester-private `privateSocialOutcome`、Memory / Appraisal / Relationship / Affect，也不改simulation hook或observer ordering。World Authoring維持`world-authoring-v6`，Furniture Catalog維持`furniture-definitions-v4`；Spatial Traversal / Passage、Route、Locomotion、Physical、Spatial Identity、Dynamic Congestion、Relationship與Memory subsystem generation全部維持既有marker。由於正式玩家可見Resident View surface改變，依本文件規則升overall patch marker，`SimUI.PRESENTATION_VERSION`與其他current-marker-owned UI version一併跟隨。

### Previous Furniture Orientation release
`11.27.0-furniture-orientation` 將 Furniture朝向正式納入 canonical authoring。World Authoring升為`world-authoring-v6`：Furniture Instance新增required `orientation: north | east | south | west`，`origin`維持目前resolved footprint的NW／左上placement anchor，不因旋轉自行平移。Furniture Catalog同步升為`furniture-definitions-v4`，Definition以north為canonical local frame，shared resolver統一把footprint、display offset、slot與surface coverage轉成oriented local geometry後再套用Instance origin；rotated geometry不persistent成第二份truth。

Editor的`rotateFurniture(...)`沿用atomic clone → apply → validate → canonicalize → commit contract。明確`supportId === furnitureId`的Container position / interaction port會使用同一local↔world transform跟隨旋轉；slot-bound Resident保留stable `<instanceId>:<slotKey>` reference。方向marker只在Furniture被選取或新增／放置／拖曳預覽時顯示，平常不常駐。Source interaction ports不因本release改ownership。

本 release沒有改Spatial Traversal、Spatial Passage、Route Semantics、Locomotion、Physical、Spatial Identity或Dynamic Congestion contract，因此它們維持既有generation：Spatial Traversal `11.26.0-vertical-structure-traversal`、Spatial Passage `11.26.0-vertical-structure-passage`、Route `11.24.0-route-locomotion-cost`、Locomotion `11.24.0-locomotion-objective-burden`、Dynamic Congestion `11.26.0-vertical-flow-congestion`。產品尚未正式公開，因此v5→v6 / Catalog v3→v4不建立production migration machinery；unsupported generation仍由current import boundary拒絕。

### Current Vertical Structure Traversal release

`11.26.0-vertical-structure-traversal` 建立第一個 concrete cross-Z traversal contract。Canonical World Authoring升為`world-authoring-v5`，新增獨立 root `structures`；第一版正式Structure kind為抽象`stair`，persistent facts只保存`id / kind / lower / upper`與可選`clearanceWidth / clearanceHeight`。Authoring不保存`upCost / downCost`、adjacency、PassageProfile或Route score；`SimWorldAuthoring.deriveStructureConnections(...)`與runtime Spatial從相同world facts派生真正的cross-Z edge。沒有明確Structure時，同XY different Z仍不可達，`deriveHorizontalTopology(...)`仍保持同層horizontal owner。

Spatial Passage正式接受Structure edge，PassageProfile會回報`edgeKind: "structure" / structureId`並把Structure clearance與既有under / edge constraint組合。第一版stair只允許既有`walk`；Physical沒有新增`climbAbility`、slope或step-rise axis。Directional traversal burden由system-owned stair profile派生，目前additive objective burden為上樓`+1`、下樓`+0.5`，因此維持`up > down >= flat`；這些是Route objective facts，不寫回Structure instance，也不由`speedFactor`推導。

空樓梯仍可在1個movement tick完成單一abstract edge，不硬編`stair = 2 ticks`。Dynamic Congestion將movement direction從XY擴為XYZ，並繼續使用Passage `clearanceWidth`的既有pressure → `delayTicks`模型；因此狹窄樓梯在人多或逆向流時可以自然增加execution ticks，而不新增stair-specific timing hack或`flowCapacity` contract。Editor只新增Structure Scene Inspector / lower-upper endpoint observability與Preview round-trip；不加入完整Structure建立／拖曳、3D stair mesh、continuous slope、per-step geometry、jump/vault/climb、ladder/elevator。

本 release因cross-Z graph semantics、Structure Passage與vertical crowding direction各自換代Spatial Traversal `11.26.0-vertical-structure-traversal`、Spatial Passage `11.26.0-vertical-structure-passage`、Dynamic Congestion `11.26.0-vertical-flow-congestion`。Furniture Catalog維持`furniture-definitions-v3`；Route Semantics、Locomotion、Physical、Spatial Identity沒有改contract，因此維持原generation。

### Previous Furniture Traversal Geometry release

`11.25.0-furniture-traversal-geometry` 將 Furniture traversal geometry正式收斂到 Definition owner。Furniture Catalog generation升為`furniture-definitions-v3`：Definition以`spatial.floor.mode = open / solid / under`明確區分footprint與floor traversal的關係，沿用既有`spatial.under`作低淨空唯一truth，並新增可選`spatial.surface`持有traversable surface、`allowKinds`與surface-specific `moveCost / transitionCost` override。resolver從local geometry + Instance origin派生world footprint、`<instanceId>:<surfaceKey>`與surface cells；Furniture Instance仍只保存`id / definitionId / origin / optional name`，因此`world-authoring-v4`不跟著假升。

Default dining table的`.72m` under-clearance、`diningTable:surface` identity、桌下passage、桌面contact / Surface Environment與route cost parity均保留，但`src/spatial-traversal.js`不再對`diningTable` instance ID補traversal / surface truth。Spatial Traversal contract因正式改為generic Furniture geometry consumer，換代為`11.25.0-furniture-traversal-geometry`；Spatial Passage、Route Semantics、Locomotion、Physical、Crowding未改各自contract generation。本 release不加入vertical traversal、rotation/orientation、jump/vault/climb、Room value正式模型或Resident View私人badge。

### Previous Locomotion Traversal Cost release

`11.24.0-locomotion-traversal-cost` 補齊 production route objective對 locomotion mode / mode-transition的客觀成本。Locomotion現正式持有 mode traversal burden：walk `0/edge`、kneelCrawl `1/edge`、proneCrawl `2/edge`，每次locomotion mode切換另加`1` objective burden；Route / Spatial Traversal只負責把它與既有environmental / Surface edge cost、Crowding `congestionCost`組合成`traversalCost`。因此短但必須匍匐的捷徑不再只因edge數較少就自動勝過稍長步行路線，但當步行繞路真的更昂貴或crawl是唯一可行route時仍可選crawl。

`travelTime`仍只表示真實execution timing：`transitionTicks + edgeMoveTicks`，而`speedFactor`只影響edge movement ticks；個體速度override不會偷偷等比例改寫objective burden。主觀willingness、禮儀、尊嚴感、carefulness等仍不進Physical feasibility或客觀`traversalCost`。本次因此換代Route Semantics為`11.24.0-route-locomotion-cost`，Locomotion contract為`11.24.0-locomotion-objective-burden`；Physical / Passage、Spatial Traversal / Passage、Dynamic Congestion、World Authoring與Furniture Catalog generation均維持原marker，不跟著假升。

### Previous Editor Source Port Observability release

`11.23.1-editor-source-port-observability` 修正 Editor對Source interaction geometry的可觀測性缺口。Editor map現直接投影canonical `interactionPorts`：互動格以小型方向標記指出角色應站的位置與面向來源的方向；點擊標記可直接選取所屬Source。Source Inspector同時對具有`fill` affordance的水源顯示「取水位置」，並保留port自己的label / position。Default `tap`因此會在左側互動格`(5, 5, 0)`顯示指向本體的`→`，Inspector顯示「水龍頭左側 · (5, 5, 0)」，不再要求作者從runtime行為猜測可互動面。這次不改`world-authoring-v4` shape、不改Source interaction geometry / refill行為，也不改Furniture Catalog、Spatial Traversal / Passage、Physical / Route / Locomotion / Crowding等subsystem generation；因正式玩家可見Editor observability surface改變，overall current marker升一個patch。

### Previous World Boundary / Door / Exit release

`11.23.0-world-boundary-door-exit` 完成 Grid / Wall decision gate的正式落地與Door / Opening / Exit分離。Canonical authoring升為`world-authoring-v4`：`map.cellSizeMeters = 1`明確定義coarse Tile與SI metric geometry的換算邊界；普通牆／結構開口改由每層`boundaries`持有，不再把`wall / doorway`當Cell terrain。Door改成獨立root entity，只持有opening boundary reference與`open / closed` state；off-map world Exit另外持有boundary reference與內側access position。Furniture Catalog因移除`front-door` Definition、`runtimeExitSlotKeys`與`canExit` compatibility bridge，換代為`furniture-definitions-v2`；External Supply改用正式Exit identity。為避免ownership refactor偷改既有Room value，default Door暫以`compatibility.roomValueContribution`保存原本front door的18點貢獻；這只是窄parity bridge，不建立正式Door value模型。Spatial topology、room flood-fill、PassageProfile與route共用同一boundary interpretation；wall / closed Door阻斷edge，opening / open Door保留edge，opening的metric `clearanceWidth / clearanceHeight`進入PassageProfile。因此Spatial Traversal contract換代為`11.23.0-boundary-traversal`，Spatial Passage contract換代為`11.23.0-boundary-passage-profile`。Physical、Route Semantics、Locomotion、Crowding、Spatial Identity、Relationship、Memory等未改contract的subsystem generation不跟著假升。產品尚未正式公開，因此v3→v4不建立production migration machinery；unsupported schema / catalog generation由current import boundary直接拒絕。

### Previous Editor-3 release

`11.22.3-editor-authoring-presentation` 完成 **Editor-3｜Authoring presentation polish**。正式`material` authoring contract維持既有`world-authoring-v3`：Editor新增Cell材質編輯，可設定、替換與清除既有`material`，常用`wood / stone`只作輸入提示，不建立新的封閉material enum；所有修改仍經`SimEditorAuthoringMutations`的clone → apply → validation → canonicalize → commit流程。作者主要可見文案改為自然繁體中文，正式identifier只在必要的進階／診斷位置保留；runtime boundary改為預設收合的進階資訊。Desktop左右操作panel增加viewport-scoped sticky / independent scroll，mobile保留單欄與map internal scroll並補足主要控制項的觸控高度。這是玩家可見Editor功能／interaction surface的patch-level更新，因此推進overall current marker；`world-authoring-v3`、`furniture-definitions-v1`與Physical / Passage / Route / Locomotion / Crowding / Spatial Identity / Relationship / Memory等subsystem generation均不假升。

### Previous Editor-2 release

`11.22.2-editor-furniture-definitions` 完成 Furniture Definition / Instance authoring slice。新增pure system-owned `SimFurnitureDefinitions` Catalog（`furniture-definitions-v1`），並將canonical authoring升為`world-authoring-v3`：document以`furnitureCatalogVersion` pin catalog generation，Furniture Instance只保存`id / definitionId / origin / optional name`；intrinsic name/icon/kind、local footprint/display offset、slot、under-clearance與activity suitability由Furniture Definition持有，再由shared resolver / initializer投影為world geometry與既有runtime compatibility shape。Editor新增Catalog → create flow；new / duplicate instance ID使用`<definitionId>-N`，duplicate只複製instance-owned facts與placement，不複製外部references。因canonical authoring package shape與玩家可見Editor surface都改變，因此overall current marker升patch；Physical 11.17、Passage 11.17、Route 11.18、Locomotion 11.19、Crowding 11.20、Spatial Identity 11.22.0等subsystem generation不假升。產品尚未正式公開，因此v2→v3不建立production migration machinery；current import對unsupported schema/catalog generation直接拒絕。

### Previous Editor-1 release

`11.22.1-editor-resident-capabilities` 完成第一個 Editor Usability / Authoring Model實作切片。新增pure `SimEmbodimentCapabilities` authoring-safe capability contract，讓Editor與runtime Physical / Locomotion共用Human / Cat default Physical template、locomotion mode ↔ posture vocabulary與姿勢查詢，不為Editor複製第二份物種規則，也不啟動simulation。Resident free placement收斂為單一capability-aware move flow：作者明確選擇合法free posture；bound Resident移到自由位置時明確解除furniture / slot reference；slot posture selector同樣只顯示resident kind + slot capability允許的選項。這是玩家可見Editor policy / interaction surface更新，因此依本文件規則升overall current patch marker；`world-authoring-v2` shape、Physical 11.17、Passage 11.17、Route 11.18、Locomotion 11.19、Crowding 11.20與Spatial Identity 11.22.0 generation均不假升。

### Previous Slice E release

`11.22.0-spatial-z-identity` 將 authoring中的Z-level正式接入 runtime identity。`map.tiles`使用單一flattened index，z=0維持`x,y` compatibility key、non-zero z使用`x,y,z`；base Spatial helper、Spatial Node / route state、Room / Surface Environment / Memory spatial ref、occupancy / contact / crowding與simulator layer presentation共用`z ?? 0` semantics。Initializer可編譯multi-layer `world-authoring-v2`，但本slice不加入任何vertical structure或跨Z traversal edge，所以無concrete structure時跨層route仍unreachable。這同時改變persistent runtime map shape、Spatial semantics與玩家可見layer presentation，因此使用新minor marker`11.22.0-spatial-z-identity`。Authoring仍是`world-authoring-v2`；Physical / Passage / Route / Locomotion / Crowding / Relationship / Memory generation不假升。

### Previous D.1C release

`11.21.4-editor-playtest-bridge` 新增玩家可見的Editor→Simulator playtest flow，但不改`world-authoring-v2` shape，也不改Physical / Passage / Route / Locomotion / Crowding / Relationship / Memory subsystem generation。Editor在launch前用current authoring validation + runtime compatibility preflight拒絕invalid schema、broken references、multi-layer / non-zero Z；成功handoff只存在同origin `sessionStorage`，並且只有explicit `?preview=editor` simulator load會消費。`SimWorld.createInitialStateFromAuthoring(...)`與default `createInitialState(...)`共用同一named initial-state pipeline，Preview Reset重建同一snapshot；normal simulator load不受先前preview影響。因此這是current product / presentation + bootstrap contract的patch-level更新，使用`11.21.4-editor-playtest-bridge`，authoring generation維持`world-authoring-v2`。
### World authoring contract version

World authoring另有獨立contract generation：current `SimWorldAuthoring.VERSION = "world-authoring-v11"`，canonical package保存`authoringSchema: "world-authoring-v11"`、`furnitureCatalogVersion: "furniture-definitions-v12"`、`map.cellSizeMeters = 1`、root `structures`、Furniture Instance required `orientation`、`usageAssignments[]`與`claimEligibility[]`。Furniture Catalog generation由`SimFurnitureDefinitions.VERSION`獨立持有；catalog-only expansion不改Furniture Instance schema。

只有authoring package shape / compatibility需要新generation時才升`world-authoring-vN`。目前 **current** 是 World Authoring v11、Furniture Catalog v12；current Spatial Traversal為`11.38.0-carried-handling-risk`、Contact為`11.32.0-contact-slot-corner`、Spatial Passage為`11.39.1-surface-boundary-transition`、Dynamic Congestion為`11.31.0-crowding-8-direction`、Physical為`11.45.0-agent-carry-relocate`、Route / Locomotion為`11.38.0-carried-handling-risk`，Spatial Identity維持`11.22.0-spatial-z-identity`。

## 何時必須升版

只要合併後的`main`出現下列任一類current contract變更，就必須在同一個PR內更新runtime marker：

- persistent simulation schema / state shape改變；
- canonical structured data contract改變，例如正式event metadata / lifecycle marker；
- simulation semantics或玩家可觀察到的policy改變；
- 新增、移除或實質改變玩家可見功能；
- 正式observability surface改變，例如Resident / Entity Readable View / Debug Inspector新增具有語義的資訊；
- 舊版本載入後會得到不同externally observable contract的其他變更。

## 何時可以不升版

若observable behavior、schema與current product surface都沒有改變，下列工作可維持原版本：

- 純refactor / ownership cleanup；
- regression / CI強化；
- documentation-only sync；
- internal load-order / registry cleanup，且正式語義不變；
- typo、註解或不影響行為的程式整理。

## 版本號使用方式

目前採`major.minor.patch-slug`：

- `major`：專案世代／大規模不相容重構；目前為11。
- `minor`：新的subsystem / 明確產品slice或較大的current contract階段；例如11.14建立Player Resident View / Debug Inspector split，11.15建立persistent Relationship Foundation，11.16建立Physical Profile Foundation，11.17建立Passage Profile + multi-mode traversal feasibility，11.18建立Route Semantics Split，11.19建立Locomotion Execution + Posture Transition，11.20建立Dynamic Congestion。
- `patch`：同一minor線內的可辨識feature / contract更新；例如11.14.1增加player-readable action explanations、11.14.2對齊Resident Action / Intent / Explanation的玩家語意、11.14.3將Explanation的玩家文案收斂為自然直接的原因描述、11.14.4將玩家可讀Inspector擴展到Container / Source / Furniture / Tile / Room / Event、11.15.1讓既有Relationship Foundation第一次以bounded target preference影響initiator-side social target selection、11.15.2再讓responder自己的directional Relationship以bounded modifier影響Human talk / animal pet response score。
- `slug`：描述current marker的主要辨識功能，不是完整changelog。

不是每個PR都需要版本號。PR編號、Git commit與runtime version是不同維度：一個版本可以包含多個refactor/docs PR；反之，一個真正改變current contract的PR必須同時處理版本更新。

### 檔名 / workflow family 不是 current release marker

Current UI source與current regression test / workflow已使用semantic filename；檔名本身不再承擔current release marker。Subsystem generation仍由正式schema/runtime marker表示，DOM data attribute或historical console/output label若保留舊generation字樣，也不得反推為整體current release。

判斷**整體current release**時，以`state.version`、`SimRelease.VERSION / SimWorld.VERSION`、`SimUI.PRESENTATION_VERSION`、玩家可見app version與Current文件為準；判斷**某subsystem generation**時，才看該subsystem自己的schema/runtime marker。不得因整體runtime推進到11.20.0就把沒有generation變更的Physical / Passage / Route / Locomotion / Relationship / Memory marker假升到11.20.0，也不得從舊family檔名反推整體current release。

若未來subsystem generation改變，舊family名稱造成實質誤導，再另行rename；單純current marker推進不要求rename。

## Version consistency checklist

需要升版的PR必須同步確認：

1. `src/release.js`的canonical current runtime marker；
2. 本次新增／改變contract的generation marker（目前包含`SimWorldAuthoring.VERSION / authoringSchema`與`SimFurnitureDefinitions.VERSION / furnitureCatalogVersion`；Physical / Passage / Route / Locomotion / Crowding / Relationship / Memory marker只有自身contract generation改變時才升），並確認未變更subsystem不被假升版；
3. `state.version` / `SimRelease.VERSION` / `SimWorld.VERSION` / `SimUI.PRESENTATION_VERSION`；
4. 由Presentation current marker持有的UI version（目前包含Resident View、Physical View、Locomotion View、Entity Readable View；其他subsystem UI依其owner contract判斷）沒有形成第二份release marker；
5. `index.html`的browser `<title>`維持穩定、不複製runtime版本；頁首current-version display則必須與current release同步。若頁面顯示subsystem generation（例如Editor的World Authoring badge），必須從該subsystem canonical owner（例如`SimWorldAuthoring.VERSION`）動態投影，不得在HTML複製`world-authoring-vN` literal；
6. `README.md` current runtime marker；
7. `docs/architecture.md` / `docs/tick-pipeline.md`若記載current runtime marker，必須同步；若文件刻意只記subsystem contract，則不得為了版本同步改寫無關語義；
8. presentation / browser regression的expected version；
9. Notion Architecture Current / relevant Current Design文件。

`tests/presentation-observability.mjs`與對應presentation regression負責鎖定repo內可自動驗證的version consistency。若feature已改但版本marker沒更新，PR review / Current documentation sync仍必須把它視為release-contract缺漏，而不是單純docs問題。

## Historical correction

PR #55 / #56屬ownership / compatibility lifecycle refactor，未改正式simulation policy，因此不補造中間release version；PR #58為docs-only，也不升版。PR #57改變canonical plan event的structured contract，但這次不回補虛構的歷史release；其contract hardening保留在Git history / Architecture Current。PR #59實際新增玩家可見的player-readable action explanation，因此current line從`11.14.0-player-resident-view-debug-inspector`校正為`11.14.1-player-readable-action-explanations`。其後Resident View的Action / Intent / Explanation presentation semantics以11.14.2獨立升版；11.14.3再把Explanation的玩家文案規則收斂成「同一evidence能用自然日常語言表達時，不暴露需求threshold / engine強度術語」，仍不改simulation policy。11.14.4再把readable Inspector從Agent擴展到非居民entity；這仍是presentation-only projection，不新增Container / Furniture等第二份玩家狀態。

11.15.0正式新增Agent-local persistent`relationships[counterpartId]` state、historical Appraisal → Relationship consolidation semantics，以及玩家可讀／Debug Relationship surface。這同時觸及persistent schema、simulation semantics與observability，因此使用新的minor marker`11.15.0-relationship-foundation`；該Foundation當時刻意保持decision-inert。

11.15.1在同一minor線內完成動物互動canonicalization（`interactWithAnimal / petAnimal`）並讓Relationship第一次進入initiator-side social target ranking。Relationship influence僅作bounded target preference：`relationshipTargetDelta = 8 × familiarity × affinity`，與Memory influence、distance penalty一起決定「找誰」，但不加入action-level social utility、不hard-ban負向target，也不修改responder policy、current-intent utility、soft-switch threshold或commitment。因此使用patch marker`11.15.1-relationship-target-preference`。

11.15.2再加入 **Relationship → Responder Bias**。Relationship runtime只提供directional unitless`relationshipSignal = familiarity × affinity`；Human talk與animal pet responder subsystem各自持有自己的bounded scaling，目前cap均為`±0.18`。Human responder-specific`talkResponseUtility`可因response score改變，但general`E.baseUtilityForAction(...,'talk')`、initiator social Action utility、target preference、current-intent utility、soft-switch threshold與commitment不變。World Event不保存response-score decomposition或Relationship internals，Debug只即時派生`base + Relationship delta → final`。因此這是simulation semantics + observability的patch-level current contract變更，使用`11.15.2-relationship-responder-bias`。

11.16.0正式建立 **Physical Profile Foundation**。每個Agent新增authoritative`physical` state，第一版包含`mass / volume / bodyGeometry / locomotionCapabilities / locomotionProfiles`；`SimPhysical.getMovementEnvelope(agent, mode)`從個體profile即時派生`clearanceHeight / clearanceWidth / clearanceLength / speedFactor`，不保存第二份envelope cache。既有Spatial家具下clearance改為消費canonical Physical`requiredClearance`，同時維持Human`1.65 m`、Cat`0.32 m`對餐桌下`0.72 m`的預設行為parity；單一個體geometry / locomotion profile override則可改變自己的feasibility，不再由`kind`硬鎖。Debug Inspector新增Physical Profile / standing MovementEnvelope observability。本slice刻意不加入crouch / kneelCrawl / proneCrawl、姿勢切換、traversal timing、crowding geometry或人格／Relationship對locomotion willingness的影響。由於這同時新增persistent physical schema、新subsystem interface、Spatial consumer semantics與正式Debug observability，因此使用新的minor marker`11.16.0-physical-profile-foundation`。

11.17.0正式加入 **Passage Profile + multi-mode traversal feasibility**。Physical locomotion baseline從舊`standing`正名為`walk`，與Agent`posture.kind='standing'`分離；Human第一批提供`walk / kneelCrawl / proneCrawl` MovementEnvelope，Cat本slice只保留`walk`。Spatial新增edge-derived`PassageProfile`，第一版比較height / width，未設定軸以`null`表示unconstrained；`traversalFeasibility(...)`只回各supported mode的`feasible / failedAxes`，不選mode、不讀心理狀態。v11.17當時的production A*仍是walk-only execution，但已對每條edge消費walk feasibility，因此passage width/height成為真正routing constraint，同時crawl-query可行仍不會自動改姿勢穿越。Deterministic single-passage + water fixture鎖住normal / low / lower / width-only四種情況。本slice刻意不加入PoseEnvelope/static fit、length/turn clearance、traversalCost/travelTime split、locomotion execution/posture transition或behavioral willingness。由於Physical contract、Spatial traversal semantics、Debug observability與測試契約都實質改變，因此使用新的minor marker`11.17.0-passage-profile-multimode`。

11.18.0正式完成 **Route Semantics Split**。原本`SP.pathDistance()`實際直接回傳weighted route cost；本slice新增canonical`SimSpatial.planRoute(...)`，把selected route的`pathDistance / traversalCost / travelTime`分開，並讓standalone`pathDistance`搜尋physical-feasible shortest topology route、`traversalCost`搜尋最低客觀route burden。既有A*與gameplay consumer全部繼續以traversal cost為預設objective，因此route preference / AI balance保持parity；Memory / Relationship target decomposition的`distancePenalty`正名為`accessPenalty`，source改讀traversal cost，但數值與target ordering維持。第一版`travelTime`只反映current executable walk edges（一edge一tick），不提前使用尚未進execution的`speedFactor`。Debug同步分開顯示distance / cost / time。由於canonical Spatial route API、decision decomposition、observable Debug surface與current semantics都改變，因此使用新的minor marker`11.18.0-route-semantics-split`。

11.19.0正式完成 **Locomotion Execution + Posture Transition**。Production route planner可用`mode:'auto'`在supported + passage-feasible locomotion modes中規劃，route state正式包含Spatial Node + locomotion mode；core`moveToward()`實際執行selected mode。posture與locomotion mode保持分離但明確mapping：`walk → standing`、`kneelCrawl → kneeling`、`proneCrawl → prone`，mode/posture切換固定先消耗1tick。MovementEnvelope的`speedFactor`首次進入真正execution timing，以`ceil(1 / speedFactor)`決定每edge movement ticks；route`travelTime`因此由transition + actual edge timing派生並由runtime兌現。新增`agent.locomotion { mode, phase }`、Locomotion validator與Debug projection；舊Physical / Passage / Route / Relationship / Memory subsystem marker均不假升。Behavioral willingness、crowding、PoseEnvelope與新的exertion model仍未納入。由於persistent Agent execution state、route search semantics、movement timing、posture lifecycle與正式observability都改變，因此使用新的minor marker`11.19.0-locomotion-execution-posture`。

11.20.0正式完成 **Dynamic Congestion**。新增derived / uncached`SimCrowding.getCrowdingProfile(...)`，把當下Agent occupancy、movement direction、MovementEnvelope width與已知PassageProfile width轉成soft`congestionCost`與movement delay。其他Agent不修改PassageProfile，也不產生hard block；狹窄處錯身的額外時間代表側身、錯步、短暫停頓與調整移動方式。route planning把crowding snapshot納入`traversalCost / travelTime`，core execution在每次重新規劃下一條edge時讀取當下congestion，因此actual travel time可和較早estimate不同。舊floor`occupiedCount × 5/2.5`與`bestInteractionPosition()`的raw occupancy優先排序在production Crowding runtime下停止重複計算。Debug新增next-edge congestion pressure / cost / delay / speed / occupants。第一版不做Agent overlap hard block、reservation、yielding、deadlock、collision或behavioral willingness。由於route objective burden、實際movement timing與正式observability都改變，因此使用新的minor marker`11.20.0-dynamic-congestion`；Physical / Passage維持v11.17、Route維持v11.18、Locomotion維持v11.19等各自generation。

11.21.0正式完成 **Geometry-derived Horizontal Topology**。`world-authoring-v2`把Furniture under-clearance等concrete geometry納入canonical authoring，並提供explicit`world-authoring-v1 → v2`migration；legacy default dining-table的`.72m` clearance只在migration邊界轉成正式資料，不再由runtime ID fallback補值。`SimWorldAuthoring.deriveHorizontalTopology(authoring,{z})`成為Editor preview、initializer diagnostics與runtime compatibility compilation共用的pure horizontal geometry interpretation：`floor / doorway`提供structural openness，solid Furniture / fixed entity可關閉connectivity，under-clearance則保留connectivity並交給PassageProfile判斷個體mode feasibility。`tile.walkable / tile.furnitureIds`保留為derived runtime compatibility fields，正常Editor不author traversal flags。此版刻意不把`z`納入Spatial Node / occupancy / route identity；Physical / Passage維持v11.17、Route維持v11.18、Locomotion維持v11.19、Crowding維持v11.20。

11.21.1新增 **Editor Scene Inspector**：Editor由canonical authoring即時投影Furniture / Objects / Residents scene list、typed map markers與共用ephemeral selection/focus，並在主模擬器toolbar提供Editor入口。這是玩家可見產品surface變更，因此依本文件規則使用11.21 patch marker；simulation semantics、persistent state shape、`world-authoring-v2` generation，以及Physical / Passage / Route / Locomotion / Crowding / Relationship subsystem markers均未改變。

11.21.2新增 **Editor Entity Lifecycle / Mutation Semantics**。Editor的Furniture / Container / Source / Resident entity mutation集中到pure`SimEditorAuthoringMutations` owner；正式操作以clone → apply → `SimWorldAuthoring.validateAuthoring` → commit保證atomicity。Furniture move會維持既有explicit Container`supportId` relation並同步follower interaction ports；Container移到support-capable footprint時要求作者明確選Floor或Furniture support；Source不新增`supportId`。同型Furniture duplicate使用deterministic instance / global-unique slot IDs且不複製外部references；referenced Furniture delete以structured blocker report拒絕cascade。Resident generic move只支援unbound exact placement，bound/anchor Resident必須explicit convert-to-exact-standing或furnitureSlot rebind。這是玩家可見Editor功能，因此升current patch；persistent authoring fields仍全屬既有`world-authoring-v2`，Physical / Passage / Route / Locomotion / Crowding / Relationship等subsystem generation不變。D.1B2 drag、D.1C playtest bridge與runtime Z identity仍未加入。

11.21.3新增 **Editor Furniture Drag UX**。Desktop Furniture marker使用Pointer Events與explicit movement threshold區分click selection / drag；pointer move只生成full-footprint ghost、explicit`supportId` follower preview與valid-invalid drop state，不改canonical document。preview與正式drop都委派既有`SimEditorAuthoringMutations.moveFurniture(...)`，browser regression要求同一source/target的click placement與drag drop產生相同canonical semantic fingerprint。Touch/mobile仍保留click/tap placement。這是玩家可見Editor interaction surface，因此升current patch；`world-authoring-v2`、runtime Spatial identity以及Physical / Passage / Route / Locomotion / Crowding / Relationship subsystem generation均不變。D.1C playtest bridge與runtime Z identity仍未加入。

`11.44.0-sleep-slot-conflict` 的 occupancy wait 使用獨立 `sleepSlotOccupancy` semantic source；其有限 patience 是獨立 runtime calibration，不由 assignment / claim / habit 強度推導。Human conflict response 另把 perceived / understood / accepted-or-refused / completed 分離；completed 只在 canonical Slot occupancy 實際清除後產生。
