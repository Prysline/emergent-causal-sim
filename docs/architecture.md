# Architecture — v11.8 Logistics Container

本文件描述目前正式架構。v10.4 以前的 wrapper / patch runtime 只存在 Git history，不是現行模型；v11.7 清除 Unified Core 內殘留的案例特判、重複 truth 與 post-load API mutation；v11.8 進一步移除最後的抽象 bulk hauling state `Agent.carrying`，所有角色搬運資源都回到真正 Container。

## 1. 模組責任

```text
world.js
→ 世界資料、entity capability、role、policy、初始狀態

spatial.js
→ topology、Room、dynamic blocker、A*、interaction geometry、局部環境

engine.js
→ 唯一 tick、decision、generic resource verbs、action lifecycle、物流流程

state-validator.js
→ pure invariant validation

ui.js
→ read-only projection / Inspector / timeline / controls
```

任何模組不得在載入後包裝或覆寫另一模組的 `tick / reset`。Validator 不得修改 Engine API；UI 不得補 simulation state。

## 2. 單一真相

### Agent

```text
Agent.position   → 物理位置
Agent.action     → 目前 action state machine
Agent.posture    → standing / sitting / lying
Agent.held       → 手持 portable Container
```

`Agent.carrying` 已不存在。角色搬運 bulk resource 時，資源必須存在某個被角色實際持有的 Container.contents。

Container 不保存 `heldBy`；`holderOf(containerId)` 由 `Agent.held` 推導。

### Exclusive use

```text
state.reservations
```

只表示「前往使用途中」的暫時 exclusive claim。角色正式坐／躺後，slot occupancy 由 `Agent.posture.slotId` 表示；角色拿起 Container 後，ownership 由 `Agent.held` 表示。

### Supply worker

不保存 `state.supply.workerId`。活動中的 worker 由：

```text
Agent.action.intent === 'externalSupply'
```

推導。

### Validation

Validation result 不存在 simulation state 裡：

```text
SimValidator.validateState(state)
→ { ok, issueCount, issues, crowdingTiles }
```

## 3. World 是資料，不是流程腳本

Entity 可以使用：

```text
roles
preferredResource
restock
interactions
portable
capacity
emptyLoad
transportResources
canEatFrom
canDrinkFrom
servingDish
```

例如 ready-food destination：

```text
roles: [readyFood]
restock:
  resource: food
  low: 18
  strategy: logisticsContainer
  sourceRole: foodReserve
```

物流容器：

```text
roles: [logisticsContainer]
portable: true
capacity: 55
emptyLoad: 0.8
transportResources: [food]
contents: {}
```

水 storage：

```text
roles: [waterReserve, refillable, drinkSource]
restock:
  resource: water
  low: 24
  strategy: carryContainer
  sourceRole: resourceSource
interactions:
  pickup: occupy
  drinkFrom: reach
```

Engine 只查 capability / role / policy，不查目前場景的 entity ID；目前世界雖然有一個名為「搬運籃」的 Container，Engine 不認 `basket` ID。

## 4. Tile、Room 與 blocker

### Tile

Tile 保存 terrain base：

```text
terrain
material
walkable   // terrain base only
surface.contents
roomId
furnitureIds
```

Tile 不保存 `staticBlockedBy` cache。

### Dynamic blocker

`SimSpatial.blockerAt(state, position)` 即時計算：

- terrain 是否允許通行；
- blocking furniture footprint；
- 無 support 的 fixed Container；
- fixed Source。

`walkable()` 只讀目前世界，因此固定物件移動後不需要同步 Tile cache。

### Room

Room 由 floor topology flood-fill 推導；它不是用途 Zone，也不直接提供休息或噪音魔法加成。

## 5. Interaction Geometry

正式 API：

```text
interactionGeometry(state, target, agent, affordance)
interactionPositions(...)
bestInteractionPosition(...)
isAtInteraction(...)
```

幾何規則屬於 **affordance + target data**，不是只屬於 entity type。

同一物件可以是：

```text
pickup    → occupy
drinkFrom → reach
```

現行 mode：

```text
occupy
reach
supportReach
port
slot
socialReach
tileContact
heldReach
```

物流籃目前 `pickup → occupy`；角色必須真的走進籃子所在 Tile 才能拿起。被角色持有後，其有效位置由 holder 推導。

### Support reach

若 Container 有 `supportId` 且沒有更明確 affordance rule，合法 interaction positions 由承載 Furniture footprint 外圍與 slot 推導。

### Port

固定設備可用 `interactionPorts` 指定操作 Tile；port 可以限定 `affordances`。

## 6. Movement

A* 仍使用 12×8 Tile grid：

- 不可達 → `[]`
- Agent occupancy → soft cost
- 濕地 → 額外 cost
- 一個 tick 最多移動一格

角色開始移動時會離開 sitting / lying posture。

v11.8 沒有新增 Tile 內第二套 pathfinding 座標。若未來狹窄通道、碰撞、家具比例或移動步幅長期無法合理表示，再評估提高 resolution。

## 7. Resource verbs

底層資源只透過 generic endpoint verbs：

```text
amountAt
capacityLeft
takeResource
putResource
transferResource
consumeFrom
```

Endpoint 可為 Container、Source、Tile surface 或 Agent contact。

角色主動 transfer 必須通過 `actorCanTransfer()`，並使用 Interaction Geometry 驗證來源／目的位置。物流裝貨與卸貨也不另外建立資源複製 API，仍走同一個 `transferResource()`。

## 8. Restock

補充行為統一為：

```text
restockContainer
```

由 destination 的 `restock` policy 決定 resource、threshold、strategy 與 source role。

目前 strategy：

```text
carryContainer
→ 去目的容器
→ pickup
→ 把目的容器帶到 resource source
→ transfer
→ 放下
```

