# Emergent Causal Simulator

湧現式因果模擬器。用少量可組合規則觀察角色、物件、資源與環境如何自行形成因果鏈。

目前版本：**v11.4・Carry Load / Resource Weight**。

> v11 先移除 v7～v10.4 累積的 wrapper／patch，重新建立單一空間、行動與狀態契約；v11.2 起在這個 core 上重新增加玩法。v11.3 把角色主動資源轉移納入物理 interaction contract；v11.4 再把手持 Container 與抽象搬運 Resource 收斂成同一套即時負重計算。

## 核心方向

```text
Tile / terrain     = 物理世界
Room               = 由牆、邊界、門的拓撲自動推導
Furniture / object = affordance、局部舒適與互動來源
Agent.position     = 角色位置唯一真相
Agent.action       = 唯一行動 state machine
Activity Area      = 未來可選用途 overlay，不提供環境魔法加成
```

舊版六個 `Zone` 不再負責噪音、休息品質、是否抵達物件或行動 prerequisite。局部環境由真正的 Tile、家具、液體、角色與噪音事件決定。

## v11.4：Carry Load / Resource Weight

負重使用內部的「負重單位」，不是公斤。重量完全由現行資料即時計算，不另外儲存會失同步的 `currentLoad`。

```text
Resource.loadPerUnit
Container.emptyLoad

containerLoad(container)
= emptyLoad
+ Σ(contents amount × Resource.loadPerUnit)

carriedResourceLoad(agent.carrying)
= amount × Resource.loadPerUnit

effectiveCarryLoad(agent)
= held Container load
+ carrying Resource load
```

因此同一套規則會自然涵蓋：

```text
空水桶 < 滿水桶
空餐盤 < 裝食物的餐盤
搬 10 單位食物 < 搬 40 單位食物
```

`moveToward()` 不再分別判斷「有沒有 held」與「有沒有 carrying」，只讀 `effectiveCarryLoad()` 並把負重轉成額外 movement exertion。舊的 `carrying.amount * .0015` 專用公式與固定 held surcharge 已移除。

所以現在可以形成：

```text
搬更多資源／容器內容增加
→ effectiveCarryLoad 上升
→ 同距離步行活動成本上升
→ fatigue / thirst / hunger 透過既有 applyExertion 鏈條受影響
→ 後續休息、喝水與其他需求決策改變
```

Inspector 會顯示 Agent 的「目前負重」、Container 的「空重／目前負重」，最近一次負重步行的 exertion 也會帶當時負重。

目前 `Agent.carrying` 仍可代表抽象搬運中的資源，例如從 pantry 搬食物、外出補給帶食物回家；這是暫時物流表示，但它現在和手持 Container 共用完全相同的重量來源與步行成本。未來若改成籃子／箱子等真正物流 Container，可直接沿用 `containerLoad()`，不需要另一套重量系統。

本版刻意**沒有**加入力量值、硬負重上限、超重禁止搬運、移動速度下降或背包 inventory。

## v11.3：Portable Water Bucket / Physical Transfer

水桶現在是普通 `portable` Container，不再是固定在水龍頭旁、可以被遠端寫入內容物的特殊儲水點。

補水流程：

```text
水桶水量偏低
→ 找到水桶
→ 預約／拿起水桶
→ 搬到水龍頭 interaction position
→ 在手上替水桶補水
→ 把水桶留在實際補水位置
```

同時加入 actor-mediated resource transfer contract：角色主動把資源從 A 轉到 B 時，角色必須能實際操作來源，而且目的 Container 必須在角色手上，或本身位於角色可直接操作的位置。若來源 Container 正被別人拿著，也不能直接從對方手上的容器抽取資源。

這條規則現在共用於水龍頭 → 手持容器、水龍頭 → 手持水桶、現成食物 → 手持餐盤。`transferResource()` 本身仍保留為底層物理 primitive，供灑出等不是「角色主動操作兩端」的資源轉移使用。

水桶改為可攜後，橘子也不會直接喝正在被其他角色拿在手上的水桶。

## v11.2：Serving / Plate

用餐不再把「食物來源」和「實際吃飯位置」綁在同一個 interaction point。

```text
想吃東西
→ 找可用餐盤
→ 拿起餐盤
→ 到現成食物旁盛一份
→ 找座位
   ├ 餐椅優先
   ├ 餐椅不可用時可選其他可坐家具
   └ 沒有合適座位時站著吃
→ 吃完
→ 空盤留在實際用餐位置
```

餐盤是普通 portable Container，具有 `servingDish / canEatFrom / contents.food`。橘子不會主動拿餐盤，但會直接吃可接近、仍有食物且沒有被別人持有的容器內容。人類非常餓或沒有可用餐盤時仍可直接吃。

家庭食物總量統計所有 Container 的 `contents.food`，避免食物從 `mealTray` 轉進餐盤後被誤判成庫存消失。

