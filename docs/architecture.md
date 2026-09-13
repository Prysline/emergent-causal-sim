# Architecture — v11.10 Sleep Social Stimulus / Response

本文件描述目前正式架構。v10.4 以前的 wrapper / patch runtime 只存在 Git history；v11.7 清除 Unified Core 內殘留的案例特判、重複 truth 與 post-load API mutation；v11.8 移除最後的抽象 bulk hauling state `Agent.carrying`；v11.9 把活動疲勞與睡眠需求拆成 `fatigue / sleepNeed` 並加入 Species circadian profile；v11.10 再把社交互動拆成「發起 action → target stimulus → 是否喚醒 → 是否回應」，使睡眠中的目標不再因一次社交 action 自動醒來或自動做出 reciprocal response。

## 1. 模組責任

```text
world.js
→ 世界資料、species profile、entity capability、role、policy、初始狀態

spatial.js
→ topology、Room、dynamic blocker、A*、interaction geometry、局部環境

engine.js
→ 唯一 tick、decision、sleep / circadian / social-stimulus derived logic、generic resource verbs、action lifecycle、物流流程

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
Agent.pendingInteraction → 已真正形成、仍可回應的短期互動請求
```

`fatigue` 與 `sleepNeed` 不互相充當 alias。短休可以降低 fatigue，但不能把「沒睡夠」當成已恢復；真正 sleeping 才會降低 sleepNeed。

`pendingInteraction` 也不能拿來表示「有人對睡著角色做過某件事」。只有目標真正處於可回應狀態時才建立 pending request；未喚醒的睡眠 disturbance 只存在 event / cause chain，不另存虛構的待回應狀態。

`Agent.carrying` 已不存在。角色搬運 bulk resource 時，資源必須存在某個被角色實際持有的 `Container.contents`。Container 不保存 `heldBy`；`holderOf(containerId)` 由 `Agent.held` 推導。

### Species sleep profile

物種提供預設睡眠／節律資料：

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

`circadianPhaseOffsetMinutes` 用於同一物種中的早型／晚型差異；它不是新的 clock state。

### Derived sleep / arousal state

以下資料都不保存進 Agent：

```text
isSleeping(agent)
circadianSleepBias(agent, minute)
sleepPropensity(agent, minute)
naturalWakeDrive(agent, minute)
interactionWakeChance(agent, stimulusIntensity)
```

`isSleeping` 直接由 `Agent.action.intent === sleep && phase === sleeping` 推導。`interactionWakeChance` 讀現有睡眠 state 與本次 stimulus，不新增 persistent `sleepDepth / arousal` truth。

### Exclusive use

`state.reservations` 只表示「前往使用途中」的暫時 exclusive claim。角色正式坐／躺後，slot occupancy 由 `Agent.posture.slotId` 表示；角色拿起 Container 後，ownership 由 `Agent.held` 表示。

### Supply worker

不保存 `state.supply.workerId`。活動中的 worker 由 `Agent.action.intent === 'externalSupply'` 推導。

### Validation

`SimValidator.validateState(state)` 是 pure function，回傳 `{ ok, issueCount, issues, crowdingTiles }`。Validator 會確認 `sleepNeed` 為 0–100 有限值、circadian override 合法、phase offset 為有限數值，也保留 sleeping posture / canSleep 等 invariant。

## 3. World 是資料，不是流程腳本

Entity 可以使用 `roles / preferredResource / restock / interactions / portable / capacity / emptyLoad / transportResources / canEatFrom / canDrinkFrom / servingDish`。

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

Engine 只查 capability / role / policy，不查目前場景的 entity ID；目前世界雖有「搬運籃」，Engine 不認 `basket` ID。

## 4. Tile、Room 與 blocker

Tile 保存 terrain base：`terrain / material / walkable / surface.contents / roomId / furnitureIds`，不保存 `staticBlockedBy` cache。

