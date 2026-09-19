# Versioning Contract

本文件定義 Emergent Causal Simulator 的 current runtime marker 何時必須更新，以及哪些變更可以留在同一版本內。

## Current version

目前 current runtime marker：

`11.21.2-editor-entity-lifecycle`

玩家可見的 app 頁首 current-version display 使用短版 `v11.21.2`；瀏覽器 document `<title>` 使用不帶 runtime 版本的穩定產品名稱 `因果湧現模擬器｜Emergent Causal Sim`，不持有 release truth。`state.version` 與 `SimWorld.PRESENTATION_SCHEMA_VERSION` 使用完整 current marker。Subsystem schema/runtime marker 代表各自 contract generation：目前 Physical 使用 `SimWorld.PHYSICAL_SCHEMA_VERSION = 11.17.0-passage-profile-multimode`，Spatial Passage 使用 `SimSpatial.PASSAGE_PROFILE_VERSION = 11.17.0-passage-profile-multimode`，Route Semantics 使用 `SimSpatial.ROUTE_SEMANTICS_VERSION = 11.18.0-route-semantics-split`，Locomotion Execution 使用 `SimWorld.LOCOMOTION_SCHEMA_VERSION / SimLocomotion.VERSION = 11.19.0-locomotion-execution-posture`，Dynamic Congestion 使用 `SimCrowding.VERSION / SimSpatial.CROWDING_VERSION = 11.20.0-dynamic-congestion`；Relationship 仍保留自己的 `SimWorld.RELATIONSHIP_SCHEMA_VERSION = 11.15.2-relationship-responder-bias`，Memory→Deliberation 仍保留 `11.13.4-memory-deliberation-influence`，不因整體 current release 推進而假升未換代 subsystem。Resident / Physical / Locomotion / Entity Readable 等 UI version 若以 current Presentation marker 為 owner，則跟隨 current marker。

### World authoring contract version

World authoring 另有獨立 contract generation：`SimWorldAuthoring.VERSION = "world-authoring-v2"`，canonical package 同時保存 `authoringSchema: "world-authoring-v2"`。它不是 current runtime marker，也不是 Physical / Spatial 等 simulation subsystem generation。現行 loader asset 仍沿用歷史檔名 `world-authoring-v1.js`；contract generation 以 `VERSION / authoringSchema` 為準，不以 asset 檔名推斷。

只有 authoring package shape / migration compatibility需要新 generation時才升 `world-authoring-vN`；單純 current runtime推進不得順手假升 authoring schema。Slice D 因 Furniture under-clearance進入 canonical authoring geometry、並需要 explicit v1→v2 migration，因此 authoring contract升為 v2；同時 opening / blocker topology semantics成為正式 runtime行為，所以 current runtime另升為 `11.21.0-geometry-derived-topology`。Physical / Passage、Route、Locomotion、Crowding各自 contract沒有換代，因此維持原 subsystem marker。

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

像 `presentation-schema-v1140.js`、`ui-resident-view-v1140.js`、`ui-entity-readable-v1141.js`、`relationship-*-v1150.js`、`physical-*-v1160.js`、`browser-resident-view-v1140-qa` 這類名稱代表 subsystem / test family，可以跨後續 current release 延續，不需要因 runtime marker 推進就整組複製／改名。`spatial-passage-v1170.js` 則是本 slice 新增的 Passage contract owner。

判斷**整體 current release** 時，以 `state.version`、`SimWorld.PRESENTATION_SCHEMA_VERSION`、玩家可見 app version 與 Current 文件為準；判斷**某 subsystem generation** 時，才看該 subsystem 自己的 schema/runtime marker。不得因整體 runtime 推進到 11.20.0 就把沒有 generation 變更的 Physical / Passage / Route / Locomotion / Relationship / Memory marker 假升到 11.20.0，也不得從舊 family 檔名反推整體 current release。

若未來 subsystem generation 改變，舊 family 名稱造成實質誤導，再另行 rename；單純 current marker 推進不要求 rename。

## Version consistency checklist

需要升版的 PR 必須同步確認：

1. `src/presentation-schema-v1140.js` 的 current runtime marker；
2. 本次新增／改變 subsystem 的 schema/runtime marker（本線新增 `SimCrowding.VERSION / SimSpatial.CROWDING_VERSION`；既有 Physical / Passage / Route / Locomotion / Relationship / Memory marker 只有自身 contract generation 改變時才升），並確認未變更 subsystem 不被假升版；
3. `state.version` / `SimWorld.PRESENTATION_SCHEMA_VERSION`；
4. 由 Presentation current marker 持有的 UI version（目前包含 Resident View、Physical View、Locomotion View、Entity Readable View；其他 subsystem UI 依其 owner contract 判斷）沒有形成第二份 release marker；
5. `index.html` 的 browser `<title>` 維持穩定、不複製 runtime 版本；頁首 current-version display 則必須與 current release 同步；
6. `README.md` current runtime marker；
7. `docs/architecture.md` / `docs/tick-pipeline.md` 若記載 current runtime marker，必須同步；若文件刻意只記 subsystem contract，則不得為了版本同步改寫無關語義；
8. presentation / browser regression 的 expected version；
9. Notion Architecture Current / relevant Current Design 文件。

`tests/presentation-observability-v1140.mjs` 與對應 presentation regression 負責鎖定 repo 內可自動驗證的 version consistency。若 feature 已改但版本 marker 沒更新，PR review / Current documentation sync 仍必須把它視為 release-contract 缺漏，而不是單純 docs 問題。

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
