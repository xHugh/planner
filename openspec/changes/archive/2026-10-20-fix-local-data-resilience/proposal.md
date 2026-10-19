# Proposal

## Why

铁馆计划把全部训练数据存在浏览器 `localStorage` 里，没有后端。这轮代码审查找出 6 个真实缺陷：结构异常的本地数据会让记录页、训练页、进度页整页抛 `TypeError`；训练中刷新或误关标签页会清零已累计的训练时长；草稿的键不唯一会让「完成训练」留下残稿、同一份训练可以重复完成并产生重复记录；历史记录的训练日已不在计划中时「编辑这条记录」点了毫无反应。这几条都用真实 Chromium 复现过，其中 3 条直接导致用户已记录的数据丢失或无法编辑。

## What Changes

- `validDraft()` 与 `validSessions()` 对齐：草稿里每个动作的 `sets` 元素也必须是对象，坏草稿在记录页被清掉重建，而不是让整页崩在 `s.done` 上
- `loadDB()` 校验 `sessions` / `drafts` 的容器类型，结构异常时退化为空集合，而不是让三个页面里两个崩在 `db.sessions.filter`
- 草稿身份归一化：以 `dayId@date` 为唯一键，加载时补齐 `key` 并搬迁到规范键下，完成训练后草稿必定被删除
- 训练计时在页面隐藏/关闭时落盘，恢复时把中断间隔并回 `elapsedMs`，刷新或误关标签页不再把已训练的时长清零
- 历史记录的 `dayId` 不在当前计划中时，「编辑这条记录」给出明确提示，而不是关掉弹层后毫无反应
- `scripts/serve.js` 的路径穿越判断补上分隔符，同前缀的兄弟目录不再可读

不改动 `gym4.db.v1` 的存储结构与既有记录字段，不新增依赖，不引入构建步骤。

## Capabilities

### New Capabilities

- `local-data-integrity`: 本地数据的读取、校验与写盘失败处置——结构异常的历史记录与草稿不得让任何页面崩溃
- `workout-draft`: 训练草稿的身份、续用、丢弃与回收
- `workout-timing`: 训练时长的累计口径与跨页面生命周期的持久化
- `session-history`: 历史记录的查看、编辑与删除，含训练日已不在计划中的降级路径
- `dev-server`: 本地静态开发服务器的文件访问边界

### Modified Capabilities

无。这是本仓库的第一批 spec，`openspec/specs/` 此前为空。

## Impact

- **代码**
  - `js/core.js`：`validDraft()` 补 `sets` 元素校验；`loadDB()` 校验容器类型
  - `js/log.js`：`getDraft()` 归一化草稿身份；`openWorkout()` 补 dayId 缺失提示、把中断间隔并回 `elapsedMs`；`finishWorkout()` 按规范键删草稿；`visibilitychange` 暂停后落盘
  - `js/progress.js`：`validateDB()` 校验草稿键与 `dayId@date` 一致
  - `scripts/serve.js`：路径穿越判断补分隔符
- **测试**：`tests/run.js` 补回归用例——坏草稿（`sets:[null]`）、坏容器（`sessions` 非数组 / `drafts` 非对象）、刷新后时长保留、草稿键不一致、`dayId` 不在计划中的编辑降级
- **数据兼容性**：存储键名与记录字段不变；坏草稿沿用现有策略（记录页清掉、按计划重建）；坏历史记录沿用现有策略（过滤并提示「格式异常已跳过」）
- **风险**：计时改为落盘后，页面隐藏会多一次 `localStorage` 写入；草稿归一化会在读取时改写草稿的 `key` 字段