適合「容器本身可以被帶去補充」的情況，例如水桶。

```text
logisticsContainer
→ 找可搬該 resource 的物流容器
→ 預約並 pickup
→ 把物流容器帶到 source
→ source → carrier
→ 帶著 carrier 到 destination
→ carrier → destination
→ 放下空 carrier
```

適合固定 source 與固定 destination 之間的 bulk hauling，例如 food reserve → ready food。

因此「補水桶」與「補現成食物」仍共用 `restockContainer` executor，只由 policy 選擇不同物理策略。

## 9. Logistics Container

正式 capability：

```text
roles includes logisticsContainer
portable = true
capacity > 0
transportResources = [...]   // 可選；省略表示不額外限制
contents
emptyLoad
```

候選 carrier 必須：

- 能搬指定 resource；
- 有剩餘容量；
- 不含不相容資源；
- 沒被其他 Agent 持有；
- 沒被其他 Agent reservation；
- 角色可實際走到 pickup interaction position。

目前候選排序先偏好內容較少的 carrier，再考慮距離。這是通用物流容器 contract，不是籃子專用規則；未來可以加入箱子、麻袋、推車而不增加新的 hauling state。

## 10. External Supply

外出補給使用：

```text
canExit slot
externalSupplyDestination role
preferredResource
logisticsContainer role
```

Engine 不知道門、食物櫃或籃子的 ID。

完整流程：

```text
選擇 externalSupply
→ 找出口與 destination
→ 找 compatible logisticsContainer
→ toCarrier
→ takeCarrier
→ toExit
→ exit
→ work offMap
→ 新取得 resource 寫入 carrier.contents
→ 返回 exit slot
→ toDestination
→ carrier → destination
→ 放下空 carrier
```

角色不帶 carrier 就不能進入正式外出 hauling 階段。若外出中途因 fatigue / thirst / hunger 過高而提早返回，角色會先回到出口，再由一般 abort / finish lifecycle 把持有容器留在實際位置。

補給狀態只保存統計：

```text
supply.trigger
supply.trips
supply.totalProduced
```

worker 由 active action 推導。

## 11. Food / Serving

- `canEatFrom`：可直接進食的 Container。
- `servingDish`：可拿來盛食物的 portable Container。
- `readyFood` role：正常盛盤時偏好的食物來源。
- `foodReserve` role：室內補充 ready food 的來源。
- `logisticsContainer` role：bulk food 搬運載體。

一般人類：

```text
拿 serving dish
→ 找 readyFood
→ serve
→ 找座位
→ eat
```

非常餓或沒有盤子時保留 direct-food fallback。

貓不拿盤，但能直接吃可接近、未被別人持有的 `canEatFrom` Container。

## 12. Drink

人類先找 portable `canDrinkFrom` vessel；若 vessel 沒有所需 resource，再從目前可用 Source / Container 選擇來源。

貓直接從可飲用 Container 中依可達距離選來源。

Resource selection 是依 `water / alcohol` 等 resource capability，不綁具體物件 ID。

## 13. Rest / Sleep / Posture

Furniture slot 可提供：

```text
canRest
canSleep
mealSeat
canExit
restQuality
sleepQuality
restPosture
allowKinds
```

Short rest 與 sleep 是不同 action；sleep 必須使用合法 `canSleep` slot。床與沙發差異由 slot quality / allowKinds 資料決定。

## 14. Carry Load

```text
resourceLoad = amount × Resource.loadPerUnit
containerLoad = emptyLoad + Σ(contents load)
effectiveCarryLoad = held Container load
```

沒有 `Agent.carrying`，因此也沒有第二個 abstract hauling weight path。空籃、裝 10 單位食物的籃子、裝 40 單位食物的籃子會自然得到不同 `containerLoad()`。

負重影響 movement exertion，再透過既有 exertion model 影響 fatigue / thirst / hunger。

不保存 `currentLoad` cache。

## 15. Event / Inspector contract

事件 `data.entities` 保存 structured refs：

```text
agent:<id>
container:<id>
source:<id>
furniture:<id>
slot:<id>
```

物流事件的 `carrier` 也會被 normalize 成 `container:<id>` ref。UI 的最近相關事件只讀 refs，不解析事件自然語言來猜關聯。

Agent Inspector 不再顯示抽象「搬運資源」欄位；若角色持有物流容器，直接顯示 Container 名稱、內容物與即時負重。

## 16. Architectural regression

CI 除玩法測試外，直接禁止：

- Engine 出現目前世界的具體 entity ID。
- `Agent.carrying` 回流。
- `carriedResourceLoad()` 回流。
- `supply.workerId` 回流。
- Validator 後載入修改 Engine API。
- Validator 把結果寫回 simulation state。
- World 以 entity ID skip list 建立 blocker。
- `planLabel` 等舊 compatibility alias 回流。
- 舊 wrapper / enhancer module 回流。

Regression 另外驗證：

- 室內 food restock 真的先拿物流籃、先把 food 放入籃中，再卸到 destination；
- 外出補給必須在離家前持有物流籃；
- 外出取得的 food 在入庫前實際存在物流籃；
- 卸貨後籃子變空並留在實際 destination interaction position；
- 同一物流容器裝越多資源，movement exertion 越高。

## 17. 目前未做

v11.8 完成的是「手持 portable logistics Container」的實體物流。尚未加入：

- 多手／inventory／同時持有多個容器；
- 推車等不屬於手持 `Agent.held` 的 hauling mode；
- Container durability、破損、固體掉落；
- carrier 類型偏好、容量需求預估與多趟工作排程；
- storage ownership / personal inventory。

這些若未來加入，應擴充 Container / hauling capability，不重新建立平行的 `Agent.carrying` state。
