# Architecture — v11.9 Sleep Pressure / Circadian Profile

本文件描述目前正式架構。v10.4 以前的 wrapper / patch runtime 只存在 Git history；v11.7 清除 Unified Core 內殘留的案例特判、重複 truth 與 post-load API mutation；v11.8 移除最後的抽象 bulk hauling state `Agent.carrying`，所有角色搬運資源都回到真正 Container；v11.9 再把「活動疲勞」與「睡眠需求」正式拆成兩個生理量，並加入由 Species profile + Agent phase offset + 世界時間推導的節律層。

## 1. 模組責任

```text
world.js
→ 世界資料、species profile、entity capability、role、policy、初始狀態

spatial.js
→ topology、Room、dynamic blocker、A*、interaction geometry、局部環境

engine.js
→ 唯一 tick、decision、sleep pressure / circadian derived logic、generic resource verbs、action lifecycle、物流流程

state-validator.js
→ pure invariant validation

ui.js
→ read-only projection / Inspector / timeline / controls
```

任何模組不得在載入後包裝或覆寫另一模組的 `tick / reset`。Validator 不得修改 Engine API；UI 不得補 simulation state。

## 2. 單一真相

### Agent

```text
Agent.position           → 物理位置
Agent.action             → 目前 action state machine
Agent.posture            → standing / sitting / lying
Agent.held               → 手持 portable Container
Agent.needs.fatigue      → 活動造成的短期身體疲勞
Agent.needs.sleepNeed    → 清醒時間累積的睡眠需求
```

`fatigue` 與 `sleepNeed` 不互相充當 alias。短休可以降低 fatigue，但不能把「沒睡夠」當成已恢復；真正 sleeping 才會降低 sleepNeed。

`Agent.carrying` 已不存在。角色搬運 bulk resource 時，資源必須存在某個被角色實際持有的 Container.contents。

Container 不保存 `heldBy`；`holderOf(containerId)` 由 `Agent.held` 推導。

### Species sleep profile

物種提供預設睡眠／節律資料，而不是由 Engine 以特定 Agent ID 或場景腳本決定：

```text
SPECIES_PROFILES[kind]
→ circadianPattern
→ sleepNeedGainPerTick
→ sleepNeedRecoveryPerTick
→ minSleepTicks / maxSleepTicks
→ minimumSleepNeed
→ sleepOpportunityThreshold
→ naturalWakeSleepNeed
→ noiseWakeThreshold
```

目前：

```text
human → diurnal
cat   → crepuscular
```

Agent 可用 trait 覆寫：

```text
traits.circadianPattern
traits.circadianPhaseOffsetMinutes
traits.sleepRecoveryRate
```

`circadianPhaseOffsetMinutes` 用於同一物種中的早型／晚型差異。正值代表整個節律向後延；它不是新的 clock state。

### Derived sleep state

以下資料不保存進 Agent：

```text
circadianSleepBias(agent, minute)
sleepPropensity(agent, minute)
naturalWakeDrive(agent, minute)
```

它們由 `state.minute`、species profile、Agent traits 與目前 needs 即時計算，避免第二份節律／睡眠真相。

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

Validator 也會確認每個 Agent 的 `sleepNeed` 為 0–100 有限值，個體 circadian override 僅能使用正式 pattern，phase offset 必須是有限數值。

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

角色開始移動時會離開 sitting / lying posture。因此「醒來」與「起床」是不同事件：Sleep action 結束可以繼續 lying；真正移動時才 `standUp()`。

v11.9 沒有新增 Tile 內第二套 pathfinding 座標。若未來狹窄通道、碰撞、家具比例或移動步幅長期無法合理表示，再評估提高 resolution。

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

角色不帶 carrier 就不能進入正式外出 hauling 階段。若外出中途因 fatigue / sleepNeed / thirst / hunger 過高而提早返回，角色會先回到出口，再由一般 abort / finish lifecycle 把持有容器留在實際位置。

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

## 13. Rest / Sleep / Circadian

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

### Rest

Short rest 只把「活動累」當作主要需求：

```text
fatigue 高
→ 找 canRest surface
→ sitting / lying / floor rest
→ 依 restQuality + local noise + recoveryRate 降低 fatigue
→ sleepNeed 不降低；因仍清醒而繼續累積
```

因此躺在床上並不等於 sleeping。Agent 可以躺床短休，休息結束後也能維持 lying 姿勢思考下一個行動。

### Sleep need

Awake tick 會依 species profile 增加：

```text
sleepNeed += sleepNeedGainPerTick
```

被動 fatigue drift 只保留極小值；步行、搬運、工作等活動疲勞仍主要來自 `applyExertion()`。這避免把「清醒時間」同時重複算進 fatigue 與 sleepNeed。

