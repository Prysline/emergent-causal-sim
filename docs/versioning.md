# Versioning Contract — Current

目前 overall runtime marker：`11.58.0-object-containment`。

`src/release.js` 是 **current overall runtime version 的唯一 canonical production owner**。`state.version`、`SimWorld.VERSION`、`SimRelease.VERSION` 與 Presentation projection 只能引用這個 owner；一般 subsystem regression 不得複製 current overall literal 當 authority。

## Overall vs subsystem generation

使用者可觀察 simulation semantics、truth boundary、runtime ordering 或跨 subsystem canonical contract 改變時，評估 overall marker。純文件整理、測試重構、CI optimization、無語意 refactor 不機械 bump。

Subsystem marker只在**自己的 contract**改變時前進；overall release 前進不代表所有 subsystem換代。

## 何時必須升版

以下任一項改變時，必須檢查並更新對應 version marker，而不是只改程式或文件：

- 使用者可觀察的 simulation semantics 改變。
- canonical truth ownership / truth boundary 改變。
- runtime hook ordering、same-tick visibility、initialization lifecycle 等執行語意改變。
- 對外可依賴的 subsystem contract / schema / generation 改變。
- 新增、移除或重新定義會影響 gameplay / observability 的 canonical state、interaction geometry 或 execution rule。

只修測試 fixture、文件排版、CI plumbing、無語意 refactor 或 historical/archive 內容時，不為形式一致而機械升 overall / subsystem version。若只改單一 subsystem contract，只升該 subsystem generation；不得讓 unrelated subsystem 假性換代。

Current relevant markers：

- Nearby Placement：`nearby-placement-v2-object-release`
- Pickup Interaction Geometry：`pickup-interaction-v2-containment`
- ordinary-object interaction：`ordinary-object-interaction-v2`
- Daily Life Routine：`daily-life-routine-v1`
- Mental Regulation：`mental-regulation-v4`
- Action / Human Social Response：`11.51.0-activity-concurrency`
- Object Handling：`object-handling-v1`
- Resources：`11.56.0-resource-container-capability`
- Physical `11.56.0-physical-object-handling`
- Agent Carry：`11.46.0-sleep-carry-integration`
- Social Bid：`11.47.0-social-bid-carry-cooperation`
- Deliberation / Decision Evidence：`11.48.1-sleep-perception-approach`
- Sleep Slot Conflict：`11.57.0-sleep-animal-resolution`
- Locomotion：`11.50.1-prone-transition-burden`
- Spatial Traversal / Route：`11.38.0-carried-handling-risk`
- Spatial Passage：`11.39.1-surface-boundary-transition`
- Contact：`11.32.0-contact-slot-corner`
- Spatial Identity：`11.22.0-spatial-z-identity`
- Spatial Observability：`11.58.0-spatial-containment-observability`
- Dynamic Congestion：`11.31.0-crowding-8-direction`
- Memory / Usage Preference：`11.42.0-usage-preference-sleep`
- Horizontal Geometry：`11.29.0-horizontal-geometry-foundation`
- Embodiment Capabilities 為 `embodiment-capabilities-v5`
- World Authoring：`world-authoring-v15`
- Furniture Catalog：`furniture-definitions-v13`

## Current release impact

`11.58.0-object-containment` 建立 Object containment v1：World Authoring → `world-authoring-v15`、Furniture Catalog → `furniture-definitions-v13`、Pickup Interaction Geometry → `pickup-interaction-v2-containment`、Editor ordinary-object authoring → `editor-ordinary-object-authoring-v3`、Spatial Observability → `11.58.0-spatial-containment-observability`。Spatial Identity / Route、Physical、Agent Carry、Resources 與 Sleep Slot Conflict 不因本 release 假升版。

前一個 `11.57.0-sleep-animal-conflict` 修正 preferred Sleep Slot conflict 的 Animal resolution 與 escalation 語意。

- `sleep`、`rest` 與 Human `meal` 仍先以 canonical `bestSlotApproachNode(..., objective:'traversalCost')` 選擇 chooser-time navigation witness；這個 winner 是 ephemeral derived result，不是跨 tick 唯一抵達真相。
- Action execution 每 tick 以 current `slotApproachNodes()` 重新確認 target Slot 的合法 approach set。若 actor 已在其中任一 node，movement phase 直接轉入 `settle` / `sit`，不再為了較早選到的 stale witness 額外繞行。
- same-tick semantics 保持原本兩階段：arrival tick 只改 phase；真正坐下／躺下在下一個 core tick進行，並重驗 activity capability、kind、Pose fit、availability / reservation 與 current Slot approach。
- 沒有合法 approach 時仍不得 settle；Human meal 的 `standForMeal` fallback 不變。
- 本 release 不改 Furniture Definition / Slot schema、`approachEdges`、Spatial / Route geometry、`bestSlotApproachNode()` ranking 或 Sleep preferred-Slot conflict policy。

Version impact：overall / Presentation → `11.57.1-slot-approach-arrival`。Sleep Slot Conflict own marker維持 `11.57.0-sleep-animal-resolution`；Generic Deliberation / Decision Evidence 維持 `11.48.1-sleep-perception-approach`；Spatial Traversal / Route維持 `11.38.0-carried-handling-risk`。Action、Furniture、Locomotion、Contact、Usage Preference等 subsystem generation 都未改自身 contract，因此不為這個 shared Engine consumer correction 假升版。

前一個 `11.57.0-sleep-animal-conflict` 的 Sleep preferred-Slot conflict contract 全部維持 current：wake success 與 occupancy resolution 仍分離；同一 requester Sleep Decision + preferred Slot + observed occupant episode 內以 `sleepSlotConflictOutcome` causal evidence 抑制 repeat wake，不保存 retry counter；awake Animal 的 move-away仍由 directed World Bid → Animal-owned observation → `yieldSleepSlot` Intent / `wander` Action完成，Sleep requester不直接改寫 Animal position；sleeping relocation ranking仍只讀 requester 可知 observation、公開 Embodiment defaults、canonical Slot legality、objective sleep quality與 requester relocation cost，不偷看 occupant-private Usage preference或 hidden instance physical truth。

前一個 `11.56.0-object-unification` 的 Object identity / Resource-container capability / generic Object handling contract 全部維持 current：concrete physical item 仍只存在 `entities.objects / state.objects`，`Agent.held` 仍是唯一 held physical Object relation，Nearby Placement 仍為 `nearby-placement-v2-object-release`。該 release 不做 Object containment / bookshelf runtime，也不做 Food Object migration；current `contents.food` 繼續作 Resource-container capability 的 production representation。

詳細跨 subsystem 語意見 [`architecture.md`](architecture.md)。

## Consistency responsibility

Release bump 應核對：`src/release.js`、runtime / Presentation derived version、README、`docs/architecture.md`、本頁、semantic-owner current doc，以及 dedicated preflight / version ownership regression。若行為 browser-observable，執行必要 Browser regression。

PR head 每次改變後，舊 head 的 CI 結果不得直接套用到新 head。

Historical version narrative 保存於 `docs/archive/versioning-through-11.53.md`；Historical literal 不因新 current release 全域替換。