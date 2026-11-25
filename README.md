# Emergent Causal Simulator

湧現式因果模擬器：以少量、底層且可組合的規則，產生可追溯的因果鏈與湧現行為。

目前 runtime marker：`11.81.0-food-r4a2-pantry-access`。

R4-A2 固定收納取料：既有 `cookMeal` 可在當下可觀察／接觸的固定收納處實際檢視後，選擇合法完整食材，經單一 `held` 搬到指定合法支撐面，再延續原本 Cooking。遠端未知內容不提供食材 ID；食材容量、接觸與預約重驗，取出及放置事件連至既有料理因果鏈。此切片不代表 R4-B 自主外出補給或 R4-C 持續供餐完成。詳見 [`docs/food-r4a2-pantry-access.md`](docs/food-r4a2-pantry-access.md)。

Floor pickup posture recovery：Human 在真實 Floor 拿起普通 Object 且採 kneeling／prone 時，既有 Engine Action 會於下一 tick 以當下攜物／站立幾何確認合法性，合法才支付一次 Locomotion mode transition 恢復 standing 並繼續原 Action；低矮空間不強迫站立，Supported／Contained pickup 與普通 crawl 抵達不受影響。此變更不加入新的移動姿勢、物品位置真相或跨 Agent 觀測權威。詳見 `docs/interaction-geometry.md`。

R4-A1 Generic Physical Ingredient Logistics：正式 B 世界保留 `basketA` 兩手大籃（24 L、0.8 kg），另有 `basketSmallA` 單手小籃（18 L、0.6 kg）；`carryGeometry`、容器 capacity 和籃體 `physicalVolumeCubicMeters` 各自保持單一來源。既有 R3 `externalSupply` 可指定任一合法普通 Object carrier。新明確規劃的 `transferContainedObjects` Engine Action，只有在自身持籃且剩一手、已合法接觸檢視來源／目的地、容量和預約重驗通過時，才逐件原子改寫同一 `containedBy` 並產生 canonical World Event；雙手持籃必須先依 canonical placement 放下，才以既有取物／搬運／contain lifecycle 入櫃。遠距 World facts 不構成 Agent knowledge。此 Slice 不含自主補貨決策、固定櫃取料至指定料理檯面及 Cooking 整合（R4-A2）、R4-B/C、R5 或 R6。詳見 `docs/food-r4a1-generic-logistics.md`。

Physical Meal seating correction：Human 直接吃實體 Meal 或放下真正餐盤後，優先使用合法可達且具有當下 `eatFrom` 接觸的 Furniture Slot；經重驗才坐下並產生 `sitForMeal`。座位不可用時仍可在合法接觸位置站著吃，沒有第二套 Chair reach、Meal inventory 或舊 Resource Food 擴張。

Food Legacy Default Isolation Slice 0：正式 B 住宅不再包含舊 Resource Food 的餐盤、meal tray、food pantry、logistics basket 或其補貨責任；保留普通 `readyMealF0`、Ingredient A、料理鍋與 Serving plates。歷史 Resource Food 模型在 base authoring 保留 `legacyResource*` 身分供遷移與追溯，但正式 Editor 新增目錄已移除四個舊 Food presets；水／酒 Resource presets 仍可用。舊 Food amount-based production paths 待後續 R5 退役，不再接受功能擴張。UI 分別投影 Ingredient 件數與 Meal 公克數，不再以舊 `contents.food` 單位宣稱正式食物庫存。R2 已建立普通搬運籃、固定食材櫃及物理體積容量；R3 已加入有限場景外實體食材供應，居民自主取得食材與持續供餐仍屬後續 R4。

Logistics carrier drop lifecycle：當實際 completed movement edge 產生合法 `containerDrop`，依賴該容器的 `restockContainer`／`externalSupply` 會在同一 tick 經既有 abort lifecycle 中止，並讓中止 World Event 引用掉落事件；實際掉落位置、剩餘內容物及已確定發生的事件不回滾。意外掉落機率與其他 Action 不因此改變。