### Circadian pattern

第一版正式 pattern：

```text
diurnal
nocturnal
crepuscular
```

目前基準：

```text
human = diurnal
cat = crepuscular
```

Pattern 決定一天內 `circadianSleepBias` 的形狀；Agent `circadianPhaseOffsetMinutes` 只把整個曲線向前／向後平移。

這個 bias 不會禁止角色在特定時段睡眠。高 sleepNeed 仍可壓過不利時段，因此它是軟性 preference，不是 hard schedule。

### Sleep decision

Sleep candidate 由以下條件形成：

```text
有合法 canSleep target
sleepNeed >= species minimumSleepNeed
sleepPropensity >= species sleepOpportunityThreshold
```

其中：

```text
sleepPropensity
= sleepNeed
+ circadianSleepBias
+ 少量高 fatigue contribution
```

fatigue 不再是「能不能睡」的固定 threshold。

### Sleeping

進入 `sleeping` phase 後：

- fatigue 依 `sleepRecoveryInfo()` 降低；
- sleepNeed 依 species `sleepNeedRecoveryPerTick × sleepEfficiency × sleepRecoveryRate` 降低；
- sleepEfficiency 仍受 sleep surface quality 與即時噪音影響；
- hunger / thirst 等 background drift 以較低倍率持續，而不是完全凍結。

### Wake conditions

Sleep action 可以因以下條件結束：

```text
自然醒：達到最短睡眠時間，且 sleepNeed + circadian wake tendency 已允許醒來
強烈口渴
強烈飢餓
強烈局部噪音
maxSleepTicks 安全上限
睡眠位置失效
```

自然醒不要求 `fatigue === 0`，也不要求固定 `fatigue <= 12`。醒來事件會保存 fatigue、sleepNeed、sleepEfficiency、circadianBias、sleepPropensity 與 wakeReason。

午睡與整段主睡眠使用同一個 action；睡眠長度由進入時 sleepNeed、節律時段、環境與後續需求自然產生。

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

Sleep wake event 另外保存 structured `wakeReason / sleepNeed / fatigue / sleepEfficiency / circadianBias / sleepPropensity`，Inspector 可直接讀正式數據。

Agent Inspector 顯示完整 `sleepNeed`、effective circadian pattern、個體 phase offset、目前 circadian bias 與 sleep propensity；快速 Agent card 以短標籤「睡意」顯示同一個 `needs.sleepNeed`，不是另一份 UI state。

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

Logistics regression 驗證：

- 室內 food restock 真的先拿物流籃、先把 food 放入籃中，再卸到 destination；
- 外出補給必須在離家前持有物流籃；
- 外出取得的 food 在入庫前實際存在物流籃；
- 卸貨後籃子變空並留在實際 destination interaction position；
- 同一物流容器裝越多資源，movement exertion 越高；
- reservation 排他、資源守恆與中斷清理成立。

Sleep pressure regression 驗證：

- human default `diurnal`、cat default `crepuscular`；
- nocturnal override 與個體 phase offset 真的改變 derived circadian bias；
- rest 降低 fatigue 但不清除 sleepNeed；
- 高 fatigue / 低 sleepNeed 會選 rest，而非由 fatigue 強制 sleep；
- 低 fatigue / 高 sleepNeed 仍可選 sleep；
- natural wake 可在仍有 fatigue 時發生，而且醒來後 posture 仍可 lying；
- extreme thirst 與 strong noise 可喚醒；
- sleeping 真的降低 sleepNeed。

## 17. 目前未做

v11.9 完成的是「fatigue / sleepNeed split + species circadian profile + derived sleep propensity + first wake conditions」。尚未加入：

- 睡眠階段（NREM / REM）或醫學級 sleep architecture；
- 長期 sleep debt、跨多日慢性睡眠不足後果；
- daylight / lighting 對 circadian phase 的真實 entrainment；
- 鬧鐘、工作行程、社會時鐘；
- Agent chronotype 自動學習或隨環境逐日漂移；
- 睡眠不足對 coordination / mood / cognition 的獨立長期作用；
- 多手／inventory／同時持有多個容器；
- 推車等不屬於手持 `Agent.held` 的 hauling mode；
- Container durability、破損、固體掉落；
- carrier 類型偏好、容量需求預估與多趟工作排程；
- storage ownership / personal inventory。

Sleep 的後續擴充應延伸 `SPECIES_PROFILES`、Agent sleep traits 與 derived wake/sleep functions，不要重新把睡眠壓力塞回 fatigue，也不要建立重複的 persistent circadian state。物流擴充則應繼續擴充 Container / hauling capability，不重新建立平行的 `Agent.carrying` state。
