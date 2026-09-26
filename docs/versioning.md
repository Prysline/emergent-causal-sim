# Versioning Contract

本文件定義 Emergent Causal Simulator 的 current runtime marker 何時必須更新，以及哪些變更可以留在同一版本內。

## Current version

目前 current runtime marker：

`11.29.3-interaction-winner-result-reuse`

玩家可見的 app 頁首 current-version display 使用短版 `v11.29.3`；`state.version`、`SimRelease.VERSION`、`SimWorld.VERSION` 與 `SimUI.PRESENTATION_VERSION` 使用完整 current marker。Current subsystem markers：Horizontal Geometry `11.29.0-horizontal-geometry-foundation`；Spatial Identity `11.22.0-spatial-z-identity`；Physical `11.17.0-passage-profile-multimode`；Spatial Traversal `11.29.3-interaction-winner-result`；Spatial Passage `11.29.0-horizontal-connection-passage`；Route `11.24.0-route-locomotion-cost`；Locomotion `11.24.0-locomotion-objective-burden`；Dynamic Congestion `11.28.0-effective-passage-width`。未改 contract 的 Relationship / Memory 等 generation 不跟著假升。

### Current Interaction Winner Result Reuse release

`11.29.3-interaction-winner-result-reuse` 將 interaction-position winner scoring 已經算出的 canonical `traversalCost` 正式暴露為 additive Spatial result contract：新增 `bestInteractionPositionResult(...)`，回傳 `{ position, traversalCost }` 或 `null`；既有 `bestInteractionPosition(...)` 保持 position-only compatibility contract，winner identity、candidate order、same-XY cross-surface filtering、Crowding-aware 排序與 tie-break 全部不變。

Engine 的 target-selection `targetTraversalCost()` 在 richer API 可用時直接消費 winner result 的 `traversalCost`，不再對同一 winner 緊接著重跑一次 `SP.traversalCost(...)`。這只重用同一次同步 winner calculation 的 derived result；不建立 persistent / cross-tick cache，也不把 action-execution `moveToInteraction() → planRoute` 納入 reuse。Browser performance regression 鎖定 single tick inside-tick `traversalFeasibility = 5,385`、`step(10)` inside `16,345` / outside `2,682`，並保留 exact canonical state parity、page error = 0、console error = 0。

因新增正式 public Spatial result API，本 release 推進 overall current marker，Spatial Traversal contract marker同步升為 `11.29.3-interaction-winner-result`。World Authoring `world-authoring-v7`、Furniture Catalog `furniture-definitions-v7`、Horizontal Geometry、Spatial Identity、Physical、Spatial Passage、Route、Locomotion、Dynamic Congestion與其他未改 subsystem generation均不假升。

### Previous Batch Step Yielding release

`11.29.2-batch-step-yielding` 把「10 步」的排程責任正式收斂到 Presentation / UI layer。單步 `step(1)` 仍同步執行一個完整 `E.tick()` 後 render；manual `step(10)` 先建立 UI-only batch context與 busy state，在第一個 tick 前先讓出一次 browser event loop，之後每個**完整** tick 之間再讓出一次。單一 `E.tick()` 內沒有 `await`、partial render或 cancellation checkpoint，因此 runtime hook ordering、same-tick visibility、RNG與 canonical simulation semantics不變。

Intermediate manual-batch tick 仍照既有 registry 順序呼叫 Presentation afterTick observers，但 `uiObservability.render-mobile-summary`、`residentView.schedule`、`relationshipView.schedule` 會 coalesce / defer真正 refresh；最後一個 tick才恢復正式 refresh，接著 `src/ui/core.js` 做一次 core full render。Manual batch期間 `step / step10 / play`、runtime layer、決策原因、scenario load與 simulation-dependent workspace互動會被 UI-only busy / inert policy阻擋；Reset保留可用，先 invalidates batch generation，再 reset回 canonical state，舊 continuation不得再執行 tick或 stale final render。Autoplay期間則停用 manual step controls，仍保留 play作pause與Reset。

這是玩家可觀察的 Presentation / scheduling contract變更，因此 overall current marker與 `SimUI.PRESENTATION_VERSION` 跟隨 patch升版；World Authoring `world-authoring-v7`、Furniture Catalog `furniture-definitions-v7`、Horizontal Geometry、Spatial、Route、Locomotion、Dynamic Congestion、Physical與其他未改 subsystem generation均不假升。Interaction winner-result reuse仍是獨立延後候選，不屬本 release。

### Previous Slot Interaction Egress Fix release

`11.29.1-slot-interaction-egress` 修正家具 Slot 姿勢離開後再前往一般互動目標時的 action lifecycle 次序。若 Agent 已在目標的有效 interaction position，仍可直接維持坐姿／躺姿互動；只有在目前不能直接互動且仍綁定 Slot 時，`moveToInteraction()` 才先透過既有 `standUp() → slotEgressNodes()` 離開 Slot，下一 tick 再以合法 floor node 執行 `bestInteractionPosition()` 與 production Route 查詢。這避免把家具 Slot 的 coarse anchor 當成 Human 可站立 floor route 起點，進而把其實可達的 portable object 誤判成「找不到能接近的位置」。

Focused regression 使用 default world seed `20260912`，重現 Human 從餐椅 Slot 嘗試拿取落在 `(4,5,0)` 的 `cupB`：修正前 route scoring 全部為不可達、Agent 留在 sitting；修正後先合法 egress，重新取得 pickup goal，並可繼續拿起杯子。問題在 PR #119 前的 baseline 已存在，因此不是 8-direction Slice 2 regression。

本 patch 改變玩家可觀察到的 simulation semantics，因此依版本規範升 overall current marker；但 World Authoring、Furniture Catalog、Horizontal Geometry、Spatial Traversal、Spatial Passage、Route、Locomotion、Dynamic Congestion、Physical 與 Spatial Identity contract 均未改，各 subsystem generation 維持原值。

### Previous Shared Horizontal Geometry Foundation release

