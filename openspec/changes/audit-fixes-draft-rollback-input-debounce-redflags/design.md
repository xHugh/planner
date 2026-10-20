# Design

## Context

三处改动的现状（见 proposal.md 的动因）：

- `renderLog()`（`js/log.js`）在渲染时调用 `normalizeDrafts()` 并删除空草稿，随后 `saveDB()` 不检查返回值。仓库其他写入口径（`finishWorkout`、放弃草稿、删除记录、导入）都是「成功才生效，失败回滚」，唯独这里缺了。
- `renderWorkout()` 的备注 `oninput`、`setRow()`（`js/core.js`）的重量/次数 `oninput` 每次按键直接 `saveDB()`——即整个 `db` 的 `JSON.stringify`。
- `PLAN.redFlags`（`data.js`）有 5 条警示文案，无消费者。

约束：零依赖、无构建；`saveDB()` 已有「返回 false + toast」的失败语义；训练计时依赖 `visibilitychange`/`pagehide` 时的 `saveDB()` 落盘。

## Goals / Non-Goals

**Goals:**

- 草稿清理路径与仓库既有写盘回滚口径一致。
- 输入路径去高频化：按键只改内存，落盘最多约每 300ms 一次，且用户可感知的数据不丢。
- `PLAN.redFlags` 在计划页可见。

**Non-Goals:**

- 不改任何数据结构、localStorage 键、SW 缓存策略。
- 不引入通用的 debounce/存储层抽象——改动范围限定在训练页输入回调。
- 不处理审计报告里的 #5（SW 超时回退测试）与 #6（编辑模式计时器观感），它们不进本变更。

## Decisions

### D1. 草稿清理回滚：快照 `db.drafts`，失败恢复引用

进入清理前保存 `const prevDrafts = db.drafts`；清理改动的是同一个对象（`normalizeDrafts()` 直接替换 `db.drafts`，空草稿删除也是原地 `delete`），所以快照必须在**任何改动发生前**取。`saveDB()` 返回 `false` 时 `db.drafts = prevDrafts` 恢复。

备选：逐条记录被删的键再一一恢复。更繁琐且 `normalizeDrafts()` 还会改键、改 `key` 字段，逐条恢复无法完整还原，放弃。

注意点：恢复的是引用，`normalizeDrafts()` 内部对存活草稿的 `dr.key = nk` 赋值无法回滚。这可以接受——`key` 归一化本身是幂等的修正，不属于用户数据损失；丢失的只有「写盘失败时被删的空草稿/坏草稿在内存里回来了」，这正是目标行为。

### D2. 输入防抖：per-workout 单一 pending 标记 + 冲刷点

在 `state.wo` 上挂一个 `pendingSave` 定时器句柄。输入回调（备注 `oninput`、`setRow` 的 `onInput`）只做三件事：置脏（`markDirty`、`dr.touched = true`）、写内存字段、重启 300ms 定时器到点 `saveDB()`。

关键点是冲刷（flush）：凡是既有的立即落盘时机——退出训练（`closeWorkout`）、完成训练（`finishWorkout`）、`visibilitychange` 暂停、`pagehide`——先清掉定时器并立即 `saveDB()` 一次，保证防抖窗口内的输入不丢。这些路径本身就会调 `saveDB()`，所以实现上只需要在它们的 `pauseClock`/`stopTimer` 附近确保 pending 定时器被取消、且本次 `saveDB()` 覆盖未落盘的输入（内存里已是最新值，天然覆盖）。

勾选组（`.check` onclick）、RIR/疼痛 chips、按上次重量填入等低频操作保持现状立即 `saveDB()`，同样顺带把 pending 定时器清掉即可。

备选一：每个输入框各自防抖——多个定时器，且最后落盘的会覆盖，没必要。备选二：全局 storage 层节流——超出本变更范围的抽象，且训练外的写入（主题等）不经过 `db`，放弃。

`oninput` 里的 `markDirty()`（编辑模式脏标记）不防抖：它在内存里即时置位，`beforeunload` 读的就是内存，无需落盘，不受影响。

### D3. redFlags 渲染：复用减伤规则的卡片模式

`renderPlan()` 在「减损规则」卡之后追加一张同构的警示卡：标题用警示样式（复用 `.card-warn` + `.card-title-danger`，与进度页疼痛警示、`brokenCard` 一致），条目同样走 `list(PLAN.rules...)` 的 `esc()` 路径。`redFlags` 为空数组时不渲染。

不新造 CSS；若 `.card-warn` 在深色主题的覆盖已存在（AGENTS.md 确认），无额外主题工作。

### D4. 注释修正

`snapPain` 的注释从「就近吸附到 10」改为「向上取偶（1→2、9→10）」，与实现对齐。无行为变化。

## Risks / Trade-offs

- [防抖窗口内崩溃/断电丢 300ms 输入] → 接受。现状是每次按键都落盘，但 `pagehide`/`visibilitychange` 冲刷已覆盖绝大多数退出路径；纯崩溃场景下丢最后一两个字符，换取全程不卡输入。
- [`db.drafts` 回滚后与 `storage` 事件同步的交互] → `app.js` 的 storage 同步只在不训练时整包替换 `db.sessions/db.drafts`，与回滚不并发（同一标签页内 `saveDB` 失败不会触发本页 storage 事件），无冲突。
- [redFlags 卡片对比度不达标] → 复用已有 `.card-warn` 体系，`tests/run.js` 的 `contrastScan` 会扫计划页，测试兜底。

## Migration Plan

无数据迁移。改动即生效：下次渲染记录页/训练页时走新逻辑；`redFlags` 卡片随计划页渲染出现。回滚 = revert 提交。
