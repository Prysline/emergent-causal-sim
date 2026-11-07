# Versioning Contract — Current

目前 overall runtime marker：`11.65.0-character-traits-foundation`。

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

- Tidying / Put-away：`tidying-put-away-v1`

- Furniture Passage Yielding：`furniture-passage-yielding-v1`
- Perception Visual LOS production composition：`perception-visual-los-v3-runtime-furniture`
- Perception Visual Sight Samples production composition：`perception-visual-sight-samples-v2-furniture-target`
- Perception Visual Availability production composition：`perception-visual-availability-v3-object-point`
- Activity Continuity：`activity-continuity-v1`
- Nearby Placement：`nearby-placement-v2-object-release`
- Pickup Interaction Geometry：`pickup-interaction-v2-containment`
- ordinary-object interaction：`ordinary-object-interaction-v2`
- Daily Life Routine：`daily-life-routine-v1`
- Daily Life Learned Habit：`daily-life-learned-habit-v1`
- Standing Responsibility：`standing-responsibility-v1`
- Mental Regulation：`mental-regulation-v4`
- Action / Human Social Response：`11.51.0-activity-concurrency`
- Interruption：`11.12.4-activity-continuity`
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
- Character Traits：`character-traits-v1`
- World Authoring：`world-authoring-v19`
- Furniture Catalog：`furniture-definitions-v13`

## Current release impact

`11.65.0-character-traits-foundation`：`character-traits-v1` 收斂既有 sparse Agent traits 的 key、type、range 與缺值規則，`world-authoring-v19` 確保 authoring validation 與 runtime admission 共用契約；Engine／Deliberation／Appraisal 的既有 consumer 與 live state validator 亦讀同一 owner。三位居民既有 authored 值與各公式保留；缺少 `careful` 時，held-object route weights 改沿用 precision 的 `.55`（舊路徑為 0）。未新增 Trait、Need、Action、Decision Option 或其他 subsystem generation。參見 [`character-traits.md`](character-traits.md)。

前一個 release：

`11.64.0-observed-environmental-cleaning` 修正既有 Human `cleanFloor` 的 World / Agent observation 邊界：從同一 Floor Node 的即時液體接觸（>0.2）導出初始 Decision、Soft Reconsideration、Hard Replanning 與 canonical Action 目標，執行前重新驗證 Actor / Node / 液體；透過 Spatial Environment API 移除，只有實際移除才產生 World Event。遠距濕度不構成 Agent knowledge，也不擴充 Furniture Surface cleaning、Perception 或衛生 Need。使用者可觀察行為已改變，overall / derived Presentation 前進；Spatial Environment / generic Deliberation / Decision Evidence / Intent schema / World Authoring / Perception own generation 均維持原值，未新增 own marker。

`11.63.0-tidying-put-away` 以 World Authoring v18 author canonical `objectStorageAssignments[]` 與各 Resident `initial.knownObjectStorageAssignmentIds[]`，runtime 初始化由 `tidying.schema` order 1492 對應 World / Agent-private truth。Perception Visual Availability own generation → `perception-visual-availability-v3-object-point`，只對已知 assignment 的 exposed Free / Supported Object 提供狹義 point-target visual evidence。第一個 production consumer 是 Human 自主 `putAwayObject`：透過既有 Decision Option Provider / Deliberation / Engine Action 與 canonical Object held / containment transitions 形成 World Event；緊急中斷沿用原 cleanup；沒有新增 soft reconsideration、Activity Continuity episode 或 Editor GUI。World Authoring → `world-authoring-v18`；Object Handling / Spatial / Physical / generic Deliberation / Intent / Resources 等 own generation 不假升。Default world 無指定 storage assignments。

