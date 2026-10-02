# Versioning Contract

本文件定義 Emergent Causal Simulator 的 current runtime marker 何時必須更新，以及哪些變更可以留在同一版本內。

## Current version

目前 current runtime marker：

`11.44.0-sleep-slot-conflict`

玩家可見的 app 頁首 current-version display 使用短版 `v11.44.0`；`state.version`、`SimRelease.VERSION`、`SimWorld.VERSION` 與 `SimUI.PRESENTATION_VERSION` 使用完整 current marker。Current subsystem markers：Resources `11.39.0-carried-contents-loss`；Physical `11.37.0-carried-container-feasibility`；Spatial Traversal `11.38.0-carried-handling-risk`；Spatial Passage `11.39.1-surface-boundary-transition`；Route `11.38.0-carried-handling-risk`；Deliberation / Decision Evidence `11.44.0-sleep-slot-conflict`；Memory `11.42.0-usage-preference-sleep`；Usage Preference `11.42.0-usage-preference-sleep`；Affect `11.35.0-affect-responder-bias`；Horizontal Geometry `11.29.0-horizontal-geometry-foundation`；Spatial Identity `11.22.0-spatial-z-identity`；Contact `11.32.0-contact-slot-corner`；Locomotion `11.38.0-carried-handling-risk`；Dynamic Congestion `11.31.0-crowding-8-direction`。Embodiment Capabilities 為 `embodiment-capabilities-v4`；World Authoring = `world-authoring-v11`，Furniture Catalog = `furniture-definitions-v12`。未改 contract 的 Resources / Physical / Spatial Traversal / Spatial Passage / Route / Locomotion / Contact / Dynamic Congestion / Affect / Relationship / Surface Environment、Furniture Catalog 與 Embodiment Capabilities 不跟著 overall minor 假升。

### Version-marker synchronization rule

任何 current runtime marker、subsystem generation、schema version、catalog generation 或其他硬編碼 current marker 的變更，在執行完整 regression 前都必須先做 repo-wide stale-marker audit。檢查範圍至少包含 production source、fixtures、Node regressions、Browser regressions、Presentation projection 與 current docs；不得只更新 production marker 後等待 CI 逐一暴露 stale assertion。

測試或 fixture 中的硬編碼版本值必須先判斷其語意再更新：若它是在驗證「current contract / current release / current schema」，則應與本次換代同步；若它是在驗證未變更 subsystem 的 own generation，則必須保留原值，不得因 overall marker 改變而形式性假升版。換言之，stale-marker audit 是**語意核對**，不是 repo-wide blind replace。

完成 marker / generation 變更後，PR 驗證記錄應能明確區分：哪些 marker 本次有換代、哪些 subsystem 明確未換代，以及 Node / Browser regression 中對應 current expectation 是否已同步。

### Current Sleep preferred Slot conflict release

`11.44.0-sleep-slot-conflict` 實作 fixed-Slot sleep conflict 第一版。Spatial objective legality 不變：被 Agent 佔用的 preferred Slot 仍不會進入 `SP.sleepTargets()`。Usage Preference 仍只提供 assignment / Runtime Claim / Memory-owned Usage Habit 的 Association Reasons；Deliberation 另外把這些 bounded signals 與 shared `observeAgentContext(...)` decision-time snapshot 組合成 conflict resolution candidates，而不是把 occupancy 或 preference 複製成第二份 truth。

第一版 candidate family 包含合法替代睡眠位置、有限 occupancy wait、generic attention、Human 讓位要求、Human 非物理 drive-away 與暫時放棄。Animal occupant 不取得 Human-only request / drive-away shortcut。sleep conflict wait 是 `sleep` Intent 內的專用 phase，不冒充 Social Bid `awaitResponse`；只有這些 conflict wait phases 對既有 soft reconsideration / emergency preemption 開放，真正的 sleeping phase仍維持 protected。no-response 只記錄私人 `noResponse` outcome，不翻譯成拒絕或 intentional ignore。

Human request 使用可觀察 Social Bid event 作跨 Agent boundary；responder 只從自己的 observed bid 建立 responder-local Intent / Action。requester 不直接改 responder position / posture / Action / Intent。perceived、understood、accepted / refused / delayed 與 actual Slot release 分別由不同 structured event / state transition表達。generic attention 仍沿用 `performAttentionInteraction(...)`；wake consequence 不等於 understood / accepted / released。

Conflict Resolution Evidence 延伸既有 Decision Evidence owner：每次 decision 保存 `parentDecisionId`、preferred Slot、Association Reasons、conflict reason、frozen Agent-context Observation snapshot、evaluated candidates、selected resolution 與可選 `priorConflictDecisionId`。它是 Agent-private downstream evidence；不回填 occupant 未來狀態，也不取代 Target Selection Evidence。

Version impact：overall / Presentation、Deliberation / Decision Evidence → `11.44.0-sleep-slot-conflict`。Memory 與 Usage Preference 維持 `11.42.0-usage-preference-sleep`；Social Bid lifecycle 維持 `11.12.2-social-bid-lifecycle`；World Authoring 維持 `world-authoring-v11`；Furniture Catalog 維持 `furniture-definitions-v12`；Resources / Physical / Spatial Traversal / Spatial Passage / Route / Locomotion / Contact / Crowding / Affect / Relationship 等未改 generation 均不假升。runtime hook 新增 beforeTick 350 `sleepSlotConflict.promote-responses`，位於 Human Social prepare 300 與既有 Social Response prepare 400 之間。

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

`11.37.0-carried-container-feasibility` 建立 P1 Slice A carried physical feasibility：portable Container author `carryGeometry / handsRequired`；Resources 成為 canonical carried-load / handling-profile owner；Physical 保持 body-only MovementEnvelope 並派生 effective carried envelope；Passage / Route 使用相同 geometry 與總 hand-demand gate。basket 0.55m / 2 hands 作為 body-fits-carried-does-not reference fixture，cup / plate / bucket / bottle 保留一手攜帶的非 blanket-ban 行為。

這是 simulation semantic / authoring contract 變更，因此 overall、Resources、Physical、Spatial Traversal、Spatial Passage、Route 推進到 `11.37.0-carried-container-feasibility`；World Authoring → `world-authoring-v8`，Embodiment Capabilities → `embodiment-capabilities-v4`。Locomotion、Crowding、Deliberation、Affect、Contact 等未改語意，不假升。PR #157 的 Map posture / mobile selection Presentation 行為保留；Presentation projection 仍由 canonical release owner顯示 current overall marker。HandlingRisk、`tilt / impact / oscillation` calibration、spill/drop consequence 尚未實作。

### Previous Map posture / mobile selection release

`11.36.1-map-posture-selection` 修正 Simulator runtime map 的 posture / overlap Presentation。Spatial observability 直接讀 authoritative `agent.posture.kind` 投影 `kneeling → 跪`、`prone → 趴` compact marker，並以 `data-posture` 暴露同一 canonical posture 給 Browser QA；不從 Action text、locomotion wording、Furniture overlap 或 route 反推姿勢。

同一 patch 退休把 coarse `covered / overhead` 幾何視覺化成 `.spatial-under-cover` opacity 的作法。Current floor Spatial Node 沒有 tile 內 local offset / region identity，因此 same XY + overhead geometry 仍不足以宣稱角色確定位於家具下方；真正 under-furniture occlusion 必須等待 semantic owner 提供足夠 local-position / region truth。

Mobile 同格選取維持單一 `SimUI` selection truth：Agent 的 map entity layer 保持高於 `spatial-furniture-handle`，因此家具 secondary handle 不得遮住可見角色的直接 hit target；家具 handle 本身提高可見度並在 ≤720px viewport 擴為 18×18px，仍只屬 Presentation affordance，不成為 Furniture / Spatial truth。這是玩家可見 Presentation interaction / observability patch，因此只推進 overall runtime / `SimUI.PRESENTATION_VERSION` 到 `11.36.1-map-posture-selection`；Deliberation維持 `11.36.0-decision-evidence`，Physical / Spatial / Passage / Route / Locomotion、World Authoring、Furniture Catalog與其他未改 subsystem generation都不假升。

### Previous Decision Evidence release

`11.36.0-decision-evidence` 將 Resident Explanation 的可信來源從「Recent Decision 的 tick + Action kind 對齊」升格為 Deliberation-owned adopted final evidence。每個 Agent 新增單筆 private `decisionEvidence`；live Action 只保存 `decisionId` reference。Initial core decision 在 afterTick 800 Memory→Deliberation correction 完成後，由新增的 `deliberation.finalize-decision-evidence` order 850 finalize；soft reconsideration、emergency preemption與 hard replan則在 replacement Action 真正採納時建立新的 decision identity。Hard replan仍可保留同一 Intent ID，但 replacement Action不得沿用舊 Decision ID。

Core chooser / soft candidate現在攜帶 structured contributor metadata；Social target 的 Memory / Relationship / access decomposition只在 final selected target freeze。這些 capture不新增 RNG consumption，也不改既有 utility、target ranking、responder policy或 World Event truth。Resident View只從與 live Action精確對齊的 adopted evidence投影原因；Human wander在尚無 formal winner-relative selection evidence前不再輸出「沒有更急的事」；`respondSocialBid` 第一階段仍省略自主 Explanation。Debug Inspector可查看 frozen final contributor snapshot，current-derived diagnostics仍保持 derived。

這是新的 simulation semantic / state contract，因此 overall runtime / Presentation 與 Deliberation generation推進到 `11.36.0-decision-evidence`。Memory Deliberation公式與 generation維持 `11.13.4-memory-deliberation-influence`；Social Bid lifecycle、Affect、Relationship、Human / Animal responder policy、Action、Physical / Spatial / Route / Locomotion、World Authoring / Furniture Catalog均未改語意，不假升。

### Previous Presentation event truth release

`11.35.2-presentation-event-truth` 完成 Presentation Truth Boundary P2：timeline summary classification 不再解析 `event.text` 的自然語句或中文 regex，而改讀 structured event `type / data.action`；Human / animal social producer、core social fallback 與相關 action event wording 移除沒有 canonical evidence 的「走近／蹲下／跑到／蹭／伸手／側身／低頭／手一晃」等 transition / gesture 敘事，並將 initial provisional plan、wait、abort、sleep-start 等文字收斂成現有 structured source 可支持的保守描述。Requester-private no-response truth 仍由既有 private `awaitResponse / socialWaitEnded` ownership 持有，不混入 World disturbance wording。