`11.29.0-horizontal-geometry-foundation` 建立 8-direction implementation 的第一個可執行基礎，但**尚未啟用 production diagonal routing**。新增 `src/horizontal-geometry.js` 作為 Authoring／Runtime 未來共用的 pure geometry owner：它不讀 Agent、Crowding、Route cost 或 runtime global state，從 adapter snapshot 派生無向、Agent-independent `HorizontalConnection`。cardinal `distanceMeters = 1`；diagonal `distanceMeters = sqrt(2)`。斜向第一版採 B+ conservative local geometry，同時考慮相關 cardinal Boundary／Door、Furniture metric solids、fixed blocker、explicit Passage constraint 與 shared-corner free-space，並以 `candidate / blocked / unsupported` 區分可證明 passage、可證明阻斷與第一版無法安全證明的情況。

`SimWorldAuthoring.deriveHorizontalTopology(...)` 現額外回傳 ephemeral `horizontalConnections`，但 serialized World Authoring shape 完全不變；`world-authoring-v7` 與 `furniture-definitions-v7` 因此維持原 generation。legacy `cells[].adjacent / componentId / components` 仍只表示 cardinal compatibility coarse topology，Initializer／Editor 舊 consumer 不會因 diagonal candidate 被污染。Agent-specific MovementEnvelope feasibility 不回寫 connection；focused regression 同時鎖住 open corner、wall／Door、單／雙 Furniture narrowing、complete cut、ambiguous `unsupported`、multi-region `unsupported`、canonical endpoint/resource 與 legacy cardinal parity。

本 release 只落地 shared horizontal geometry foundation 與 Authoring projection；`SimSpatial.getPassageProfile`、Spatial Traversal neighbor generation、Route distance／step semantics、Locomotion execution timing、Dynamic Congestion、Contact 與 Slot corner semantics都尚未接 diagonal。因此 Spatial Traversal `11.28.0-furniture-local-geometry`、Spatial Passage `11.28.0-positioned-passage-options`、Route `11.24.0-route-locomotion-cost`、Locomotion `11.24.0-locomotion-objective-burden`、Dynamic Congestion `11.28.0-effective-passage-width`、Physical `11.17.0-passage-profile-multimode` 與 Spatial Identity `11.22.0-spatial-z-identity` 均不假升。

### Previous Preview Boundary Presentation release

`11.28.2-preview-boundary-presentation` 修正 Simulator / Editor Preview 對 World Boundary / Door canonical truth 的呈現落差。Runtime map 現直接從 `state.map.boundaries` 投影格線牆：`kind:"wall"` 顯示為 cell edge line，普通 `kind:"opening"` 不顯示實牆線；若 opening boundary 被 root `state.doors` 引用，則依 Door `open / closed` state 顯示不同的 Door edge 樣式。投影依目前 runtime Z layer 篩選，切換到沒有 boundaries 的 layer 不殘留其他層邊線。

這是 Presentation-only contract 更新：不改 World Authoring `world-authoring-v7`、Furniture Catalog `furniture-definitions-v7`、runtime map / Door schema、Spatial topology / Passage / Route / Locomotion / Crowding semantics，也不新增第二份 wall truth。舊 `.sim-tile.terrain-wall / terrain-doorway` 樣式暫保留給低階 compatibility fixture，但 canonical Simulator wall presentation只讀 `state.map.boundaries / state.doors`。因正式玩家可見 Simulator surface 改變，overall current marker 升 patch；`SimUI.PRESENTATION_VERSION` 與 current-marker-owned UI version 依既有規則跟隨 release marker。

### Previous Furniture Facing Semantics release

`11.28.1-furniture-facing-semantics` 修正 Furniture orientation contract 的語意不一致。Furniture Catalog 升為 `furniture-definitions-v7`：Definition canonical orientation 改為 `south`；directional Furniture 以 `orientationSemantics:"facing"` 表示 Instance `orientation` 是正面／主要 facing，床的 facing 定義為 head → foot；沒有自然正面的 Furniture 以 `orientationSemantics:"frame"` 保留 quarter-turn local-frame transform，但 Editor 不顯示 facing arrow。

World Authoring 升為 `world-authoring-v7`。Furniture Instance shape 仍是 `id / definitionId / origin / orientation / optional name`，但同一個 orientation value 的 compatibility semantics 已改變，因此不能沿用 v6 generation。Default world 為保留既有實際擺法，dining table / sofa 改為 `south`、bed 改為 `north`，四張餐椅維持既有 east / west facing。New Furniture Instance 預設 explicit `south`。

Editor 的 `↑ → ↓ ←` 只代表 directional Furniture 的 facing；frame-only Furniture 顯示 0° / 90° / 180° / 270° local-frame rotation。這次不新增 45° Furniture orientation，也不改 Spatial Traversal / Passage、Route、Locomotion、Physical、Spatial Identity 或 Dynamic Congestion generation。產品尚未正式公開，因此不建立 v6 → v7 migration；unsupported generation 仍由 current import boundary 拒絕。

### Previous Furniture Local Geometry release

`11.28.0-furniture-local-geometry` 將 Furniture physical obstruction 從 whole-tile `spatial.floor.mode / spatial.under` 收斂為 Furniture-local 公尺制 3D AABB `spatial.solids`。Furniture Catalog 升為 `furniture-definitions-v6`；Surface 以 `onSolid:{key,face:'top'}` 派生 coarse cells，Slot 保留 stable `<instanceId>:<slotKey>` 並新增 rotated `approachEdges`。World Authoring Instance shape 未改，因此維持 `world-authoring-v6`。

Spatial Traversal 升為 `11.28.0-furniture-local-geometry`，由 floor-start solids、單一格內 free region與 directional edge intervals 派生 partial-tile traversal；同 tile 多個 disconnected floor regions仍拒絕。Spatial Passage 升為 `11.28.0-positioned-passage-options`，同一 edge 可有多個位置化 `options`，避免把不同位置的最大寬度與高度拼成虛構 passage。Dynamic Congestion 升為 `11.28.0-effective-passage-width`，讀目前 locomotion mode 真正選中的 `effectiveClearanceWidth`。

