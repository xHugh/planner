# Tasks

## 1. 草稿归一化抽成纯函数（js/core.js）

- [x] 1.1 把 `normalizeDrafts()`（`js/core.js:221-234`）里的归一化逻辑抽成纯函数 `normalizeDraftMap(drafts)`：输入一个草稿容器，输出 `{ out, changed }`，不修改入参；`normalizeDrafts()` 改为调用它并保持现有对外行为（返回是否变化、替换 `db.drafts`）；验证：`node tests/run.js draft` 通过，且 `data` 组的「草稿身份归一化」用例不回归
- [x] 1.2 给 `normalizeDraftMap()` 补一条断言：键非规范、结构损坏的草稿分别被搬迁与剔除，且函数不修改传入的容器对象；验证：`node tests/run.js data` 通过

## 2. 训练中合并对方草稿（app.js）

- [x] 2.1 在 `app.js` 的 `storage` 监听训练中分支（`app.js:60-67`）：把 `fresh.drafts` 经 `normalizeDraftMap()` 归一化后并入 `db.drafts`，跳过本标签页正在编辑的那份（规范键 `draftKey(state.wo.draft.dayId, state.wo.draft.date)`），其余草稿内容保持对方版本；验证：`node tests/run.js data` 不回归
- [x] 2.2 新增回归用例「训练中另一标签页新建的草稿不被本标签页落盘抹掉」：A 打开训练 → B 新建带内容的草稿（填重量并勾一组）→ A 输入备注触发防抖落盘 → 断言 B 的草稿仍在 `localStorage` 且内容不变、A 自己的草稿也仍在；验证：该用例在 2.1 落地前失败、落地后通过
- [x] 2.3 在同一条用例里断言「本标签页正在编辑的草稿不被对方的草稿替换」：B 用同一个训练日与日期新建草稿后，A 的草稿内容与已勾选组保持不变；验证：`node tests/run.js data` 通过

## 3. 记录定位：引用优先 + 签名回退（js/log.js）

- [x] 3.1 在 `js/log.js` 加 `resolveSession(s)`：先按对象引用在 `db.sessions` 里找；未命中时按「`id` + `date` + `dayId` + 动作数 + 总组数」的签名找唯一候选；找不到或候选不唯一时返回 null；验证：`node tests/run.js history` 不回归
- [x] 3.2 `showSessionSheet()` 的删除路径（`js/log.js:303`）改用 `resolveSession()` 定位后再 `splice`，定位失败保持现有「这条记录已经不在了」提示并关闭弹层；验证：`node tests/run.js history` 通过，且重复 `id` 的既有用例仍只删一条
- [x] 3.3 `finishWorkout()` 的编辑分支（`js/log.js:725`）改用 `resolveSession(wo.editingRef)` 定位后再覆盖，定位失败保持现有提示与训练页；验证：`node tests/run.js workout` 与 `data` 组的「写盘失败与旧记录编辑」用例通过
- [x] 3.4 新增回归用例「跨标签页同步后仍能删除所选记录」：B 打开某条记录的详情弹层 → A 写盘触发 B 的 `storage` 事件 → B 点「删除这条记录」并确认 → 断言该记录真的从 `localStorage` 移除、提示为「已删除」而不是「这条记录已经不在了」；验证：该用例在 3.2 落地前失败、落地后通过
- [x] 3.5 新增回归用例「跨标签页同步后仍能保存对所选记录的编辑」：同 3.4 的布置，改为点「编辑这条记录」→ 改重量 → 保存 → 断言被选中的那条记录内容已更新、同 `id` 的另一条不受影响；验证：该用例在 3.3 落地前失败、落地后通过

## 4. 集成验证

- [x] 4.1 全量 `node tests/run.js` 0 失败，并用 `GYM4_TZ=Pacific/Kiritimati node tests/run.js` 复跑确认与星期几无关；验证：两轮均 0 失败
- [x] 4.2 `openspec validate --changes` 与 `openspec validate --specs` 均通过；验证：两条命令退出码 0
- [x] 4.3 更新 `AGENTS.md` 的「关键约束」：补「跨标签页草稿合并（训练中分支也要并入对方草稿，saveDB 是整量写盘）」与「记录定位在跨标签页同步后按签名回退」两条；验证：重新读取该文件确认两条约束在位

## Workflow follow-up

- 实现完成后走 `/openspec-sync-specs` 把两条 delta 合并进主 specs，再走 `/openspec-archive-change` 归档。
- 归档后在浏览器手动过一遍：两个标签页各开一个训练 → A 落盘后 B 的草稿仍在；B 打开详情弹层 → A 完成一次训练 → B 的删除与编辑仍然生效。
