# Design

## Context

`js/log.js` 的草稿加载有两条路径，都汇到 `openWorkout()`：

- 记录页「继续」→ `getDraft(dayId, date)`（`js/log.js:38`）返回草稿对象；
- 编辑已有记录 → `openWorkout()` 内联构造草稿对象（`rir: s.rir ?? 2`）。

提交 `4575bd4` 为修「旧草稿的 RIR 是字符串 → `chips()` 用 `===` 比较导致无一档选中 → `finishWorkout()` 把字符串写进记录与导出备份（`validateDB()` 拒绝）」，在 `getDraft()` 出口和 `openWorkout()` 各加了一次 `snapInt(dr.rir, 2)` 归一，并引入 helper `snapInt(v, fallback)`。

实测：`getDraft` 全仓唯一调用方是 `js/log.js:498` 的 `openWorkout`；`getDraft()` 返回的就是 `db.drafts[k]` 里的同一个对象（重建分支也是先 `db.drafts[k] = dr` 再返回 `dr`），所以两次归一作用在同一个对象上，第二次是恒等的空操作。

## Goals / Non-Goals

**Goals:**
- 每处行为只保留一个实现点：RIR 归一一处、`localStorage` 读取一处、断言写法一处。
- 训练页显示、写入记录、导出备份三处看到的 RIR 仍是同一个数字，行为零变化。

**Non-Goals:**
- 不改 `openWorkout()` 的归一位置（保持在渲染前，覆盖两条加载路径）。
- 不改 `snapPain()` 与 `finishWorkout()` 的既有约定（`rir: dr.rir ?? 2` 保留）。
- 不动规格：见下节。

## 规格为何不动

`openspec/specs/workout-draft/spec.md` 的「草稿的训练级字段按数字归一」要求写的是「系统 SHALL 在加载草稿时把训练级 RIR 归一为数字」，两个场景的判定点分别是「训练页 RIR 有一档被选中」「写入记录与导出备份的 RIR 均为数字」。重构后：

- 两条加载路径都仍然在训练页渲染前归一（`openWorkout()` 内），场景判定点不变；
- 归一写回的是同一个草稿对象，`openWorkout()` 末尾的 `saveDB()` 落盘的仍是数字，与改动前一致（改动前 `getDraft()` 先归一、`openWorkout()` 再归一，落盘的也是同一个对象）。

即：可观察行为一字未变，规格文本仍然成立，故 `.openspec.yaml` 标 `skip_specs: true`，不写 delta。

## Decisions

**决策 1：归一只留在 `openWorkout()`**
删 `getDraft()` 出口那一次，保留 `openWorkout()` 那一次。

- 备选方案 A：两处都留（现状）。否决——同一对象被归一两次，第二处是恒等空操作，却让「归一在哪」有两个答案。
- 备选方案 B：两处都删、只在 `finishWorkout()` 写记录前归一。否决——训练页 `chips()` 用 `===` 比较，字符串会让所有档位落空，用户在训练页看不到当前值；这正是 `4575bd4` 要修的现象。

**决策 2：删掉 `snapInt()`，就地归一**
`snapInt(v, fallback)` 归一后只剩一个调用点，且 `fallback` 恒为 `2`（投机参数）。改为就地两行：

```js
const rir = +draft.rir;
draft.rir = Number.isFinite(rir) ? rir : 2;
```

表达式与原 helper 逐字等价（`+v` 后 `Number.isFinite` 判定，失败落 `2`），因此 `null`/`""` 这类边界值的输出也不变。

- 备选方案：保留 helper 但去掉 `fallback` 参数。否决——为一个调用点单开一个 helper 不值。

**决策 3：`app.js` 的 `loadDB()` 提到分支之前**
`storage` 监听原本两个分支各调一次 `loadDB()`（读 `localStorage` + `JSON.parse`）。两个分支读的是同一份数据、同一时刻，提到分支之前取一次，两边共用。

- 备选方案：保持两次调用。否决——同一份数据读两次，且两次读之间理论上可能跨过一次写入。

**决策 4：测试断言改用 locator 写法**
`tests/run.js` 里两段逐字相同的 `page.evaluate`（读 `.wo-summary .chips` 第 0 组里 `.pick.on` 的文本）改成本文件已有写法 `page.locator(".wo-summary .chips").nth(0).locator(".pick.on").allInnerTexts()`（参见 `tests/run.js:393`、`tests/run.js:1201`）。`allInnerTexts()` 返回文本数组，与原 `evaluate` 的返回值同构，断言语句与提示文案保持原样。

- 备选方案：留一个测试内 helper 函数复用。否决——两处各用一次，locator 表达式一行写完更直白。

## Risks / Trade-offs

- **归一函数从 `getDraft()` 出口移到 `openWorkout()`** → `getDraft()` 是 `export`，理论上可能被别处当 API 用；实际全仓无第二个调用方，`renderLog()` 列草稿行不读 `rir`，`progress.js` 不读草稿。
- **就地归一与原 helper 表达式不等价** → 逐字比对：`snapInt(v, 2)` 即 `Number.isFinite(+v) ? +v : 2`，新写法同式，仅把 `+v` 提成临时变量以免二次求值。
- **测试改写后断言强度下降** → `allInnerTexts()` 返回的是同样的文本数组，`length === 1` 与取值断言一字未改。

## Migration Plan

纯代码重构，无数据结构变化，无需迁移。回滚 = 还原 `js/log.js`、`app.js`、`tests/run.js` 三个文件。