`SimSpatial.blockerAt()` 即時由 terrain、blocking furniture、無 support 的 fixed Container 與 fixed Source 推導。Room 由 floor topology flood-fill 推導；不是用途 Zone，也不直接提供休息或噪音魔法加成。

## 5. Interaction Geometry

正式 API：

```text
interactionGeometry(state, target, agent, affordance)
interactionPositions(...)
bestInteractionPosition(...)
isAtInteraction(...)
```

幾何規則屬於 **affordance + target data**。現行 mode：`occupy / reach / supportReach / port / slot / socialReach / tileContact / heldReach`。

同一物件可同時 `pickup → occupy`、`drinkFrom → reach`。固定設備可用 `interactionPorts`；有 `supportId` 的物件可由 furniture footprint 推導 `supportReach`。

## 6. Movement

A* 使用 12×8 Tile grid；不可達回傳 `[]`，Agent occupancy 是 soft cost，濕地增加 cost，一個 tick 最多移動一格。

角色開始移動時會離開 sitting / lying posture。因此「醒來」與「起床」不同：Sleep action 結束可繼續 lying，真正移動時才 `standUp()`。

## 7. Resource verbs

底層資源只透過 `amountAt / capacityLeft / takeResource / putResource / transferResource / consumeFrom`。Endpoint 可為 Container、Source、Tile surface 或 Agent contact。角色主動 transfer 必須通過 `actorCanTransfer()` 與 Interaction Geometry；物流裝卸仍走同一個 `transferResource()`。

## 8. Restock

補充行為統一為 `restockContainer`，由 destination policy 決定 resource、threshold、strategy 與 source role。

`carryContainer`：把目的容器本身帶到 source 補充，例如水桶。

`logisticsContainer`：找相容 carrier → pickup → source → source-to-carrier transfer → destination → carrier-to-destination transfer → 放下空 carrier，例如 food reserve → ready food。

## 9. Logistics Container

正式 capability：

```text
roles includes logisticsContainer
portable = true
capacity > 0
transportResources = [...]
contents
emptyLoad
```

候選 carrier 必須資源相容、有容量、沒有不相容內容、未被別人持有／預約且可達。排序先偏好內容較少，再看距離。未來可加入箱子、麻袋、推車等 capability，而不重新建立 `Agent.carrying`。

## 10. External Supply

外出補給使用 `canExit slot / externalSupplyDestination / preferredResource / logisticsContainer`。

```text
選擇 externalSupply
→ 找出口 / destination / carrier
→ pickup carrier
→ 到出口並 offMap 工作
→ 新取得 resource 寫入 carrier.contents
→ 帶 carrier 回出口
→ 前往 destination
→ carrier → destination
→ 放下空 carrier
```

若 fatigue / sleepNeed / thirst / hunger 過高，角色提早返回並在實際位置中止。Supply 只保存 `trigger / trips / totalProduced`；worker 由 active action 推導。

## 11. Food / Serving

`canEatFrom` 是可直接進食 Container；`servingDish` 是可盛食物的 portable Container；`readyFood` 是正常盛盤來源；`foodReserve` 是補充來源；`logisticsContainer` 是 bulk 搬運載體。

一般人類：拿 serving dish → 找 readyFood → serve → 找座位 → eat。非常餓或沒有盤子時保留 direct-food fallback。貓不拿盤，但能直接吃可接近、未被別人持有的 `canEatFrom` Container。

## 12. Drink

人類先找 portable `canDrinkFrom` vessel；沒有目標 resource 時再找 Source / Container 裝取。貓直接從可飲用 Container 中依可達距離選來源。Resource selection 依 capability，不綁具體物件 ID。

## 13. Rest / Sleep / Circadian

### Rest

```text
fatigue 高
→ 找 canRest surface
→ sitting / lying / floor rest
→ 依 restQuality + local noise + recoveryRate 降低 fatigue
→ sleepNeed 不降低；因仍清醒而繼續累積
```

