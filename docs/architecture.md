# v8.1 架構說明

## 核心分層

### `world.js`
描述世界資料：資源、區域拓樸、Agent、容器、來源、表面與初始值。

角色狀態分為：

- `needs`：高值＝需求更迫切，如飢餓、口渴、疲勞、社交、理毛需求。
- `wellbeing`：高值＝狀態較好，目前有舒適、安全感。
- `status`：效果型狀態，例如醉酒。
- `metrics`：觀測／統計資料。`exertionToday` 是當日活動量，跨日歸零；`lastExertion` 保留最近一次活動來源。

體力相關 trait 目前拆成兩個互不等價的維度：

- `exertionSensitivity`：同樣活動量會造成多少疲勞。低值代表較不容易因活動疲勞。
- `recoveryRate`：休息時的恢復倍率。高值代表短時間休息較有效。

容器維持 affordance / preference 分離：`canDrinkFrom` 描述物理能力，`drinkPreference` 描述角色通常多願意拿它來喝。

### `engine.js` + `recovery.js`
`engine.js` 保留通用 exertion 與主要行動鏈；v8.1 將角色差異與休息恢復拆到獨立 `recovery.js`，避免繼續把所有規則塞進單一 engine。

`applyExertion` 在 v8.1 的有效結果明確區分「活動量」和「疲勞成本」：

```text
行動
→ activity（客觀活動量）
├─ metrics.exertionToday += activity
├─ fatigue += activity × exertionSensitivity
├─ thirst += activity × 小倍率
└─ hunger += activity × 更小倍率
```

因此兩個人做完全相同的工作，今日活動量可以一樣，但累積疲勞不同。

休息則改為逐 tick 恢復：

```text
休息恢復
= 基礎恢復
× 角色 recoveryRate
× 當前區域 restEfficiency
```

`restEfficiency` 由區域 `restQuality` 和即時噪音共同決定。角色會持續休息到疲勞降到目標值，或單次休息達 24 tick（48 分鐘）後結束；因此高疲勞或低恢復倍率角色會自然休更久。

跨日只重置 `metrics.exertionToday`，**不重置 fatigue，也不清除最近一次活動來源**。疲勞只能透過實際休息下降。

目前仍只有「短期疲勞」一層；`sleepDebt / sleepNeed / sleepEfficiency` 尚未加入，避免過早把 MVP 變成完整睡眠模擬。

### `ui.js` + `recovery-ui.js`
主要 UI 維持在 `ui.js`；v8.1 的體力觀測補充放在 `recovery-ui.js`，讓恢復系統可以先獨立迭代。

觀測層現在明確顯示：

- 今日活動量（不是疲勞槽）。
- 最近活動的活動量與實際疲勞成本。
- `exertionSensitivity`、`recoveryRate`。
- 角色所在區域目前的休息效率。

## 下一個決策點

v8.1 先把「活動 → 疲勞 → 休息恢復」閉環釐清。下一步仍是補給層：固定補貨、勞動補給或真正貨幣經濟。

若後續出現「明明休息很久仍應該困」或「睡不夠會累積到隔天」的需求，再新增 `sleepDebt`，不要把它混進目前的 `exertionToday`。
