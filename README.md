# Emergent Causal Simulator

湧現式因果模擬器。用少量可組合規則觀察角色、物件、資源與環境如何自行形成因果鏈。

目前重構版本：**v11・Unified Core**。

> v11 的目標不是新增更多玩法，而是移除 v7～v10.4 累積的 wrapper／patch，重新建立單一空間、行動與狀態契約。

## 核心方向

```text
Tile / terrain     = 物理世界
Room               = 由牆、邊界、門的拓撲自動推導
Furniture / object = affordance、局部舒適與互動來源
Agent.position     = 角色位置唯一真相
Agent.action       = 唯一行動 state machine
Activity Area      = 未來可選用途 overlay，不提供環境魔法加成
```

舊版六個 `Zone` 不再負責：

- 噪音
- 休息品質
- 是否抵達物件
- 行動 prerequisite

現在局部環境由真正的 Tile、家具、液體、角色與噪音事件決定。

## v11 主要改變

- 12×8 Tile map 加入實體邊界牆與大門。
- Room 由 floor topology 自動 flood fill；目前小屋自然形成一個主室。
- 房間價值由 floor / wall / furniture 的簡化價值聚合，不再是手寫 Zone 數值。
- `zone.baseNoise` / `zone.restQuality` 移除；改用 `noiseAt(position)`、`comfortAt(position)`。
- 所有互動只看合法 interaction position，不再要求 Agent 與物件 `location` 相同。
- 角色只有 `action`，不再有 `plan + wrapper` 多層狀態。
- 每 tick 最多移動一格或推進一個 phase。
- `posture` 是正式 state：`standing / sitting / lying`。
- 家具 footprint 與 slot 分離；雙人沙發可同時容納兩名角色。
- 貓可以使用沙發，也可以在安全乾燥地板蜷下休息，不再出現「站著休息」只是 UI 預設值的狀況。
- 手持容器只有 `Agent.held` 一份 truth；Container 不再另外保存 `heldBy`。
- 短期 exclusive 使用統一放進 `state.reservations`。
- 地面液體直接存在 `Tile.surface.contents`，舊 Zone surface 相容層移除。
- 食物外出補給保留，但已整合進普通 `supplyFood` action。
- Inspector、地圖、Room、家具 slot、補給資訊全部由單一 `ui.js` 呈現。

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

已移除的歷史 patch layer 包括：

```text
action-guard.js
recovery.js / recovery-ui.js
supply.js / supply-ui.js
furniture.js / furniture-ui.js
seating.js
rest-surface.js
spatial-ui.js
styles/v101.css
styles/v103.css
```

Git history 仍保留這些版本，可供追溯。

## 現有行為

目前仍保留並重寫到新 core 的主要系統：

- 人類與貓的需求與加權決策
- Seeded RNG / deterministic replay
- 食物、水、酒與通用容器
- 酒瓶可直接喝，杯子仍具較高偏好
- A* Tile movement 與 soft crowding
- 局部濕地、滑倒、灑出、貓踩濕與舔毛攝入
- 人類主動找貓／橘子主動撒嬌／延後回應後追貓
- exertion / fatigue / recovery trait
- 家具 slot 與 Rest Surface
- 食物勞動補給閉環
- 時間線、Inspector、Room / Tile debug

## Room 與 Activity Area

v11 特別區分兩者：

### Room

物理拓撲產物。

牆、邊界與門決定哪些 Floor Tile 屬於同一個房間，可用於：

- 聲音衰減
- 未來溫度／煙霧傳播
- Room value
- 房間聚合資訊

### Activity Area / Zone

未來若需要，可以作為制度或用途標記，例如：

- 醫療區
- 餐廳
- 工作區
- 禁區
- 垃圾傾倒區

但 Area 本身不能讓一塊空地「因為被標成休息區就更舒服」。

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
- 站著吃 fallback
- supply 必須實際走到 pantry 才入庫
- A* unreachable → []
- index 不可再載入舊 wrapper

## 下一步候選

目前較合理的擴充順序：

1. **Serving / Plate**：從食物來源盛一份到可攜盤子，再找餐椅／沙發／其他位置吃。
2. **Sleep / Bed**：在現有 Rest Surface 上加入較強 commitment 與 wake conditions。
3. **Room topology**：加入真正隔間牆、可開關門，測試噪音／未來溫度跨 Room 傳播。
4. **Activity Area**：只有在需要制度化用途時才新增。
5. **Material / Quality**：讓家具與 Room value 有更完整的材質／品質來源。
6. **經濟系統**：等工作與物資閉環成熟後再決定是否加入貨幣。

`interaction commitment strength` 也已列為未來 memo，用來避免角色為了低強度社交互動追逐過遠，但目前不急著實作。

完整狀態契約請見 [`docs/architecture.md`](docs/architecture.md)。
