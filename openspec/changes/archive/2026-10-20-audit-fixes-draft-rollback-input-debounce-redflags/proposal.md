# Proposal

## Why

全仓库审计发现三处与既有 spec 不符或未兑现的实现问题：记录页的空草稿自动清理在写盘失败时不回滚内存状态，违反 `local-data-integrity` 的「写盘失败必须如实反馈且不丢数据」；训练中的自由文本与数字输入每敲一键就把整个数据库 `JSON.stringify` 落盘一次，慢设备上输入明显卡顿；`PLAN.redFlags` 定义了 5 条就医警示文案却没有任何 UI 消费，属于死数据或漏做的功能。

## What Changes

- 记录页渲染时的空草稿清理（`renderLog` 中的 `normalizeDrafts()` + 僵尸草稿删除 + `saveDB()`）在写盘失败时回滚 `db.drafts`，与其他数据写入口径一致。
- 训练页的备注输入、重量与次数输入改为「置脏 + 防抖落盘」：每次按键只更新内存与脏标记，约 300ms 无新输入后才写盘；勾选组等低频操作保持立即落盘；退出训练、完成训练、切后台、`pagehide` 等既有落盘时机照常并冲刷未落盘的输入。
- `PLAN.redFlags` 在计划页「减伤规则」卡之后渲染为「红旗警示」卡，向用户展示何时应停练就医（选择渲染而非删除：这是减伤版计划的既有设计意图，文案已在 `data.js` 中）。
- 顺带修正 `snapPain` 的误导性注释（「就近吸附」→「向上取偶」），纯注释改动，无行为变化。

## Capabilities

### New Capabilities

- `red-flags-guidance`: 计划页展示停练与就医的红旗警示清单，内容来自训练计划数据源 `PLAN.redFlags`。

### Modified Capabilities

- `workout-draft`: 「空草稿自动清理」需求增加写盘失败回滚场景——清理空草稿后写入失败时，草稿数据必须回到清理前状态。
- `local-data-integrity`: 「写盘失败必须如实反馈且不丢数据」需求补充覆盖记录页空草稿清理路径（场景级补充，需求文本不变语义、收紧适用范围）。

说明：输入防抖是纯实现层优化（可观察行为不变：输入仍在训练中持久化，防抖只是改变写盘时机与频率），不构成 spec 级行为变更，故不新增能力、不改既有需求；防抖引入的「退出/完成/切后台时冲刷未落盘输入」约束属于实现细节，记录在 design.md。

## Impact

- `js/log.js`：`renderLog()` 空草稿清理的回滚逻辑；`renderWorkout()` 备注/重量/次数输入的防抖落盘；`snapPain` 注释。
- `js/core.js`：`setRow()` 的 `onInput` 回调路径改为防抖。
- `js/plan.js`：`renderPlan()` 渲染红旗警示卡。
- `data.js`：无改动（`redFlags` 已存在）。
- `tests/run.js`：新增/扩展回归用例（写盘失败回滚、防抖后数据持久、redFlags 渲染）。
- 无依赖、无 API、无数据结构变化。
