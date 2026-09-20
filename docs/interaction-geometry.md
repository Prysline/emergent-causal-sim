# Interaction Geometry — v11.7

12×8 Tile grid 仍負責真正的移動與站位；Interaction Geometry 負責回答：**這個 Agent 要用某個 affordance 操作某個 target 時，哪些 Tile 是合法操作位置？**

## 正式分工

```text
Tile / A*
→ 角色真正移動與站位

Furniture footprint
→ 家具實際占地

Furniture slot
→ 坐、躺、睡、出口等精確使用位置

Interaction port
→ 固定設備可從哪些 Tile 操作

Support reach
→ 家具承載物從哪些外圍 Tile 可及

Affordance rule
→ 同一 target 在不同動作下可使用不同 geometry
```

## API

```text
interactionGeometry(state, target, agent, affordance)
interactionPositions(state, target, agent, affordance)
bestInteractionPosition(state, agent, target, affordance)
isAtInteraction(state, agent, target, affordance)
```

目前 mode：

- `occupy`：必須與目標同 Tile。
- `reach`：同 Tile或相鄰可走 Tile。
- `supportReach`：承載家具 footprint 外圍與 slot。
- `port`：只允許資料指定的 interaction port。
- `slot`：精確 Furniture slot。
- `socialReach`：Agent 間同格／鄰格互動。
- `tileContact`：直接和 Tile 接觸。
- `heldReach`：目標被 Agent 持有時依 holder 位置推導。

## Affordance-specific geometry

Entity 可以直接描述：

```js
interactions: {
  pickup: { mode: 'occupy' },
  drinkFrom: { mode: 'reach' }
}
```

因此一個大水桶可以要求「拾取時走進同 Tile」，但喝水時仍允許站在旁邊。v11.6 雖然已經把 `affordance` 放進 API，v11.7 才正式讓它參與 geometry rule selection。

## Interaction port

Source 可以描述：

```js
interactions: {
  fill: { mode: 'port' }
},
interactionPorts: [
  {
    id: 'tap:west',
    position: { x: 5, y: 5 },
    edge: 'east',
    affordances: ['fill']
  }
]
```

`edge` 仍是 interaction metadata，不是第二套 pathfinding coordinate。

## Support reach

若 Container 有 `supportId` 且沒有更明確 affordance rule，Spatial 會從承載 Furniture 的完整 footprint 外圍與 slot 推導合法位置。桌面物件不再只認自己的單點座標。

## Dynamic blocker

Interaction Geometry 與 pathfinding 共用同一份實體世界。Tile 本身不保存 fixed object blocker cache；`blockerAt()` 每次依目前家具、fixed Container、Source 位置推導，因此物件移動後 interaction 與 pathfinding 不會讀到不同年代的空間狀態。

## 空間解析度策略

目前不提高 pathfinding resolution。只有當問題已經不是「從哪裡操作」，而是：

- 角色站位本身無法表達桌邊多人位置；
- 狹窄通道需要真正的擦身與堵路；
- 家具比例持續失真；
- 一格移動代表的實際距離過長；

才重新評估更細的 physical grid。