Core Default World B：正式預設住宅採用有實際隔間與臥室門的 16×10 公共／私人分區格局，配置可接觸的瓦斯爐、廚房櫃台、料理鍋及 Ingredient A；正式餐盤 `plateA`／`plateB` 均使用 Food v2 普通 Object 盛餐契約，舊 Resource 餐盤不出現在正式預設場景。舊 Resource 餐盤 `legacyResourcePlateA/B` 與其他 `legacyResource*` food containers 僅供獨立 Legacy 情境；正式 B 不再混用。完整物理供應鏈仍待後續 slices。

Meal Serving & Physical Transfer v1：既有 `eat` Action 在可合法觀察到 Meal 與可用明確外露普通餐盤時，可依真實公克分裝、由 `Agent.held` 搬運並按 canonical nearby placement 放下，再由自己或其他居民以既有 `eatingMeal` 逐 tick 食用。部分轉移建立新 Meal Object；全量轉移保留身份，單一 `meal.edibleMassGrams` 與 Object `containedBy` 不設鏡像庫存；Object／Spatial／Perception 只對可合法進食的外露餐盤提供受控質量與接觸投影。Legacy `contents.food` 仍是不同 Resource 單位；並不包含 Core Default World、主動送餐、D2 或原料持續補給。詳見 [`docs/food-meal-serving.md`](docs/food-meal-serving.md)。

本版修正合法跪爬／匍匐姿勢缺少 static PoseEnvelope 時，Cooking / Tidying 視覺候選與直接 Action revalidation 可能中止 Engine tick 的跨系統問題。依 canonical Embodiment / Physical profile 確認視覺前置證據；缺少時不產生依賴該證據的行動，但 Perception API 仍明確失敗。沒有新增 kneeling / prone 3D geometry、預設住宅、Serving 或 D2 行為。

前一個 release 完成 Character Traits Foundation v1 Slice B1：Social Trait 對 `needs.social` 的自然形成使用 bounded multiplier `.75 + .5 * social`；主動 `talk`、`seekHuman` 移除直接 social Trait 加分；Human／Animal 收到邀請的 response score 繼續保留獨立 social Trait 傾向，並統一 canonical 缺值 `0`／非法值 fail-closed。僅更動受影響的 Social Response generations，既有 World Event／Agent-private Need／Social Bid 邊界、互動緩解、其他 Trait、World Authoring 和 Deliberation 沿用既有 owner。詳見 [`docs/character-traits.md`](docs/character-traits.md)。

Food autonomous Ingredient acquisition v1：居民依當下視覺、實際支撐表面和 Spatial 可達性，可在 kitchen-counter 等合法 Furniture 上自主取得完整 Type A Ingredient，搬到指定的合法料理鍋中，逐 tick 完成原有單批 D1 料理；原始 sourceId 與 potId 固定、重驗，pickupIngredient → loadPot → complete 保留唯一 World Event 因果鏈。Meal 仍在爐面交由既有 F0 eat 消費，尚未做盛餐、D2、外部 Ingredient 補給或核心住宅整合。詳見 [`docs/food-autonomous-ingredient-acquisition.md`](docs/food-autonomous-ingredient-acquisition.md)。

Cookware Eligibility v1：普通 Object 以明示的 `cookingEligible` 暫定功能資格取代 `cookingPot` 物件種類判斷。Cooking 先對單批真實 Ingredient、既有 `cookingStation` 與所有可用容器完成容量／可視／接觸／預約檢查，確定性選定 `potId` 後從 Action 建立到每 tick、真實裝鍋和完成均禁止換鍋。World Authoring v23／runtime validator 共用資格錯誤契約；單一 `containedBy`、`loadPot → complete` Event 因果鏈不變。未實作 D2、多料理方式、盛餐、外出供料或預設住宅。詳見 [`docs/food-cookware-eligibility.md`](docs/food-cookware-eligibility.md)。