Slot occupancy 同步改成 `route to approach → settle → occupy slot`；slot-bound Agent 的 coarse anchor 不算 ordinary floor occupancy，離開必須先選合法且未被其他 ordinary Agent 佔用的 egress，無可用 egress時不得 teleport 或清掉 slot posture。Default bed 改為 2×2、`origin:{x:8,y:5,z:0}, orientation:'south'`；四張餐椅朝向餐桌；老周 opening placement由 `(7,3)` 改為 `(7,4)`。

本 release 不加入 8-direction、sideways / step-over / jump / climb、movable-furniture metric translation、PoseEnvelope / static fit、45° Furniture orientation、Nav Cell / micro-grid或 continuous Agent local position。Physical、Route、Locomotion、Spatial Identity 等未改 contract 的 generation維持原值。

### Previous Room Value Legacy Removal release

`11.27.2-room-value-legacy-removal` 移除沒有 gameplay consumer 的 legacy Room value aggregate。Spatial `recomputeRooms()` 仍負責 Room topology、identity、membership、boundary / Furniture集合與 area，但不再把 floor material、boundary material、Furniture legacy `value` 與 Door parity constant 混成 `room.value`。Furniture Catalog 同步換代為 `furniture-definitions-v5`：Definition 移除 `compatibility.roomValueContribution`，shared resolver 不再投影 runtime Furniture `value`。Default Door 也移除只為歷史 parity 存在的 `compatibility.roomValueContribution: 18`，`313.6` regression 改為明確鎖定 Room / Furniture 不再帶 legacy `value`。

這次不建立新的經濟／資產、品質、prestige、美學或舒適度模型；既有 `comfortAt()` 與 Room topology / memory / social room-membership consumer 都保持原 ownership。World Authoring 的 canonical Instance shape 沒有改，因此維持 `world-authoring-v6`；Furniture Definition / resolver contract 有實質改變，所以 Catalog 換代為 `furniture-definitions-v5`。Spatial Traversal / Passage、Route、Locomotion、Physical、Spatial Identity、Dynamic Congestion、Relationship 與 Memory subsystem generation 均不跟著假升。由於 runtime derived state shape 與 Catalog contract 改變，overall current marker 推進一個 patch。

### Previous Resident Private Badge release

`11.27.1-resident-private-badge` 將 Resident View「最近發生的事」中的 owner-private event 從正文前綴「自己的經驗・」改為獨立「私人」badge。事件正文仍直接使用 canonical event text；公開事件不顯示 badge，private event 仍只有 owner 本人可在自己的 Resident View 看見。

這是純 Presentation / observability contract 更新：不改 World Event 的 `visibility / owner` truth、不改 requester-private `privateSocialOutcome`、Memory / Appraisal / Relationship / Affect，也不改 simulation hook 或 observer ordering。World Authoring 維持 `world-authoring-v6`，Furniture Catalog 維持 `furniture-definitions-v4`；Spatial Traversal / Passage、Route、Locomotion、Physical、Spatial Identity、Dynamic Congestion、Relationship 與 Memory subsystem generation 全部維持既有 marker。由於正式玩家可見 Resident View surface 改變，依本文件規則升 overall patch marker，`SimUI.PRESENTATION_VERSION` 與其他 current-marker-owned UI version一併跟隨。

### Previous Furniture Orientation release
`11.27.0-furniture-orientation` 將 Furniture 朝向正式納入 canonical authoring。World Authoring 升為 `world-authoring-v6`：Furniture Instance 新增 required `orientation: north | east | south | west`，`origin` 維持目前 resolved footprint 的 NW／左上 placement anchor，不因旋轉自行平移。Furniture Catalog 同步升為 `furniture-definitions-v4`，Definition 以 north 為 canonical local frame，shared resolver 統一把 footprint、display offset、slot 與 surface coverage 轉成 oriented local geometry後再套用 Instance origin；rotated geometry 不 persistent 成第二份 truth。

Editor 的 `rotateFurniture(...)` 沿用 atomic clone → apply → validate → canonicalize → commit contract。明確 `supportId === furnitureId` 的 Container position / interaction port 會使用同一 local↔world transform 跟隨旋轉；slot-bound Resident 保留 stable `<instanceId>:<slotKey>` reference。方向 marker 只在 Furniture 被選取或新增／放置／拖曳預覽時顯示，平常不常駐。Source interaction ports 不因本 release 改 ownership。

本 release 沒有改 Spatial Traversal、Spatial Passage、Route Semantics、Locomotion、Physical、Spatial Identity 或 Dynamic Congestion contract，因此它們維持既有 generation：Spatial Traversal `11.26.0-vertical-structure-traversal`、Spatial Passage `11.26.0-vertical-structure-passage`、Route `11.24.0-route-locomotion-cost`、Locomotion `11.24.0-locomotion-objective-burden`、Dynamic Congestion `11.26.0-vertical-flow-congestion`。產品尚未正式公開，因此 v5→v6 / Catalog v3→v4 不建立 production migration machinery；unsupported generation 仍由 current import boundary 拒絕。

### Current Vertical Structure Traversal release

`11.26.0-vertical-structure-traversal` 建立第一個 concrete cross-Z traversal contract。Canonical World Authoring 升為 `world-authoring-v5`，新增獨立 root `structures`；第一版正式 Structure kind 為抽象 `stair`，persistent facts 只保存 `id / kind / lower / upper` 與可選 `clearanceWidth / clearanceHeight`。Authoring 不保存 `upCost / downCost`、adjacency、PassageProfile 或 Route score；`SimWorldAuthoring.deriveStructureConnections(...)` 與 runtime Spatial 從相同 world facts 派生真正的 cross-Z edge。沒有明確 Structure 時，同 XY different Z 仍不可達，`deriveHorizontalTopology(...)` 仍保持同層 horizontal owner。

