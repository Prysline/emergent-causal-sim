# Architecture — Current Runtime Contract

本頁是跨 subsystem 的**現行入口**。若與 current implementation / regression 衝突，以已實作且經測試的行為為準；`docs/archive/` 只供歷史追溯。

目前 runtime marker：`11.83.0-intentional-nearby-placement`。

B2 Intentional Nearby Placement v5: Physical Meal Serving `eat.placeMealDish` keeps immediate legal contact placement first, otherwise selects from Action-local observed Furniture IDs using canonical support contact and finite traversal cost (initial budget 4, elapsed bound 12 ticks). Remote occupancy is not queried for selection; B1 intrinsic fit and actual capacity are checked separately, actual capacity only at contact. Recompute approach each tick, reject failed targets, use canonical Floor fallback when exhausted. No route/feasibility cache, no new Intent, no cleanup/abort/accidental-drop migration, no B1 precision change. Other consumers remain unchanged.

B1 uses explicit `placementFootprint:{width,depth}` in meters, independent of carry geometry and container volume. Canonical `SimSurfacePlacement` derives each cell's actual support rectangle from resolved `supportRegion` and checks individual dimensions plus total direct supported Object area. Multiple objects per cell are allowed; contained children never add independent occupancy. No exact packing, rotation, stacking, cross-cell placement, stored occupancy or persistent subcell coordinates; this approximation can both reject physically possible placements and accept overlapping arrangements. Existing immediate generic release keeps floor fallback; specified placement rejects without redirecting. R4-A2 local inspection, movement and final release use the same eligible cells. World Authoring v31 and runtime validation reject missing/invalid footprints and over-budget supported state; Editor uses existing atomic candidate validation. No B2/C or new Food activity.

Cooking × Serving 收納修正：料理完成在原鍋原子替換 Ingredient 為 Meal（`containedBy=potId`，無獨立 position/supportId），保留真實重量、體積及 loadPot → complete 因果鏈。只有明確外露的料理容器才可透過其真實位置觀察、盛取或進食；不將鍋具誤判為餐盤、不公開一般 cargo。部分盛餐留原鍋，全量轉移保留 Meal ID。沿用原本 eat Action、容量與預約。詳見 [`docs/food-meal-serving.md`](docs/food-meal-serving.md)。

R4-A2 固定收納取料：既有 `cookMeal` 可在當下可觀察／接觸的固定收納處實際檢視後，選擇合法完整食材，經單一 `held` 搬到指定合法支撐面，再延續原本 Cooking。遠端未知內容不提供食材 ID；食材容量、接觸與預約重驗，取出及放置事件連至既有料理因果鏈。此切片不代表 R4-B 自主外出補給或 R4-C 持續供餐完成。詳見 [`docs/food-r4a2-pantry-access.md`](docs/food-r4a2-pantry-access.md)。

Current Floor pickup recovery：`SimEngine.holdObject` 僅在 Human 以合法 kneeling／prone 真正拾取 Floor Object 後，記錄一次 Action-local recovery hint；下一 tick `stepAction` 先以 `SimSpatial.floorNodeFitsMode(...,'walk')` 重新確認含攜物幾何的 standing fit，再沿用 `SimLocomotion` 原始 mode transition 支付一 tick。Blocked transition 不改變 canonical `Agent.posture` 或 `Agent.held`，原 Action 照常執行；supported/contained pickup、任意 action completion、crawl arrival 無通用免費站立。此 hint 不建立新 World、Perception、Object Location 或 Agent-private truth。

R4-A1 Generic Physical Ingredient Logistics：正式 B 世界保留 `basketA` 兩手大籃（24 L、0.8 kg），另有 `basketSmallA` 單手小籃（18 L、0.6 kg）；`carryGeometry`、容器 capacity 和籃體 `physicalVolumeCubicMeters` 各自保持單一來源。既有 R3 `externalSupply` 可指定任一合法普通 Object carrier。新明確規劃的 `transferContainedObjects` Engine Action，只有在自身持籃且剩一手、已合法接觸檢視來源／目的地、容量和預約重驗通過時，才逐件原子改寫同一 `containedBy` 並產生 canonical World Event；雙手持籃必須先依 canonical placement 放下，才以既有取物／搬運／contain lifecycle 入櫃。遠距 World facts 不構成 Agent knowledge。此 Slice 不含自主補貨決策、固定櫃取料至指定料理檯面及 Cooking 整合（R4-A2）、R4-B/C、R5 或 R6。詳見 `docs/food-r4a1-generic-logistics.md`。

Physical Meal seating correction：現行 `eat` 只在可達 Slot 的真實坐姿 `eatFrom` 接觸成立時選座，settlement 時再次核對 Slot／姿勢／接觸並沿用 `sitOn` 與 canonical Event；站立備援仍須真實接觸。Serving 餐盤先真正放下，才判斷座位接觸；Spatial `supportReach/eatFrom` 僅重用已存在的 Surface contact witness（專用 generation `meal-plate-eat-from-v2-seated-slot-contact`），不建立 Chair→Table 或 Food 庫存第二真相。

