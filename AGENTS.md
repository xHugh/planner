# AGENTS.md

## 运行

```bash
node scripts/serve.js
# 打开 http://127.0.0.1:8765/
```

- 纯前端 PWA：原生 JS + ES Modules + 单个 `style.css`，**无构建、无依赖、无 `package.json`、无 lint/typecheck**。不要引入打包器或 npm 依赖到 App 本身。
- 必须通过 HTTP 访问：`app.js` 是 module，`file://` 下 import 会被浏览器拦截；Service Worker 也只在 secure context（`localhost` 或 HTTPS）生效。README 里“可直接双击 `index.html`”的说法已过时。
- `scripts/serve.js` 是零依赖的 Node 静态服务器（仅用内置模块）。`node scripts/serve.js --host` 会打印局域网地址供手机访问。
- 有自动化验证：`node tests/run.js`（见下「测试」）。仓库不依赖 npm，脚本会到常见位置找本机已装的 `playwright`。改完仍建议在浏览器手动走一遍交互细节。

## 测试

```bash
node tests/run.js              # 跑全部用例
node tests/run.js flow         # 只跑名字含 "flow" 的用例
node tests/run.js --url=http://127.0.0.1:8765   # 对已启动的服务跑
```

- 脚本自带静态服务器，不用先起 `node scripts/serve.js`。
- 需要本机已有 `playwright` + chromium（仅开发用，App 本身零依赖），与 `scripts/render-icons.js` 同一约定。脚本会依次尝试 `playwright` / `playwright-core`，并在本仓库、`/tmp/pwtest`、`npm root -g` 等位置查找；找不到会给出安装提示并退出。
- 用例分组：`flow`（训练完整流程）、`draft`（草稿不被覆盖、放弃、空草稿清理、草稿身份归一化）、`data`（旧数据兼容、导入校验、残缺记录容错、坏草稿与坏容器不崩页）、`workout`（底栏进度、后台不计时长、记录再编辑、刷新后时长不丢）、`history`（训练日缺失时编辑有提示）、`a11y`（触摸 ≥44px、对比度 ≥4.5:1 深浅主题 × 计划页/进度页、`aria-current`/`aria-live`）、`chart`（一年数据下图表可读）、`offline`（预缓存清单完整性、断网加载）。每条用例还会检查 JS 报错与 4xx/5xx。
- 退出码非 0 表示有失败，失败明细会打印在末尾。
- 用例**不假设「今天是周一」**：今日训练、「开始今天」按钮存不存在，都由 `tests/run.js` 里的 `todayPlan()` 从 `PLAN.week` 现算；`GYM4_TZ=Pacific/Kiritimati node tests/run.js` 可以在别的星期几跑同一套用例。改 `PLAN.week` 时注意用例是按 `data-day` 选训练日的。
- **没有 CI**：仓库不保留 `.github/workflows/`，push 到 `main` 不会自动跑测试。改完代码要在本地 `node tests/run.js` 跑通再提交；部署由 GitHub Pages 托管（`main` 分支根目录），与 workflow 无关。

## 结构

