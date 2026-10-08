# PR Preflight Checklist

本文件只處理「不應該等完整 CI 才發現」的低成本錯誤。它不是 Node / Browser regression 的替代品，也不改變各 subsystem 的正式驗證需求。

## 固定順序

推 PR 前先執行：

```bash
node tests/pr-preflight.mjs
```

目前 preflight 只串接低成本、高命中率的既有 guards：

1. `tests/check-source-syntax.mjs`
2. `tests/workflow-architecture.mjs`
3. `tests/production-source-load-architecture.mjs`
4. `tests/presentation-observability.mjs`

任一項失敗就先修正，不要先 push 等完整 CI 重跑。

## 版本／generation 自檢

只要本次變更碰到 runtime marker、schema、catalog generation、subsystem generation 或玩家可見 current release：

- [ ] 先判斷這次**哪些 owner 的 contract 真的改變**。
- [ ] overall runtime marker 需要升版時，`SimRelease.VERSION` / `SimWorld.VERSION` / Presentation current marker 等 current-release projection 已同步。
- [ ] 有改 contract 的 subsystem own generation 已更新。
- [ ] **沒改 contract 的 subsystem 不假升版**。
- [ ] repo-wide 搜尋舊 marker；逐一判斷 production source、fixtures、Node regressions、Browser regressions、Presentation projection、README / current docs 是否應同步。
- [ ] `tests/production-source-load-architecture.mjs` 等 current-contract assertion 已同步。
- [ ] 若 World Authoring / Furniture Catalog / Embodiment Capabilities generation 改變，相關 authored fixtures 與 validator expectations 已同步。

這是語意 audit，不是 repo-wide blind replace。

## Production composition 自檢

若新增、刪除、移動或改名 production source：

- [ ] production loader / index 已使用正確 current path。
- [ ] source 沒有重複載入。
- [ ] retired path 已移除。
- [ ] initial-state registrant 在 manifest finalization 前完成註冊。
- [ ] runtime hook 在 `runtime-hook-pipeline.js` 後、hook manifest finalization 前註冊。
- [ ] Presentation observer 不混入 simulation hook manifest。
- [ ] validator rule 位於 registry 建立後、validation manifest finalization 前。
- [ ] app bootstrap 仍是 production composition 的最後入口。

## Regression / workflow 自檢

若新增、刪除或改名 regression：

- [ ] 新的 canonical Node regression 已掛入 `.github/workflows/node-regression.yml`（若它應屬完整 Node CI）。
- [ ] Browser QA 已掛入 Browser matrix（若它是 browser-observable contract）。
- [ ] retired test path 不再留在 current workflow / architecture assertions。
- [ ] focused test 使用 production composition / canonical helper，不自行建立第二套假的 load order 或 fallback lifecycle。

## API / fixture 自檢

若改 API、export、required field 或 evidence shape：

- [ ] repo-wide 搜尋被改名 identifier / retired literal。
- [ ] 直接 production consumers 已更新。
- [ ] fixtures / initializer / validator expectations 已更新。
- [ ] Debug / Inspector / Presentation projection 沒有殘留舊 shape。
- [ ] focused regression 至少覆蓋 authoritative owner 與直接 consumer。

## Runner / workflow 自檢

目前 Node CI 契約：canonical Node regression 預設直接使用 `self-hosted`；GitHub-hosted `ubuntu-latest` 只作為手動 fallback。

修改 workflow 時確認：

- [ ] 沒有重新引入必須先佔用 GitHub-hosted runner 的 selector job。
- [ ] manual fallback 沒有被 `push` / `pull_request` 自動觸發。
- [ ] fallback 仍重用 canonical Node workflow，而不是維護第二份 test list。

## Preflight 通過後仍要做什麼

Preflight 只代表便宜的結構性錯誤已排除。之後仍需依變更風險執行：

- authoritative owner 的 focused regression；
- 直接 consumer regressions；
- 必要的完整 Node regression；
- 涉及 UI / browser behavior 時的 Browser regression。

不要把 `PR preflight: ok` 宣稱成完整 Node / Browser runtime 驗證。