Current B Food / Legacy Resource isolation：正式 `DEFAULT_WORLD_AUTHORING` 由 World Authoring v26 單一組裝層移除舊 `legacyResourcePlateA/B`、`legacyResourceMealTray`、`legacyResourceFoodPantry`、`legacyResourceBasket` 與 Food `resourceResponsibilityAssignments`，保留普通 `readyMealF0` Meal、`ingredientA1` 及 `plateA/B`。既有 amount-based `foodStock` / `restockContainer` / `externalSupply` 僅供獨立 Legacy Resource 場景；B 無 Food Resource destination/carrier，因而不會產生原本的食物 Resource 補貨行動。Presentation 分別投影 Ingredient 件數與 Meal 公克數，不混算 Resource 單位。Editor 已移除四個舊 Resource Food 建立 presets（tooling v3）；水／酒等其他 Resource 建立能力不變。R2 已導入 canonical physical-volume Object Storage；R3 已在既有 `externalSupply` 加入實體食材供應模式及正式 B 場景有限場景外 Ingredient 來源，R4 自主供餐尚未實作。

Current Logistics carrier drop integration：Engine 在 completed movement edge 的 `containerDrop` canonical consequence 後，對仍依賴該 carrier 的 `restockContainer` / `externalSupply` 即時呼叫原有 `abortAction`、清理 reservations，並由 existing afterTick Intent reconciliation 收束 actionBound Intent；`abort` Event 引用原 `containerDrop` Event。Spatial nearby intentional release、Resources handling risk / accidental drop placement、其他 Action 與 Runtime Hook 排序不變。

Core Default World B（正式預設場景）：`src/core-default-world-authoring.js` 最後一層將 Food v24 Authoring 組成唯一 `world-authoring-v31` 預設；16×10 公共／私人分區住宅的 geometry、Ingredient A、Cooking 和普通 Serving plates 沿用 B 原有契約。正式 Food truth 只來自 Ingredient/Meal Objects；舊 Resource Food models 已移出 B 但於 base Legacy 情境保留，舊模型使用 `legacyResource*` ID。本場景不屬於 WORLD 001，不宣稱後續供應鏈已完成。

Current Meal Serving & Physical Transfer v1：`SimFood` 是 fully edible Meal grams 的唯一 mass owner，原子分裝使用 `meal.edibleMassGrams`；`Object.containedBy` 指向普通可攜餐盤或合法料理容器，Object Handling 以該 grams 的唯讀 kg projection 負責 carried load，Storage 容量則由同一 Meal 的 grams／有效密度導出 physical volume，不另建 `handling.massKg`。Spatial `eatFrom` 及 Object point visibility 對已合法觀察的外露餐盤或料理容器內 Meal 提供受控接觸；其他 contained cargo 保持 hidden。Engine `eat` 利用既有 Action / pickup / movement / nearby placement / per-tick `eatingMeal`，Serving Event 引用原 Meal 與 Cooking Event；legacy `contents.food`、Resource serving 與 D2 不變；此 Serving 切片當時未改 Default World，後續由獨立的 B Authoring 層更新。Introduced-in markers：Food `food-v2-meal-serving`、Object Handling `object-handling-v3-meal-mass-projection`、Perception Visual Availability `perception-visual-availability-v4-exposed-meal`、World Authoring `world-authoring-v24`；目前正式 World Authoring 已另進至 v25，Cooking／Resources generation 不假升版。詳見 [`food-meal-serving.md`](food-meal-serving.md)。

Current posture × visual consumer boundary：`kneeling` / `prone` 是 Human 合法 locomotion posture，但缺少 static `PoseEnvelope` 時無法建立 canonical sight sample；Perception direct classification 繼續明確 throw，不使用 standing fallback。共用 query-time `lacksVisualPoseEnvelopeForSupportedLocomotion` 僅讓 Cooking / Tidying 視覺依賴候選與 Engine direct Action construction 返回不可用；未知姿勢與非法 Physical / visual input 不受此 gate 掩蓋。World Object / Event 與 Agent-private observation 不新增真相；Core Default World PR #246 與 Serving 獨立驗證。

Current Food autonomous Ingredient acquisition：Cooking 的觀察與容量決策允許完整 Ingredient 位於任一真正 `supportsObjects` Furniture 表面（首例 kitchen-counter），而非必先放在爐具。原有 `cookMeal` Action 固定實際來源 `sourceId` 和合法鍋具 `potId`，透過通用 Object pickup／containHeldObject 真正跨位置裝鍋；來源變動或預約失效不能繼續。單一 World Event pickupIngredient → loadPot → complete 形成因果引用。該切片當時的 F0 Meal 爐面位置已由現行 contained Meal 修正取代。