本 patch 不新增 event schema、posture / movement state、semantic hook、Memory / Affect / Relationship input，也不改 Social Bid / wake / responder behavior。精確 abort cause 與其他若未來確實需要的事件級細節仍屬 semantic-owner design gap，不以 readable prose 取代 structured evidence。因此只推進 overall runtime / `SimUI.PRESENTATION_VERSION` 到 `11.35.2-presentation-event-truth`；Affect 維持 `11.35.0-affect-responder-bias`，Physical / Spatial Traversal / Spatial Passage / Route / Locomotion 維持 `11.34.0-surface-traversal-maneuvers`，Contact 維持 `11.32.0-contact-slot-corner`，Dynamic Congestion 維持 `11.31.0-crowding-8-direction`，World Authoring / Furniture Catalog / Embodiment Capabilities 亦不假升。

### Previous Presentation projection correctness release

`11.35.1-presentation-projection-correctness` 收斂 Presentation Truth Boundary 的第一階段 correctness：app 頁首 release label 改由 canonical `SimRelease.VERSION` 派生短版；Resident / Action / Debug 對 `standing / sitting / lying / kneeling / prone` 使用一致 projection，missing / unknown posture 不再假裝成 standing；Furniture / Room Debug 移除 retired `blocksMovement / value` 與 `room.value`；Tile Readable / Debug 明確標示 `SP.walkable() / SP.blockerAt()` 只是 base/static blocker，而不是完整 per-Agent traversal feasibility；Appraisal / Memory Retention hint 同步 current Appraisal → Affect 與 Memory → Deliberation ownership。這些變更只修正既有 canonical truth 的玩家／Debug 投影，不新增 simulation state、behavior input 或 semantic pipeline。

因此 overall runtime / `SimUI.PRESENTATION_VERSION` 推進到 `11.35.1-presentation-projection-correctness`。Affect generation 維持 `11.35.0-affect-responder-bias`；Physical / Spatial Traversal / Spatial Passage / Route / Locomotion 維持 `11.34.0-surface-traversal-maneuvers`，Contact 維持 `11.32.0-contact-slot-corner`，Dynamic Congestion 維持 `11.31.0-crowding-8-direction`，World Authoring / Furniture Catalog / Embodiment Capabilities 也不假升。本 release 不包含 event producer transition wording migration 或 timeline `event.text` reverse parsing removal；那些仍屬後續 Presentation work。

### Previous Affect responder bias release

`11.35.0-affect-responder-bias` 將 Current Affect 第一次接到正式 responder behavior，而不擴大到 general Deliberation。Affect runtime 提供 `affectResponseSignal = clamp(valence - frustration, -1, +1)`；Human talk 與 animal pet responder 各自以 `0.12` cap 形成短期 response delta，再與既有 Relationship `0.18` delta 並列後 clamp final score。只讀 responder 自己的 Current Affect；requester Affect 不滲入，`activation` 第一階段保持 decision-neutral。

為了讓同一 tick 的 Human responder candidate 與 final response 讀到同一個 current-Affect phase，`affect.decay` 從 beforeTick order 500 提前到 250，位於 Memory→Deliberation baseline capture 200 之後、Human Social prepare 300 / Animal Social prepare 400 之前。沒有新增 runtime hook。General `E.baseUtilityForAction(...,'talk')`、initiator target ranking、soft-switch / commitment、Physical / Passage / Route feasibility 都不變；World Event / Agent 不保存 Affect responder decomposition，Debug 只即時計算 `base + Affect + Relationship → final`。

這是新的 simulation semantic slice，因此 overall runtime 與 Affect subsystem generation 推進到 `11.35.0-affect-responder-bias`。Persistent `agent.affect` shape 不變；Relationship、Human Social Response、Animal Social Response、Physical、Spatial Traversal、Passage、Route、Locomotion、Dynamic Congestion、World Authoring / Furniture Catalog generation 都不假升。

### Previous Surface traversal maneuvers release

`11.34.0-surface-traversal-maneuvers` 將 Furniture top traversal 從 Definition 額外 author 一份可走 Surface policy，收斂為客觀幾何／支撐事實到執行 maneuver 的單一路徑。Furniture Catalog 升為 `furniture-definitions-v12`：Definition 只在 canonical solid top face author `faces.top.supportsBodyOccupancy:true` 與可選 `surfaceKey / surfaceLabel`；resolver 從同一 rotated solid bounds 派生 runtime `spatial.surfaces[]` 的 stable `id / sourceSolidKey / supportRegion / topElevation / cells`。legacy singular `spatial.surface` 現在直接拒絕，Surface 不再 author species `allowKinds`、`traversable`、`moveCost / transitionCost` 或 duplicate bounds。World Authoring Instance shape沒有改，仍為 `world-authoring-v7`，但 current document以 `furnitureCatalogVersion:"furniture-definitions-v12"` pin 新 Catalog。

Embodiment Capabilities 升為 `embodiment-capabilities-v3`，新增 posture-specific support footprint 與 Human / Cat Surface maneuver profile；Physical 以 support footprint + full body / pose clearance 判斷 Surface static fit。Passage 只擁有 floor ↔ Surface 的 objective elevation、gap、support-region edge geometry；Physical 依個體 geometry 產生 `step / climb / jump` 上／下候選，同一 geometry 可同時存在多個合法 candidate。

Locomotion 現正式擁有 Surface traversal / maneuver burden、timing、candidate selection 與 execution；本 release 只搬移既有 Human / Cat Surface burden calibration，沒有憑空新增 family-specific timing 差異。Route 將選中的 exact `surfaceManeuver` 保存到 route step；Engine pending movement 驗證並執行同一 maneuver identity。Contact 保持獨立 occlusion owner；Surface Environment、support-object resolver、Initializer、Validator、Editor / Debug 都消費同一 derived Surface enumeration。

因此 overall runtime、Physical、Spatial Traversal、Spatial Passage、Route 與 Locomotion generation一同推進到 `11.34.0-surface-traversal-maneuvers`。Contact仍為 `11.32.0-contact-slot-corner`、Dynamic Congestion仍為 `11.31.0-crowding-8-direction`、Surface Environment仍為 `11.11.4-surface-liquid-foundation`；沒有新增 continuous Surface local position、多角色／跨 Slot occupancy、turn clearance、sideways traversal或 persistent / cross-tick Route cache。性能量測確認 default graph 增加 8 個合法 derived Surface nodes後，single/batch feasibility 與 Passage query 增量來自 graph expansion；focused geometry-query regression仍要求單次 Route search `traversalFeasibility.repeatedCalls = 0`。

### Previous Human drink vessel feasibility release

`11.33.5-drink-vessel-feasibility` 修正 11.33.4 need-plan parity 中兩個 Human drink 邊界。第一，actor 自己已持有的 portable `canDrinkFrom` vessel 原本會被 `canDrinkResource()` 與 `chooseDrinkVessel()` 當成「已被持有」而整個排除，即使 execution 已具備直接飲用或帶去 refill 的條件；現在 self-held vessel 以 0 pickup burden 參與同一個 executable vessel plan。第二，內容低於直接飲用門檻的 vessel 原本可能在 feasibility 階段被同一 vessel 自己當成 refill source，導致 Action 建立後 execution 用 `excludeId` 排除它才 abort；現在 candidate plan 在成立前就用相同 exclusion 驗證真正可達的外部 source。

Human drink 的 Decision / Intent / `E.buildAction()` 與 `chooseDrinkVessel()` 共用同一套 vessel access / refill-source feasibility：availability 保留 existence-only short-circuit，不為每次 deliberation 重跑完整 vessel ranking；execution 再在同一 feasibility 上選出實際 winner。若 winner 已是 `a.held`，直接進入 idempotent take / drink-or-refill lifecycle，不再繞回 pickup 自己手上的容器。這是 observable behavior correctness patch，因此 overall runtime / Presentation marker 升為 `11.33.5-drink-vessel-feasibility`；Spatial Traversal仍為 `11.32.1-slot-aware-route-origin`、Route仍為 `11.30.1-slot-aware-origin`、Contact仍為 `11.32.0-contact-slot-corner`，World Authoring / Furniture Catalog維持 v7 / v11。

### Previous Slot-aware actor route-origin release

`11.33.4-slot-aware-route-origin` 修正 actor 本身位於 Furniture Slot 時的 Route origin correctness。先前 PR #147 已讓 slot-bound **target** 不再把 Slot anchor 當 interaction destination，但 actor-side `planRoute / pathDistances / bestInteractionPositionResult` 仍從 `agent.position` 起算；對 sitting / lying Slot occupant 而言，該位置是 Furniture Slot coarse anchor，通常被 solid 覆蓋，不是 ordinary locomotion node。因此角色實際可以 `standUp → slotEgressNodes → route`，target ranking 卻會先得到 Infinity。Seed 20260911 的橘子躺在小型寵物床時反覆「決定吃東西 → Action 消失」就是此漂移的玩家可見重現。

Spatial Traversal 現以 `routeOriginsForAgent(...)` 收斂 actor origin：ordinary actor 使用 current locomotion node；slot-bound actor 使用當下合法 `slotEgressNodes()` 作 multi-source route origins。Interaction winner、Slot target、ordinary target、Memory / Decision access queries 因此讀同一組 origin。Action execution 離座時以 `bestSlotEgressNode(..., goal)` 使用與 target ranking 相容的 egress；如果 current Slot posture 已直接滿足 Interaction Geometry，仍保留 0-cost current-contact，不強迫站起。multi-source origins 在同一次 route search 中求 winner，不為每個 egress 重跑完整搜尋。

同一 release 也收斂 Hunger / Drink feasibility parity。Core chooser、Intent utility 與 `E.buildAction()` 共用 executable-plan feasibility：Cat direct eating / drinking 必須有 reachable source；Human eating / drinking 必須有可執行的 dish / vessel / resource chain。世界上單純存在 food / water 不再足以建立 Action；直接進食在執行時失去所有 reachable source 會明確 abort / bounded replan，而不是 silent `finishAction()` 後下一 tick 無限重選。explicit Cat drink target 也必須由該 target 本身通過 availability + interaction reachability。

這個 patch 改變正式 actor-side Route semantics，因此 overall runtime 推進到 `11.33.4-slot-aware-route-origin`、Spatial Traversal 到 `11.32.1-slot-aware-route-origin`、Route Semantics 到 `11.30.1-slot-aware-origin`。Contact仍為 `11.32.0-contact-slot-corner`、Physical仍為 `11.33.0-pose-envelope-static-fit`、Locomotion仍為 `11.30.0-distance-timing`；World Authoring / Furniture Catalog維持 v7 / v11，沒有新增 persistent route cache、Slot schema、Furniture schema或 Surface feature semantics。

### Previous Place Description Projection release