Spatial Passage 正式接受 Structure edge，PassageProfile 會回報 `edgeKind: "structure"` / `structureId` 並把 Structure clearance 與既有 under / edge constraint 組合。第一版 stair 只允許既有 `walk`；Physical 沒有新增 `climbAbility`、slope 或 step-rise axis。Directional traversal burden 由 system-owned stair profile 派生，目前 additive objective burden 為上樓 `+1`、下樓 `+0.5`，因此維持 `up > down >= flat`；這些是 Route objective facts，不寫回 Structure instance，也不由 `speedFactor` 推導。

空樓梯仍可在 1 個 movement tick 完成單一 abstract edge，不硬編 `stair = 2 ticks`。Dynamic Congestion 將 movement direction 從 XY 擴為 XYZ，並繼續使用 Passage `clearanceWidth` 的既有 pressure → `delayTicks` 模型；因此狹窄樓梯在人多或逆向流時可以自然增加 execution ticks，而不新增 stair-specific timing hack 或 `flowCapacity` contract。Editor 只新增 Structure Scene Inspector / lower-upper endpoint observability與 Preview round-trip；不加入完整 Structure 建立／拖曳、3D stair mesh、continuous slope、per-step geometry、jump/vault/climb、ladder/elevator。

本 release 因 cross-Z graph semantics、Structure Passage 與 vertical crowding direction 各自換代 Spatial Traversal `11.26.0-vertical-structure-traversal`、Spatial Passage `11.26.0-vertical-structure-passage`、Dynamic Congestion `11.26.0-vertical-flow-congestion`。Furniture Catalog 維持 `furniture-definitions-v3`；Route Semantics、Locomotion、Physical、Spatial Identity 沒有改 contract，因此維持原 generation。

### Previous Furniture Traversal Geometry release

`11.25.0-furniture-traversal-geometry` 將 Furniture traversal geometry 正式收斂到 Definition owner。Furniture Catalog generation 升為 `furniture-definitions-v3`：Definition 以 `spatial.floor.mode = open / solid / under` 明確區分 footprint 與 floor traversal 的關係，沿用既有 `spatial.under` 作低淨空唯一 truth，並新增可選 `spatial.surface` 持有 traversable surface、`allowKinds` 與 surface-specific `moveCost / transitionCost` override。resolver 從 local geometry + Instance origin 派生 world footprint、`<instanceId>:<surfaceKey>` 與 surface cells；Furniture Instance 仍只保存 `id / definitionId / origin / optional name`，因此 `world-authoring-v4` 不跟著假升。

Default dining table 的 `.72m` under-clearance、`diningTable:surface` identity、桌下 passage、桌面 contact / Surface Environment 與 route cost parity 均保留，但 `src/spatial-traversal.js` 不再對 `diningTable` instance ID 補 traversal / surface truth。Spatial Traversal contract 因正式改為 generic Furniture geometry consumer，換代為 `11.25.0-furniture-traversal-geometry`；Spatial Passage、Route Semantics、Locomotion、Physical、Crowding 未改各自 contract generation。本 release 不加入 vertical traversal、rotation/orientation、jump/vault/climb、Room value 正式模型或 Resident View 私人 badge。

### Previous Locomotion Traversal Cost release

`11.24.0-locomotion-traversal-cost` 補齊 production route objective 對 locomotion mode / mode-transition 的客觀成本。Locomotion 現正式持有 mode traversal burden：walk `0/edge`、kneelCrawl `1/edge`、proneCrawl `2/edge`，每次 locomotion mode 切換另加 `1` objective burden；Route / Spatial Traversal 只負責把它與既有 environmental / Surface edge cost、Crowding `congestionCost` 組合成 `traversalCost`。因此短但必須匍匐的捷徑不再只因 edge 數較少就自動勝過稍長步行路線，但當步行繞路真的更昂貴或 crawl 是唯一可行 route 時仍可選 crawl。

`travelTime` 仍只表示真實 execution timing：`transitionTicks + edgeMoveTicks`，而 `speedFactor` 只影響 edge movement ticks；個體速度 override 不會偷偷等比例改寫 objective burden。主觀 willingness、禮儀、尊嚴感、carefulness 等仍不進 Physical feasibility 或客觀 `traversalCost`。本次因此換代 Route Semantics 為 `11.24.0-route-locomotion-cost`，Locomotion contract 為 `11.24.0-locomotion-objective-burden`；Physical / Passage、Spatial Traversal / Passage、Dynamic Congestion、World Authoring 與 Furniture Catalog generation 均維持原 marker，不跟著假升。

### Previous Editor Source Port Observability release

`11.23.1-editor-source-port-observability` 修正 Editor 對 Source interaction geometry 的可觀測性缺口。Editor map 現直接投影 canonical `interactionPorts`：互動格以小型方向標記指出角色應站的位置與面向來源的方向；點擊標記可直接選取所屬 Source。Source Inspector 同時對具有 `fill` affordance 的水源顯示「取水位置」，並保留 port 自己的 label / position。Default `tap` 因此會在左側互動格 `(5, 5, 0)` 顯示指向本體的 `→`，Inspector 顯示「水龍頭左側 · (5, 5, 0)」，不再要求作者從 runtime 行為猜測可互動面。這次不改 `world-authoring-v4` shape、不改 Source interaction geometry / refill 行為，也不改 Furniture Catalog、Spatial Traversal / Passage、Physical / Route / Locomotion / Crowding 等 subsystem generation；因正式玩家可見 Editor observability surface 改變，overall current marker 升一個 patch。

### Previous World Boundary / Door / Exit release