Current Cookware Eligibility v1：`SimFoodCookwareEligibility` 是 `Object.cookingEligible` 明示布林能力的唯一查詢與非法輸入判斷；World Authoring v23 overlay 與 Validator layer 共用它，舊 `cookingPot` fail explicitly。`SimFoodCooking` 仍只負責單批完整 Type A Ingredient、現有 `cookingStation` 與普通 Object 容器的組合判斷，容量由 canonical Object Handling 得出；Decision 逐一檢查所有合法容器，依 Agent Perception／Spatial／reservations 選出可執行組合。既有 Engine `cookMeal` Action 從 `buildAction` 起固定 `potId`，每 tick／完成只重驗這一實體，絕不換鍋或寫入平行 cargo／Meal 真相；`loadPot` → `complete` World Event 引用關係維持不變。Own markers：Cooking `food-cooking-v1-cookware-eligibility`、World Authoring v23、新 eligibility `food-cookware-eligibility-v1`；其他 subsystem 不假升。詳見 [`food-cookware-eligibility.md`](food-cookware-eligibility.md)。

Food F1-B2 Pot Loading（歷史引入契約）：Cooking Action 沿用現有 Engine ordinary Object pickup/containHeldObject、canonical Spatial pickup/receive interaction、同一 Actor Intent 與予約，先將可觀察完整 Ingredient 從爐面放入具備 `objectContainment:true`、有界 `objectStorage` 的鍋子；鍋內物件只保存子端 `containedBy`，質量與負重不另開 Food 鏡像。`loadPot` World Event 為原料原子轉換 `complete` 的 causeId；未有合法放入、當下仍在鍋內、持續預約與接觸時不可完成。鍋內 Ingredient 對其他 Agent 不憑空可視，完成後的 F0 Meal 仍在合法爐具表面供原有 eat 使用。Cooking own generation 為 `food-cooking-f1b2-pot-loading`；World Authoring v22、Furniture v14、Ingredient v1、Meal F0、Object Handling／Spatial／Perception 不假增版。詳見 [`food-v1-f1b2-pot-loading.md`](food-v1-f1b2-pot-loading.md)。

Current Food F1-B1 Cooking：`SimFoodCooking` 僅擁有 first bounded Type A whole-Ingredient → Meal 等重 recipe rule；input mass 單位來自 `SimIngredient.massGrams(Object.handling.massKg)`，output 食用重量由 `SimFood` F0 `Meal.edibleMassGrams` 擁有，完成時單一 material-transaction Event 連回已退休原料 ID。Decision option 使用當下可視證據及 `gas-stove` canonical Furniture 支撐／互動幾何，Engine 原有 Action／reservation／interruption 逐 tick 消費，成品仍在原合法爐具 Surface 且原有 eat 消費。pot 是同一爐具位置的普通 Object；尚無其內容物 containment 或單獨烹調庫存。Furniture Catalog 前進 v14、Cooking own generation `food-cooking-f1b1`；World Authoring v22、F0 Meal、Ingredient v1、Action／Spatial／Resources own markers 不假升。詳見 [`food-v1-f1b-cooking.md`](food-v1-f1b-cooking.md)。

Current Food F1-A Ingredient：`SimIngredient` 定義首個完整抽象 Type A、預設重量／密度、實際物件生成與 fail-closed 檢查；Concrete Ingredient 仍使用 `state.objects` 和 generic `Object.containedBy`，唯一實際質量為 `handling.massKg`。`ingredient.typeId / densityKgPerM3` 保存種類與建立時有效密度；公克與物理體積只讀推導，不增量記錄 `Resource contents.food`。World Authoring v22 和 runtime Validator 共用此契約；真實 Engine/Spatial/Resources 搬運及負重由既有 consumer 支援。Food F0 Meal `meal.edibleMassGrams` 仍是另一種未整合盛盤的獨立 Meal 真相；非 Cooking 或舊 Food migration。詳見 [`food-v1-f1a-ingredient.md`](food-v1-f1a-ingredient.md)。

Current R2 Physical Object Storage：`SimObjectStorageVolume` 是 World Authoring 與 runtime 共用的唯一 physical-volume / capacity 公式。Ingredient 使用 `handling.massKg / densityKgPerM3`，Meal 使用 `edibleMassGrams / densityKgPerM3`，一般 Object 明確提供 `physicalVolumeCubicMeters`，不得再存平行 storage-only volume。普通可搬 Object `basketA` 與固定 Furniture `pantryA`／Bookshelf 均由 `objectStorage.capacityCubicMeters` 與直接子物件 `containedBy` 判定容量；`maxItems/maxMassKg` 舊格式 fail-closed。Mass 只作搬運負重，Resource amount-capacity 不變。Engine、Cooking、Serving、Editor、Validator 與 Inspector 引用單一 truth，不建立 container-side `contents[]`；不包含 3D packing、nested、R3 供貨或 R5 退役。詳見 [`object-storage-volume.md`](object-storage-volume.md)。Historical introduced-in Object containment v1 見 [`movable-object-containment.md`](movable-object-containment.md)。