`11.33.3-place-description-projection` 修正 11.33.2 後仍存在的 presentation drift。11.33.2 已讓 canonical `SimSpatial.describePlace()` 不再從 coarse floor + overhead Furniture 推論「餐桌下」，但 `src/ui/spatial/observability.js` 仍會直接讀 `agentObservation.covered / overhead`，在 Action Card / map title 再拼出「餐桌下／餐椅下」；同時 slot-bound Agent 雖然已有精確 `posture.slotId`，`describePlace()` 仍把其 coarse Slot anchor 當一般 floor node描述。

本 patch 將 place projection 收斂為單一 owner：slot-bound Agent 優先用 Furniture + Slot label（例如 `餐椅 B・座位`）；ordinary coarse floor 仍使用「餐桌所在格的地面」等保守 wording；explicit Furniture Surface 仍使用「餐桌桌面」等 Surface label。UI spatial observability 不再自行附加「家具下」文案，map title 直接消費 canonical `describePlace()`；Debug 的 overhead wording改成「同格上方幾何／最低淨空」，只描述可觀測 geometry，不假裝知道 tile 內 exact occupant offset。

這是 player-visible / observable wording correctness patch，因此 overall runtime / Presentation marker升為 11.33.3。Furniture solids、MovementEnvelope、partial-tile free-space、Surface traversability、Slot occupancy、Spatial Identity schema、Route / Passage / Locomotion、World Authoring與 Furniture Catalog均未改；Physical仍為 `11.33.0-pose-envelope-static-fit`、Spatial Traversal / Contact仍為 `11.32.0-contact-slot-corner`、World Authoring / Furniture Catalog仍為 v7 / v11。

### Previous Coarse Place Description release

`11.33.2-coarse-place-description` 修正 player-readable / observable place wording 的精度邊界，不改 Spatial traversal geometry。Current Furniture-local metric solids允許角色在同一 authored tile 內使用合法剩餘 floor free-space；但 floor Spatial Node仍只有 coarse `spaceId + surfaceId + x/y/z`，沒有 tile 內 local offset / region identity。因此 `describePlace()` 不再只因同一 coarse floor tile 存在 overhead Furniture就輸出「餐桌下」等精確局部關係，而改為「餐桌所在格的地面」。若 Agent 位於 explicit Furniture Surface，仍可依正式 Surface identity輸出「餐桌桌面」等精確 label。

這個 patch **保留** Human / Cat 依 MovementEnvelope 使用 partial-tile floor free-space的既有 physical semantics，也保留 `diningTable:surface` 的 traversable Surface policy；沒有修改 Furniture solids、Surface allowKinds、Passage、Route、Locomotion、Spatial Identity schema或 World Authoring。因玩家可見描述改變，overall runtime / Presentation current marker升為 11.33.2；Spatial Traversal / Contact仍為 `11.32.0-contact-slot-corner`、Physical仍為 `11.33.0-pose-envelope-static-fit`、World Authoring / Furniture Catalog仍為 v7 / v11。

### Previous Action spatial-target consumer correctness release

`11.33.1-action-spatial-target-consumers` 修正 Slot / Interaction Geometry contract 升級後仍殘留在部分 Action / Deliberation consumer 的舊 route-target 假設。Furniture Definition、Slot geometry、PoseEnvelope、Passage、Route 與 Contact owner 都沒有改；改的是 downstream consumer 必須真正使用既有 canonical spatial target。

Human 用餐選座現在先以 `bestSlotApproachNode(..., objective:'traversalCost')` 取得合法 approach，再 route 到 approach 並於 settle 前重新驗證 activity、PoseEnvelope fit、Slot availability / reservation 與 current `slotApproachNodes()`；不再以 Slot coarse anchor 作 ordinary floor route destination。因此有合法餐椅 approach 時會實際坐下，只有所有合格座位都沒有可達 approach 時才使用 `standForMeal` fallback。

Agent social target 的 core nearest fallback、Intent deliberation、hard replan 與 Memory target evaluation 現統一以 `Interaction Geometry` 的 `socialReach` 判定可達性與 access cost。slot-bound target Agent 由 `agentContactNodes() → slotApproachNodes()` 派生合法接觸點，不再對 `target.position`（Slot coarse anchor）直接查 Route。Object / Source 類 target 的既有 Interaction Geometry execution contract不變；Cat drink 的 Intent / replan helper則同步把 resolved interaction position 的 ranking objective從 `pathDistance` 收斂為 canonical `traversalCost`，避免 Decision consumer 使用第二套客觀 access 尺度。

這個 patch 改變玩家可觀察到的用餐與自主社交 target selection semantics，因此 overall runtime / Presentation current marker升為 11.33.1；但沒有新增 persistent schema、Spatial public API 或 Furniture / World Authoring generation，所以 Physical仍為 `11.33.0-pose-envelope-static-fit`、Spatial Traversal / Contact仍為 `11.32.0-contact-slot-corner`、Route / Locomotion仍為 11.30.0 line，World Authoring / Furniture Catalog仍為 v7 / v11。

### Previous PoseEnvelope static-fit release

`11.33.0-pose-envelope-static-fit` 正式建立第一階段 **PoseEnvelope（靜態姿勢包絡）**：Physical 依每個 Agent 的 current `bodyGeometry` + authoring-safe embodiment posture profile，即時計算 sitting / lying 的 `height / width / length`，不保存 `physical.poseEnvelope` mirror。這個 contract 與 MovementEnvelope（移動包絡）分離；standing / kneeling / prone 的 static profile 未在本 slice 提前補齊。

Furniture Catalog 在 PoseEnvelope release 當時換代為 `furniture-definitions-v8`。rest / sleep Slot 必須提供 `usableSpace.width / length`，`height` 可省略表示該軸不限制；第一版不自動旋轉 PoseEnvelope 90°。餐椅 seat 為 `0.50 × 0.65m`、沙發每 Slot 為 `0.90 × 0.70m`、雙人床每 Slot 為 `0.70 × 2.00m`。雙人床移除舊 `allowKinds:['human']` 尺寸代理；餐椅的 human-only `allowKinds` 仍保留，明確證明種類門檻與物理尺寸門檻互相獨立。

同一 static-fit contract 由 rest / sleep target selection、meal seat selection、真正 settle 前 recheck、sleeping state validity、`SimWorldInitializer` initial furnitureSlot placement 與 Validator 共用。Slot occupancy 仍由 `agent.posture.slotId` 持有，slot-bound Agent 仍不算 ordinary floor occupant。World Authoring Instance schema 沒改，因此維持 `world-authoring-v7`；Spatial Traversal / Contact、Passage、Route、Locomotion、Dynamic Congestion 也不因整體 release 更新而假升。本 slice 不加入 multi-slot occupancy、usable-surface packing、dynamic seated obstruction、turn clearance、sideways movement或 8-direction Slice 6。

### Current Furniture Catalog generation

Furniture Catalog 現為 `furniture-definitions-v12`。v9 加入 `cabinet-tall`、v10 加入 `stool-basic`、v11 加入 `pet-bed-small`；v12 把 top body-support eligibility 收斂到各 solid 的 `faces.top.supportsBodyOccupancy` metadata。current resolver 會為 dining-table tabletop、chair seat、stool seat、double-bed body top 與 cabinet body top 派生 Surface；未 author eligibility 的 top face 不會自動成為平台。

v12 的 `supportRegion / topElevation / cells` 必須由 canonical metric solid bounds派生；Definition-level legacy `spatial.surface` 被拒絕。若 Furniture `supportsObjects:true`，Catalog validator要求恰好一個 derived body-support Surface，讓 `supportId` object resolution沒有歧義。

Furniture Instance canonical shape與 World Authoring schema沒有改，因此 World Authoring維持 `world-authoring-v7`；current authoring document只把 `furnitureCatalogVersion` pin到 v12。產品仍未正式公開，所以舊 Catalog generation不建立 production migration machinery；unsupported catalog version直接拒絕。

### Current Contact + Slot Corner release

`11.32.0-contact-slot-corner` 完成 8-direction implementation 的 **Slice 5｜Contact + Slot Corner Semantics**。原本允許 local-neighbor 的 `reach / socialReach` 與相應 support / cross-surface local Contact 現可產生 diagonal candidate，但 Contact 保持自己的 shared-corner occlusion owner：diagonal endpoints 之間的兩條 L 型接觸路徑任一條仍保有可確認 corner opening即可成立，因此單側 wall / closed Door 可以阻止身體 Traversal，卻不必阻止 Contact；只有兩條路徑都被 Boundary / Door / Furniture 聯合封死才 blocked，無法安全確認 opening 的局部幾何第一版保守拒絕。這個判定不呼叫 diagonal Traversal legality 作 Contact truth。

Furniture Slot authored contract 維持 cardinal `approachEdges`，沒有新增 `approachCorners` 或 World Authoring / Furniture Catalog schema。Runtime 只在兩個 incident approach sides 都 authored/legal，且 outside corner 對兩個 side approach floor nodes 的 Passage × current MovementEnvelope 都可行時，派生 direct diagonal settle / egress candidate；approach 與 egress 共用同一 candidate owner。Slot occupancy 仍由 `posture.slotId` 持有，slot-bound Agent 仍不算 ordinary floor occupant。

本 release 沒有改 HorizontalConnection / PassageProfile、Route objective / metrics、Locomotion timing、Crowding、Physical MovementEnvelope public contract、Spatial Identity、World Authoring 或 Furniture Catalog，也沒有加入 PoseEnvelope、turn clearance、sideways / step-over、Initializer / Editor / Preview diagonal parity或 persistent / cross-tick geometry cache。因此 overall runtime、Spatial Traversal與 Contact generation推進到 `11.32.0-contact-slot-corner`；Spatial Passage維持 `11.29.0-horizontal-connection-passage`，Route / Locomotion維持 11.30.0 line，Dynamic Congestion維持 `11.31.0-crowding-8-direction`，Physical維持 `11.17.0-passage-profile-multimode`，World Authoring / Furniture Catalog維持 v7。Presentation marker 只因 canonical overall release 跟隨更新，不代表新增 Presentation-owned simulation truth。

### Previous Completion-Aware Autoplay release

`11.31.1-autoplay-completion-aware` 將 simulator autoplay 的 tick-source scheduling 從固定 `setInterval(stepOne,700)` 改為 Presentation-owned completion-aware controller。名目 start-to-start cadence仍為約 700ms：若完整同步 `E.tick() → render()` 在週期內完成，下一 callback只等待剩餘時間；若工作本身已超過700ms，不補跑或追趕 overdue callback，而是在完整 callback 結束後先跨過兩個 browser `requestAnimationFrame` opportunities，再以零額外 cadence delay安排下一 tick。