`11.23.0-world-boundary-door-exit` 完成 Grid / Wall decision gate 的正式落地與 Door / Opening / Exit 分離。Canonical authoring 升為 `world-authoring-v4`：`map.cellSizeMeters = 1` 明確定義 coarse Tile 與 SI metric geometry 的換算邊界；普通牆／結構開口改由每層 `boundaries` 持有，不再把 `wall / doorway` 當 Cell terrain。Door 改成獨立 root entity，只持有 opening boundary reference 與 `open / closed` state；off-map world Exit 另外持有 boundary reference 與內側 access position。Furniture Catalog 因移除 `front-door` Definition、`runtimeExitSlotKeys` 與 `canExit` compatibility bridge，換代為 `furniture-definitions-v2`；External Supply 改用正式 Exit identity。為避免 ownership refactor 偷改既有 Room value，default Door 暫以 `compatibility.roomValueContribution` 保存原本 front door 的 18 點貢獻；這只是窄 parity bridge，不建立正式 Door value 模型。Spatial topology、room flood-fill、PassageProfile 與 route 共用同一 boundary interpretation；wall / closed Door 阻斷 edge，opening / open Door 保留 edge，opening 的 metric `clearanceWidth / clearanceHeight` 進入 PassageProfile。因此 Spatial Traversal contract 換代為 `11.23.0-boundary-traversal`，Spatial Passage contract 換代為 `11.23.0-boundary-passage-profile`。Physical、Route Semantics、Locomotion、Crowding、Spatial Identity、Relationship、Memory 等未改 contract 的 subsystem generation 不跟著假升。產品尚未正式公開，因此 v3→v4 不建立 production migration machinery；unsupported schema / catalog generation 由 current import boundary 直接拒絕。

### Previous Editor-3 release

`11.22.3-editor-authoring-presentation` 完成 **Editor-3｜Authoring presentation polish**。正式 `material` authoring contract 維持既有 `world-authoring-v3`：Editor 新增 Cell 材質編輯，可設定、替換與清除既有 `material`，常用 `wood / stone` 只作輸入提示，不建立新的封閉 material enum；所有修改仍經 `SimEditorAuthoringMutations` 的 clone → apply → validation → canonicalize → commit 流程。作者主要可見文案改為自然繁體中文，正式 identifier 只在必要的進階／診斷位置保留；runtime boundary 改為預設收合的進階資訊。Desktop 左右操作 panel 增加 viewport-scoped sticky / independent scroll，mobile 保留單欄與 map internal scroll並補足主要控制項的觸控高度。這是玩家可見 Editor 功能／interaction surface 的 patch-level 更新，因此推進 overall current marker；`world-authoring-v3`、`furniture-definitions-v1` 與 Physical / Passage / Route / Locomotion / Crowding / Spatial Identity / Relationship / Memory 等 subsystem generation 均不假升。

### Previous Editor-2 release

`11.22.2-editor-furniture-definitions` 完成 Furniture Definition / Instance authoring slice。新增 pure system-owned `SimFurnitureDefinitions` Catalog（`furniture-definitions-v1`），並將 canonical authoring 升為 `world-authoring-v3`：document 以 `furnitureCatalogVersion` pin catalog generation，Furniture Instance 只保存 `id / definitionId / origin / optional name`；intrinsic name/icon/kind、local footprint/display offset、slot、under-clearance與 activity suitability 由 Furniture Definition 持有，再由 shared resolver / initializer 投影為 world geometry與既有 runtime compatibility shape。Editor 新增 Catalog → create flow；new / duplicate instance ID 使用 `<definitionId>-N`，duplicate 只複製 instance-owned facts與 placement，不複製外部 references。因 canonical authoring package shape與玩家可見 Editor surface 都改變，因此 overall current marker 升 patch；Physical 11.17、Passage 11.17、Route 11.18、Locomotion 11.19、Crowding 11.20、Spatial Identity 11.22.0 等 subsystem generation 不假升。產品尚未正式公開，因此 v2→v3 不建立 production migration machinery；current import 對 unsupported schema/catalog generation直接拒絕。

### Previous Editor-1 release

`11.22.1-editor-resident-capabilities` 完成第一個 Editor Usability / Authoring Model 實作切片。新增 pure `SimEmbodimentCapabilities` authoring-safe capability contract，讓 Editor 與 runtime Physical / Locomotion 共用 Human / Cat default Physical template、locomotion mode ↔ posture vocabulary與姿勢查詢，不為 Editor 複製第二份物種規則，也不啟動 simulation。Resident free placement 收斂為單一 capability-aware move flow：作者明確選擇合法 free posture；bound Resident 移到自由位置時明確解除 furniture / slot reference；slot posture selector 同樣只顯示 resident kind + slot capability允許的選項。這是玩家可見 Editor policy / interaction surface 更新，因此依本文件規則升 overall current patch marker；`world-authoring-v2` shape、Physical 11.17、Passage 11.17、Route 11.18、Locomotion 11.19、Crowding 11.20 與 Spatial Identity 11.22.0 generation均不假升。

### Previous Slice E release

`11.22.0-spatial-z-identity` 將 authoring中的 Z-level正式接入 runtime identity。`map.tiles` 使用單一 flattened index，z=0維持 `x,y` compatibility key、non-zero z使用 `x,y,z`；base Spatial helper、Spatial Node / route state、Room / Surface Environment / Memory spatial ref、occupancy / contact / crowding與 simulator layer presentation共用 `z ?? 0` semantics。Initializer可編譯 multi-layer `world-authoring-v2`，但本 slice不加入任何 vertical structure或跨 Z traversal edge，所以無 concrete structure 時跨層 route仍 unreachable。這同時改變 persistent runtime map shape、Spatial semantics與玩家可見 layer presentation，因此使用新 minor marker `11.22.0-spatial-z-identity`。Authoring仍是 `world-authoring-v2`；Physical / Passage / Route / Locomotion / Crowding / Relationship / Memory generation不假升。

### Previous D.1C release