Current Character Traits Foundation v1 Slice B1：`social` Trait 在同 Agent 的 Social Need 自然形成（`.75 + .5 * social`）與收到邀請時的 Human／Animal Social Response（Need + Trait bounded score）分別作用；主動 `talk`／`seekHuman` 不重複追加直接 Trait utility。回應消費者採 `SimCharacterTraits.value` 的 canonical 缺值 `0`／invalid fail-closed，既有 Affect／Relationship、Bid／World Event、Agent-private 與緩解契約不變；只前進 Human／Animal response own generations，不改 Action、Social Bid、Character Traits schema 或 World Authoring。詳見 [`character-traits.md`](character-traits.md)。

前一個 Character Traits Foundation v1 Slice A：`src/character-traits.js` 是 Trait keys、types、read-time defaults 的唯一契約 owner。World Authoring `world-authoring-v19` author 稀疏 `Resident.traits`，初始化複製為對應 Agent 的 private `traits`；Engine／Deliberation／Appraisal 的原有 consumer 只讀同一狀態，保留 Needs 與 Decision authority。未新增 World trait mirror、跨 Agent 私有狀態寫入或活動。參見 [`character-traits.md`](character-traits.md)。

Current Observed Environmental Cleaning v1：Human 自主 `cleanFloor` 僅由自身同一 Floor Node 的當下局部接觸液體量（>0.2）形成候選，Initial Decision、Soft Reconsideration、Hard Replanning 與 Action builder 共用單一 query-time 判斷；執行前重新檢查 Actor / Floor Node / 液體，經 `SP.takeEnvironmentResource()` 更新唯一 Environment truth，非零移除才寫入 canonical World Event。全圖濕度不等於 Agent 知識；沒有 Environment cache、鄰近視覺偵測或新 Need。

前一個 release 建立 Tidying v1：`state.objectStorageAssignments[]` 僅是 World home 指定關係，`Agent.knownObjectStorageAssignmentIds[]` 只存私有 reference。Free / Supported Object 仍以 canonical Spatial 位置與 Visual sensory evidence 判定當下可見，Held / Contained 不形成第一版候選。實際 `putAwayObject` 由 Decision Option Provider → Engine Action factory → pickup → carry → `containedBy` commit 與 canonical World Event 完成；失敗／緊急中斷沿用附近 Object release。沒有新增 Need、平行 Object placement truth、global Object scan、Editor GUI、resume queue。

前一個 release 建立 Furniture Passage Yielding v1：明確 opt-in 的 Furniture 只有在 existing Action 的 normal walk route unreachable、角色以 current Perception 實際觀察到該 Furniture、translation 反側的 canonical interaction position 可達，且 fixed `parkedPlacement` 的 non-mutating counterfactual 能恢復同一 navigation goal 時，才可形成 bounded execution recovery。原 Action / Active Intent 保留 motive truth；runtime placement transaction 以 current resolved 3D solids 重驗 destination、swept transition 與 dependency legality，再原子更新 current Furniture geometry / Tile projection，最後只產生一筆 canonical World Event。詳細 contract：[`furniture-passage-yielding.md`](furniture-passage-yielding.md)。

Current Food F0：`src/food-contract.js` 是 `SimFood` 的單一 canonical Food mass owner，獨立於 World Authoring generation；`src/food-authoring.js` 只負責 v20 schema overlay／default Meal。完全可食、具正式 Object identity 的 Meal 使用單一 `meal.edibleMassGrams`；`eat` 每有效 tick 原子扣真實公克、更新 actor-private Hunger 並產生 canonical Event。`contents.food`、`foodStock()` 和原本 plate / serving / restock 仍是不同的 legacy Resource amount；不相加、不轉換。聆聽續吃、說話暫停，緊急中斷不回滾，學習習慣按 Meal Action 的首次真實攝取而非每 tick 計一次。Food F0 首次引入時的 World Authoring generation 為 v20，現行為 v22；Meal F0 generation 仍為 `food-v1-f0`；既有 Human Social Response Activity Compatibility 將 `eatingMeal` 納入吃飯時聆聽／發言的既有規則，own generation 為 `11.67.0-human-social-meal-compatibility`。見 [`food-v1-f0.md`](food-v1-f0.md)。

## Truth boundaries

- Canonical World Event 只有 `state.events / state.causes` 一份；Memory / UI / Inspector 只能引用或投影。
- World fact 不等於 Agent knowledge；跨 Agent 決策只能消費合法 observation / evidence。
- Agent-private cognition / memory / affect / relationship 不直接改寫另一 Agent 的 private state。
- `state.agentCarries` 與 generic physical-Object `Agent.held` 分離；Agent carry 不塞進 held Object relation，action / intent / observation / memory / relationship 不互相充當 mirror state。

## Furniture Passage Yielding