Pause / Reset共用單一 cancellation owner，會取消 pending timeout / animation-frame並使 generation token失效；manual `step` / `step10` 與 autoplay仍互斥，完整 simulation tick不被切開或 await。這只改玩家可觀察的 Presentation scheduling / responsiveness policy，不改 simulation state/schema、Route score、hook ordering、Crowding / Spatial / Locomotion semantics或 RNG。

因此 overall runtime與 Presentation marker推進到 `11.31.1-autoplay-completion-aware`。Dynamic Congestion generation仍為 `11.31.0-crowding-8-direction`；Spatial Traversal / Route / Locomotion / Passage / Physical、World Authoring與Furniture Catalog均維持既有 generation。

### Previous Crowding 8-direction release

`11.31.0-crowding-8-direction` 完成 8-direction implementation 的 **Slice 4｜Crowding 8-direction**。Crowding 不新增第二套 diagonal geometry truth，而是直接消費 Slice 2 已提供的 `TraversalManeuver.primaryResource / influenceNodes`：cardinal horizontal 與 Structure 使用兩個 endpoint，diagonal horizontal 使用共享 grid corner 周圍四個 floor nodes作 conservative broad phase；candidate 依 Agent ID 去重，不建立 persistent `resource -> agents` index或 cross-tick cache。

標準水平 moving-vs-moving direction relation 正式擴充為 0° / 45° / 90° / 135° / 180°。既有 `same=.65` 與 `opposite=1.7` 保留為兩端，45° / 90° / 135° 以線性插值取得 `.9125 / 1.175 / 1.4375`；`stationary=1` 與 `unknown=1` 維持獨立語意。Structure / Z-aware movement保留原本 exact same / opposite / unknown 判定，不把垂直流量硬套水平角度分類。

Passage × MovementEnvelope 仍是 physical feasibility與 mode-effective `effectiveClearanceWidth` 的唯一 truth；Crowding 沿用既有 width pressure、`congestionCost` 與 `delayTicks`。diagonal Crowding視為一次局部共享資源事件，不因 maneuver 全長是 `sqrt(2)` 就再乘距離倍率；Crowding `edgeMoveTicks` helper則改用 maneuver `distanceMeters` 取得 Locomotion metric base timing，再加 congestion delay，與 Slice 3 Route / execution timing保持一致。

本 release仍是 **soft-only**：不 hard-block、不禁止 overlap、不加入 reservation / yielding / priority / deadlock / collision，也不加入 behavioral willingness。Slice 5 Contact / Slot corner、Slice 6 Initializer / Editor / Preview diagonal parity、Static Posture Fit / PoseEnvelope、persistent heading / turn clearance、45° Furniture orientation與 PR #116 類 query-scope optimization均不包含在本 release。

因此 overall runtime 與 Dynamic Congestion generation推進到 `11.31.0-crowding-8-direction`；Spatial Traversal維持 `11.30.0-metric-route-locomotion`，Spatial Passage維持 `11.29.0-horizontal-connection-passage`，Route維持 `11.30.0-metric-route`，Locomotion維持 `11.30.0-distance-timing`，Physical維持 `11.17.0-passage-profile-multimode`，World Authoring / Furniture Catalog維持 v7。

### Previous Metric Route + Locomotion release

`11.30.0-metric-route-locomotion` 完成 8-direction implementation 的 **Slice 3｜Metric Route + Locomotion Execution**。Production floor Route 現正式枚舉 Slice 2 已建立、且 Passage status 為 `candidate` 的 cardinal / diagonal `TraversalManeuver`；blocked / unsupported diagonal仍保守拒絕。Surface traversal、Structure connection與 authored topology各自維持既有 ownership，不因 floor diagonal route偷改 schema。

Route metric正式改為公尺制：`pathDistance` 累積每個 maneuver 的 `distanceMeters`，cardinal floor step為 `1m`、diagonal為 `sqrt(2)m`；`stepCount` 另保存 graph edge count。環境 movement burden與 Locomotion mode burden按公尺累積，mode transition burden仍按 transition計算；Dynamic Congestion的既有 `congestionCost` 本 slice保持獨立，不因 diagonal整段距離自動乘 `sqrt(2)`。

Locomotion timing改由 `SimLocomotion.movementTiming(agent, mode, distanceMeters, movementCredit)` 提供共同 truth。Route planning與 Engine execution都依實際距離／`speedFactor` 計算 movement requirement；同一 locomotion mode 的連續 edge可以用 current Action內的 fractional movement credit承接前一 edge 的離散 tick餘量，mode/posture transition則清除 credit。因此兩段 walk diagonal總長 `2 × sqrt(2)m` 可在 3 movement ticks完成，而不是逐 edge各自 ceil成4 ticks。這個 credit只存在 current Action，不是 route cache，也不跨 action／tick snapshot保存 derived route result。

本 release **不包含** Slice 4 的 8-direction Crowding resource / angle semantics、Slice 5 的 Contact / Slot corner semantics、Slice 6 的 Initializer / Editor / Preview diagonal reachability、persistent heading / turn clearance、45° Furniture orientation、World Authoring / Furniture Catalog schema change、Physical MovementEnvelope public contract change，亦沒有加入 persistent / cross-tick traversal cache或 action-execution route-result reuse。

因此 overall runtime、Spatial Traversal、Route Semantics與 Locomotion generation正式推進到 11.30.0 line；Spatial Passage維持 `11.29.0-horizontal-connection-passage`，Physical維持 `11.17.0-passage-profile-multimode`，Dynamic Congestion維持 `11.28.0-effective-passage-width`，World Authoring / Furniture Catalog維持 v7。Presentation marker只因 canonical `SimRelease.VERSION` 跟隨 overall release，不代表本 slice新增 Presentation-owned simulation truth。

### Previous Interaction Winner Result Reuse release

`11.29.3-interaction-winner-result-reuse` 將 interaction-position winner scoring 已經算出的 canonical `traversalCost` 正式暴露為 additive Spatial result contract：新增 `bestInteractionPositionResult(...)`，回傳 `{ position, traversalCost }` 或 `null`；既有 `bestInteractionPosition(...)` 保持 position-only compatibility contract，winner identity、candidate order、same-XY cross-surface filtering、Crowding-aware 排序與 tie-break 全部不變。

Engine 的 target-selection `targetTraversalCost()` 在 richer API 可用時直接消費 winner result 的 `traversalCost`，不再對同一 winner 緊接著重跑一次 `SP.traversalCost(...)`。這只重用同一次同步 winner calculation 的 derived result；不建立 persistent / cross-tick cache，也不把 action-execution `moveToInteraction() → planRoute` 納入 reuse。Browser performance regression 鎖定 single tick inside-tick `traversalFeasibility = 5,385`、`step(10)` inside `16,345` / outside `2,682`，並保留 exact canonical state parity、page error = 0、console error = 0。

因新增正式 public Spatial result API，本 release 推進 overall current marker，Spatial Traversal contract marker同步升為 `11.29.3-interaction-winner-result`。World Authoring `world-authoring-v7`、Furniture Catalog `furniture-definitions-v7`、Horizontal Geometry、Spatial Identity、Physical、Spatial Passage、Route、Locomotion、Dynamic Congestion與其他未改 subsystem generation均不假升。

### Previous Batch Step Yielding release

`11.29.2-batch-step-yielding` 把「10 步」的排程責任正式收斂到 Presentation / UI layer。單步 `step(1)` 仍同步執行一個完整 `E.tick()` 後 render；manual `step(10)` 先建立 UI-only batch context與 busy state，在第一個 tick 前先讓出一次 browser event loop，之後每個**完整** tick 之間再讓出一次。單一 `E.tick()` 內沒有 `await`、partial render或 cancellation checkpoint，因此 runtime hook ordering、same-tick visibility、RNG與 canonical simulation semantics不變。

Intermediate manual-batch tick 仍照既有 registry 順序呼叫 Presentation afterTick observers，但 `uiObservability.render-mobile-summary`、`residentView.schedule`、`relationshipView.schedule` 會 coalesce / defer真正 refresh；最後一個 tick才恢復正式 refresh，接著 `src/ui/core.js` 做一次 core full render。Manual batch期間 `step / step10 / play`、runtime layer、決策原因、scenario load與 simulation-dependent workspace互動會被 UI-only busy / inert policy阻擋；Reset保留可用，先 invalidates batch generation，再 reset回 canonical state，舊 continuation不得再執行 tick或 stale final render。Autoplay期間則停用 manual step controls，仍保留 play作pause與Reset。

這是玩家可觀察的 Presentation / scheduling contract變更，因此 overall current marker與 `SimUI.PRESENTATION_VERSION` 跟隨 patch升版；World Authoring `world-authoring-v7`、Furniture Catalog `furniture-definitions-v7`、Horizontal Geometry、Spatial、Route、Locomotion、Dynamic Congestion、Physical與其他未改 subsystem generation均不假升。Interaction winner-result reuse仍是獨立延後候選，不屬本 release。

### Previous Slot Interaction Egress Fix release

`11.29.1-slot-interaction-egress` 修正家具 Slot 姿勢離開後再前往一般互動目標時的 action lifecycle 次序。若 Agent 已在目標的有效 interaction position，仍可直接維持坐姿／躺姿互動；只有在目前不能直接互動且仍綁定 Slot 時，`moveToInteraction()` 才先透過既有 `standUp() → slotEgressNodes()` 離開 Slot，下一 tick 再以合法 floor node 執行 `bestInteractionPosition()` 與 production Route 查詢。這避免把家具 Slot 的 coarse anchor 當成 Human 可站立 floor route 起點，進而把其實可達的 portable object 誤判成「找不到能接近的位置」。

Focused regression 使用 default world seed `20260912`，重現 Human 從餐椅 Slot 嘗試拿取落在 `(4,5,0)` 的 `cupB`：修正前 route scoring 全部為不可達、Agent 留在 sitting；修正後先合法 egress，重新取得 pickup goal，並可繼續拿起杯子。問題在 PR #119 前的 baseline 已存在，因此不是 8-direction Slice 2 regression。

本 patch 改變玩家可觀察到的 simulation semantics，因此依版本規範升 overall current marker；但 World Authoring、Furniture Catalog、Horizontal Geometry、Spatial Traversal、Spatial Passage、Route、Locomotion、Dynamic Congestion、Physical 與 Spatial Identity contract 均未改，各 subsystem generation 維持原值。

### Previous Shared Horizontal Geometry Foundation release