前一個 `11.62.0-furniture-passage-yielding` 建立 Furniture Passage Yielding v1：World Authoring instance contract 增加明確 opt-in `passageYielding` 與固定 `parkedPlacement`，own generation → `world-authoring-v17`；Furniture Definitions schema 未改，維持 `furniture-definitions-v13`。Perception production composition 增加 current resolved Furniture target / runtime opacity projection，對外 markers 前進至 `perception-visual-los-v3-runtime-furniture`、`perception-visual-sight-samples-v2-furniture-target`、`perception-visual-availability-v2-furniture-target`。Passage Yielding recovery 只在 normal walk unreachable、Furniture 已觀察、opposite-side interaction 可達、且 parked hypothetical 恢復 walk 時成立；成功用 narrow runtime Furniture placement transaction 更新 current resolved geometry 與 projections，並產生一筆 canonical World Event。Route own generation 維持 `11.38.0-carried-handling-risk`，Action / generic Deliberation / Decision Evidence / Locomotion / Furniture Definitions 不假升版。詳細 contract 見 [`furniture-passage-yielding.md`](furniture-passage-yielding.md)。

前一個 `11.61.0-activity-continuity` 建立 Generic Activity Continuity v1：新增 Agent-private `activityEpisode` canonical owner，第一個 production consumer 只有 `read`。Episode 只在 realized reading progress 後建立；emergency preemption 可把同一未完成 episode 轉為 `suspended`，resume 則只建立 bounded normal Decision Option，仍經既有 Deliberation。進行中 progress 仍由 live Action 唯一持有；只有 Action 被中斷且不存在時 suspended episode 才暫存 progress，resume 新建 Action 後再把 progress 移回 Action。新增 beforeTick 790 / 1250 與 afterTick 75 named hooks，因此 hook ordering / same-tick visibility 屬本 release semantic impact。Activity Continuity own generation = `activity-continuity-v1`；Interruption own generation → `11.12.4-activity-continuity`。Action 維持 `11.51.0-activity-concurrency`、generic Deliberation / Decision Evidence 維持 `11.48.1-sleep-perception-approach`、Runtime Hook Pipeline infrastructure 維持 `runtime-hook-pipeline-2`；Mental Regulation、Routine、Learned Habit、Standing Responsibility、Spatial / Route / Interaction Geometry 都不假升版。詳細 contract 見 [`activity-continuity.md`](activity-continuity.md)。

前一個 `11.60.0-standing-responsibility` 建立 Standing Responsibility v1：World Authoring 新增 durable `resourceResponsibilityAssignments[]` canonical relation，Agent-private 只保存 `knownResponsibilityAssignmentIds[]` canonical refs；authored assignee DAY 0 知道自己的 assignment。第一個 production consumer 是既有合法 `restockContainer` option，Standing Responsibility 只追加最多 `+8`、含 canonical assignment ID 的 bounded contributor，不建立第二套 candidate、objective necessity、Action 或 Active Intent。World Authoring own generation → `world-authoring-v16`；Standing Responsibility own generation → `standing-responsibility-v1`；overall / Presentation → `11.60.0-standing-responsibility`。Resources、Daily Life Routine、Daily Life Learned Habit、generic Deliberation / Decision Evidence 與 Runtime Hook Pipeline public contract 未被重新定義，因此維持原 generation。

前一個 `11.59.0-learned-habit` 建立 Daily Life Learned Habit v1：新增 Agent-private `learnedHabits` truth、`read / eat / talk` realized-experience classifier、`episodicMemoryCreated` order 50 consolidation 與既有合法 Decision Option 的 bounded score contribution。Daily Life Learned Habit own generation = `daily-life-learned-habit-v1`；Memory / Usage Preference 維持 `11.42.0-usage-preference-sleep`、Daily Life Routine 維持 `daily-life-routine-v1`、generic Deliberation / Decision Evidence 維持 `11.48.1-sleep-perception-approach`、Runtime Hook Pipeline infrastructure 維持 `runtime-hook-pipeline-2`，因為這些 owner 的 public contract 未被假性換代。Learned Habit 不保存 exact target identity、不建立 candidate / Action / Active Intent，也不讓 infeasible Activity 變合法。

