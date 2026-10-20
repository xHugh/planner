# Proposal

## Why

review 查出四条会破坏用户数据或让界面说错话的实现缺陷：没有 `id` 的历史记录被编辑时会走「完成训练」分支、生成一条重复记录；草稿的 `elapsedMs` / `lastResumedAt` 不是有效数字时计时器显示 `NaN:NaN`、写进记录的时长变成 `null`；草稿归一化时非规范键可能覆盖规范键下的草稿；`app.js` 遍历记录取 `id` 时遇到 `null` 记录会直接抛错，让跨标签页合并静默中止。这些都与仓库「手改 localStorage 或坏导入的数据不得破坏任何东西」的既有立场相悖。

## What Changes

- 记录编辑态改用显式布尔量判断，不再依赖 `editingId` 的真值：没有 `id` 的历史记录进入编辑时按钮显示「保存修改」，保存后覆盖原记录而不是新建一条重复记录；离开页面提示也随之生效。
- 草稿的计时字段按数值归一：`elapsedMs` 不是有限非负数字时按 0 起算，`lastResumedAt` 不是有限数字时按「未在计时」处理；完成训练写入记录的时长做有限性兜底，不再出现 `NaN` 与 `null`。
- 导入校验补上草稿的计时字段：`elapsedMs` / `lastResumedAt` 不是数字的草稿直接拒绝导入，与 `rir` / `maxPain` / `durationMin` 的口径一致。
- 草稿归一化时规范键优先：同时存在规范键与同 `dayId+date` 的非规范键时，保留规范键下的草稿，不再由插入顺序决定谁覆盖谁。
- `app.js` 取记录 `id` 时跳过 `null` 记录，避免一条坏记录让跨标签页合并整段抛错。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `workout-draft`: 新增需求「草稿的计时字段按数值归一」——现有需求只管 RIR 的类型归一，不管计时字段；非数字计时字段会让计时器显示 `NaN`、写进记录的时长丢失。同时在「草稿以训练日与日期唯一标识」里补一条场景：规范键与非规范键指向同一次训练时保留规范键下的草稿。
- `workout-timing`: 现有需求「页面生命周期内不丢已累计时长」「时长如实写入训练记录」补上「累计时长不是有效数字」时的行为约定——从 0 起算、写入记录的时长必须是有限数字。
- `session-history`: 新增需求「缺少 id 的记录也能编辑」——现有需求只覆盖重复 `id` 与找不到记录两种情况，没有覆盖「记录本身没有 `id`」，此时编辑会静默变成新建一条重复记录。
- `local-data-integrity`: 新增需求「导入校验拒绝非法的草稿计时字段」；并在「结构异常的本地数据不得让页面崩溃」里补一条场景：`null` 记录不得让跨标签页合并抛错。

## Impact

- 代码：`js/log.js`（编辑态判定、计时字段归一、时长兜底）、`js/core.js`（草稿归一化的规范键优先）、`js/progress.js`（`validateDB()` 补校验）、`app.js`（跳过 `null` 记录）。
- 规格：`openspec/specs/workout-draft/spec.md`、`openspec/specs/workout-timing/spec.md`、`openspec/specs/session-history/spec.md`、`openspec/specs/local-data-integrity/spec.md`。
- 测试：`tests/run.js` 新增回归用例（无 `id` 记录编辑、非法计时字段、导入拒绝非法计时字段、跨标签页合并遇 `null` 记录）。
- 不改数据结构、不改存储键名、不加依赖；「坏数据由用户手改产生」这一前提不变，仍然兼容而不是拒绝加载已有数据。
