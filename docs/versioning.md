# Versioning Contract

本文件定義 Emergent Causal Simulator 的 current runtime marker 何時必須更新，以及哪些變更可以留在同一版本內。

## Current version

目前 current runtime marker：

`11.14.1-player-readable-action-explanations`

玩家可見標題使用短版 `v11.14.1`；`state.version`、`SimWorld.PRESENTATION_SCHEMA_VERSION` 與 Resident View 的 UI version 使用完整 marker。

## 何時必須升版

只要合併後的 `main` 出現下列任一類 current contract 變更，就必須在同一個 PR 內更新 runtime marker：

- persistent simulation schema / state shape 改變；
- canonical structured data contract 改變，例如正式 event metadata / lifecycle marker；
- simulation semantics 或玩家可觀察到的 policy 改變；
- 新增、移除或實質改變玩家可見功能；
- 正式 observability surface 改變，例如 Resident View / Debug Inspector 新增具有語義的資訊；
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
- `minor`：新的 subsystem / 明確產品 slice 或較大的 current contract 階段；例如 11.14 建立 Player Resident View / Debug Inspector split。
- `patch`：同一 minor 線內的可辨識 feature / contract 更新；例如 11.14.1 增加 player-readable action explanations。
- `slug`：描述 current marker 的主要辨識功能，不是完整 changelog。

不是每個 PR 都需要版本號。PR 編號、Git commit 與 runtime version 是不同維度：一個版本可以包含多個 refactor/docs PR；反之，一個真正改變 current contract 的 PR 必須同時處理版本更新。

### 檔名 / workflow family 不是 current release marker

像 `presentation-schema-v1140.js`、`ui-resident-view-v1140.js`、`browser-resident-view-v1140-qa` 這類名稱代表 11.14 這條 subsystem / test family，可以跨 11.14.x patch 延續，不需要每個 patch 都複製／改名整組檔案與 workflow。判斷目前版本時，以 `state.version`、`SimWorld.PRESENTATION_SCHEMA_VERSION`、玩家可見 app version 與 Current 文件為準，而不是從檔名或 workflow display name反推 current release。

若未來 minor 升級代表新的 subsystem generation、舊 family 名稱會造成實質誤導，再另行 rename；單純 patch bump 不要求 rename。

## Version consistency checklist

需要升版的 PR 必須同步確認：

1. `src/presentation-schema-v1140.js` 的 current runtime marker；
2. `state.version` / `SimWorld.PRESENTATION_SCHEMA_VERSION`；
3. `SimEngine.UI_RESIDENT_VIEW_VERSION` 與 schema marker 一致；
4. `index.html` 的 `<title>` 與頁首可見版本；
5. `README.md` current runtime marker；
6. `docs/architecture.md` current runtime marker；
7. presentation / browser regression 的 expected version；
8. Notion Architecture Current / relevant Current Design 文件。

`tests/presentation-observability-v1140.mjs` 負責鎖定 repo 內可自動驗證的 version consistency。若 feature 已改但版本 marker 沒更新，PR review / Current documentation sync 仍必須把它視為 release-contract 缺漏，而不是單純 docs 問題。

## Historical correction

PR #55 / #56 屬 ownership / compatibility lifecycle refactor，未改正式 simulation policy，因此不補造中間 release version；PR #58 為 docs-only，也不升版。PR #57 改變 canonical plan event 的 structured contract，但這次不回補虛構的歷史 release；其 contract hardening 保留在 Git history / Architecture Current。PR #59 實際新增玩家可見的 player-readable action explanation，因此 current line 從 `11.14.0-player-resident-view-debug-inspector` 校正為 `11.14.1-player-readable-action-explanations`。