`11.29.0-horizontal-geometry-foundation` 建立 8-direction implementation 的第一個可執行基礎，但**尚未啟用 production diagonal routing**。新增 `src/horizontal-geometry.js` 作為 Authoring／Runtime 未來共用的 pure geometry owner：它不讀 Agent、Crowding、Route cost 或 runtime global state，從 adapter snapshot 派生無向、Agent-independent `HorizontalConnection`。cardinal `distanceMeters = 1`；diagonal `distanceMeters = sqrt(2)`。斜向第一版採 B+ conservative local geometry，同時考慮相關 cardinal Boundary／Door、Furniture metric solids、fixed blocker、explicit Passage constraint 與 shared-corner free-space，並以 `candidate / blocked / unsupported` 區分可證明 passage、可證明阻斷與第一版無法安全證明的情況。

`SimWorldAuthoring.deriveHorizontalTopology(...)` 現額外回傳 ephemeral `horizontalConnections`，但 serialized World Authoring shape 完全不變；`world-authoring-v7` 與 `furniture-definitions-v7` 因此維持原 generation。legacy `cells[].adjacent / componentId / components` 仍只表示 cardinal compatibility coarse topology，Initializer／Editor 舊 consumer 不會因 diagonal candidate 被污染。Agent-specific MovementEnvelope feasibility 不回寫 connection；focused regression 同時鎖住 open corner、wall／Door、單／雙 Furniture narrowing、complete cut、ambiguous `unsupported`、multi-region `unsupported`、canonical endpoint/resource 與 legacy cardinal parity。

本 release 只落地 shared horizontal geometry foundation 與 Authoring projection；`SimSpatial.getPassageProfile`、Spatial Traversal neighbor generation、Route distance／step semantics、Locomotion execution timing、Dynamic Congestion、Contact 與 Slot corner semantics都尚未接 diagonal。因此 Spatial Traversal `11.28.0-furniture-local-geometry`、Spatial Passage `11.28.0-positioned-passage-options`、Route `11.24.0-route-locomotion-cost`、Locomotion `11.24.0-locomotion-objective-burden`、Dynamic Congestion `11.28.0-effective-passage-width`、Physical `11.17.0-passage-profile-multimode` 與 Spatial Identity `11.22.0-spatial-z-identity` 均不假升。

### Previous Preview Boundary Presentation release

`11.28.2-preview-boundary-presentation` 修正 Simulator / Editor Preview 對 World Boundary / Door canonical truth 的呈現落差。Runtime map 現直接從 `state.map.boundaries` 投影格線牆：`kind:"wall"` 顯示為 cell edge line，普通 `kind:"opening"` 不顯示實牆線；若 opening boundary 被 root `state.doors` 引用，則依 Door `open / closed` state 顯示不同的 Door edge 樣式。投影依目前 runtime Z layer 篩選，切換到沒有 boundaries 的 layer 不殘留其他層邊線。

這是 Presentation-only contract 更新：不改 World Authoring `world-authoring-v7`、Furniture Catalog `furniture-definitions-v7`、runtime map / Door schema、Spatial topology / Passage / Route / Locomotion / Crowding semantics，也不新增第二份 wall truth。舊 `.sim-tile.terrain-wall / terrain-doorway` 樣式暫保留給低階 compatibility fixture，但 canonical Simulator wall presentation只讀 `state.map.boundaries / state.doors`。因正式玩家可見 Simulator surface 改變，overall current marker 升 patch；`SimUI.PRESENTATION_VERSION` 與 current-marker-owned UI version 依既有規則跟隨 release marker。

### Previous Furniture Facing Semantics release

`11.28.1-furniture-facing-semantics` 修正 Furniture orientation contract 的語意不一致。Furniture Catalog 升為 `furniture-definitions-v7`：Definition canonical orientation 改為 `south`；directional Furniture 以 `orientationSemantics:"facing"` 表示 Instance `orientation` 是正面／主要 facing，床的 facing 定義為 head → foot；沒有自然正面的 Furniture 以 `orientationSemantics:"frame"` 保留 quarter-turn local-frame transform，但 Editor 不顯示 facing arrow。

World Authoring 升為 `world-authoring-v7`。Furniture Instance shape 仍是 `id / definitionId / origin / orientation / optional name`，但同一個 orientation value 的 compatibility semantics 已改變，因此不能沿用 v6 generation。Default world 為保留既有實際擺法，dining table / sofa 改為 `south`、bed 改為 `north`，四張餐椅維持既有 east / west facing。New Furniture Instance 預設 explicit `south`。

Editor 的 `↑ → ↓ ←` 只代表 directional Furniture 的 facing；frame-only Furniture 顯示 0° / 90° / 180° / 270° local-frame rotation。這次不新增 45° Furniture orientation，也不改 Spatial Traversal / Passage、Route、Locomotion、Physical、Spatial Identity 或 Dynamic Congestion generation。產品尚未正式公開，因此不建立 v6 → v7 migration；unsupported generation 仍由 current import boundary 拒絕。

### Previous Furniture Local Geometry release

`11.28.0-furniture-local-geometry` 將 Furniture physical obstruction 從 whole-tile `spatial.floor.mode / spatial.under` 收斂為 Furniture-local 公尺制 3D AABB `spatial.solids`。Furniture Catalog 升為 `furniture-definitions-v6`；Surface 以 `onSolid:{key,face:'top'}` 派生 coarse cells，Slot 保留 stable `<instanceId>:<slotKey>` 並新增 rotated `approachEdges`。World Authoring Instance shape 未改，因此維持 `world-authoring-v6`。

Spatial Traversal 升為 `11.28.0-furniture-local-geometry`，由 floor-start solids、單一格內 free region與 directional edge intervals 派生 partial-tile traversal；同 tile 多個 disconnected floor regions仍拒絕。Spatial Passage 升為 `11.28.0-positioned-passage-options`，同一 edge 可有多個位置化 `options`，避免把不同位置的最大寬度與高度拼成虛構 passage。Dynamic Congestion 升為 `11.28.0-effective-passage-width`，讀目前 locomotion mode 真正選中的 `effectiveClearanceWidth`。

Slot occupancy 同步改成 `route to approach → settle → occupy slot`；slot-bound Agent 的 coarse anchor 不算 ordinary floor occupancy，離開必須先選合法且未被其他 ordinary Agent 佔用的 egress，無可用 egress時不得 teleport 或清掉 slot posture。Default bed 改為 2×2、`origin:{x:8,y:5,z:0}, orientation:'south'`；四張餐椅朝向餐桌；老周 opening placement由 `(7,3)` 改為 `(7,4)`。

本 release 不加入 8-direction、sideways / step-over / jump / climb、movable-furniture metric translation、PoseEnvelope / static fit、45° Furniture orientation、Nav Cell / micro-grid或 continuous Agent local position。Physical、Route、Locomotion、Spatial Identity 等未改 contract 的 generation維持原值。

### Previous Room Value Legacy Removal release

`11.27.2-room-value-legacy-removal` 移除沒有 gameplay consumer 的 legacy Room value aggregate。Spatial `recomputeRooms()` 仍負責 Room topology、identity、membership、boundary / Furniture集合與 area，但不再把 floor material、boundary material、Furniture legacy `value` 與 Door parity constant 混成 `room.value`。Furniture Catalog 同步換代為 `furniture-definitions-v5`：Definition 移除 `compatibility.roomValueContribution`，shared resolver 不再投影 runtime Furniture `value`。Default Door 也移除只為歷史 parity 存在的 `compatibility.roomValueContribution: 18`，`313.6` regression 改為明確鎖定 Room / Furniture 不再帶 legacy `value`。

這次不建立新的經濟／資產、品質、prestige、美學或舒適度模型；既有 `comfortAt()` 與 Room topology / memory / social room-membership consumer 都保持原 ownership。World Authoring 的 canonical Instance shape 沒有改，因此維持 `world-authoring-v6`；Furniture Definition / resolver contract 有實質改變，所以 Catalog 換代為 `furniture-definitions-v5`。Spatial Traversal / Passage、Route、Locomotion、Physical、Spatial Identity、Dynamic Congestion、Relationship 與 Memory subsystem generation 均不跟著假升。由於 runtime derived state shape 與 Catalog contract 改變，overall current marker 推進一個 patch。

### Previous Resident Private Badge release

`11.27.1-resident-private-badge` 將 Resident View「最近發生的事」中的 owner-private event 從正文前綴「自己的經驗・」改為獨立「私人」badge。事件正文仍直接使用 canonical event text；公開事件不顯示 badge，private event 仍只有 owner 本人可在自己的 Resident View 看見。

這是純 Presentation / observability contract 更新：不改 World Event 的 `visibility / owner` truth、不改 requester-private `privateSocialOutcome`、Memory / Appraisal / Relationship / Affect，也不改 simulation hook 或 observer ordering。World Authoring 維持 `world-authoring-v6`，Furniture Catalog 維持 `furniture-definitions-v4`；Spatial Traversal / Passage、Route、Locomotion、Physical、Spatial Identity、Dynamic Congestion、Relationship 與 Memory subsystem generation 全部維持既有 marker。由於正式玩家可見 Resident View surface 改變，依本文件規則升 overall patch marker，`SimUI.PRESENTATION_VERSION` 與其他 current-marker-owned UI version一併跟隨。

### Previous Furniture Orientation release
`11.27.0-furniture-orientation` 將 Furniture 朝向正式納入 canonical authoring。World Authoring 升為 `world-authoring-v6`：Furniture Instance 新增 required `orientation: north | east | south | west`，`origin` 維持目前 resolved footprint 的 NW／左上 placement anchor，不因旋轉自行平移。Furniture Catalog 同步升為 `furniture-definitions-v4`，Definition 以 north 為 canonical local frame，shared resolver 統一把 footprint、display offset、slot 與 surface coverage 轉成 oriented local geometry後再套用 Instance origin；rotated geometry 不 persistent 成第二份 truth。

Editor 的 `rotateFurniture(...)` 沿用 atomic clone → apply → validate → canonicalize → commit contract。明確 `supportId === furnitureId` 的 Container position / interaction port 會使用同一 local↔world transform 跟隨旋轉；slot-bound Resident 保留 stable `<instanceId>:<slotKey>` reference。方向 marker 只在 Furniture 被選取或新增／放置／拖曳預覽時顯示，平常不常駐。Source interaction ports 不因本 release 改 ownership。

本 release 沒有改 Spatial Traversal、Spatial Passage、Route Semantics、Locomotion、Physical、Spatial Identity 或 Dynamic Congestion contract，因此它們維持既有 generation：Spatial Traversal `11.26.0-vertical-structure-traversal`、Spatial Passage `11.26.0-vertical-structure-passage`、Route `11.24.0-route-locomotion-cost`、Locomotion `11.24.0-locomotion-objective-burden`、Dynamic Congestion `11.26.0-vertical-flow-congestion`。產品尚未正式公開，因此 v5→v6 / Catalog v3→v4 不建立 production migration machinery；unsupported generation 仍由 current import boundary 拒絕。

