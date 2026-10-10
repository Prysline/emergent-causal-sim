# Versioning Contract — Current

目前 overall runtime marker：`11.54.0-pickup-interaction-geometry`。

`src/release.js` 是 **current overall runtime version 的唯一 canonical production owner**。`state.version`、`SimWorld.VERSION`、`SimRelease.VERSION` 與 Presentation projection 只能引用這個 owner；一般 subsystem regression 不得複製 current overall literal 當 authority。

## Overall vs subsystem generation

使用者可觀察 simulation semantics、truth boundary、runtime ordering 或跨 subsystem canonical contract 改變時，評估 overall marker。純文件整理、測試重構、CI optimization、無語意 refactor 不機械 bump。

Subsystem marker只在**自己的 contract**改變時前進；overall release 前進不代表所有 subsystem換代。

Current relevant markers：

- Pickup Interaction Geometry：`pickup-interaction-v1`
- ordinary-object interaction：`ordinary-object-interaction-v2`
- Daily Life Routine：`daily-life-routine-v1`
- Mental Regulation：`mental-regulation-v4`
- Action / Human Social Response：`11.51.0-activity-concurrency`
- Physical `11.45.0-agent-carry-relocate`
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
- World Authoring：`world-authoring-v13`
- Furniture Catalog：`furniture-definitions-v12`

## Current release impact

`11.54.0-pickup-interaction-geometry`：overall / Presentation 前進；Pickup Interaction Geometry → `pickup-interaction-v1`；ordinary-object interaction → `ordinary-object-interaction-v2`。Spatial Traversal / Route、Contact、Locomotion、Physical、World Authoring、Furniture Catalog、Mental Regulation 等未改 contract 的 markers 保持不變。

詳細語意見 [`interaction-geometry.md`](interaction-geometry.md)。

## Consistency responsibility

Release bump 應核對：`src/release.js`、runtime / Presentation derived version、README、`docs/architecture.md`、本頁、semantic-owner current doc，以及 dedicated preflight / version ownership regression。若行為 browser-observable，執行必要 Browser regression。

PR head 每次改變後，舊 head 的 CI 結果不得直接套用到新 head。

Historical version narrative 保存於 `docs/archive/versioning-through-11.53.md`；Historical literal 不因新 current release 全域替換。
