# v11.6 Interaction Geometry

v11.6 不提高 12×8 pathfinding grid 的解析度，而是在 Tile 之上補一層「角色從哪裡能操作某個目標」的空間語意。

## 核心分工

```text
Tile / A*
→ 角色真正的移動與站位

Furniture footprint
→ 家具占用哪些 Tile、是否阻擋移動

Furniture slot
→ 坐、躺、睡等精確使用位置

Interaction port
→ 固定設備從哪一側操作

Support reach
→ 桌上／家具承載物從哪些外圍 Tile 可及
```

`interactionGeometry(state, target, agent, affordance)` 目前可回傳：

- `occupy`：必須與目標同 Tile。
- `reach`：同 Tile 或相鄰可走 Tile。
- `supportReach`：由承載家具 footprint 的外圍與可用 slot 推導。
- `port`：只允許資料明確指定的操作 Tile。
- `slot`：精確使用家具 slot。
- `socialReach`：角色間同格／鄰格互動。
- `tileContact`：直接與 Tile 接觸。

## 水桶與水龍頭

水桶是第一個採用 `groundInteraction: occupy` 的較大型地面容器：

```text
waterBucket (5,5)
tap         (6,5)
```

水龍頭本體不可站立，但具有：

```text
interactionPorts:
- tap:west
  position: (5,5)
  edge: east
```

因此補水流程變成：

```text
走到 (5,5)
→ 拿起同 Tile 水桶
→ 人仍在 (5,5)
→ 透過 tap:west 操作水龍頭
→ 補水
→ 水桶放回 (5,5)
```

不再需要拿起水桶後額外走一格。

## 桌上物件

具有 `supportId` 的物件不再只讀自己的單點座標。`supportReach` 會讀承載家具的完整 footprint，從整個外圍推導可站位置；餐桌四側因此都可以接觸桌上的現成食物、杯子與餐盤，而不必扭曲餐椅位置來配合某一個物件座標。

## 空間粒度策略

目前仍保留 12×8 A*。`edge` 是 interaction port 的語意資訊，不是新的 pathfinding cell，也沒有建立 Tile 內第二套碰撞／移動座標。

是否需要 2× pathfinding resolution，留到出現以下訊號再評估：

- 角色站位本身無法合理表達桌子四周空間。
- 狹窄通道、擦身、堵路需要比 Tile 更細的碰撞。
- 家具比例無論如何配置都持續失真。
- 一格移動代表的距離過長，造成大量日常動作看起來像大跨步。

在此之前，優先用 interaction geometry 解決「站在哪裡才能操作」；不要用加密整張地圖來修單一互動。

## 目前尺度校準

v11.6 先讓較大的水桶使用 `occupy`。杯子／餐盤等小型地面物仍保留一般 `reach`，避免在尚未確定 Tile 實際尺度前把所有物件都鎖成同一距離規則。這是資料層差異，不是 `waterBucket` ID 特判；其他物件可以用相同欄位選擇幾何模式。
