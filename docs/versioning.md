# Versioning Contract

本文件定義 Emergent Causal Simulator 的 current runtime marker 何時必須更新，以及哪些變更可以留在同一版本內。

## Current version

目前 current runtime marker：

`11.15.0-relationship-foundation`

玩家可見標題使用短版 `v11.15.0`；`state.version`、`SimWorld.PRESENTATION_SCHEMA_VERSION`、`SimWorld.RELATIONSHIP_SCHEMA_VERSION`、Resident View、Relationship View 與 Entity Readable View 的 UI version 使用完整 marker。

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
- `minor`：新的 subsystem / 明確產品 slice 或較大的 current contract 階段；例如 11.14 建立 Player Resident View / Debug Inspector split，11.15 建立 persistent Relationship Foundation。
- `patch`：同一 minor 線內的可辨識 feature / contract 更新；例如 11.14.1 增加 player-readable action explanations、11.14.2 對齊 Resident Action / Intent / Explanation 的玩家語意、11.14.3 將 Explanation 的玩家文案收斂為自然直接的原因描述、11.14.4 將玩家可讀 Inspector 擴展到 Container / Source / Furniture / Tile / Room / Event。
- `slug`：描述 current marker 的主要辨識功能，不是完整 changelog。

不是每個 PR 都需要版本號。PR 編號、Git commit 與 runtime version 是不同維度：一個版本可以包含多個 refactor/docs PR；反之，一個真正改變 current contract 的 PR 必須同時處理版本更新。

### 檔名 / workflow family 不是 current release marker

像 `presentation-schema-v1140.js`、`ui-resident-view-v1140.js`、`ui-entity-readable-v1141.js`、`browser-resident-view-v1140-qa` 這類名稱代表 subsystem / test family，可以跨後續 current release 延續，不需要因 runtime marker 升到 11.15.0 就整組複製／改名。Relationship 自己使用 `relationship-*-v1150.js` family；判斷目前版本時，以 `state.version`、`SimWorld.PRESENTATION_SCHEMA_VERSION`、`SimWorld.RELATIONSHIP_SCHEMA_VERSION`、玩家可見 app version 與 Current 文件為準，而不是從其他舊 family 檔名或 workflow display name 反推 current release。

若未來 subsystem generation 改變，舊 family 名稱造成實質誤導，再另行 rename；單純 current marker 推進不要求 rename。

## Version consistency checklist

需要升版的 PR 必須同步確認：

1. `src/presentation-schema-v1140.js` 的 current runtime marker；
2. 新增 subsystem 的 schema marker（本版為 `SimWorld.RELATIONSHIP_SCHEMA_VERSION`）；
3. `state.version` / `SimWorld.PRESENTATION_SCHEMA_VERSION`；
4. `SimEngine.UI_RESIDENT_VIEW_VERSION`、`SimEngine.UI_RELATIONSHIP_VERSION` 與 `SimEngine.UI_ENTITY_READABLE_VERSION`（若已載入）都與 current marker 一致；
5. `index.html` 的 `<title>` 與頁首可見版本；
6. `README.md` current runtime marker；
7. `docs/architecture.md` / `docs/tick-pipeline.md` current runtime marker；
8. presentation / browser regression 的 expected version；
9. Notion Architecture Current / relevant Current Design 文件。

`tests/presentation-observability-v1140.mjs` 與對應 presentation regression 負責鎖定 repo 內可自動驗證的 version consistency。若 feature 已改但版本 marker 沒更新，PR review / Current documentation sync 仍必須把它視為 release-contract 缺漏，而不是單純 docs 問題。

## Historical correction

PR #55 / #56 屬 ownership / compatibility lifecycle refactor，未改正式 simulation policy，因此不補造中間 release version；PR #58 為 docs-only，也不升版。PR #57 改變 canonical plan event 的 structured contract，但這次不回補虛構的歷史 release；其 contract hardening 保留在 Git history / Architecture Current。PR #59 實際新增玩家可見的 player-readable action explanation，因此 current line 從 `11.14.0-player-resident-view-debug-inspector` 校正為 `11.14.1-player-readable-action-explanations`。其後 Resident View 的 Action / Intent / Explanation presentation semantics 以 11.14.2 獨立升版；11.14.3 再把 Explanation 的玩家文案規則收斂成「同一 evidence 能用自然日常語言表達時，不暴露需求 threshold / engine 強度術語」，仍不改 simulation policy。11.14.4 再把 readable Inspector 從 Agent 擴展到非居民 entity；這仍是 presentation-only projection，不新增 Container / Furniture 等第二份玩家狀態。

11.15.0 則正式新增 Agent-local persistent `relationships[counterpartId]` state、historical Appraisal → Relationship consolidation semantics，以及玩家可讀／Debug Relationship surface。這同時觸及 persistent schema、simulation semantics 與 observability，因此使用新的 minor marker `11.15.0-relationship-foundation`；第一版 Relationship 刻意保持 decision-inert，不代表 responder policy 已接入 Relationship。
