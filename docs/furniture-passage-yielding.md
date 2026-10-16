# Furniture Passage Yielding v1

Current capability marker: `furniture-passage-yielding-v1`.

## Purpose and boundary

Furniture Passage Yielding 是既有 navigation / Action execution 的 bounded recovery capability，不是新的高階 Need / Intent，也不是 generic Furniture relocation。v1 只處理明確 opt-in Furniture 從 current displaced placement 回到唯一、固定的 authored `parkedPlacement`；不接受任意 destination，不建立 pushing physics、force / impulse / mass、carrying、layout solver 或 room-to-room relocation。

原本 Action / Active Intent 仍是角色「為什麼做」的 canonical motive。Passage Yielding 只保存 execution-recovery decision identity 與當下 evidence，成功後重新查詢原 navigation goal。

## Authoring contract

Current World Authoring generation = `world-authoring-v17`。Furniture Definition generation 維持 `furniture-definitions-v13`；Passage Yielding 是 Furniture instance opt-in，不改 Definition schema。

- `passageYielding:true` 才啟用 capability。
- `parkedPlacement` 是穩定 authored home reference，不從 runtime current position 每 tick 重算。
- explicit `parkedPlacement` 優先；否則只有 `orientationSemantics:'facing'` 的 Furniture 可用 facing 前方一格作 default。
- v1 parked placement 必須 same layer、cardinal 1-cell translation、orientation unchanged。
- 已經 parked 的 Furniture 不再形成 candidate；Passage Yielding 也不能把 parked Furniture 拉出來。

Editor 只 author / readback 同一份 World Authoring contract；runtime legality 仍在執行時重新判斷。

## World / geometry legality

Furniture current placement 與 geometry 唯一存在 `state.furniture[furnitureId]` 的 current resolved Furniture。Runtime placement transaction 重新 resolve canonical footprint / slots / solids / surfaces / display geometry，並同步 `map.tiles[*].furnitureIds`、persistent `floorGeometry` 與 room Furniture projection。Map rendering、Spatial、Route 與 visual opacity 都消費新的 current geometry，不建立 parked-chair 特例或第二份位置 truth。

Destination 與 current→parked transition 都使用 resolved 3D `spatial.solids`：

- destination 不得越界、進入 non-floor / structural blocker，或與其他 Furniture solid 非法相交；
- transition 必須通過 structural boundary / Door legality；
- v1 以一格 straight-line swept solid volume 驗證，不模擬施力或輪子；
- table top、chair seat/back/legs 等都只依實際 solid overlap 判斷，不使用 Furniture overall height 或另建 under-table clearance truth。

## Dependency legality

v1 對未定義 relocation semantics 的依賴全部 reject：

- Slot occupant / Agent posture binding；
- Slot reservation；
- supported Object (`supportId`)；
- contained Object (`containedBy`)；
- durable `usageAssignments[]` / `claimEligibility[]` / `usageClaims[]` target relation。

不搬 follower、不遷移 containment、不轉移 claim。

## Observation boundary

Furniture blockage 是 World truth，但 Agent candidate formation 必須先取得 query-time Furniture visual sensory evidence。Current Perception 增加 Furniture target seam：

- target sight projection 從 current resolved Furniture solids 派生；
- opacity projection讀 current runtime wall + Furniture geometry；
- target-specific query 排除 target Furniture 自己的 opaque solids，保留 wall 與其他 Furniture occluders；
- 不 fake Furniture as Agent，不使用 UI observation 作 cognitive truth，不建立 persistent `visibleFurniture[]`。

Current exposed Perception markers：

- `perception-visual-los-v3-runtime-furniture`
- `perception-visual-sight-samples-v2-furniture-target`
- `perception-visual-availability-v2-furniture-target`

底層 Agent-only foundation modules 與其 isolated regressions 保留自己的既有 generation；Furniture seam 是 production composition extension。

## Candidate and execution lifecycle

Production chain：

1. existing Action 有 navigation goal；
2. normal `walk` route unreachable；
3. 角色實際觀察到 opt-in Furniture；
4. dependency + destination + swept transition legal；
5. canonical Furniture contact geometry 在 translation 反側提供可達 interaction position；
6. non-mutating hypothetical parked geometry 讓原 goal 的 normal walk 重新 reachable；
7. production auto-route query 同步 arm bounded recovery，避免 core route failure 先 abort 原 Action；
8. locomotion 導向 interaction position；
9. execution-time 重新檢查 goal、walk blockage、dependency、geometry、interaction 與 counterfactual；
10. canonical runtime Furniture placement transaction；
11. exactly one canonical `furniturePassageYielding` World Event；
12. 原 Action / Intent 下一次 route query 消費新 geometry 繼續。

如果正常 walk route 本來就可行，完全不形成 candidate。v1 不做 detour-length threshold。

## Interaction geometry

Passage Yielding 不使用 Furniture center 當接觸座標。它重用 `SP.supportContactNodes(...)` / canonical Furniture interaction geometry，再依 translation vector 只保留移動方向反側的 contact candidate，並要求角色真的能以 normal walk 到達。沒有合法 contact plan 就不是 executable candidate。

## Version ownership

- overall runtime / Presentation：`src/release.js` 是唯一 current overall version owner；本 release 為 `11.62.0-furniture-passage-yielding`。
- World Authoring：`world-authoring-v17`。
- Furniture Definitions：維持 `furniture-definitions-v13`。
- Route：維持既有 own generation；Passage Yielding 不把 overall release literal 複製成 Route version。
- Passage Yielding capability：`furniture-passage-yielding-v1`。

## Regression ownership

`tests/furniture-passage-yielding.mjs` 鎖定 authoring fixed parked reference、bounded placement validation、dependency reject、3D destination / sweep、observed boundary、counterfactual、opposite-side contact、runtime transaction projection consistency、current runtime visual opacity、single canonical Event、original Intent preservation 與 production route-query recovery arm。

`tests/browser-furniture-passage-yielding-qa.mjs` 鎖 Editor author/readback 與 runtime Map 對 current Furniture placement 的 presentation projection。Browser assertion 不取代 Node geometry / semantic regression。