## v11 / v11.1 核心狀態

- 12×8 Tile map 有實體邊界牆與大門。
- Room 由 floor topology 自動 flood fill；目前小屋自然形成一個主室。
- `zone.baseNoise / zone.restQuality` 已移除；改用 `noiseAt(position) / comfortAt(position)`。
- 所有互動只看合法 interaction position，不要求 Agent 與物件 `location` 相同。
- 角色只有 `action`，每 tick 最多移動一格或推進一個 phase。
- `posture` 是正式 state：`standing / sitting / lying`。
- 家具 footprint 與 slot 分離；雙人沙發可同時容納兩名角色。
- 手持容器只有 `Agent.held` 一份 truth；短期 exclusive 使用統一放進 `state.reservations`。
- 地面液體直接存在 `Tile.surface.contents`。
- 食物外出補給保留，但整合進普通 `supplyFood` action。
- Inspector、地圖、Room、家具 slot、補給資訊全部由單一 `ui.js` 呈現。
- v11.1 加入 Target Lifecycle 基礎：entity missing / offMap 會強烈中斷；持續無法接近也不會永久等待。

## 現行檔案

```text
index.html
src/
├─ world.js
├─ spatial.js
├─ engine.js
├─ state-validator.js
└─ ui.js
styles/
├─ app.css
├─ spatial.css
└─ mobile.css
tests/
└─ v11-state-regression.mjs
docs/
└─ architecture.md
```

歷史 patch layer 已從現行 tree 移除，仍可由 Git history 追溯。

## 現有行為

- 人類與貓的需求與加權決策
- Seeded RNG / deterministic replay
- 食物、水、酒與通用容器
- Serving / Plate 與可攜餐盤
- 可攜水桶與 actor-mediated resource transfer
- Resource / Container Carry Load 與負重 exertion
- 橘子可直接吃盤中食物，但不拿盤子
- 酒瓶可直接喝，杯子仍具較高偏好
- A* Tile movement 與 soft crowding
- 局部濕地、滑倒、灑出、貓踩濕與舔毛攝入
- 人類主動找貓／橘子主動撒嬌／延後回應後追貓
- Target Lifecycle 基礎中斷
- exertion / fatigue / recovery trait
- 家具 slot 與 Rest Surface
- 食物勞動補給閉環
- 時間線、Inspector、Room / Tile debug

## Room 與 Activity Area

### Room

物理拓撲產物。牆、邊界與門決定哪些 Floor Tile 屬於同一個房間，可用於聲音衰減、未來溫度／煙霧傳播、Room value 與房間聚合資訊。

### Activity Area / Zone

未來若需要，可以作為制度或用途標記，例如醫療區、餐廳、工作區、禁區或垃圾傾倒區；Area 本身不能讓一塊空地因為被標成休息區就更舒服。

## 狀態與測試

GitHub Actions 會執行：

```text
node --check src/*.js
node tests/v11-state-regression.mjs
```

Regression 包含：

- 3 Seed × 800 tick invariant 長跑
- deterministic replay
- atomic movement / phase
- 跨舊 Zone 邊界取杯
- 貓休息 posture
- 雙人沙發 slot
- soft co-location
- 盛盤、右側餐椅、橘子吃盤中食物與直接吃 fallback
- 補水必須實際拿起水桶並搬到水龍頭
- 未持有水桶時不得遠端增加水量
- 橘子不能喝正在被別人持有的水桶
- **同角色同路程：滿水桶 exertion > 空水桶**
- **搬 40 單位食物 exertion > 搬 10 單位食物**
- Container 內容量改變後 `containerLoad()` 立即跟著改變，且沒有 cached `currentLoad`
- `effectiveCarryLoad = held Container + carrying Resource`
- 舊 `carrying.amount * .0015` 專用公式不得回流
- supply 必須實際走到 pantry 才入庫
- A* unreachable → `[]`
- offMap 社交目標強烈中斷
- index 不可再載入舊 wrapper

## 下一步候選

1. **Sleep / Bed**：在現有 Rest Surface、posture、fatigue 與 Carry Load 形成的活動成本上，加入較強 commitment、睡眠需求與 wake conditions。
2. **Logistics Container**：目前搬 pantry／外出補給食物仍使用抽象 `carrying`；未來若要增加籃子、箱子、掉落、容量與放置，可轉成真正 Container，而不重做重量系統。
3. **Room topology**：加入真正隔間牆、可開關門，測試噪音／未來溫度跨 Room 傳播。
4. **Dish lifecycle / cleanup**：收盤、清洗、髒污與餐具循環。
5. **Activity Area / Material / Quality / Economy**：等底層生活與物流閉環更成熟後再決定。

`interaction commitment strength / maxDistance / interruptPriority` 仍保留為未來 memo。

完整狀態契約請見 [`docs/architecture.md`](docs/architecture.md)。