- `app.js`：入口，负责 tab 路由、`aria-current` 与跨标签页同步；页面渲染在 `js/*.js`。
- `js/core.js`：共享工具与全局单例——`html`、DOM 辅助、`db`（`localStorage` 单例）、`saveDB`（返回是否写盘成功）、`validSessions`/`validDraft`（过滤残缺记录与草稿）、`brokenCard`、主题、Sheet、`storage`/`requestPersist`（持久化存储）。
- `js/plan.js`：计划页及计划/休息日 sheet；`js/log.js`：记录页、草稿、进行中的训练与记录再编辑；`js/progress.js`：统计、Canvas 图表（`aggregateByWeek`/`drawBars`）、导入导出（`validateDB`）。
- `data.js`：训练计划唯一数据源，改计划只改这里（`PLAN.days`、`PLAN.week`）。
- `index.html`：骨架、底部导航、sheet/workout dock/toast/update bar 容器；`style.css`：设计令牌、双主题（`<html data-theme="light|dark">`）、无障碍样式。
- `scripts/serve.js`：本地静态服务器（零依赖）；`scripts/render-icons.js`：由 `app-icon.svg` 渲染各尺寸 PNG。
- `tests/run.js`：自动化测试运行器（自带服务器，仅开发用）。
- `openspec/`：**需求与行为规格**用 OpenSpec 管。`openspec/specs/<能力>/spec.md` 是各能力的行为契约（需求 + 场景），改行为前先看对应 spec；`openspec/changes/` 放进行中的变更（`proposal.md` / `specs/` 增量 / `design.md` / `tasks.md`），完成后归档到 `openspec/changes/archive/`。CLI：`openspec list --specs`、`openspec validate --specs`。规格只描述可观察行为，不写实现细节。

## 关键约束