躺床不等於 sleeping；短休結束後也可以維持 lying 思考下一個行動。

### Sleep need / circadian

Awake tick 依 Species profile 增加 `sleepNeed`。Passive fatigue drift 僅保留極小值，活動疲勞主要來自 `applyExertion()`。

正式節律 pattern：`diurnal / nocturnal / crepuscular`；human default = diurnal，cat default = crepuscular。Pattern 決定 `circadianSleepBias` 曲線，Agent phase offset 只平移曲線。節律是 soft bias，不是 hard gate。

### Sleep decision

Sleep candidate 需要合法 `canSleep` target、達到 `minimumSleepNeed`，且 `sleepPropensity >= sleepOpportunityThreshold`。

```text
sleepPropensity
= sleepNeed
+ circadianSleepBias
+ 少量高 fatigue contribution
```

fatigue 不再是固定睡眠門檻。

### Sleeping / wake

Sleeping phase 會降低 fatigue 與 sleepNeed；sleepEfficiency 受 surface quality 與即時噪音影響。Sleep 可因自然醒、極端口渴、極端飢餓、強烈局部噪音、maxSleepTicks 或睡眠位置失效而結束。

自然醒不要求 `fatigue === 0`。醒來事件保存 fatigue、sleepNeed、sleepEfficiency、circadianBias、sleepPropensity、wakeReason。午睡與主睡眠仍共用同一個 sleep action。

## 14. Social Interaction / Sleeping Target

v11.10 的核心原則是：**interaction initiation、stimulus、wake、response 是四個不同事實。**

```text
發起者選擇 social action
→ 走到 social interaction position
→ 發生發起者真的做出的行為
→ 若 target 正在 sleeping，產生 stimulus
→ interactionWakeChance + seeded roll
→ target 可能醒，也可能繼續睡
→ target 是否回應由之後自己的 action 決定
```

### Target eligibility 依 intent 而不同

普通 `talk` 需要清醒對象。Human decision 透過 `nearestAgent(..., {allowSleeping:false})` 排除 sleeping human；若目標在路途中睡著，`stepSocial()` 會中止聊天，不會把 sleeping target 當正常對話者。

`petCat` 與 cat `seekHuman` 則允許 sleeping target，因為摸睡著的貓、貓去碰睡著的人本身都是真實可發生的行為。

### Stimulus 是 action outcome，不是 persistent state

目前第一版社交刺激：

```text
petCat    → touch，intensity 18
seekHuman → touch+sound，intensity 34
```

它們是該次 interaction 的 structured event data，不寫入 Agent 作長期狀態。

### Interaction wake chance

```text
interactionWakeChance
← stimulus intensity
← naturalWakeDrive
← remaining sleepNeed
← 是否仍在 species minSleepTicks 以前
```

高 sleepNeed、剛入睡會降低被輕刺激喚醒的機率；sleepNeed 已低、接近自然醒時，相同刺激較容易叫醒。結果使用既有 seeded RNG，因此 deterministic replay 仍成立。

目前沒有 NREM / REM 或 persistent `sleepDepth`。Wake chance 是簡化的 derived arousal model，不是醫學級睡眠階段模型。

### Wake != response

`tryWakeFromInteraction()` 只處理「刺激是否結束 sleeping」。成功喚醒仍保留 lying posture，且不自動執行 reciprocal response。

`petCat` 現在只描述人真的摸了貓，不再固定附加「貓靠過去蹭了幾下」。Sleeping cat 未醒時明確記錄「仍然睡著，沒有明顯回應」；即使醒來，也只是可以在下一輪自行決策。

Cat `seekHuman` 的喵叫與蹭碰是貓自己選擇並完成的 action，所以可直接敘述；若 human sleeping，只有真的被叫醒後才建立 `cat_request`。未醒就不會保存一個假裝已接收到的 pending request。

目前沒有 `selfTalk / mutter`。若未來加入，自言自語應是獨立 action，不能把普通 `talk` 對 sleeping target 當成 fallback。