Passage Yielding 是 navigation / Action execution recovery，不是新的 Need / high-level Intent，也不是 generic Furniture relocation。

- Canonical authored truth 是 Furniture instance 的 explicit opt-in 與固定 `parkedPlacement`；default parked 只能從 stable authored home + facing 前方一格推導一次。runtime current position 不得讓 parked reference 漂移。
- v1 只允許 same-layer cardinal 1-cell translation、orientation unchanged；已 parked 後不再產生 candidate，也不能用同 capability 把 Furniture 拉出 parked placement。
- Destination 與 transition legality 使用 current resolved `spatial.solids`；不以 tile occupancy、overall height 或新的 under-table clearance mirror 取代 3D geometry。parked Furniture 仍保留完整 actual geometry，walk / crawl / prone / visibility 都重算同一 current truth。
- Slot occupant / reservation / posture binding、supported / contained Object 與 durable usage / claim relation 都使 v1 relocation unavailable；不做 follower transfer 或 claim migration。
- World blockage 不等於 Agent knowledge。Furniture visual target evidence 從 current resolved Furniture geometry query-time 派生，target-specific visibility 只排除 target 自己的 opacity occluder，仍保留 wall / other Furniture occluders；不建立 persistent `visibleFurniture[]`。
- Trigger 只有 normal walk unreachable；若 walk route 仍可行就直接 route。Hypothetical parked route 只作 non-mutating counterfactual，不直接改 World。
- Interaction position 重用 canonical Furniture contact geometry，再依 translation vector限制在移動方向反側；不可達就不是 executable plan。
- Runtime placement transaction 是唯一 runtime Furniture move owner：重新 resolve current footprint / slots / solids / surfaces / display geometry，並同步 Tile membership / floor geometry / room projection。Editor authoring move helper 不作 runtime World action。

Furniture Passage Yielding 當時的 World Authoring generation = `world-authoring-v17`；Furniture Definitions 維持 `furniture-definitions-v13`。Passage Yielding capability marker = `furniture-passage-yielding-v1`；Route own generation維持既有 owner，不複製 overall release literal。

## Activity Continuity

`Agent.activityEpisode` 是 unfinished Activity continuity 的 Agent-private canonical owner，不是 World-level queue，也不是 Active Intent / Action / Memory 的 mirror。v1 每個 Agent 最多只有一個 current episode slot，第一個 production consumer 只有 `read`。

- plan / approach 不建立 episode；至少一次 realized reading feedback 後才算 episode 已開始。
- `ongoing` 時 live Action 唯一持有 `feedbackUnits / feedbackGoal`；episode 只持有 episode identity、exact target reference 與 matching Action linkage。
- `suspended` 時原 Action 已不存在，episode 才持有 bounded `suspendedProgress`。Resume 建立新 Action後 progress 原子移回 Action並清除 suspended copy。
- `completed / abandoned / invalidated` 是 terminal；domain read completion、ordinary Deliberation 選擇其他 Activity、以及永久 target/affordance失效各自擁有終止原因。
- temporary unreachability 不等於 invalidation；只暫時不產生 resume candidate。
- Resume evidence 必須重新進 normal Deliberation；強 Need / 其他 candidate 可以勝出。v1 不建立 backlog 或多 episode stack。

Activity Continuity 不改 hard replan 的「同一 Intent、重新建立 execution plan」語意，也不把 Activity Concurrency 的 execution-local transient behavior 誤稱 episode suspension。World `activityStarted / activitySuspended / activityResumed / activityCompleted / activityAbandoned / activityInvalidated` events 只記錄 observable transition，不讓其他 Agent 自動取得 actor-private suspended truth。

## Standing Responsibility

Standing Responsibility 回答「為什麼這個長期任務是這個 Agent 的責任」，不回答「世界是否客觀需要做這件事」。v1 只處理 Resources replenishment responsibility。

Canonical World truth 只有 `resourceResponsibilityAssignments[]`；assignment 包含 stable `id`、Agent principal、`responsibility:'restock'` 與 resource scope。Agent-private knowledge 只保存 `knownResponsibilityAssignmentIds[]` refs，不複製 assignment 內容。World assignment 存在不代表所有 Agent 知道它；Decision integration 只能由該 Agent 的 known refs 回查 canonical assignment，不能直接掃 World assignments 當作 Agent knowledge。

Responsibility 不是 candidate provider。Resources / logistics 既有 `restockContainer` legal candidate authority 維持不變；只有既有 legal option 的 resource 與 Agent-known responsibility scope 相符時，Standing Responsibility 才能追加最多 `+8` 的 bounded contributor，並保存 canonical `assignmentId` provenance。Responsibility query 不得建立 objective need、target、Action、Active Intent，也不得讓 infeasible restock 變合法。完成一次 restock 不移除 durable assignment。

Editor 的 Resident inspector 提供 bounded「長期責任」authoring surface，但 mutation 寫回 World-level relation；Resident View 只顯示 Agent 已知責任，Debug Inspector 同時投影 canonical assignments 與 known-ref linkage。詳細 current contract：[`standing-responsibility.md`](standing-responsibility.md)。

