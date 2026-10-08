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

若新增、修改、刪除或改名 regression：

- [ ] 新的 canonical Node regression 已掛入 `.github/workflows/node-regression.yml`（若它應屬完整 Node CI）。
- [ ] Browser QA 已掛入 Browser matrix（若它是 browser-observable contract）。
- [ ] retired test path 不再留在 current workflow / architecture assertions。
- [ ] focused test 使用 production composition / canonical helper，不自行建立第二套假的 load order 或 fallback lifecycle。
- [ ] **新增或修改 focused regression 後，push 前至少單獨執行該 test 一次**；確認 fixture、canonical node identity / evidence shape 與 expected literals 符合 current contract，而不是只確認 syntax 或 workflow registration。

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

### 多 PR 併行時的 runner 策略

只有一台 self-hosted runner、同時有多個 PR 等 Node CI 時，可以人工把後續 PR 暫時排去 GitHub-hosted fallback，以提高兩邊 runner 的利用率：

1. 第一個 PR 保留 canonical `Node regression`，繼續排／使用 `self-hosted`。
2. 第二個 PR 若還在等 self-hosted，可取消該次 canonical Node run。
3. 手動啟動 `Node regression (GitHub fallback)`，branch 選第二個 PR 的 branch，讓它排 `ubuntu-latest`。
4. 若 GitHub-hosted runner 先開始，就讓 fallback 跑完。
5. 若第一個 PR 的 self-hosted run 先完成，而第二個 PR 的 GitHub fallback **仍是 queued、尚未開始**，可取消 fallback，再對第二個 PR 原本被取消的 canonical `Node regression` 執行 Re-run，讓它回到 `self-hosted`。

這是一個人工 opportunistic scheduling 流程，不改變 canonical runner contract。避免讓同一個 PR 同時實際執行 self-hosted 與 GitHub-hosted Node regression，以免浪費資源。Browser regression 不需要參與這個切換，因為它本來就是 GitHub-hosted。

## Browser regression 判斷

Browser regression **不是每個 PR 都必跑的驗證**。是否需要，把判斷建立在本次變更是否影響 browser-observable contract，而不是因為 workflow 存在就一律視為必要。

通常需要 Browser regression：

- UI / Presentation 的實際呈現、DOM 結構或互動行為改變；
- browser bootstrap、頁面載入、瀏覽器事件或只能在 browser runtime 驗證的整合改變；
- simulation semantic 的結果會直接改變玩家可見 browser 行為，而且 Node regression 無法充分覆蓋該投影。

通常可以省略 Browser regression：

- 純文件變更；
- 純 Node-side tooling / regression orchestration；
- 不影響 browser runtime 的 internal refactor；
- 已由 Node contract guards 完整鎖定、沒有玩家可見 browser 行為改變的版本／architecture 維護。

如果 Browser workflow 因 PR trigger 自動排起來，但本次變更不需要 browser validation，可以取消該 run；取消本身不代表驗證失敗，但完成報告要明確記錄「Browser regression 未執行／取消，原因是本次變更不涉及 browser-observable contract」。若 branch protection 或 required checks 未來要求 Browser regression，則以當時 repository policy 為準，不得用本節繞過 required check。

## Preflight 通過後仍要做什麼

Preflight 只代表便宜的結構性錯誤已排除。之後仍需依變更風險執行：

- authoritative owner 的 focused regression；
- 直接 consumer regressions；
- 必要的完整 Node regression；
- 涉及 UI / browser behavior 時的 Browser regression。

不要把 `PR preflight: ok` 宣稱成完整 Node / Browser runtime 驗證。