### Current Vertical Structure Traversal release

`11.26.0-vertical-structure-traversal` 建立第一個 concrete cross-Z traversal contract。Canonical World Authoring 升為 `world-authoring-v5`，新增獨立 root `structures`；第一版正式 Structure kind 為抽象 `stair`，persistent facts 只保存 `id / kind / lower / upper` 與可選 `clearanceWidth / clearanceHeight`。Authoring 不保存 `upCost / downCost`、adjacency、PassageProfile 或 Route score；`SimWorldAuthoring.deriveStructureConnections(...)` 與 runtime Spatial 從相同 world facts 派生真正的 cross-Z edge。沒有明確 Structure 時，同 XY different Z 仍不可達，`deriveHorizontalTopology(...)` 仍保持同層 horizontal owner。

Spatial Passage 正式接受 Structure edge，PassageProfile 會回報 `edgeKind: "structure"` / `structureId` 並把 Structure clearance 與既有 under / edge constraint 組合。第一版 stair 只允許既有 `walk`；Physical 沒有新增 `climbAbility`、slope 或 step-rise axis。Directional traversal burden 由 system-owned stair profile 派生，目前 additive objective burden 為上樓 `+1`、下樓 `+0.5`，因此維持 `up > down >= flat`；這些是 Route objective facts，不寫回 Structure instance，也不由 `speedFactor` 推導。

空樓梯仍可在 1 個 movement tick 完成單一 abstract edge，不硬編 `stair = 2 ticks`。Dynamic Congestion 將 movement direction 從 XY 擴為 XYZ，並繼續使用 Passage `clearanceWidth` 的既有 pressure → `delayTicks` 模型；因此狹窄樓梯在人多或逆向流時可以自然增加 execution ticks，而不新增 stair-specific timing hack 或 `flowCapacity` contract。Editor 只新增 Structure Scene Inspector / lower-upper endpoint observability與 Preview round-trip；不加入完整 Structure 建立／拖曳、3D stair mesh、continuous slope、per-step geometry、jump/vault/climb、ladder/elevator。

本 release 因 cross-Z graph semantics、Structure Passage 與 vertical crowding direction 各自換代 Spatial Traversal `11.26.0-vertical-structure-traversal`、Spatial Passage `11.26.0-vertical-structure-passage`、Dynamic Congestion `11.26.0-vertical-flow-congestion`。Furniture Catalog 維持 `furniture-definitions-v3`；Route Semantics、Locomotion、Physical、Spatial Identity 沒有改 contract，因此維持原 generation。

### Previous Furniture Traversal Geometry release

`11.25.0-furniture-traversal-geometry` 將 Furniture traversal geometry 正式收斂到 Definition owner。Furniture Catalog generation 升為 `furniture-definitions-v3`：Definition 以 `spatial.floor.mode = open / solid / under` 明確區分 footprint 與 floor traversal 的關係，沿用既有 `spatial.under` 作低淨空唯一 truth，並新增可選 `spatial.surface` 持有 traversable surface、`allowKinds` 與 surface-specific `moveCost / transitionCost` override。resolver 從 local geometry + Instance origin 派生 world footprint、`<instanceId>:<surfaceKey>` 與 surface cells；Furniture Instance 仍只保存 `id / definitionId / origin / optional name`，因此 `world-authoring-v4` 不跟著假升。

Default dining table 的 `.72m` under-clearance、`diningTable:surface` identity、桌下 passage、桌面 contact / Surface Environment 與 route cost parity 均保留，但 `src/spatial-traversal.js` 不再對 `diningTable` instance ID 補 traversal / surface truth。Spatial Traversal contract 因正式改為 generic Furniture geometry consumer，換代為 `11.25.0-furniture-traversal-geometry`；Spatial Passage、Route Semantics、Locomotion、Physical、Crowding 未改各自 contract generation。本 release 不加入 vertical traversal、rotation/orientation、jump/vault/climb、Room value 正式模型或 Resident View 私人 badge。

### Previous Locomotion Traversal Cost release

`11.24.0-locomotion-traversal-cost` 補齊 production route objective 對 locomotion mode / mode-transition 的客觀成本。Locomotion 現正式持有 mode traversal burden：walk `0/edge`、kneelCrawl `1/edge`、proneCrawl `2/edge`，每次 locomotion mode 切換另加 `1` objective burden；Route / Spatial Traversal 只負責把它與既有 environmental / Surface edge cost、Crowding `congestionCost` 組合成 `traversalCost`。因此短但必須匍匐的捷徑不再只因 edge 數較少就自動勝過稍長步行路線，但當步行繞路真的更昂貴或 crawl 是唯一可行 route 時仍可選 crawl。

`travelTime` 仍只表示真實 execution timing：`transitionTicks + edgeMoveTicks`，而 `speedFactor` 只影響 edge movement ticks；個體速度 override 不會偷偷等比例改寫 objective burden。主觀 willingness、禮儀、尊嚴感、carefulness 等仍不進 Physical feasibility 或客觀 `traversalCost`。本次因此換代 Route Semantics 為 `11.24.0-route-locomotion-cost`，Locomotion contract 為 `11.24.0-locomotion-objective-burden`；Physical / Passage、Spatial Traversal / Passage、Dynamic Congestion、World Authoring 與 Furniture Catalog generation 均維持原 marker，不跟著假升。

### Previous Editor Source Port Observability release

`11.23.1-editor-source-port-observability` 修正 Editor 對 Source interaction geometry 的可觀測性缺口。Editor map 現直接投影 canonical `interactionPorts`：互動格以小型方向標記指出角色應站的位置與面向來源的方向；點擊標記可直接選取所屬 Source。Source Inspector 同時對具有 `fill` affordance 的水源顯示「取水位置」，並保留 port 自己的 label / position。Default `tap` 因此會在左側互動格 `(5, 5, 0)` 顯示指向本體的 `→`，Inspector 顯示「水龍頭左側 · (5, 5, 0)」，不再要求作者從 runtime 行為猜測可互動面。這次不改 `world-authoring-v4` shape、不改 Source interaction geometry / refill 行為，也不改 Furniture Catalog、Spatial Traversal / Passage、Physical / Route / Locomotion / Crowding 等 subsystem generation；因正式玩家可見 Editor observability surface 改變，overall current marker 升一個 patch。

### Previous World Boundary / Door / Exit release

`11.23.0-world-boundary-door-exit` 完成 Grid / Wall decision gate 的正式落地與 Door / Opening / Exit 分離。Canonical authoring 升為 `world-authoring-v4`：`map.cellSizeMeters = 1` 明確定義 coarse Tile 與 SI metric geometry 的換算邊界；普通牆／結構開口改由每層 `boundaries` 持有，不再把 `wall / doorway` 當 Cell terrain。Door 改成獨立 root entity，只持有 opening boundary reference 與 `open / closed` state；off-map world Exit 另外持有 boundary reference 與內側 access position。Furniture Catalog 因移除 `front-door` Definition、`runtimeExitSlotKeys` 與 `canExit` compatibility bridge，換代為 `furniture-definitions-v2`；External Supply 改用正式 Exit identity。為避免 ownership refactor 偷改既有 Room value，default Door 暫以 `compatibility.roomValueContribution` 保存原本 front door 的 18 點貢獻；這只是窄 parity bridge，不建立正式 Door value 模型。Spatial topology、room flood-fill、PassageProfile 與 route 共用同一 boundary interpretation；wall / closed Door 阻斷 edge，opening / open Door 保留 edge，opening 的 metric `clearanceWidth / clearanceHeight` 進入 PassageProfile。因此 Spatial Traversal contract 換代為 `11.23.0-boundary-traversal`，Spatial Passage contract 換代為 `11.23.0-boundary-passage-profile`。Physical、Route Semantics、Locomotion、Crowding、Spatial Identity、Relationship、Memory 等未改 contract 的 subsystem generation 不跟著假升。產品尚未正式公開，因此 v3→v4 不建立 production migration machinery；unsupported schema / catalog generation 由 current import boundary 直接拒絕。

### Previous Editor-3 release

`11.22.3-editor-authoring-presentation` 完成 **Editor-3｜Authoring presentation polish**。正式 `material` authoring contract 維持既有 `world-authoring-v3`：Editor 新增 Cell 材質編輯，可設定、替換與清除既有 `material`，常用 `wood / stone` 只作輸入提示，不建立新的封閉 material enum；所有修改仍經 `SimEditorAuthoringMutations` 的 clone → apply → validation → canonicalize → commit 流程。作者主要可見文案改為自然繁體中文，正式 identifier 只在必要的進階／診斷位置保留；runtime boundary 改為預設收合的進階資訊。Desktop 左右操作 panel 增加 viewport-scoped sticky / independent scroll，mobile 保留單欄與 map internal scroll並補足主要控制項的觸控高度。這是玩家可見 Editor 功能／interaction surface 的 patch-level 更新，因此推進 overall current marker；`world-authoring-v3`、`furniture-definitions-v1` 與 Physical / Passage / Route / Locomotion / Crowding / Spatial Identity / Relationship / Memory 等 subsystem generation 均不假升。

### Previous Editor-2 release

`11.22.2-editor-furniture-definitions` 完成 Furniture Definition / Instance authoring slice。新增 pure system-owned `SimFurnitureDefinitions` Catalog（`furniture-definitions-v1`），並將 canonical authoring 升為 `world-authoring-v3`：document 以 `furnitureCatalogVersion` pin catalog generation，Furniture Instance 只保存 `id / definitionId / origin / optional name`；intrinsic name/icon/kind、local footprint/display offset、slot、under-clearance與 activity suitability 由 Furniture Definition 持有，再由 shared resolver / initializer 投影為 world geometry與既有 runtime compatibility shape。Editor 新增 Catalog → create flow；new / duplicate instance ID 使用 `<definitionId>-N`，duplicate 只複製 instance-owned facts與 placement，不複製外部 references。因 canonical authoring package shape與玩家可見 Editor surface 都改變，因此 overall current marker 升 patch；Physical 11.17、Passage 11.17、Route 11.18、Locomotion 11.19、Crowding 11.20、Spatial Identity 11.22.0 等 subsystem generation 不假升。產品尚未正式公開，因此 v2→v3 不建立 production migration machinery；current import 對 unsupported schema/catalog generation直接拒絕。

### Previous Editor-1 release