- **Service Worker 策略**：`sw.js` 对同源 GET 走 **network-first**（3s 超时回退缓存），离线兜底靠 `ASSETS` 预缓存。改线上文件**不需要**手动改版本号，用户下次打开自动是新的；`CACHE`（当前 `gym4-v18`）只用于 `activate` 时清理旧缓存，仍建议递增。新增静态文件必须同步加入 `ASSETS`，否则离线时缺失（`offline` 用例会检查清单完整性）。
- **草稿不可覆盖**：草稿键为 `dayId@date`（`core.js` 的 `draftKey()`），同一天同一训练日只有一份。`getDraft()` 命中已有草稿时**一律续用**，绝不能覆盖——覆盖会丢掉用户已勾选的组（历史上出过这个 bug）。要丢弃用记录页草稿行的「✕」按钮。草稿的 `touched` 字段标记用户是否动过它：开了训练什么都没动就退出的空草稿会在渲染时清掉。**草稿身份只认 `dayId@date`**：导入的旧备份或手改 localStorage 可能把草稿存在别的键下，`core.js` 的 `normalizeDrafts()` 负责剔除坏草稿并把它们搬回规范键（`getDraft()` 也会按 `dayId+date` 兜底查找）。`finishWorkout()` 按规范键删除草稿，**不要用草稿对象自带的 `key` 字段**——它可能缺失，那样删的是 `drafts[undefined]`，草稿会留下来让同一份训练被重复完成、生成重复记录。
- **训练计时**：`elapsedMs` 是累计活跃时长，`lastResumedAt` 是本次开始时刻。切后台/锁屏走 `visibilitychange` 暂停，计时不增长；**暂停后要 `saveDB()` 落盘**。**`pagehide` 也要落盘**（刷新/关闭/跳走都会触发）——只靠 `visibilitychange` 不够：从后台切回前台后计时继续走，这中间没有任何落盘时机，页面一刷新这段就白丢了。`openWorkout()` 恢复草稿时会把残留的 `lastResumedAt` 间隔并回 `elapsedMs`（上限 2 小时，隔夜重开不算 10 小时训练）。`durationMin` 由 `elapsedMs` 得出。
- **HTML 转义**：`html` 不转义，只用于 `data.js` 等可信常量；动态数据（备注、动作名、导入内容）必须经 `esc()`。现有代码全部是 `html` + 显式 `esc`，照此处理。
- **残缺记录**：`db.sessions` 里可能混有缺 `date`、缺 `moves`，或某个动作缺 `sets`/`sets` 里混了 `null` 的记录（旧版本遗留或手改 localStorage）。读记录一律走 `core.js` 的 `validSessions()` 过滤，不要直接遍历 `db.sessions` 再访问 `s.moves`——漏判一处就会整页崩。`validSessions()` 要同时校验 `moves`、每个动作的 `sets` 数组，以及 `sets` 里的元素是对象：消费端直接 `m.sets.forEach` 再读 `x.done`，只查 `moves` 挡不住「sets 缺」和 `sets:[null]`。草稿同理走 `validDraft()`：**它也必须校验 `sets` 里的元素是对象**（消费端 `countDone()` 读 `s.done`、`setRow()` 读 `s.weight`），只查 `moves` 和 `sets` 是数组挡不住 `sets:[null]`；坏草稿在记录页渲染时清掉，`getDraft()` 会按计划重建，不能让它崩掉整页或变成删不掉的僵尸。`progress.js` 统计页与 `log.js` 记录页都会显示「有 N 条记录格式异常已跳过」。
- **容器类型校验**：`loadDB()` 负责把 `sessions`/`drafts` 的容器类型兜住——`sessions` 必须是数组、`drafts` 必须是普通对象，不满足就退化为空集合。`db.sessions.filter`、`delete db.drafts[k]` 遇到错类型会直接抛错（`Cannot delete property '0' of [object String]`），只判真值挡不住。跨标签页同步复用 `loadDB()`，自动受益。
- **主题防闪烁**：`index.html` `<head>` 的内联脚本在首屏前读取 `localStorage` 设置 `data-theme`；改主题逻辑时必须同时改它和 `js/core.js` 的 `applyTheme`。`applyTheme` 会派发 `themechange` 事件，Canvas 图表据此重绘（颜色取自 CSS 变量，不要在 `drawBars` 里硬编码颜色）。
- **计划数据与历史耦合**：训练日 `id`（`w1`–`w4`、`r1`）同时关联 CSS 变量 `--d-<id>` 和已存记录；动作历史按 `name` 匹配。重命名 id/动作名会让旧历史、草稿、最佳组对不上。
- **模块依赖环**：`log.js` 静态 import `plan.js`；反过来 `plan.js` 只能 `await import("./log.js")`，训练计数经 `app.js` 的 `setSessionCounter` 注入，避免循环依赖。
- **双主题颜色**：颜色分别定义在 `:root` 和 `:root[data-theme="dark"]`；新增训练日或颜色两边都要加，`--card-top` 在深色主题必须覆盖，否则白字压白底。**正文用的红色要 `--danger-ink`（浅 `#b91c1c` / 深 `#fca5a5`），不要用 `--danger`**——`--danger` 当文字色在浅底上只有 3.75:1，不达 AA。告警卡用 `.card-warn` 类，深色主题必须覆盖背景。`tests/run.js` 的 `contrastScan` 会把半透明背景逐层合成后计算对比度。
- **本地数据**：键名 `gym4.db.v1`（`sessions`/`drafts`）、`gym4.theme`、`gym4.persist.v1`、`gym4.backup.hint.v1`；无后端。改数据结构要考虑旧数据迁移（`log.js` 里有旧版草稿兼容代码）。导入 JSON 走 `validateDB()`（`sessions` 和 `drafts` 都校验，`rir`/`maxPain`/`durationMin` 必须是数字），结构不对的数据直接拒绝、不写盘。`saveDB()` 写盘失败会 toast 并返回 `false`：调用方只在成功时删草稿、提示成功；另一个标签页写入会触发 `storage` 同步（训练中只提醒，不覆盖）。

## 图标

`icons/app-icon.svg` 是母版，改动后用 Playwright Chromium 重新渲染：

```bash
node scripts/render-icons.js
```

仓库没有依赖清单，需本机已有 `playwright` + chromium（仅开发用，不影响 App 运行）。脚本通过字符串替换 SVG 里的 `rx="114"` 控制圆角，改母版时不要破坏该属性。

## 提交

Conventional Commits：`type(scope): subject`；历史 subject 使用中文。除用户明确要求外，不要 commit 或 push。线上由 GitHub Pages 托管（<https://xhugh.github.io/planner/>，仓库 `xHugh/planner`），`.nojekyll` 已存在；仓库没有 CI workflow，push 不会自动跑测试。
