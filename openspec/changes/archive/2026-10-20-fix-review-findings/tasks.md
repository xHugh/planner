# Tasks

## 1. dev-server：服务健壮性与路径边界

- [x] 1.1 `scripts/serve.js` 把 `decodeURIComponent` 移入 try（或包裹 try/catch），非法编码路径返回 400 且进程不退出；新增自动化用例：spawn 该服务器、发送 `GET /%` 断言收到 400、随后请求 `/index.html` 仍返回 200（当前行为是进程退出 `code 1`，用例先红后绿）
- [x] 1.2 `tests/run.js` 自带静态服务器的路径判定改为 `file !== root && file.startsWith(root + path.sep)` 边界形式；新增用例：向测试服务器直接发 `GET /../<root目录名>-probe/x` 断言返回 403（修复前为 404：裸 `startsWith` 放行后 stat 失败）
- [x] 1.3 跑 `node tests/run.js` 全绿，确认 1.1/1.2 两个新用例在列

## 2. local-data-integrity：导入拒绝重复 id

- [x] 2.1 `js/progress.js` 的 `validateDB` 在记录循环中收集并校验 `id` 唯一，重复时返回含「重复的记录 id」的失败原因；新增用例：页面内直接调用 `validateDB`，重复 id 数据被拒、id 唯一数据通过，且拒绝后 `localStorage` 未被改动（沿用既有 data 用例的写法）
- [x] 2.2 跑 `node tests/run.js data` 组确认新旧用例全绿

## 3. session-history：按所选记录本身定位详情/编辑/删除

- [x] 3.1 `js/log.js`：`showSessionSheet` 支持传记录对象（列表行 `onclick` 传 `s`），保留 id 字符串兼容分支按第一条匹配；删除改为 `indexOf` 定位 + `splice`，编辑保存改为 `state.wo.editingRef` 引用 `indexOf` 定位（-1 时走既有「这条记录已经不在了」）；先跑既有用例确认 `showSessionSheet(id)` 调用不破
- [x] 3.2 新增用例：注入两条 `id` 相同的记录 → 历史列表显示两行 → 点击第二行详情的日期与该行一致 → 删除其中一条后另一条仍在 → 编辑另一条只改它本身；断言详情/删除/编辑均锚定被选中的对象
- [x] 3.3 跑 `node tests/run.js` 全绿

## 4. session-history：编辑有修改时离开页面提示

- [x] 4.1 `js/log.js`：`state.wo` 增加 `editDirty` 标记，编辑模式下任意输入/勾选回调置位；模块级 `beforeunload` 处理器在 `editingId && editDirty` 时 `preventDefault()`；关闭/保存编辑后标记随 `state.wo = null` 自然失效
- [x] 4.2 新增用例（chromium dialog 捕获）：编辑记录修改一个字段后 `page.reload()` 断言触发 beforeunload 对话框并 accept；未修改时 reload 断言不触发；非编辑状态刷新断言不触发
- [x] 4.3 跑 `node tests/run.js` 全绿

## 5. progress-stats / workout-draft：未来日期不进统计

- [x] 5.1 `js/progress.js`：`renderProgress` 的会话数组在排序后追加 `s.date <= today()` 过滤，统计卡、容量图、疼痛图、疼痛告警卡共用该数组（历史列表不经过此处）；新增用例：注入一条未来日期记录 → 「累计训练/累计训练次数/累计容量」不含它、容量图槽位不含未来周、记录页历史列表仍显示该记录
- [x] 5.2 开始表单日期限制：`js/log.js` 设置 `inpDate.max = today()`，「开始记录」点击时再校验 `inpDate.value <= today()`，否则 toast 拒绝；新增用例：断言 `input[type=date]` 具有 `max` 属性且等于今天
- [x] 5.3 跑 `node tests/run.js` 全绿（chart 组重点确认未回归）

## 6. 集成验证与文档

- [x] 6.1 `node tests/run.js` 全套通过（含既有 178 项与全部新增用例），`openspec validate --change fix-review-findings` 通过
- [x] 6.2 对照 delta spec 逐场景手工走查（可用 `GYM4_TZ` 切换星期几跑同一套用例），确认无规格-实现偏差
- [x] 6.3 更新 `AGENTS.md` 关键约束：补充「编辑模式 beforeunload 提示」「记录定位以对象引用为准（重复 id 手改数据）」「进度统计过滤未来日期」三条，验证文档描述与最终实现一致

## Workflow follow-up

- 实现全部任务并通过验证后，走 `openspec-archive-change` 归档本变更（同步 delta 到主 specs）。
- 归档后运行 `openspec validate --specs` 确认主规格仍全部通过。
- 按需以 Conventional Commits（中文 subject）分组提交；不主动 push。