Food v1 Slice F1-B2：Cook Action 使用既有 Object pickup 與 `containHeldObject`，把可觀察、完整的 Ingredient 真正放進有界的可搬運鍋具 Object；內含物僅用 `containedBy` 保存，物理負重由既有 Object Handling 派生。鍋具裝入事件是料理完成質量轉換的因果前驅。完成時仍由 F0 Meal 出現在同一瓦斯爐合法表面，沒有假設 Meal 已可被鍋具搬走。詳細見 [`docs/food-v1-f1b2-pot-loading.md`](docs/food-v1-f1b2-pot-loading.md)。

Food v1 Slice F1-B1：新增 kitchen gas-stove、kitchen-counter Furniture 與鍋子普通 Object 的實際工作位置；沿用 Decision Option / Engine Action / Spatial，讓居民在合法觀察與接觸後將完整 Type A Ingredient 等重轉換為同位置 F0 Meal，記錄投入／產出／加工流出與可追溯 World Event，並由現有 `eat` 消費。首個鍋具為必需工作物件，尚未模擬鍋內收納；Food 供餐、舊 Resource 移除與預設完整場景另有後續 Gate。詳見 [`docs/food-v1-f1b-cooking.md`](docs/food-v1-f1b-cooking.md)。

Food v1 Slice F1-A：每份完整 Ingredient 是獨立 Object；Ingredient Type A 在建立時固定預設質量／有效密度，唯一實際物理質量放在 `handling.massKg`，公克與體積由 query-time 推導。沿用既有可搬運容器與 Engine 的放入、拿取、負重、Spatial；未加入 Cooking／Meal 盛盤、外出補給食材化或移除 `contents.food`。詳見 [`docs/food-v1-f1a-ingredient.md`](docs/food-v1-f1a-ingredient.md)。

Object Storage Volume R2（current）：單一 `SimObjectStorageVolume` 從 Ingredient 質量／密度、Meal 可食公克／有效密度或一般 Object 的 `physicalVolumeCubicMeters` 派生物件物理體積；可搬普通籃子與固定 Furniture 共用 `objectStorage.capacityCubicMeters` 合法性，只由子物件 `containedBy` 追蹤存放。 `maxMassKg/maxItems` 不再是 Storage 容量 gate，質量仍派生供搬運；無 3D packing、巢狀容器或舊 Food Resource 擴張。詳見 [`docs/object-storage-volume.md`](docs/object-storage-volume.md)。

Historical Movable Object Containment v1：普通 Object 繼續使用唯一 `containedBy` 關係，可指向明確 opt-in 的可攜 Object 容器；容器不保存第二份子物件清單。既有 Spatial、Object Handling、Engine、Resources、Inspector 共同消費此狀態，並以 `objectStorage.maxItems / maxMassKg` 和已確立的普通 Object `handling.massKg` 做有界承載／派生負重。Food／Meal 的質量適配、巢狀容器與散落物理維持後續 Gate。詳見 [`docs/movable-object-containment.md`](docs/movable-object-containment.md)。

Food v1 Slice F0：ready-to-eat Meal Object 以公克為唯一剩餘可食庫存；既有 `eat` Action 每有效 tick 攝取最多 50g，按真實攝取量降低 Hunger（0.08/g），與 legacy `contents.food` Resource amount 嚴格分離。詳見 [`docs/food-v1-f0.md`](docs/food-v1-f0.md)。

前一個 release 建立 Character Traits Foundation v1 Slice A：`character-traits-v1` 統一既有稀疏特質、型別與範圍驗證、read-time default，以及 Engine／Deliberation／Appraisal consumer。World Authoring 升為 `world-authoring-v19`；`careful` 缺值統一使用原 precision 路徑的 `.55`，原有居民的 authored 值不變。未新增 Trait、Need、活動或第二套決策 authority。詳見 [`docs/character-traits.md`](docs/character-traits.md)。