`11.21.4-editor-playtest-bridge` 新增玩家可見的 Editor→Simulator playtest flow，但不改 `world-authoring-v2` shape，也不改 Physical / Passage / Route / Locomotion / Crowding / Relationship / Memory subsystem generation。Editor 在 launch 前用 current authoring validation + runtime compatibility preflight 拒絕 invalid schema、broken references、multi-layer / non-zero Z；成功 handoff 只存在同 origin `sessionStorage`，並且只有 explicit `?preview=editor` simulator load 會消費。`SimWorld.createInitialStateFromAuthoring(...)` 與 default `createInitialState(...)` 共用同一 named initial-state pipeline，Preview Reset 重建同一 snapshot；normal simulator load 不受先前 preview 影響。因此這是 current product / presentation + bootstrap contract 的 patch-level 更新，使用 `11.21.4-editor-playtest-bridge`，authoring generation 維持 `world-authoring-v2`。
### World authoring contract version

World authoring 另有獨立 contract generation：current `SimWorldAuthoring.VERSION = "world-authoring-v7"`，canonical package 保存 `authoringSchema: "world-authoring-v7"`、`furnitureCatalogVersion: "furniture-definitions-v7"`、`map.cellSizeMeters = 1`、root `structures` 與 Furniture Instance required `orientation`。Furniture Catalog generation由 `SimFurnitureDefinitions.VERSION` 獨立持有。

只有 authoring package shape / compatibility需要新 generation時才升 `world-authoring-vN`；本 release 雖未改 Furniture Instance 欄位 shape，但改變了 `orientation` 的 compatibility semantics，所以 World Authoring 換代為 v7。Furniture Catalog 同步以 south-canonical local frame、`orientationSemantics` 與 shared resolver contract 換代為 current `furniture-definitions-v7`。Current Spatial Traversal / Passage / Crowding 分別維持 `11.28.0-furniture-local-geometry`、`11.28.0-positioned-passage-options`、`11.28.0-effective-passage-width`；Physical、Route、Locomotion、Spatial Identity也維持原 generation。

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
- `minor`：新的 subsystem / 明確產品 slice 或較大的 current contract 階段；例如 11.14 建立 Player Resident View / Debug Inspector split，11.15 建立 persistent Relationship Foundation，11.16 建立 Physical Profile Foundation，11.17 建立 Passage Profile + multi-mode traversal feasibility，11.18 建立 Route Semantics Split，11.19 建立 Locomotion Execution + Posture Transition，11.20 建立 Dynamic Congestion。
- `patch`：同一 minor 線內的可辨識 feature / contract 更新；例如 11.14.1 增加 player-readable action explanations、11.14.2 對齊 Resident Action / Intent / Explanation 的玩家語意、11.14.3 將 Explanation 的玩家文案收斂為自然直接的原因描述、11.14.4 將玩家可讀 Inspector 擴展到 Container / Source / Furniture / Tile / Room / Event、11.15.1 讓既有 Relationship Foundation 第一次以 bounded target preference 影響 initiator-side social target selection、11.15.2 再讓 responder 自己的 directional Relationship 以 bounded modifier 影響 Human talk / animal pet response score。
- `slug`：描述 current marker 的主要辨識功能，不是完整 changelog。

不是每個 PR 都需要版本號。PR 編號、Git commit 與 runtime version 是不同維度：一個版本可以包含多個 refactor/docs PR；反之，一個真正改變 current contract 的 PR 必須同時處理版本更新。

### 檔名 / workflow family 不是 current release marker

Current UI source與 current regression test / workflow 已使用 semantic filename；檔名本身不再承擔 current release marker。Subsystem generation仍由正式 schema/runtime marker表示，DOM data attribute或 historical console/output label若保留舊 generation字樣，也不得反推為整體 current release。

判斷**整體 current release** 時，以 `state.version`、`SimRelease.VERSION / SimWorld.VERSION`、`SimUI.PRESENTATION_VERSION`、玩家可見 app version 與 Current 文件為準；判斷**某 subsystem generation** 時，才看該 subsystem 自己的 schema/runtime marker。不得因整體 runtime 推進到 11.20.0 就把沒有 generation 變更的 Physical / Passage / Route / Locomotion / Relationship / Memory marker 假升到 11.20.0，也不得從舊 family 檔名反推整體 current release。

若未來 subsystem generation 改變，舊 family 名稱造成實質誤導，再另行 rename；單純 current marker 推進不要求 rename。

## Version consistency checklist

需要升版的 PR 必須同步確認：

1. `src/release.js` 的 canonical current runtime marker；
2. 本次新增／改變 contract 的 generation marker（目前包含 `SimWorldAuthoring.VERSION / authoringSchema` 與 `SimFurnitureDefinitions.VERSION / furnitureCatalogVersion`；Physical / Passage / Route / Locomotion / Crowding / Relationship / Memory marker 只有自身 contract generation 改變時才升），並確認未變更 subsystem 不被假升版；
3. `state.version` / `SimRelease.VERSION` / `SimWorld.VERSION` / `SimUI.PRESENTATION_VERSION`；
4. 由 Presentation current marker 持有的 UI version（目前包含 Resident View、Physical View、Locomotion View、Entity Readable View；其他 subsystem UI 依其 owner contract 判斷）沒有形成第二份 release marker；
5. `index.html` 的 browser `<title>` 維持穩定、不複製 runtime 版本；頁首 current-version display 則必須與 current release 同步；
6. `README.md` current runtime marker；
7. `docs/architecture.md` / `docs/tick-pipeline.md` 若記載 current runtime marker，必須同步；若文件刻意只記 subsystem contract，則不得為了版本同步改寫無關語義；
8. presentation / browser regression 的 expected version；
9. Notion Architecture Current / relevant Current Design 文件。

`tests/presentation-observability.mjs` 與對應 presentation regression 負責鎖定 repo 內可自動驗證的 version consistency。若 feature 已改但版本 marker 沒更新，PR review / Current documentation sync 仍必須把它視為 release-contract 缺漏，而不是單純 docs 問題。

## Historical correction

