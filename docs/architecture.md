# Architecture — v11.7 Core Consolidation

本文件描述目前正式架構。v10.4 以前的 wrapper / patch runtime 只存在 Git history，不是現行模型；v11.7 進一步清除 Unified Core 內仍殘留的案例特判、重複 truth 與 post-load API mutation。

## 1. 模組責任

```text
world.js
→ 世界資料、entity capability、role、policy、初始狀態

spatial.js
→ topology、Room、dynamic blocker、A*、interaction geometry、局部環境

engine.js
→ 唯一 tick、decision、generic resource verbs、action lifecycle

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
Agent.held       → 手持 Container
Agent.carrying   → 尚未物件化的 bulk resource hauling
```

Container 不保存 `heldBy`；`holderOf(containerId)` 由 Agent state 推導。

### Exclusive use

```text
state.reservations
```

只表示「前往使用途中」的暫時 exclusive claim。角色正式坐／躺後，slot occupancy 由 `Agent.posture.slotId` 表示。

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
canEatFrom
canDrinkFrom
servingDish
```

例如：

```text
ready-food container
roles: [readyFood]
restock:
  resource: food
  low: 18
  strategy: carryResource
  sourceRole: foodReserve
```

```text
water storage
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

Engine 只查 capability / role / policy，不查目前場景的 entity ID。

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

因此同一物件可以是：

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

v11.7 沒有新增 Tile 內第二套 pathfinding 座標。若未來狹窄通道、碰撞、家具比例或移動步幅長期無法合理表示，再評估提高 resolution。

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

角色主動 transfer 必須通過 `actorCanTransfer()`，並使用 Interaction Geometry 驗證來源位置。

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
→ 把容器帶到 resource source
→ transfer
→ 放下

carryResource
→ 去 source
→ 取得 bulk resource
→ 搬到 destination
→ deposit
```

因此「補水桶」與「補現成食物」不是兩個特殊 executor。

## 9. External Supply

外出補給使用：

```text
canExit slot
externalSupplyDestination role
preferredResource
```

Engine 不知道門或食物櫃的 ID。

補給狀態只保存統計：

```text
supply.trigger
supply.trips
supply.totalProduced
```

目前 worker 由 active action 推導。

## 10. Food / Serving

- `canEatFrom`：可直接進食的 Container。
- `servingDish`：可拿來盛食物的 portable Container。
- `readyFood` role：正常盛盤時偏好的食物來源。
- `foodReserve` role：室內補充 ready food 的來源。

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

## 11. Drink

人類先找 portable `canDrinkFrom` vessel；若 vessel 沒有所需 resource，再從目前可用 Source / Container 選擇來源。

貓直接從可飲用 Container 中依可達距離選來源。

Resource selection 是依 `water / alcohol` 等 resource capability，不綁具體物件 ID。

## 12. Rest / Sleep / Posture

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

## 13. Carry Load

```text
resourceLoad = amount × Resource.loadPerUnit
containerLoad = emptyLoad + Σ(contents load)
effectiveCarryLoad = held Container load + carrying resource load
```

負重影響 movement exertion，再透過既有 exertion model 影響 fatigue / thirst / hunger。

不保存 `currentLoad` cache。

## 14. Event / Inspector contract

事件 `data.entities` 保存 structured refs：

```text
agent:<id>
container:<id>
source:<id>
furniture:<id>
slot:<id>
```

UI 的最近相關事件只讀 refs，不解析事件自然語言來猜關聯。

## 15. Architectural regression

CI 除玩法測試外，直接禁止：

- Engine 出現目前世界的具體 entity ID。
- `supply.workerId` 回流。
- Validator 後載入修改 Engine API。
- Validator 把結果寫回 simulation state。
- World 以 entity ID skip list 建立 blocker。
- `planLabel` 等舊 compatibility alias 回流。
- 舊 wrapper / enhancer module 回流。

## 16. 尚未完成但不是補丁

目前 `Agent.carrying` 仍是 bulk resource hauling 的抽象表示。它已與 Container 共用負重模型，但尚未物件化為 basket / box 等 Logistics Container。這是明確的未完成系統層，不是為單一案例加入的例外；若未來進物流物件化，應直接取代 `Agent.carrying`，而不是再疊第三種搬運模型。