## Daily Life Learned Habit

Learned Habit 的 canonical truth 是 Agent-private `agent.learnedHabits`。它回答「在某個 coarse temporal context，我通常傾向做哪類 Activity」，不回答「既然要做這件事，我習慣用哪個 target」；後者仍是 Usage Habit / target preference 的責任。

形成路徑必須經過 actor 自己已建立的 episodic memory，再由 `memory.sourceEventId` 回看同一 canonical World Event 判斷是否跨過 realized-execution threshold。v1 僅支援 `read` completion、真正 `amount > 0` 的 `eat` consumption、以及 completed `talk` interaction；plan、approach、wait、abort、`eat phase:start` 與旁觀他人行為都不能增加自己的 Learned Habit。

State 僅保存 `activityKind + daily-time-bucket + strength / count / last experience provenance`；不得保存 exact Object / Furniture / Agent target、position 或另一 Agent private state。Strength 使用 deterministic lazy decay + saturating gain；Decision integration 只在既有 core/provider option 已合法存在後追加 bounded `learnedHabit` contributor，不能建立 candidate、改 target、建立 Action / Active Intent 或繞過 feasibility。

## Resident Action / Intent / Explanation

這三層不能互相取代：

- **Action＝角色現在具體在做什麼**：由 canonical Action runtime 持有目前執行中的具體行為與進度。
- **Intent＝這個行動服務的短期目的**：`Agent.activeIntent` 是 Agent-private 短期目的；`action.intentId` 只作 Action → Intent linkage。
- **Explanation＝為什麼此刻選擇這個行動**：Presentation 只從 canonical Decision Evidence / state 投影可讀原因，不保存第二份 decision truth。**Explanation wording 優先自然直接**，不得為了玩家文案重算或改寫 simulation reasoning。

`Entity Readable View`、Resident View 與 Debug Inspector 都是 canonical simulation state 的 projection；不得把 presentation wording、summary 或 inferred relationship state 寫回 World / Agent truth。

## Relationship Foundation

Relationship 是 Agent-private directional state；`A → B` 與 `B → A` 分開保存，不建立 shared pair score。Relationship consolidation 只承接該 Agent 自己合法取得的 appraisal / experience evidence。

**Relationship → Responder Bias**：responder decision 可以消費 responder 自己的 canonical relationship state 作 bounded influence；Relationship 不直接替 responder建 Action、Intent 或 response outcome，也不把另一 Agent 的 private state變成共享真相。

## World / Spatial / Physical

Current World Authoring = `world-authoring-v19`；Furniture Catalog = `furniture-definitions-v13`。

Current Spatial Node identity = `spaceId + surfaceId + x/y/z`。`z` 是 World spatial dimension；Furniture `topElevation` 是 local geometry，兩者不得混為同一真相。

- Structural Floor 是 World support，不是 Furniture / ordinary Entity，也不建立 `supportId:'floor'`。
- Furniture metric `spatial.solids` 是 canonical obstruction geometry；eligible top face 派生 runtime Surface。
- Slot 是 occupancy / posture identity，不是 generic reach authority。
- Current floor node 沒有 persistent `localX/localY`。

### Physical Profile + Passage Profile / Multi-mode Feasibility

Physical Profile 持有 body / locomotion capability。`MovementEnvelope` / `PoseEnvelope` 都由 canonical profile 即時計算，不保存第二份 geometry cache。

`PassageProfile` 由 current edge / opening / structure geometry 即時計算；它描述 passage candidates 與 clearance context，不把 derived feasibility 寫回 Furniture、Tile 或 Agent state。`traversalFeasibility` 以 Agent 的 Physical capability / MovementEnvelope 消費同一 PassageProfile，回答可用 mode / maneuver；未知或不相容 geometry 必須明確失敗，不以 silent fallback 猜測可走。

### Route Semantics Split

Route consumer 必須區分：

- `pathDistance`：topology / metric path distance，不含個體 mode burden。
- `traversalCost`：目前 Agent 在 canonical geometry 下的 objective movement / transition burden。
- `travelTime`：可執行 movement plan 的時間成本。
- `accessPenalty`：Deliberation / target ranking 對 canonical accessibility burden 的 projection；不得用舊 `distancePenalty` 建第二套 route truth。

Navigation、target accessibility、ranking、replan 與 execution 必須消費同一 canonical movement / Interaction Geometry，不得用 entity coarse position 或 UI projection 取代 route target。

### Slot-use arrival contract

Furniture Slot 的 current legal approach truth 仍由 Spatial `slotApproachNodes()` 唯一持有；`bestSlotApproachNode(..., objective:'traversalCost')` 只是在 chooser / replanning 當下從同一候選集合選出的 ephemeral navigation witness，不是 persistent Slot arrival truth。

對 `sleep`、`rest` 與 Human `meal`：