前一個 `11.58.0-object-containment` 建立 Object containment v1：World Authoring 當時前進至 `world-authoring-v15`、Furniture Catalog → `furniture-definitions-v13`、Pickup Interaction Geometry → `pickup-interaction-v2-containment`、Editor ordinary-object authoring → `editor-ordinary-object-authoring-v3`、Spatial Observability → `11.58.0-spatial-containment-observability`。此段是 historical release evidence，不代表 current World Authoring marker。Spatial Identity / Route、Physical、Agent Carry、Resources 與 Sleep Slot Conflict 不因該 release 假升版。

前一個 `11.57.0-sleep-animal-conflict` 修正 preferred Sleep Slot conflict 的 Animal resolution 與 escalation 語意。

- `sleep`、`rest` 與 Human `meal` 仍先以 canonical `bestSlotApproachNode(..., objective:'traversalCost')` 選擇 chooser-time navigation witness；這個 winner 是 ephemeral derived result，不是跨 tick 唯一抵達真相。
- Action execution 每 tick 以 current `slotApproachNodes()` 重新確認 target Slot 的合法 approach set。若 actor 已在其中任一 node，movement phase 直接轉入 `settle` / `sit`，不再為了較早選到的 stale witness 額外繞行。
- same-tick semantics 保持原本兩階段：arrival tick 只改 phase；真正坐下／躺下在下一個 core tick進行，並重驗 activity capability、kind、Pose fit、availability / reservation 與 current Slot approach。
- 沒有合法 approach 時仍不得 settle；Human meal 的 `standForMeal` fallback 不變。
- 本 release 不改 Furniture Definition / Slot schema、`approachEdges`、Spatial / Route geometry、`bestSlotApproachNode()` ranking 或 Sleep preferred-Slot conflict policy。

Version impact：overall / Presentation → `11.57.1-slot-approach-arrival`。Sleep Slot Conflict own marker維持 `11.57.0-sleep-animal-resolution`；Generic Deliberation / Decision Evidence 維持 `11.48.1-sleep-perception-approach`；Spatial Traversal / Route維持 `11.38.0-carried-handling-risk`。Action、Furniture、Locomotion、Contact、Usage Preference等 subsystem generation 都未改自身 contract，因此不為這個 shared Engine consumer correction 假升版。

前一個 `11.57.0-sleep-animal-conflict` 的 Sleep preferred-Slot conflict contract 全部維持 current：wake success 與 occupancy resolution 仍分離；同一 requester Sleep Decision + preferred Slot + observed occupant episode 內以 `sleepSlotConflictOutcome` causal evidence 抑制 repeat wake，不保存 retry counter；awake Animal 的 move-away仍由 directed World Bid → Animal-owned observation → `yieldSleepSlot` Intent / `wander` Action完成，Sleep requester不直接改寫 Animal position；sleeping relocation ranking仍只讀 requester 可知 observation、公開 Embodiment defaults、canonical Slot legality、objective sleep quality與 requester relocation cost，不偷看 occupant-private Usage preference或 hidden instance physical truth。

前一個 `11.56.0-object-unification` 的 Object identity / Resource-container capability / generic Object handling contract 全部維持 current：concrete physical item 仍只存在 `entities.objects / state.objects`，`Agent.held` 仍是唯一 held physical Object relation，Nearby Placement 仍為 `nearby-placement-v2-object-release`。該 release 不做 Object containment / bookshelf runtime，也不做 Food Object migration；current `contents.food` 繼續作 Resource-container capability 的 production representation。

詳細 Furniture Passage Yielding 語意見 [`furniture-passage-yielding.md`](furniture-passage-yielding.md)；Activity Continuity 語意見 [`activity-continuity.md`](activity-continuity.md)；Standing Responsibility 語意見 [`standing-responsibility.md`](standing-responsibility.md)；跨 subsystem 語意見 [`architecture.md`](architecture.md)。

## Consistency responsibility

Release bump 應核對：`src/release.js`、runtime / Presentation derived version、README、`docs/architecture.md`、本頁、semantic-owner current doc，以及 dedicated preflight / version ownership regression。若行為 browser-observable，執行必要 Browser regression。

PR head 每次改變後，舊 head 的 CI 結果不得直接套用到新 head。

Historical version narrative 保存於 `docs/archive/versioning-through-11.53.md`；Historical literal 不因新 current release 全域替換。