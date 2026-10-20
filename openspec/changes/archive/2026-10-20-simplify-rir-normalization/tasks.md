# Tasks

## 1. RIR 归一收敛到一处（js/log.js）

- [x] 1.1 删掉 `getDraft()` 出口的 `dr.rir = snapInt(dr.rir, 2)` 及其注释；删掉 `snapInt(v, fallback)` helper 与注释；把 `openWorkout()` 里的归一改为就地两行 `const rir = +draft.rir; draft.rir = Number.isFinite(rir) ? rir : 2;`（表达式与原 helper 逐字等价）；验证：`node tests/run.js draft` 通过，且 `node tests/run.js data` 的「字符串 RIR 归一为数字」用例通过
- [x] 1.2 确认两条加载路径（记录页「继续」→ `getDraft`、编辑已有记录 → 内联构造草稿）都在训练页渲染前完成归一，且落盘的草稿 `rir` 仍是数字；验证：`node tests/run.js data` 的「旧数据兼容」与「字符串 RIR 归一为数字」两条用例均通过

## 2. storage 监听只读一次 localStorage（app.js）

- [x] 2.1 把 `app.js` 的 `storage` 监听里两处 `const fresh = loadDB();` 合并为分支之前的一次，两个分支共用同一个 `fresh`；验证：`node tests/run.js data` 的「两个标签页相互同步」与「训练中不覆盖另一标签页的写入」两条用例均通过

## 3. 测试断言复用本文件已有 locator 写法（tests/run.js）

- [x] 3.1 把「字符串 RIR 归一为数字」用例里两段逐字相同的 `page.evaluate` 读选中档改成 `page.locator(".wo-summary .chips").nth(0).locator(".pick.on").allInnerTexts()`，断言与提示文案保持原样；验证：`node tests/run.js data` 通过

## 4. 文档修正

- [x] 4.1 修正 `openspec/changes/archive/2026-10-20-fix-multitab-overwrite-and-rir-type/proposal.md` 的 `What Changes` 段：两个 bullet 被并成一行，拆回两条独立 bullet；验证：重新读取该文件确认每条 bullet 独立成行

## 5. 集成验证

- [x] 5.1 全量 `node tests/run.js` 0 失败，并用 `GYM4_TZ=Pacific/Kiritimati node tests/run.js` 复跑确认与星期几无关；验证：两轮均 0 失败（两轮均 276 项通过）
- [x] 5.2 `openspec validate --changes` 与 `openspec validate --specs` 均通过（退出码 0）；验证：两条命令退出码 0

## Workflow follow-up

- 实现完成后走 `/openspec-sync-specs`（本变更 `skip_specs: true`，无 delta 可同步，跳过），再走 `/openspec-archive-change` 归档
- 归档后在浏览器手动过一遍：记录页「继续」打开旧草稿 → 训练页 RIR 有档选中 → 完成训练后记录与导出的 RIR 是数字；再开两个标签页同时操作确认同步提示仍正常
