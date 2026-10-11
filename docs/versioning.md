# Versioning Contract — Current

目前 overall runtime marker：`11.56.0-object-unification`。

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
- Pickup Interaction Geometry：`pickup-interaction-v1`
- ordinary-object interaction：`ordinary-object-interaction-v2`
- Daily Life Routine：`daily-life-routine-v1`
- Mental Regulation：`mental-regulation-v4`
- Action / Human Social Response：`11.51.0-activity-concurrency`
- Object Handling：`object-handling-v1`
- Resources：`11.56.0-resource-container-capability`
- Physical `11.56.0-physical-object-handling`
- Agent Carry：`11.46.0-sleep-carry-integration`
- Social Bid：`11.47.0-social-bid-carry-cooperation`
- Deliberation / Decision Evidence / Sleep Slot Conflict：`11.48.1-sleep-perception-approach`
- Locomotion：`11.50.1-prone-transition-burden`
- Spatial Traversal / Route：`11.38.0-carried-handling-risk`
- Spatial Passage：`11.39.1-surface-boundary-transition`
- Contact：`11.32.0-contact-slot-corner`
- Spatial Identity：`11.22.0-spatial-z-identity`
- Dynamic Congestion：`11.31.0-crowding-8-direction`
- Memory / Usage Preference：`11.42.0-usage-preference-sleep`
- Horizontal Geometry：`11.29.0-horizontal-geometry-foundation`
- Embodiment Capabilities 為 `embodiment-capabilities-v5`
- World Authoring：`world-authoring-v14`
- Furniture Catalog：`furniture-definitions-v12`

## Current release impact

`11.56.0-object-unification` 是一次 semantic migration：concrete physical-item canonical identity 從原本 `objects / containers` 雙 collection 收斂為唯一 `entities.objects / state.objects`。World Authoring 因 schema 移除 `entities.containers` 並新增明示 Resource-container capability 而前進至 `world-authoring-v14`。

Generic Object carry 的 physical authority 新增 `object-handling-v1`：`portable`、`handling.carryGeometry`、`handling.handsRequired` 與 `Agent.held` 不再由 Resources 決定；Physical 因 traversal envelope / hand-feasibility 現在接受任何合法 held Object 而前進至 `11.56.0-physical-object-handling`。Resources 同樣前進至 `11.56.0-resource-container-capability`，只對 `resourceContainer:true` Object 提供 `contents / capacity / load / retention / spill / transfer` semantics。

Nearby Placement algorithm 的 locality / support-contact 原則不變，但 public release contract 從 Container-specific 擴為 generic Object，因此 capability marker 前進至 `nearby-placement-v2-object-release`。`state.agentCarries` relation、Agent Carry generation、Spatial Traversal / Route、Spatial Passage、Contact、Locomotion、Furniture Catalog 等未改自己的 contract，不為 overall release 機械升版。

本 release 不做 Object containment / bookshelf runtime，也不做 Food Object migration；current `contents.food` 繼續作 Resource-container capability 的 production representation。

詳細語意見 [`architecture.md`](architecture.md) 的 Object identity / Resource-container capability 與 Intentional nearby placement v2。

## Consistency responsibility

Release bump 應核對：`src/release.js`、runtime / Presentation derived version、README、`docs/architecture.md`、本頁、semantic-owner current doc，以及 dedicated preflight / version ownership regression。若行為 browser-observable，執行必要 Browser regression。

PR head 每次改變後，舊 head 的 CI 結果不得直接套用到新 head。

Historical version narrative 保存於 `docs/archive/versioning-through-11.53.md`；Historical literal 不因新 current release 全域替換。