- 尚未站上任何 current legal Slot approach 時，Action 可以繼續往 chooser-time winner 移動；
- execution 若目前 actor node 已屬 target Slot 的 current `slotApproachNodes()`，movement phase立即停止追逐舊 witness並轉入 `settle` / `sit`；
- arrival tick只轉 phase，真正坐下／躺下仍在下一個 core tick執行，維持既有 same-tick lifecycle；
- settle / sit仍重驗 activity capability、`slotAllows`、Pose fit、availability / reservation 與 current approach；沒有合法 approach時不能 settle。

這個 contract不把 Slot anchor當 ordinary floor route destination，也不改 Furniture-authored `approachEdges`、Spatial geometry、Route ranking或 persistent Agent position resolution。

### Locomotion Execution + Posture Transition

Locomotion 持有 locomotion mode、posture transition burden、movement timing 與 execution。Route / Interaction witness 若要求 terminal mode / posture，execution 必須完成並驗證同一 witness；不能 ranking 時假設 kneeling/prone 成本、執行時卻略過 transition。

### Dynamic Congestion

Dynamic Congestion 只從 current occupancy / movement context 派生 next-edge delay / burden；不保存 persistent congestion truth，也不改寫 PassageProfile、Route topology 或 Agent-private preference。consumer 仍以當下 canonical route geometry 重算。

## Preferred Sleep Slot conflict / Animal resolution

Sleep conflict 不建立第二份 Spatial occupancy truth：preferred Slot 是否被占用仍由 canonical Slot occupancy / `sleepTargetExclusion(...)` 判定；occupied preferred Slot 不會被塞回 legal `sleepTargets()`。Occupant-specific resolution 仍必須先有 requester 的合法 Agent-context observation。

Current resolution policy 分流：

- Human 可以比較 alternate、bounded wait、attention / wake、`requestYield`、較強 nonphysical `driveAway`、sleeping carry，以及具有明確 cooperation evidence 的 awake carry。Human refusal 不解鎖 forced / resisted carry。
- Animal sleeping 時可比較 wait / attention 與合法 sleeping carry；Animal awake 時額外有 `sleepSlotAnimalMoveAway` self-displacement path。requester 只建立 directed attention + observable World Bid，Animal 先由 Social Bid observation 取得自己的 evidence，再由 Animal 自己形成 `yieldSleepSlot` Intent 與 `wander` Movement Action。Sleep conflict 不直接改寫 Animal position。

Wake 與 occupancy release 是兩件事。`attentionStimulus` / `sleepWake` 保持既有 World Event consequence；Sleep conflict 另外保存 scoped `sleepSlotConflictOutcome` event，記錄例如 `wakeSucceededOccupancyPersisted`、`waitExpiredOccupancyPersisted` 或 `animalMoveAwayPerceivedOccupancyPersisted`。這些 outcome 只在同一 requester Sleep Decision + preferred Slot + observed occupant identity 的 active episode 內影響 ranking；沒有 `retryCount`。新的 Sleep Decision、occupant identity 改變、preferred association 消失或 Slot 真正釋放後，舊 historical evidence 不再作為 active escalation truth。

Sleeping 本身不是 wake utility bonus。Sleep conflict 把 `wakeDisruption`、`socialDisruption`、`physicalRelocationDisruption`、`placementQuality` 與 relocation cost 分開記為 contributors；wake succeeded but occupancy persisted 會降低同 episode 的 repeat-wake utility。若 Animal 已開始自己的 departure `wander`，requester 只看到 observable departure pending，等待實際 Slot release，不把「尚未走完」視為 refusal / shoo failure，也不立即切 carry。

Sleeping relocation candidate 保持 Agent Carry two-stage boundary：requester-time ranking只消費 requester 可知 observation 與公開 Embodiment defaults；candidate destination 使用 canonical Slot `canSleep / slotAllows / slotPoseFits / slotAvailable`、objective `sleepQuality` 與 requester accessibility / relocation cost。不得讀 occupant-private Usage habit / claim / preference、hidden Need，或 target instance hidden mass / held / body geometry來替 candidate ranking 偷看 execution truth。真正建立 carry relation / placement 時仍由 Agent Carry / Spatial / Physical 以完整 World truth驗證。

Sleep Slot Conflict own marker = `11.57.0-sleep-animal-resolution`。Generic Deliberation / Decision Evidence schema 仍是 `11.48.1-sleep-perception-approach`；Social Bid / Agent Carry / Physical / Spatial / Furniture 未改自身 contract，因此不因目前 overall release 假升版。

## Object identity / Resource-container capability

所有 authored/runtime concrete physical item 只有一個 canonical collection：`entities.objects / state.objects`。不存在 production `entities.containers / state.containers` alias。

