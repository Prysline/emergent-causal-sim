# Development Workflow

本文件定義本 repo 的 PR lifecycle：**Preflight → PR / CI Integration → Merge Gate → Post-merge Closeout**。

它不取代各 subsystem 的驗證契約，也不把文件流程變成 merge / deploy 授權。`docs/pr-preflight.md` 與 `tests/pr-preflight.mjs` 仍專門負責推 PR 前的低成本 Preflight。

## 1. Preflight

推 PR 前先依 `docs/pr-preflight.md` 執行：

```bash
node tests/pr-preflight.mjs
```

`PR preflight: ok` 只代表低成本結構性 guard 通過，不代表完整 Node / Browser runtime 驗證完成。

## 2. PR / CI Integration

候選變更進入 PR 後，驗證證據必須能追溯到實際 **exact PR head**。

- 舊 head 的成功不得套用到新 head。
- focused regression、direct-consumer regression、完整 Node regression 與 Browser regression 依變更風險選擇。
- Browser 是否必要，以 browser-observable contract 判斷；若 repository policy 將它設為 required check，則以當時 policy 為準。
- CI 狀態必須區分 `queued`、`in_progress`、`success`、`failure`、`cancelled`，不得用「有跑」替代結果。

### Branch provenance

工作 branch 的歸屬資訊不得只存在於 assistant conversation state。任何為同一 workstream 建立的正式、staging、temp、retry、clean、rebuild 或 final branch，都必須在建立當下留下可由 GitHub durable state 重建的共同 work identifier。

建議直接讓 branch 名稱攜帶共同 prefix，例如：

```text
work/routine-slice-a/staging-01
work/routine-slice-a/rebuild
work/routine-slice-a/final
```

branch 建立本身就是 provenance write；不得先建立無法辨識歸屬的 branch，再依賴後續聊天記憶補記。PR / handoff 可以再記錄 work identifier 與 canonical branch，作為第二份 durable evidence。

## 3. Merge Gate

「可以合併」與「已經合併」是不同事實。

Merge 前至少確認：

- PR final head；
- 必要 exact-head 驗證；
- mergeability；
- 未解決 blocker；
- 操作授權。

Merge 後重新確認 PR merged state、merge commit 與 current `main`；不得因 PR closed 或操作已送出，就推定 current-main integration 已完成。

## 4. Post-merge Closeout（收尾）

**Closeout** 是把已完成的 implementation 從「PR / branch 上已驗證」轉換成「current-main、current documentation、active work state 與 handoff 彼此一致」的流程。

Closeout 至少包含：

1. 確認 PR 是否真的 merged、final head、merge commit 與 current `main`。
2. 核對 post-merge current-main Node / Pages / deploy / release 等實際狀態；沒有執行、仍在排隊或已取消時如實記錄，不補成 success。
3. 同步直接相關 current authority / navigation / factual status；不得趁收尾改寫未獲核准的 simulation semantic、需求或優先順序。
4. Active TODO 若完成條件已進 current `main`，將完成項移出，只保留真正尚未完成的 deferred / handoff。
5. Completed TODO Archive 留精簡完成紀錄：完成範圍、merge / 驗證證據、version boundary、deferred / handoff、authority link。
6. 依本 workstream 的 durable work identifier 找回其完整 branch inventory，移除已沒有保留理由的多餘 branch；不得只檢查 final branch 或目前 PR head。
7. 完成報告分開列出 branch / commit / PR / CI / deploy / Notion 的實際狀態，以及未執行檢查、阻礙與未確認事項。

## 5. 「收尾」與「合併和收尾」

- 使用者說 **「收尾」**：要求執行 Closeout，但不自動授權 merge。PR 尚未 merge 時，只能整理既有權限涵蓋的完成狀態與待處理項。
- 使用者說 **「合併和收尾」**：在當前工作已具備 merge 所需條件且沒有新的 blocker 時，表示 merge 與後續 Closeout 都在該次指示範圍內。
- Workflow requirement 與 operation permission 分離：Closeout 要求檢查 deploy / branch cleanup 等狀態，不代表在沒有相應授權時可以自行 deploy、merge 或執行其他不可逆操作。

## 6. Active TODO 歸檔不變量

> 若 Active TODO 的完成條件已進 current `main`，且剩餘工作已不再屬於該完成條件，完成項必須自 Current TODO 移除並留下 Completed TODO Archive 紀錄。

不得只把舊項目標成 done 後長期留在 Active TODO。後續新工作若有自己的完成條件，應成為新的 Active TODO / handoff，而不是讓舊 merge gate 繼續占位。

## 7. Branch provenance recovery 與 cleanup 安全規則

正常 Closeout 只處理**本 workstream** 的 branch inventory，不應因為某一窗收尾就把其他平行 workstream 的 branch 納入清理判斷。

正常 discovery 順序：

1. 由 durable work identifier 列舉本 workstream 的所有 remote branches；
2. 以 PR head、handoff 與已知 canonical/final branch 交叉確認；
3. 對這個 inventory 逐條判斷 `preserve`、`safe-delete` 或 `uncertain`。

若聊天中斷、換窗或上下文遺失，使 work identifier / provenance 無法直接取得，可以使用 repository-wide branch inventory 作 **recovery mechanism**，但目的只是在重建本工作 branch 的歸屬，不是審核或清理整個 repo。

只有在全部條件都能確認時才刪除 branch：

- branch 已 merge，或其有效產品工作已被 current `main` / canonical final implementation 完整取代；
- 沒有 open PR 仍引用它；
- 沒有仍需保留的獨立未整合工作；
- 沒有明確的保留、比較、hotfix 或 handoff 理由。

`ahead of main` 不能單獨證明 branch 必須保留。若 final implementation 是重建 commit history，舊 staging branch 即使仍顯示 ahead，也可以在有直接證據證明其有效工作已被取代後列為 `safe-delete`。

任一條無法確認時保留 branch，並在完成報告列為 `uncertain` / 待處理；不得因「收尾」而盲目刪除 branch。

Closeout 的完成聲明應是「本 workstream 的 branch cleanup complete」，除非任務本身就是 repository-wide branch cleanup，否則不得宣稱整個 repository 沒有殘留 branch。

## 8. 證據與狀態用語

完成報告與 archive 至少分辨：

- **local / branch implementation complete**：候選變更完成，不代表已 push / merge。
- **exact-head validation success**：特定 PR head 的指定驗證成功。
- **merged**：PR 已有可確認 merge commit 且 current `main` 已包含該整合。
- **post-merge current-main validation**：merge 後 main 上實際執行的驗證結果。
- **deployed / released / tagged**：只有有對應外部狀態證據時才使用；Pages success 不得泛化成其他 deploy / release 已完成。
- **Notion synced**：只代表文件已同步，不等於 repo commit / PR / CI / deploy 完成。

## 9. 自動化邊界

適合確定性自動化：

- source syntax；
- workflow architecture；
- production source-load architecture；
- 已知 current marker consistency；
- regression registration / retired path；
- 唯讀 lifecycle evidence collection；
- 依 durable work identifier 列舉本 workstream branch inventory。

仍需人工／模型判斷：

- semantic change 是否要求 version bump；
- Browser regression 是否必要；
- authority 是否需要更新；
- Active TODO 是否真的完成；
- deferred / handoff 的產品意義；
- branch 是否安全可刪；
- provenance recovery 後某 branch 是否真的屬於本 workstream；
- cancelled CI 是否可接受；
- merge / deploy 權限。

第一版不新增會自行 merge、deploy、刪 branch、改 TODO 或替人做 semantic completion 判斷的 automation。