PR #55 / #56 屬 ownership / compatibility lifecycle refactor，未改正式 simulation policy，因此不補造中間 release version；PR #58 為 docs-only，也不升版。PR #57 改變 canonical plan event 的 structured contract，但這次不回補虛構的歷史 release；其 contract hardening 保留在 Git history / Architecture Current。PR #59 實際新增玩家可見的 player-readable action explanation，因此 current line 從 `11.14.0-player-resident-view-debug-inspector` 校正為 `11.14.1-player-readable-action-explanations`。其後 Resident View 的 Action / Intent / Explanation presentation semantics 以 11.14.2 獨立升版；11.14.3 再把 Explanation 的玩家文案規則收斂成「同一 evidence 能用自然日常語言表達時，不暴露需求 threshold / engine 強度術語」，仍不改 simulation policy。11.14.4 再把 readable Inspector 從 Agent 擴展到非居民 entity；這仍是 presentation-only projection，不新增 Container / Furniture 等第二份玩家狀態。

11.15.0 正式新增 Agent-local persistent `relationships[counterpartId]` state、historical Appraisal → Relationship consolidation semantics，以及玩家可讀／Debug Relationship surface。這同時觸及 persistent schema、simulation semantics 與 observability，因此使用新的 minor marker `11.15.0-relationship-foundation`；該 Foundation 當時刻意保持 decision-inert。

11.15.1 在同一 minor 線內完成動物互動 canonicalization（`interactWithAnimal / petAnimal`）並讓 Relationship 第一次進入 initiator-side social target ranking。Relationship influence 僅作 bounded target preference：`relationshipTargetDelta = 8 × familiarity × affinity`，與 Memory influence、distance penalty 一起決定「找誰」，但不加入 action-level social utility、不 hard-ban 負向 target，也不修改 responder policy、current-intent utility、soft-switch threshold 或 commitment。因此使用 patch marker `11.15.1-relationship-target-preference`。

11.15.2 再加入 **Relationship → Responder Bias**。Relationship runtime 只提供 directional unitless `relationshipSignal = familiarity × affinity`；Human talk 與 animal pet responder subsystem 各自持有自己的 bounded scaling，目前 cap 均為 `±0.18`。Human responder-specific `talkResponseUtility` 可因 response score 改變，但 general `E.baseUtilityForAction(...,'talk')`、initiator social Action utility、target preference、current-intent utility、soft-switch threshold 與 commitment 不變。World Event 不保存 response-score decomposition 或 Relationship internals，Debug 只即時派生 `base + Relationship delta → final`。因此這是 simulation semantics + observability 的 patch-level current contract 變更，使用 `11.15.2-relationship-responder-bias`。

11.16.0 正式建立 **Physical Profile Foundation**。每個 Agent 新增 authoritative `physical` state，第一版包含 `mass / volume / bodyGeometry / locomotionCapabilities / locomotionProfiles`；`SimPhysical.getMovementEnvelope(agent, mode)` 從個體 profile 即時派生 `clearanceHeight / clearanceWidth / clearanceLength / speedFactor`，不保存第二份 envelope cache。既有 Spatial 家具下 clearance 改為消費 canonical Physical `requiredClearance`，同時維持 Human `1.65 m`、Cat `0.32 m` 對餐桌下 `0.72 m` 的預設行為 parity；單一個體 geometry / locomotion profile override 則可改變自己的 feasibility，不再由 `kind` 硬鎖。Debug Inspector 新增 Physical Profile / standing MovementEnvelope observability。本 slice 刻意不加入 crouch / kneelCrawl / proneCrawl、姿勢切換、traversal timing、crowding geometry 或人格／Relationship 對 locomotion willingness 的影響。由於這同時新增 persistent physical schema、新 subsystem interface、Spatial consumer semantics 與正式 Debug observability，因此使用新的 minor marker `11.16.0-physical-profile-foundation`。

11.17.0 正式加入 **Passage Profile + multi-mode traversal feasibility**。Physical locomotion baseline 從舊 `standing` 正名為 `walk`，與 Agent `posture.kind='standing'` 分離；Human 第一批提供 `walk / kneelCrawl / proneCrawl` MovementEnvelope，Cat 本 slice 只保留 `walk`。Spatial 新增 edge-derived `PassageProfile`，第一版比較 height / width，未設定軸以 `null` 表示 unconstrained；`traversalFeasibility(...)` 只回各 supported mode 的 `feasible / failedAxes`，不選 mode、不讀心理狀態。v11.17 當時的 production A* 仍是 walk-only execution，但已對每條 edge 消費 walk feasibility，因此 passage width/height 成為真正 routing constraint，同時 crawl-query 可行仍不會自動改姿勢穿越。Deterministic single-passage + water fixture 鎖住 normal / low / lower / width-only 四種情況。本 slice 刻意不加入 PoseEnvelope/static fit、length/turn clearance、traversalCost/travelTime split、locomotion execution/posture transition 或 behavioral willingness。由於 Physical contract、Spatial traversal semantics、Debug observability 與測試契約都實質改變，因此使用新的 minor marker `11.17.0-passage-profile-multimode`。

11.18.0 正式完成 **Route Semantics Split**。原本 `SP.pathDistance()` 實際直接回傳 weighted route cost；本 slice 新增 canonical `SimSpatial.planRoute(...)`，把 selected route 的 `pathDistance / traversalCost / travelTime` 分開，並讓 standalone `pathDistance` 搜尋 physical-feasible shortest topology route、`traversalCost` 搜尋最低客觀 route burden。既有 A* 與 gameplay consumer 全部繼續以 traversal cost 為預設 objective，因此 route preference / AI balance 保持 parity；Memory / Relationship target decomposition 的 `distancePenalty` 正名為 `accessPenalty`，source 改讀 traversal cost，但數值與 target ordering維持。第一版 `travelTime` 只反映 current executable walk edges（一 edge一 tick），不提前使用尚未進 execution 的 `speedFactor`。Debug 同步分開顯示 distance / cost / time。由於 canonical Spatial route API、decision decomposition、observable Debug surface 與 current semantics 都改變，因此使用新的 minor marker `11.18.0-route-semantics-split`。