- base Object 持有 stable identity、position / `supportId`、affordance 與其他 Object-local facts。
- portable physical handling 由 Object capability `portable + handling.carryGeometry + handling.handsRequired` 描述，canonical generic owner 是 `SimObjectHandling`。
- Resource-container capability 以 `resourceContainer:true` 明示；Resources 才消費 `contents / capacity / emptyLoad / restock` 與 carried-content `handling.containment / contentRetention`。
- `Agent.held` 只保存一個 physical Object id。ordinary book 與 cup / basket 等 capability Object 共用同一 hold / effective-location / release relation。
- ordinary Object 不因可攜就取得 Resource load / spill / transfer semantics；Resources 對非 Resource-container Object 回傳 no-container / zero Resource-derived consequence。
- `state.agentCarries` 仍只描述 Agent 搬 Agent。
- current bulk `contents.food` 是 Resources compatibility representation；Food Object lifecycle 另行設計。

## Object support / effective location

```text
holder exists
→ effective location follows holder

else containedBy exists
→ containedBy → objectContainment-capable Furniture
→ effective location follows the containing Furniture; Object has no own position

else supportId exists
→ supportId → Furniture → unique canonical support Surface
→ object.position retains x/y/z and selects actual Surface cell

else
→ object.position → structural Floor Spatial Node
```

Current `supportsObjects:true` Furniture 必須恰好有一個 canonical support Surface；0 或 >1 明確失敗。`objectContainment:true` Furniture 可作為 Object `containedBy` target；Held / Contained / Supported / Free location relations 互斥，Furniture / Surface 不保存反向 `objects[]` / `contents[]` mirror。Contained pickup interaction 直接重用 containing Furniture 的 canonical Interaction Geometry；其他 Object affordance 必須先把物件取出。

### Intentional nearby placement v2

當 lifecycle-driven release 需要放下 held Object 時，Spatial candidate-selection 是唯一 nearby placement query owner：

- 只考慮 `supportsObjects:true` 且能解析到唯一 canonical support Surface 的 Furniture。
- v2 延續既有 placement algorithm，不建立新的 move-to-place action；候選必須是 Agent **目前所在 node 已可依既有 `supportContactNodes(...)` 接觸**的 Surface，避免把物件瞬移到幾步外的家具。
- 同一目前可接觸 Surface 內，以 actor 與 Surface cell 的 locality 排序，之後用 stable `supportId / surfaceId / nodeKey` tie-break；不加入 personality、habit、home、housekeeping 或 furniture preference。
- winner 寫 held Object 的 `position + supportId` 並清除 `Agent.held`；沒有合法 winner 時寫 actor current canonical Floor node並保持無 `supportId`。
- accidental movement `containerDrop` 是另一條 handling consequence authority，仍落在 completed-edge current node，不經 nearby placement。

Engine 的一般 `releaseHeld()`、Deliberation soft reconsideration、replanning interruption 與 Human social soft-reconsideration 都委派同一 `releaseHeldObjectNearby(...)` helper；ordinary Object 與 Resource-container Object 因此共享 intentional release placement。Accidental movement `containerDrop` 仍是 Resources-owned intentionally-distinct consequence path，只適用具有 Resource-container handling capability 的 held Object。

## Interaction Geometry / Pickup v1

詳細 contract：[`interaction-geometry.md`](interaction-geometry.md)。

- `pickup` 不由 Object type 或 authored `interactions.pickup` 永久決定。
- Floor：同一 Floor Spatial Node + legal low-posture witness；Human 優先 `kneelCrawl → kneeling`，必要時 `proneCrawl → prone`。
- Supported object：使用 object actual Surface cell 與 Surface-owned contact geometry，不擴張成整個 Furniture perimeter。
- Slot-bound actor：Slot 只證明 current stance；符合 Surface contact 才能直接 interaction，否則 normal egress / movement。
- ranking 的 terminal mode/posture burden 與 execution 使用同一 ephemeral witness；`isAtInteraction(...)` 驗完整 witness。
- support / holder / position 改變後即時重算；不跨 tick 保存無失效規則的 pickup route / witness。

本 slice 不新增 limb reach / IK、crouch、persistent sub-tile coordinate、chair→table mapping、Nav Cell 或 generic high-fidelity reach framework。

## Lifecycle / detailed owners

Runtime hook ordering：[`tick-pipeline.md`](tick-pipeline.md)。其餘 subsystem detailed authority 由各 current doc 與 regression 持有；本頁不複製其完整版本歷史。

Historical snapshot：`docs/archive/architecture-through-11.53.md`。該頁不是 current authority。
R3 off-map physical supply：`externalSupply` 增加明確的 `physicalIngredient` mode；`offMapIngredientSources` 有限且不自動刷新。每次成功取得都建立一件普通 Ingredient Object、扣減來源並記錄 World Event；容器繼續依 R2 `containedBy` + 體積容量。其他 off-map Exit、Agent Action／Intent、可觀測性各自保有原始權威。R4 自主供餐、R5 Legacy Food 退役尚未完成。契約：`docs/food-offmap-physical-ingredient-supply.md`。