`11.22.1-editor-resident-capabilities` 完成第一個 Editor Usability / Authoring Model 實作切片。新增 pure `SimEmbodimentCapabilities` authoring-safe capability contract，讓 Editor 與 runtime Physical / Locomotion 共用 Human / Cat default Physical template、locomotion mode ↔ posture vocabulary與姿勢查詢，不為 Editor 複製第二份物種規則，也不啟動 simulation。Resident free placement 收斂為單一 capability-aware move flow：作者明確選擇合法 free posture；bound Resident 移到自由位置時明確解除 furniture / slot reference；slot posture selector 同樣只顯示 resident kind + slot capability允許的選項。這是玩家可見 Editor policy / interaction surface 更新，因此依本文件規則升 overall current patch marker；`world-authoring-v2` shape、Physical 11.17、Passage 11.17、Route 11.18、Locomotion 11.19、Crowding 11.20 與 Spatial Identity 11.22.0 generation均不假升。

### Previous Slice E release

`11.22.0-spatial-z-identity` 將 authoring中的 Z-level正式接入 runtime identity。`map.tiles` 使用單一 flattened index，z=0維持 `x,y` compatibility key、non-zero z使用 `x,y,z`；base Spatial helper、Spatial Node / route state、Room / Surface Environment / Memory spatial ref、occupancy / contact / crowding與 simulator layer presentation共用 `z ?? 0` semantics。Initializer可編譯 multi-layer `world-authoring-v2`，但本 slice不加入任何 vertical structure或跨 Z traversal edge，所以無 concrete structure 時跨層 route仍 unreachable。這同時改變 persistent runtime map shape、Spatial semantics與玩家可見 layer presentation，因此使用新 minor marker `11.22.0-spatial-z-identity`。Authoring仍是 `world-authoring-v2`；Physical / Passage / Route / Locomotion / Crowding / Relationship / Memory generation不假升。

### Previous D.1C release

`11.21.4-editor-playtest-bridge` 新增玩家可見的 Editor→Simulator playtest flow，但不改 `world-authoring-v2` shape，也不改 Physical / Passage / Route / Locomotion / Crowding / Relationship / Memory subsystem generation。Editor 在 launch 前用 current authoring validation + runtime compatibility preflight 拒絕 invalid schema、broken references、multi-layer / non-zero Z；成功 handoff 只存在同 origin `sessionStorage`，並且只有 explicit `?preview=editor` simulator load 會消費。`SimWorld.createInitialStateFromAuthoring(...)` 與 default `createInitialState(...)` 共用同一 named initial-state pipeline，Preview Reset 重建同一 snapshot；normal simulator load 不受先前 preview 影響。因此這是 current product / presentation + bootstrap contract 的 patch-level 更新，使用 `11.21.4-editor-playtest-bridge`，authoring generation 維持 `world-authoring-v2`。
### World authoring contract version

World authoring 另有獨立 contract generation：current `SimWorldAuthoring.VERSION = "world-authoring-v7"`，canonical package 保存 `authoringSchema: "world-authoring-v7"`、`furnitureCatalogVersion: "furniture-definitions-v11"`、`map.cellSizeMeters = 1`、root `structures` 與 Furniture Instance required `orientation`。Furniture Catalog generation由 `SimFurnitureDefinitions.VERSION` 獨立持有；v8～v11 的 catalog-only expansion沒有改 Furniture Instance schema，因此 World Authoring仍維持 v7。

只有 authoring package shape / compatibility需要新 generation時才升 `world-authoring-vN`。PR #112 當時因 `orientation` compatibility semantics 改為 south-canonical + `orientationSemantics`，將 World Authoring / Furniture Catalog 推進到 v7 / v7；之後 v8～v11 只擴充 system-owned Furniture Definition set，因此 **current** 仍是 World Authoring v7、Furniture Catalog v11。Current Spatial Traversal / Contact為 `11.32.0-contact-slot-corner`、Spatial Passage為 `11.29.0-horizontal-connection-passage`、Dynamic Congestion為 `11.31.0-crowding-8-direction`、Physical為 `11.33.0-pose-envelope-static-fit`、Route / Locomotion維持 11.30.0 line，Spatial Identity維持 `11.22.0-spatial-z-identity`。

## 何時必須升版

只要合併後的 `main` 出現下列任一類 current contract 變更，就必須在同一個 PR 內更新 runtime marker：

- persistent simulation schema / state shape 改變；
- canonical structured data contract 改變，例如正式 event metadata / lifecycle marker；
- simulation semantics 或玩家可觀察到的 policy 改變；
- 新增、移除或實質改變玩家可見功能；
- 正式 observability surface 改變，例如 Resident / Entity Readable View / Debug Inspector 新增具有語義的資訊；
- 舊版本載入後會得到不同 externally observable contract 的其他變更。

## 何時可以不升版

若 observable behavior、schema 與 current product surface 都沒有改變，下列工作可維持原版本：

- 純 refactor / ownership cleanup；
- regression / CI 強化；
- documentation-only sync；
- internal load-order / registry cleanup，且正式語義不變；
- typo、註解或不影響行為的程式整理。

## 版本號使用方式

目前採 `major.minor.patch-slug`：

- `major`：專案世代／大規模不相容重構；目前為 11。
- `minor`：新的 subsystem / 明確產品 slice 或較大的 current contract 階段；例如 11.14 建立 Player Resident View / Debug Inspector split，11.15 建立 persistent Relationship Foundation，11.16 建立 Physical Profile Foundation，11.17 建立 Passage Profile + multi-mode traversal feasibility，11.18 建立 Route Semantics Split，11.19 建立 Locomotion Execution + Posture Transition，11.20 建立 Dynamic Congestion。
- `patch`：同一 minor 線內的可辨識 feature / contract 更新；例如 11.14.1 增加 player-readable action explanations、11.14.2 對齊 Resident Action / Intent / Explanation 的玩家語意、11.14.3 將 Explanation 的玩家文案收斂為自然直接的原因描述、11.14.4 將玩家可讀 Inspector 擴展到 Container / Source / Furniture / Tile / Room / Event、11.15.1 讓既有 Relationship Foundation 第一次以 bounded target preference 影響 initiator-side social target selection、11.15.2 再讓 responder 自己的 directional Relationship 以 bounded modifier 影響 Human talk / animal pet response score。
- `slug`：描述 current marker 的主要辨識功能，不是完整 changelog。

不是每個 PR 都需要版本號。PR 編號、Git commit 與 runtime version 是不同維度：一個版本可以包含多個 refactor/docs PR；反之，一個真正改變 current contract 的 PR 必須同時處理版本更新。

### 檔名 / workflow family 不是 current release marker

Current UI source與 current regression test / workflow 已使用 semantic filename；檔名本身不再承擔 current release marker。Subsystem generation仍由正式 schema/runtime marker表示，DOM data attribute或 historical console/output label若保留舊 generation字樣，也不得反推為整體 current release。

判斷**整體 current release** 時，以 `state.version`、`SimRelease.VERSION / SimWorld.VERSION`、`SimUI.PRESENTATION_VERSION`、玩家可見 app version 與 Current 文件為準；判斷**某 subsystem generation** 時，才看該 subsystem 自己的 schema/runtime marker。不得因整體 runtime 推進到 11.20.0 就把沒有 generation 變更的 Physical / Passage / Route / Locomotion / Relationship / Memory marker 假升到 11.20.0，也不得從舊 family 檔名反推整體 current release。

若未來 subsystem generation 改變，舊 family 名稱造成實質誤導，再另行 rename；單純 current marker 推進不要求 rename。

## Version consistency checklist

需要升版的 PR 必須同步確認：

1. `src/release.js` 的 canonical current runtime marker；
2. 本次新增／改變 contract 的 generation marker（目前包含 `SimWorldAuthoring.VERSION / authoringSchema` 與 `SimFurnitureDefinitions.VERSION / furnitureCatalogVersion`；Physical / Passage / Route / Locomotion / Crowding / Relationship / Memory marker 只有自身 contract generation 改變時才升），並確認未變更 subsystem 不被假升版；
3. `state.version` / `SimRelease.VERSION` / `SimWorld.VERSION` / `SimUI.PRESENTATION_VERSION`；
4. 由 Presentation current marker 持有的 UI version（目前包含 Resident View、Physical View、Locomotion View、Entity Readable View；其他 subsystem UI 依其 owner contract 判斷）沒有形成第二份 release marker；
5. `index.html` 的 browser `<title>` 維持穩定、不複製 runtime 版本；頁首 current-version display 則必須與 current release 同步。若頁面顯示 subsystem generation（例如 Editor 的 World Authoring badge），必須從該 subsystem canonical owner（例如 `SimWorldAuthoring.VERSION`）動態投影，不得在 HTML 複製 `world-authoring-vN` literal；
6. `README.md` current runtime marker；
7. `docs/architecture.md` / `docs/tick-pipeline.md` 若記載 current runtime marker，必須同步；若文件刻意只記 subsystem contract，則不得為了版本同步改寫無關語義；
8. presentation / browser regression 的 expected version；
9. Notion Architecture Current / relevant Current Design 文件。

`tests/presentation-observability.mjs` 與對應 presentation regression 負責鎖定 repo 內可自動驗證的 version consistency。若 feature 已改但版本 marker 沒更新，PR review / Current documentation sync 仍必須把它視為 release-contract 缺漏，而不是單純 docs 問題。

## Historical correction

PR #55 / #56 屬 ownership / compatibility lifecycle refactor，未改正式 simulation policy，因此不補造中間 release version；PR #58 為 docs-only，也不升版。PR #57 改變 canonical plan event 的 structured contract，但這次不回補虛構的歷史 release；其 contract hardening 保留在 Git history / Architecture Current。PR #59 實際新增玩家可見的 player-readable action explanation，因此 current line 從 `11.14.0-player-resident-view-debug-inspector` 校正為 `11.14.1-player-readable-action-explanations`。其後 Resident View 的 Action / Intent / Explanation presentation semantics 以 11.14.2 獨立升版；11.14.3 再把 Explanation 的玩家文案規則收斂成「同一 evidence 能用自然日常語言表達時，不暴露需求 threshold / engine 強度術語」，仍不改 simulation policy。11.14.4 再把 readable Inspector 從 Agent 擴展到非居民 entity；這仍是 presentation-only projection，不新增 Container / Furniture 等第二份玩家狀態。

11.15.0 正式新增 Agent-local persistent `relationships[counterpartId]` state、historical Appraisal → Relationship consolidation semantics，以及玩家可讀／Debug Relationship surface。這同時觸及 persistent schema、simulation semantics 與 observability，因此使用新的 minor marker `11.15.0-relationship-foundation`；該 Foundation 當時刻意保持 decision-inert。

