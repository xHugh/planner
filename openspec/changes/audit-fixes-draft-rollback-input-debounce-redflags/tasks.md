# Tasks

## 1. 草稿清理写盘回滚（workout-draft / local-data-integrity）

- [x] 1.1 在 `js/log.js` 的 `renderLog()` 中，把「清理前快照 `db.drafts` → `normalizeDrafts()` + 空草稿删除 → `saveDB()` 失败时恢复快照」串起来；验证：新增回归用例「清理空草稿时写盘失败 → 草稿回到清理前状态且无成功提示」通过
- [x] 1.2 同路径补一条「结构损坏草稿被清理后写盘失败 → 容器整体回滚」的回归用例，随 1.1 的改动一起跑通

## 2. 输入防抖落盘（纯实现优化，无 spec delta）

- [x] 2.1 在 `state.wo` 上实现 pending 定时器机制：输入回调只写内存 + 重启 300ms 定时器到点 `saveDB()`；验证：训练中备注/重量/次数输入后停手，最终 `localStorage` 里是最新值
- [x] 2.2 在 `closeWorkout`、`finishWorkout`、`visibilitychange`（暂停分支）、`pagehide` 四个既有落盘点取消 pending 定时器，确保防抖窗口内的输入随这些路径立即落盘；验证：新增用例「输入后立即点『保存并退出』→ 不等 300ms，草稿已含刚输入的备注」通过
- [x] 2.3 勾选组 / RIR / 疼痛 chips / 按上次重量填入等低频入口保持立即 `saveDB()`，并顺带取消 pending 定时器；验证：现有 `flow`/`workout`/`draft` 全部用例不回归
- [x] 2.4 修正 `js/log.js` `snapPain` 注释为「向上取偶」；验证：注释与实现一致（`1→2、9→10`），纯文档改动

## 3. 红旗警示渲染（red-flags-guidance）

- [x] 3.1 在 `js/plan.js` `renderPlan()` 的减伤规则卡之后渲染红旗警示卡（`.card-warn` + `esc()` 逐条转义，`redFlags` 为空则不渲染）；验证：新增用例「计划页出现 5 条警示文案」通过
- [x] 3.2 确认深浅主题下警示卡对比度达标；验证：`tests/run.js` 的 `a11y` 用例（含 `contrastScan` 计划页扫描）通过

## 4. 集成验证

- [x] 4.1 全量 `node tests/run.js`（0 失败），并用 `GYM4_TZ=Pacific/Kiritimati node tests/run.js` 复跑一遍确认星期几无关
- [x] 4.2 `openspec validate --changes` 通过；浏览器手动过一遍：计划页警示卡、训练中快速输入备注后退出、记录页空草稿列表

## Workflow follow-up

- 实现完成后走 `/openspec-sync-specs` 同步 delta 到主 specs，再走 `/openspec-archive-change` 归档