前一個 release 修正 Human `cleanFloor`：只有腳下同一 Floor Node 的液體量超過 0.2，才會成為自主 Decision、Soft Reconsideration 與 Hard Replanning 的合法目標，不再由全圖濕度推定 Agent 知識。執行前重驗目標與液體，透過 Spatial Environment API 清除；實際移除液體才建立 World Event。未加入鄰近視覺掃描或新衛生 Need，Generic Deliberation / Spatial own generation 不假升。

前一個 release 建立 Tidying / Put-away v1：World Authoring v18 明確 author `objectStorageAssignments[]` 與 Resident 初始已知 refs，Agent 只從自己的已知 assignment 出發，依 query-time Object visual availability 形成 bounded put-away Decision Option；正式 Action 逐步拿取、搬運並存入指定 `objectContainment:true` Furniture。canonical Object location 仍由原 Engine/Spatial 處理，中斷不 rollback；default world 不配置 home、Editor GUI 未擴張。Own generation `tidying-put-away-v1`，Perception Visual Availability `perception-visual-availability-v3-object-point`。

前一個 release 建立 Furniture Passage Yielding v1：明確 opt-in 的 Furniture 可在角色 normal walk route unreachable、角色實際觀察到阻塞 Furniture、正確反側 interaction position 可達，而且固定 `parkedPlacement` 的 hypothetical geometry 能恢復原 walk goal 時，作為既有 Action / Intent 的 bounded execution recovery 收回一格。Runtime move 使用 resolved 3D solids 做 destination + swept transition legality，並以單一 placement transaction 同步 current Furniture geometry、Tile membership / floor geometry 與 presentation；Perception Furniture target 讀 current runtime geometry 並排除 target self-occlusion。World Authoring 升為 `world-authoring-v17`；Furniture Definitions 維持 `furniture-definitions-v13`；Route own generation不假升版。詳細 contract 見 [`docs/furniture-passage-yielding.md`](docs/furniture-passage-yielding.md)。

前一個 `11.61.0-activity-continuity` 建立 Generic Activity Continuity v1：新增 Agent-private `activityEpisode` canonical owner，第一個 production consumer 只有 `read`。閱讀至少產生一次 realized feedback 後才形成 episode；emergency preemption 可把同一段未完成閱讀轉為 `suspended`，但不保存舊 Action / path / reservation。Resume 只形成 bounded Decision Option，仍由既有 Deliberation 與 Needs / 其他 Activities 競爭，不會自動接回。進行中 progress 只存在 live Action；Action 被中斷且不存在時才由 suspended episode 暫存，resume 建立新 Action 後再移回 Action。Activity Continuity own generation = `activity-continuity-v1`；Interruption own generation → `11.12.4-activity-continuity`；Action、generic Deliberation / Decision Evidence、Mental Regulation、Routine、Learned Habit 與 Standing Responsibility 不因本 release 假升版。

前一個 `11.60.0-standing-responsibility` 建立 Standing Responsibility v1：World 以 durable `resourceResponsibilityAssignments[]` 保存 Resources replenishment responsibility；Agent-private 只保存自己已知的 `knownResponsibilityAssignmentIds[]`。第一個 consumer 是既有合法 `restockContainer` option：責任只追加最多 `+8`、可追溯至 assignment ID 的 bounded decision contributor，不建立第二套 restock candidate、objective need、Action 或 Active Intent，也不取代 Routine、Learned Habit 或 Obligation。World Authoring 升為 `world-authoring-v16`，Editor Resident inspector 可 author Resources 補充責任，Resident View / Debug Inspector 只投影 canonical World truth 與 Agent-private known-ref linkage。

前一個 `11.59.0-learned-habit` 建立 Daily Life Learned Habit v1：Agent 自己真正形成的 episodic experience 經 `episodicMemoryCreated` 與 bounded activity classifier 收斂為 `activityKind + daily-time-bucket` 的 Agent-private `learnedHabits`；第一版支援 `read / eat / talk`，以慢速 deterministic consolidation / decay 對既有合法 Decision Option 提供最多 `+10` 的 bounded evidence。Learned Habit 不建立候選、Action 或 Active Intent，不保存 exact Object / Furniture / Agent target identity，也不取代 Routine、Usage Habit、Need 或 Standing Responsibility。