## 15. Carry Load

```text
resourceLoad = amount × Resource.loadPerUnit
containerLoad = emptyLoad + Σ(contents load)
effectiveCarryLoad = held Container load
```

沒有 `Agent.carrying` 或 `currentLoad` cache。負重影響 movement exertion，再透過既有 exertion model 影響 fatigue / thirst / hunger。

## 16. Event / Inspector contract

事件 `data.entities` 保存 structured refs：`agent / container / source / furniture / slot`。UI 的最近相關事件只讀 refs，不解析自然語言猜關聯。

Sleep wake event 保存 `wakeReason / sleepNeed / fatigue / sleepEfficiency / circadianBias / sleepPropensity`。

v11.10 的 sleeping-social disturbance event 另外保存：

```text
stimulusIntensity
stimulusKind
wakeChance
wakeRoll
```

如果 interaction 真正喚醒 target，`sleepWake.causeIds` 會包含造成喚醒的 contact event，因此可追蹤 `接觸 → 喚醒` 因果鏈。

Agent Inspector 顯示 sleepNeed、effective circadian pattern、phase offset、circadian bias 與 sleep propensity。快速 card 的「睡意」只是 `needs.sleepNeed` 的短標籤，不是第二份 UI state。

## 17. Architectural regression

CI 直接禁止 Engine 綁定目前世界 entity ID、`Agent.carrying`／`carriedResourceLoad()`／`supply.workerId` 回流、Validator mutation、World entity-ID blocker skip list、舊 `planLabel` 與 wrapper/enhancer module 回流。

Logistics regression 驗證物資守恆、reservation 排他、中斷清理、carrier 位置與實際負重。

Sleep pressure regression 驗證 species circadian default / override、rest 不清 sleepNeed、高 fatigue/低 sleepNeed 選 rest、低 fatigue/高 sleepNeed 可 sleep、自然醒可殘留 fatigue、口渴／噪音喚醒與 sleeping 降低 sleepNeed。

Social / sleep interaction regression 額外驗證：

- ordinary talk 不把 sleeping human 列為候選；
- 輕摸高 sleepNeed、剛入睡的 cat 可完全不喚醒；
- `petCat` 不再固定宣告 reciprocal rub；
- sleeping cat 未醒時保留 sleep action並留下 no-response + wake chance / roll event；
- cat 可打擾 sleeping human，但未叫醒時不能建立 `cat_request`；
- 真正喚醒時 contact event 會成為 sleepWake cause；
- awake cat 被摸也不由 `petCat` action 虛構回蹭。

## 18. 目前未做

v11.10 完成的是「sleep pressure + circadian + sleeping social stimulus / wake / response separation」。尚未加入：

- 睡眠階段（NREM / REM）或醫學級 sleep architecture；
- persistent sleepDepth / arousal state；
- 長期 sleep debt、跨多日慢性睡眠不足後果；
- daylight / lighting 對 circadian phase 的真實 entrainment；
- 鬧鐘、工作行程、社會時鐘；
- Agent chronotype 自動學習或隨環境逐日漂移；
- 睡眠不足對 coordination / mood / cognition 的獨立長期作用；
- 一般化 personality-driven response matrix（接受摸觸、閃避、回蹭等尚未成為完整 response system）；
- `selfTalk / mutter`；
- 多手／inventory／同時持有多個容器；
- 推車等不屬於手持 `Agent.held` 的 hauling mode；
- Container durability、破損、固體掉落；
- carrier 類型偏好、容量需求預估與多趟工作排程；
- storage ownership / personal inventory。

Sleep 後續擴充應延伸 `SPECIES_PROFILES`、Agent sleep traits 與 derived wake/sleep functions；social response 應建立在 target 自己的 action / response 決策，不把結果寫死在 initiator narrative；物流則繼續擴充 Container / hauling capability，不重新建立平行 state。