11.19.0 正式完成 **Locomotion Execution + Posture Transition**。Production route planner 可用 `mode:'auto'` 在 supported + passage-feasible locomotion modes 中規劃，route state 正式包含 Spatial Node + locomotion mode；core `moveToward()` 實際執行 selected mode。posture 與 locomotion mode 保持分離但明確 mapping：`walk → standing`、`kneelCrawl → kneeling`、`proneCrawl → prone`，mode/posture 切換固定先消耗 1 tick。MovementEnvelope 的 `speedFactor` 首次進入真正 execution timing，以 `ceil(1 / speedFactor)` 決定每 edge movement ticks；route `travelTime` 因此由 transition + actual edge timing 派生並由 runtime兌現。新增 `agent.locomotion { mode, phase }`、Locomotion validator與 Debug projection；舊 Physical / Passage / Route / Relationship / Memory subsystem marker均不假升。Behavioral willingness、crowding、PoseEnvelope與新的 exertion model仍未納入。由於 persistent Agent execution state、route search semantics、movement timing、posture lifecycle與正式 observability都改變，因此使用新的 minor marker `11.19.0-locomotion-execution-posture`。


11.20.0 正式完成 **Dynamic Congestion**。新增 derived / uncached `SimCrowding.getCrowdingProfile(...)`，把當下 Agent occupancy、movement direction、MovementEnvelope width 與已知 PassageProfile width轉成 soft `congestionCost` 與 movement delay。其他 Agent不修改 PassageProfile，也不產生hard block；狹窄處錯身的額外時間代表側身、錯步、短暫停頓與調整移動方式。route planning把 crowding snapshot納入 `traversalCost / travelTime`，core execution在每次重新規劃下一條edge時讀取當下 congestion，因此 actual travel time可和較早estimate不同。舊 floor `occupiedCount × 5/2.5`與 `bestInteractionPosition()` 的 raw occupancy優先排序在production Crowding runtime下停止重複計算。Debug新增next-edge congestion pressure / cost / delay / speed / occupants。第一版不做Agent overlap hard block、reservation、yielding、deadlock、collision或behavioral willingness。由於 route objective burden、實際movement timing與正式observability都改變，因此使用新的minor marker `11.20.0-dynamic-congestion`；Physical / Passage維持v11.17、Route維持v11.18、Locomotion維持v11.19等各自generation。

11.21.0 正式完成 **Geometry-derived Horizontal Topology**。`world-authoring-v2` 把 Furniture under-clearance 等 concrete geometry納入 canonical authoring，並提供 explicit `world-authoring-v1 → v2` migration；legacy default dining-table 的 `.72m` clearance只在 migration邊界轉成正式資料，不再由 runtime ID fallback補值。`SimWorldAuthoring.deriveHorizontalTopology(authoring,{z})` 成為 Editor preview、initializer diagnostics與 runtime compatibility compilation共用的 pure horizontal geometry interpretation：`floor / doorway` 提供 structural openness，solid Furniture / fixed entity可關閉 connectivity，under-clearance則保留 connectivity並交給 PassageProfile判斷個體 mode feasibility。`tile.walkable / tile.furnitureIds` 保留為 derived runtime compatibility fields，正常 Editor不 author traversal flags。此版刻意不把 `z` 納入 Spatial Node / occupancy / route identity；Physical / Passage維持v11.17、Route維持v11.18、Locomotion維持v11.19、Crowding維持v11.20。


11.21.1 新增 **Editor Scene Inspector**：Editor 由 canonical authoring 即時投影 Furniture / Objects / Residents scene list、typed map markers與共用 ephemeral selection/focus，並在主模擬器 toolbar 提供 Editor 入口。這是玩家可見產品 surface 變更，因此依本文件規則使用 11.21 patch marker；simulation semantics、persistent state shape、`world-authoring-v2` generation，以及 Physical / Passage / Route / Locomotion / Crowding / Relationship subsystem markers均未改變。


11.21.2 新增 **Editor Entity Lifecycle / Mutation Semantics**。Editor 的 Furniture / Container / Source / Resident entity mutation集中到 pure `SimEditorAuthoringMutations` owner；正式操作以 clone → apply → `SimWorldAuthoring.validateAuthoring` → commit 保證 atomicity。Furniture move會維持既有 explicit Container `supportId` relation並同步 follower interaction ports；Container移到 support-capable footprint時要求作者明確選 Floor 或 Furniture support；Source不新增 `supportId`。同型 Furniture duplicate使用 deterministic instance / global-unique slot IDs且不複製外部 references；referenced Furniture delete以 structured blocker report拒絕 cascade。Resident generic move只支援 unbound exact placement，bound/anchor Resident必須 explicit convert-to-exact-standing或 furnitureSlot rebind。這是玩家可見 Editor功能，因此升 current patch；persistent authoring fields仍全屬既有 `world-authoring-v2`，Physical / Passage / Route / Locomotion / Crowding / Relationship 等 subsystem generation不變。D.1B2 drag、D.1C playtest bridge與 runtime Z identity仍未加入。

11.21.3 新增 **Editor Furniture Drag UX**。Desktop Furniture marker使用 Pointer Events與 explicit movement threshold區分 click selection / drag；pointer move只生成 full-footprint ghost、explicit `supportId` follower preview與 valid-invalid drop state，不改 canonical document。preview與正式 drop都委派既有 `SimEditorAuthoringMutations.moveFurniture(...)`，browser regression要求同一 source/target的 click placement與 drag drop產生相同 canonical semantic fingerprint。Touch/mobile仍保留 click/tap placement。這是玩家可見 Editor interaction surface，因此升 current patch；`world-authoring-v2`、runtime Spatial identity以及 Physical / Passage / Route / Locomotion / Crowding / Relationship subsystem generation均不變。D.1C playtest bridge與 runtime Z identity仍未加入。
