# Tasks

## 1. local-data-integrity：空态下的导入入口与提示

- [x] 1.1 `js/progress.js`：`renderProgress` 的空态分支渲染「导入备份」按钮并绑定既有 `importData()`，不再阻断在空态；导入成功后沿用导入流程的重渲染。验证：新增用例——清空 `localStorage` 后进入进度页，断言 `#view` 内存在导入按钮；通过 `filechooser` 导入一份合法备份，断言记录写入且页面按备份渲染（修复前空态按钮数为 0）
- [x] 1.2 `js/progress.js`：空态文案按原因分叉——`db.sessions.length - valid.length > 0` 时渲染 `brokenCard` 措辞而非「还没有数据」；无记录时保留原文案。验证：新增用例——写入两条缺 `moves` 的记录，断言进度页出现格式异常提示且不出现「还没有数据」；再写入一条未来日期记录，断言提示仍为格式异常相关的可解释文案（修复前两种情况都显示「还没有数据」）
- [x] 1.3 跑 `node tests/run.js data` 与 `node tests/run.js chart`，确认新增用例与既有统计/图表用例全绿

## 2. offline-cache：缓存清理收敛到本应用命名空间

- [x] 2.1 `sw.js`：`activate` 的删除条件改为「缓存名以 `gym4-` 开头且不等于当前 `CACHE`」，并按既有约定递增 `CACHE` 版本号。验证：新增用例——页面内先 `caches.open("other-app-v1")` 写入一条假响应，再触发 Service Worker 更新/激活，断言 `other-app-v1` 仍存在且内容未变、旧版本 `gym4-*` 缓存被删除（修复前 `caches.keys()` 只剩当前版本）
- [x] 2.2 跑 `node tests/run.js offline`，确认预缓存清单完整性与断网加载用例全绿（`ASSETS` 未变）

## 3. workout-timing：旧草稿的时长起算

- [x] 3.1 `js/log.js`：`openWorkout` 中 `draft.elapsedMs == null` 时从 0 起算，不再用 `Date.now() - draft.startedAt` 推算。验证：新增用例——注入一份 `startedAt` 为 3 天前、无 `elapsedMs` 的草稿，点「继续」后断言计时显示小于 1 分钟（修复前实测为 `4320:01`）；完成该训练后断言 `durationMin` 为 1
- [x] 3.2 跑 `node tests/run.js workout`，确认既有「刷新后时长不丢」「后台不计时长」用例全绿，证明正常草稿的 2 小时上限路径未被改动

## 4. 集成验证与文档

- [x] 4.1 `node tests/run.js` 全套通过，`openspec validate fix-recovery-and-timing-bounds` 通过
- [x] 4.2 按真实操作路径手工走查：清空站点数据 → 进度页导入备份 → 统计正常；训练中切后台再回前台 → 刷新 → 继续，时长不倒退
- [x] 4.3 更新 `AGENTS.md` 关键约束：补充「进度页空态仍须提供导入入口」「`sw.js` 只清理 `gym4-` 前缀缓存」「旧草稿缺 `elapsedMs` 从 0 起算」三条

## Workflow follow-up

- 实现全部任务并通过验证后，走 `openspec-archive-change` 归档本变更（同步 delta 到主 specs）。