11.15.1 在同一 minor 線內完成動物互動 canonicalization（`interactWithAnimal / petAnimal`）並讓 Relationship 第一次進入 initiator-side social target ranking。Relationship influence 僅作 bounded target preference：`relationshipTargetDelta = 8 × familiarity × affinity`，與 Memory influence、distance penalty 一起決定「找誰」，但不加入 action-level social utility、不 hard-ban 負向 target，也不修改 responder policy、current-intent utility、soft-switch threshold 或 commitment。因此使用 patch marker `11.15.1-relationship-target-preference`。

11.15.2 再加入 **Relationship → Responder Bias**。Relationship runtime 只提供 directional unitless `relationshipSignal = familiarity × affinity`；Human talk 與 animal pet responder subsystem 各自持有自己的 bounded scaling，目前 cap 均為 `±0.18`。Human responder-specific `talkResponseUtility` 可因 response score 改變，但 general `E.baseUtilityForAction(...,'talk')`、initiator social Action utility、target preference、current-intent utility、soft-switch threshold 與 commitment 不變。World Event 不保存 response-score decomposition 或 Relationship internals，Debug 只即時派生 `base + Relationship delta → final`。因此這是 simulation semantics + observability 的 patch-level current contract 變更，使用 `11.15.2-relationship-responder-bias`。

11.16.0 正式建立 **Physical Profile Foundation**。每個 Agent 新增 authoritative `physical` state，第一版包含 `mass / volume / bodyGeometry / locomotionCapabilities / locomotionProfiles`；`SimPhysical.getMovementEnvelope(agent, mode)` 從個體 profile 即時派生 `clearanceHeight / clearanceWidth / clearanceLength / speedFactor`，不保存第二份 envelope cache。既有 Spatial 家具下 clearance 改為消費 canonical Physical `requiredClearance`，同時維持 Human `1.65 m`、Cat `0.32 m` 對餐桌下 `0.72 m` 的預設行為 parity；單一個體 geometry / locomotion profile override 則可改變自己的 feasibility，不再由 `kind` 硬鎖。Debug Inspector 新增 Physical Profile / standing MovementEnvelope observability。本 slice 刻意不加入 crouch / kneelCrawl / proneCrawl、姿勢切換、traversal timing、crowding geometry 或人格／Relationship 對 locomotion willingness 的影響。由於這同時新增 persistent physical schema、新 subsystem interface、Spatial consumer semantics 與正式 Debug observability，因此使用新的 minor marker `11.16.0-physical-profile-foundation`。

11.17.0 正式加入 **Passage Profile + multi-mode traversal feasibility**。Physical locomotion baseline 從舊 `standing` 正名為 `walk`，與 Agent `posture.kind='standing'` 分離；Human 第一批提供 `walk / kneelCrawl / proneCrawl` MovementEnvelope，Cat 本 slice 只保留 `walk`。Spatial 新增 edge-derived `PassageProfile`，第一版比較 height / width，未設定軸以 `null` 表示 unconstrained；`traversalFeasibility(...)` 只回各 supported mode 的 `feasible / failedAxes`，不選 mode、不讀心理狀態。v11.17 當時的 production A* 仍是 walk-only execution，但已對每條 edge 消費 walk feasibility，因此 passage width/height 成為真正 routing constraint，同時 crawl-query 可行仍不會自動改姿勢穿越。Deterministic single-passage + water fixture 鎖住 normal / low / lower / width-only 四種情況。本 slice 刻意不加入 PoseEnvelope/static fit、length/turn clearance、traversalCost/travelTime split、locomotion execution/posture transition 或 behavioral willingness。由於 Physical contract、Spatial traversal semantics、Debug observability 與測試契約都實質改變，因此使用新的 minor marker `11.17.0-passage-profile-multimode`。

11.18.0 正式完成 **Route Semantics Split**。原本 `SP.pathDistance()` 實際直接回傳 weighted route cost；本 slice 新增 canonical `SimSpatial.planRoute(...)`，把 selected route 的 `pathDistance / traversalCost / travelTime` 分開，並讓 standalone `pathDistance` 搜尋 physical-feasible shortest topology route、`traversalCost` 搜尋最低客觀 route burden。既有 A* 與 gameplay consumer 全部繼續以 traversal cost 為預設 objective，因此 route preference / AI balance 保持 parity；Memory / Relationship target decomposition 的 `distancePenalty` 正名為 `accessPenalty`，source 改讀 traversal cost，但數值與 target ordering維持。第一版 `travelTime` 只反映 current executable walk edges（一 edge一 tick），不提前使用尚未進 execution 的 `speedFactor`。Debug 同步分開顯示 distance / cost / time。由於 canonical Spatial route API、decision decomposition、observable Debug surface 與 current semantics 都改變，因此使用新的 minor marker `11.18.0-route-semantics-split`。


11.19.0 正式完成 **Locomotion Execution + Posture Transition**。Production route planner 可用 `mode:'auto'` 在 supported + passage-feasible locomotion modes 中規劃，route state 正式包含 Spatial Node + locomotion mode；core `moveToward()` 實際執行 selected mode。posture 與 locomotion mode 保持分離但明確 mapping：`walk → standing`、`kneelCrawl → kneeling`、`proneCrawl → prone`，mode/posture 切換固定先消耗 1 tick。MovementEnvelope 的 `speedFactor` 首次進入真正 execution timing，以 `ceil(1 / speedFactor)` 決定每 edge movement ticks；route `travelTime` 因此由 transition + actual edge timing 派生並由 runtime兌現。新增 `agent.locomotion { mode, phase }`、Locomotion validator與 Debug projection；舊 Physical / Passage / Route / Relationship / Memory subsystem marker均不假升。Behavioral willingness、crowding、PoseEnvelope與新的 exertion model仍未納入。由於 persistent Agent execution state、route search semantics、movement timing、posture lifecycle與正式 observability都改變，因此使用新的 minor marker `11.19.0-locomotion-execution-posture`。


11.20.0 正式完成 **Dynamic Congestion**。新增 derived / uncached `SimCrowding.getCrowdingProfile(...)`，把當下 Agent occupancy、movement direction、MovementEnvelope width 與已知 PassageProfile width轉成 soft `congestionCost` 與 movement delay。其他 Agent不修改 PassageProfile，也不產生hard block；狹窄處錯身的額外時間代表側身、錯步、短暫停頓與調整移動方式。route planning把 crowding snapshot納入 `traversalCost / travelTime`，core execution在每次重新規劃下一條edge時讀取當下 congestion，因此 actual travel time可和較早estimate不同。舊 floor `occupiedCount × 5/2.5`與 `bestInteractionPosition()` 的 raw occupancy優先排序在production Crowding runtime下停止重複計算。Debug新增next-edge congestion pressure / cost / delay / speed / occupants。第一版不做Agent overlap hard block、reservation、yielding、deadlock、collision或behavioral willingness。由於 route objective burden、實際movement timing與正式observability都改變，因此使用新的minor marker `11.20.0-dynamic-congestion`；Physical / Passage維持v11.17、Route維持v11.18、Locomotion維持v11.19等各自generation。

11.21.0 正式完成 **Geometry-derived Horizontal Topology**。`world-authoring-v2` 把 Furniture under-clearance 等 concrete geometry納入 canonical authoring，並提供 explicit `world-authoring-v1 → v2` migration；legacy default dining-table 的 `.72m` clearance只在 migration邊界轉成正式資料，不再由 runtime ID fallback補值。`SimWorldAuthoring.deriveHorizontalTopology(authoring,{z})` 成為 Editor preview、initializer diagnostics與 runtime compatibility compilation共用的 pure horizontal geometry interpretation：`floor / doorway` 提供 structural openness，solid Furniture / fixed entity可關閉 connectivity，under-clearance則保留 connectivity並交給 PassageProfile判斷個體 mode feasibility。`tile.walkable / tile.furnitureIds` 保留為 derived runtime compatibility fields，正常 Editor不 author traversal flags。此版刻意不把 `z` 納入 Spatial Node / occupancy / route identity；Physical / Passage維持v11.17、Route維持v11.18、Locomotion維持v11.19、Crowding維持v11.20。


11.21.1 新增 **Editor Scene Inspector**：Editor 由 canonical authoring 即時投影 Furniture / Objects / Residents scene list、typed map markers與共用 ephemeral selection/focus，並在主模擬器 toolbar 提供 Editor 入口。這是玩家可見產品 surface 變更，因此依本文件規則使用 11.21 patch marker；simulation semantics、persistent state shape、`world-authoring-v2` generation，以及 Physical / Passage / Route / Locomotion / Crowding / Relationship subsystem markers均未改變。


11.21.2 新增 **Editor Entity Lifecycle / Mutation Semantics**。Editor 的 Furniture / Container / Source / Resident entity mutation集中到 pure `SimEditorAuthoringMutations` owner；正式操作以 clone → apply → `SimWorldAuthoring.validateAuthoring` → commit 保證 atomicity。Furniture move會維持既有 explicit Container `supportId` relation並同步 follower interaction ports；Container移到 support-capable footprint時要求作者明確選 Floor 或 Furniture support；Source不新增 `supportId`。同型 Furniture duplicate使用 deterministic instance / global-unique slot IDs且不複製外部 references；referenced Furniture delete以 structured blocker report拒絕 cascade。Resident generic move只支援 unbound exact placement，bound/anchor Resident必須 explicit convert-to-exact-standing或 furnitureSlot rebind。這是玩家可見 Editor功能，因此升 current patch；persistent authoring fields仍全屬既有 `world-authoring-v2`，Physical / Passage / Route / Locomotion / Crowding / Relationship 等 subsystem generation不變。D.1B2 drag、D.1C playtest bridge與 runtime Z identity仍未加入。

11.21.3 新增 **Editor Furniture Drag UX**。Desktop Furniture marker使用 Pointer Events與 explicit movement threshold區分 click selection / drag；pointer move只生成 full-footprint ghost、explicit `supportId` follower preview與 valid-invalid drop state，不改 canonical document。preview與正式 drop都委派既有 `SimEditorAuthoringMutations.moveFurniture(...)`，browser regression要求同一 source/target的 click placement與 drag drop產生相同 canonical semantic fingerprint。Touch/mobile仍保留 click/tap placement。這是玩家可見 Editor interaction surface，因此升 current patch；`world-authoring-v2`、runtime Spatial identity以及 Physical / Passage / Route / Locomotion / Crowding / Relationship subsystem generation均不變。D.1C playtest bridge與 runtime Z identity仍未加入。