前一個 `11.58.0-object-containment` 建立 Object containment v1：Object 以 `containedBy` 保存唯一 canonical containment relation，Furniture Definition 以 `objectContainment:true` 宣告 capability；Contained Object 不保存自己的 `position`，Spatial 由 containing Furniture 推導 effective location。第一個 consumer 是 Bookshelf，提供最基本 `Held ↔ Contained` lifecycle 與必要 Editor / Presentation projection；不加入 autonomous storage policy、nested containment、capacity / packing 或 generic storage framework。

Object containment v1 建立 Object-side `containedBy: furnitureId` canonical relation；第一代只允許 `objectContainment:true` Furniture target，Bookshelf 是第一個 consumer。Held / Contained / Supported / Free 為互斥的 derived location classification；Contained Object 不保存自己的 `position`，effective location 由 Spatial 經 Furniture 推導，Furniture 不保存反向 canonical `contents[]`。`Held ↔ Contained` 只提供底層 canonical lifecycle，不加入 housekeeping / habit / autonomous storage policy；既有 bulk food / Resource Container 語意維持不變。

前一個 `11.57.1-slot-approach-arrival` 已修正 Furniture Slot-use arrival：chooser-time approach winner 只作 ephemeral navigation witness；`sleep`、`rest` 與 Human `meal` execution 以 current `slotApproachNodes()` 判斷是否已抵達任一合法 approach。

## Current authority navigation

- [`docs/architecture.md`](docs/architecture.md)：跨 subsystem 現行工程契約
- [`docs/versioning.md`](docs/versioning.md)：版本與 marker ownership
- [`docs/furniture-passage-yielding.md`](docs/furniture-passage-yielding.md)：Furniture Passage Yielding authoring / observation / geometry / recovery / runtime transaction contract
- [`docs/activity-continuity.md`](docs/activity-continuity.md)：Generic Activity Continuity / resume truth、lifecycle、progress ownership 與 interruption / Deliberation contract
- [`docs/standing-responsibility.md`](docs/standing-responsibility.md)：Standing Responsibility v1 truth / knowledge / decision / Editor contract
- [`docs/interaction-geometry.md`](docs/interaction-geometry.md)：Interaction Geometry / Pickup 詳細契約
- [`docs/tick-pipeline.md`](docs/tick-pipeline.md)：runtime hook ordering
- [`docs/agent-carry-relocate.md`](docs/agent-carry-relocate.md)：Agent Carry
- [`docs/mental-regulation.md`](docs/mental-regulation.md)：Mental Regulation
- [`docs/daily-life-routine.md`](docs/daily-life-routine.md)：Daily Life Routine
- [`docs/daily-life-learned-habit.md`](docs/daily-life-learned-habit.md)：Daily Life Learned Habit
- [`docs/reading-activity.md`](docs/reading-activity.md)：Reading Activity
- [`docs/development-workflow.md`](docs/development-workflow.md)、[`docs/pr-preflight.md`](docs/pr-preflight.md)：工程流程 / preflight

11.53 以前累積在 README / Architecture / Versioning 的全文 snapshot 保留於 `docs/archive/`，只供追溯，不是現行規格。

## Current subsystem boundary index

