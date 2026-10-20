# Tasks

## 1. 编辑态用显式布尔量（js/log.js）

- [x] 1.1 `openWorkout()` 的编辑分支（`js/log.js:452`）设 `state.wo.isEdit = !!o.session`，`editingId` 只保留记录 id（可以是 `undefined`）；三处判定改用 `isEdit`：`log.js:324`（离开提示）、`log.js:679-680`（按钮文案）、`log.js:721`（保存时覆盖还是新建）；验证：`node tests/run.js workout` 与 `history` 不回归
- [x] 1.2 新增回归用例「编辑没有 id 的记录不生成重复记录」：造一条无 `id` 的历史记录 → 详情弹层点「编辑这条记录」→ 断言训练页主按钮文案是「保存修改」→ 改重量 → 保存 → 断言该训练日与日期在历史里仍只有一条且内容已更新；验证：该用例在 1.1 落地前失败、落地后通过
- [x] 1.3 在同一条用例里断言编辑态的离开提示仍生效（改过重量后触发 `beforeunload` 会被拦下）；验证：与 1.2 同批通过

## 2. 计时字段按数值归一（js/log.js）

- [x] 2.1 在 `openWorkout()` 加载草稿时归一计时字段（`js/log.js:487-508`）：`elapsedMs` 不是有限非负数字时按 0 起算；`lastResumedAt` 不是有限数字时按 `null` 处理；间隔并入前先确认起点是有限数字；验证：`node tests/run.js workout` 不回归
- [x] 2.2 `finishWorkout()` 计算时长后做有限性兜底（`js/log.js:746-749`）：结果不是有限数字时按 1 分钟计，写进记录的 `durationMin` 永远是有限数字；验证：`node tests/run.js workout` 通过
- [x] 2.3 新增回归用例「草稿计时字段非法时不出现 NaN」：造 `elapsedMs: "abc"`、`lastResumedAt: "xyz"` 的草稿 → 记录页「继续」→ 断言训练页计时不是 `NaN:NaN` → 完成训练 → 断言记录的 `durationMin` 是有限数字；验证：该用例在 2.1 与 2.2 落地前失败、落地后通过
- [x] 2.4 补 `pageshow` 处理：页面从往返缓存恢复（`event.persisted` 为真）且训练未结束时，恢复计时并继续走时；验证：新增用例「页面从往返缓存恢复后继续计时」

## 3. 导入校验与草稿归一化（js/progress.js、js/core.js）

- [x] 3.1 `validateDB()`（`js/progress.js:343-357`）校验草稿的 `elapsedMs` / `lastResumedAt`：不是数字且不是缺省时返回失败原因，与 `rir` / `maxPain` / `durationMin` 同一口径；验证：`node tests/run.js data` 通过
- [x] 3.2 新增回归用例「导入拒绝非数字草稿计时字段」：造一份 `elapsedMs: "abc"` 的备份 → 走真实导入流程 → 断言导入被拒绝、本地记录数不变、提示里说明是哪一项不合法；验证：该用例在 3.1 落地前失败、落地后通过
- [x] 3.3 `normalizeDrafts()`（`js/core.js:221-234`）改为规范键优先：同一 `dayId+date` 同时存在规范键与非规范键时保留规范键下的草稿；验证：新增一条断言（两种键并存 → 归一后只剩规范键那份、内容是它的）+ `node tests/run.js draft` 通过

## 4. 跨标签页合并跳过 null 记录（app.js）

- [x] 4.1 `app.js:63-64` 取记录 id 与合并时跳过 `null` 记录（`s && s.id`），避免一条坏记录让整段合并抛错；验证：新增断言
- [x] 4.2 该用例放进 `data` 组：造 `sessions: [null, {...}]` → 另一个标签页写入 → 断言本标签页无 JS 报错且对方新增的可用记录已被并入；验证：该用例在 4.1 落地前失败、落地后通过

## 5. 集成验证

- [x] 5.1 全量 `node tests/run.js` 0 失败，并用 `GYM4_TZ=Pacific/Kiritimati node tests/run.js` 复跑确认与星期几无关；验证：两轮均 0 失败
- [x] 5.2 `openspec validate --changes` 与 `openspec validate --specs` 均通过；验证：两条命令退出码 0
- [x] 5.3 更新 `AGENTS.md` 的「关键约束」：补「编辑态判定不依赖记录 id（用显式 isEdit）」与「草稿计时字段按数值归一，坏值降级为 0 而不是判坏草稿」两条；验证：重新读取该文件确认两条约束在位

## Workflow follow-up

- 实现完成后走 `/openspec-sync-specs` 把四条 delta 合并进主 specs，再走 `/openspec-archive-change` 归档。
- 归档后在浏览器手动过一遍：编辑一条没有 id 的记录（按钮显示「保存修改」，保存后不产生重复记录）；用带字符串计时字段的草稿继续训练，确认计时不显示 `NaN`。