- **Furniture Passage Yielding**：只在 normal walk unreachable 時，對已觀察且 opt-in Furniture 檢查 fixed parked counterfactual，並以 canonical interaction geometry + runtime placement transaction做 bounded recovery；不建立第二份 motive、generic relocation 或 pushing physics。parked 後的 Furniture 仍是完整 current geometry，所有 traversal / visual consumer 重新讀同一 truth。
- **Activity Continuity**：`Agent.activityEpisode` 是已開始但未自然完成 Activity 的 Agent-private canonical owner；v1 最多一個 episode，第一個 consumer 只有 `read`。Resume 只提供 bounded normal Decision Option；不復活舊 Action、不保存 stale path / reservation、不繞過 Deliberation。
- **Standing Responsibility**：canonical World truth 是 durable `resourceResponsibilityAssignments[]`；Agent-private 只持有已知 assignment ID refs。v1 僅支援 Resources replenishment / `restock` scope；decision integration 只能 enrich 已存在且 legal 的 `restockContainer` option，不能建立 candidate 或 objective necessity。
- **Object Domain**：具體 physical item 的 canonical identity 只在 `state.objects`；`resourceContainer:true` 與 Furniture-side `objectContainment:true` 都是可組合 capability，不建立平行 entity taxonomy。Object containment 的 canonical relation 只在 child Object 的 `containedBy`；Furniture 的 reverse contents 只能投影。Generic physical handling 由 `SimObjectHandling` 持有，Resources 只消費 Resource-container capability。
- **Daily Life Learned Habit**：`Agent.learnedHabits` 是由 actor 自己已形成的 private episodic experience 收斂出的 Activity-level 慢速慣性；v1 只保存 `activityKind + daily-time-bucket`，不保存 target identity，且只 enrich 已存在的合法 Decision Option。
- **Relationship Foundation**：Relationship 是 Agent-private directional state；`A → B` 與 `B → A` 分開保存。**Relationship → Responder Bias** 只讓 responder decision 消費自己的 canonical relationship，不建立 shared pair score。
- **Physical Profile Foundation**：Agent physical profile 是 body / locomotion capability authority；`MovementEnvelope` / `PoseEnvelope` 由 canonical profile 即時計算，不保存第二份 geometry cache。
- **Passage Profile**：edge / opening geometry 由 Spatial / Passage authority 即時派生；不把 traversal feasibility 寫回 Furniture 或 Tile。
- **Metric Route**：`pathDistance`、`traversalCost`、`travelTime` 分工；target ranking 使用 canonical `accessPenalty`，不建立另一套 route truth。
- **Locomotion Execution**：mode / posture transition、movement timing 與 execution 由 Locomotion owner 持有；Interaction witness 若要求 terminal posture，execution 消費同一 witness。
- **Dynamic Congestion**：只從 current occupancy / movement context 派生 next-edge cost；不保存 persistent congestion truth。
- **Player-readable Entity View 與 Debug Inspector 共用同一 authoritative simulation state**；Presentation 只投影，不建立 competing truth。
- `slot reservation` 是 World-level temporary coordination state；Debug projection 可以顯示 reservation，但不得把 Agent-private preference / habit 誤投影成公共所有權。

## Core invariants

- 同一事實只有一個 authoritative truth；UI / Inspector / Memory 只能引用或派生。
- World fact 存在不代表所有 Agent 都知道；Agent-private state 不直接改寫另一 Agent 的 private state。
- action / intent / observation / memory / relationship 分層。
- Runtime hook 順序與 same-tick visibility 是 simulation semantics；未知、重複、缺失 registration 明確失敗。
- 導航使用 canonical movement geometry；互動使用 canonical Interaction Geometry；accessibility / ranking / replan / execution 共用同一 authority。
- Furniture footprint、Surface、Slot、Object location/support 各自分工；不以 entity coarse position 取代 interaction stance。
- Current floor Spatial Node 是 coarse `spaceId + surfaceId + x/y/z` identity；不保存 persistent sub-tile Agent position。

`src/release.js` 是 overall current runtime marker 的唯一 production owner。Subsystem generation 只在自己的 contract 改變時前進。
R3｜Off-map Physical Ingredient Supply：正式 B 世界具有有限的場景外 Type A 實體食材來源；明確規劃的 `externalSupply` physical Ingredient mode 沿用原有出口與攜帶普通籃子流程，逐件完成食材取得、物件身份、容量與因果事件。沒有自動刷新、沒有借用舊 Resource Food；自主補貨屬 R4。參見 `docs/food-offmap-physical-ingredient-supply.md`。
