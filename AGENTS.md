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
- 用例分组：`flow`（训练完整流程）、`draft`（草稿不被覆盖、放弃、空草稿清理、草稿身份归一化）、`data`（旧数据兼容、导入校验、残缺记录容错、坏草稿与坏容器不崩页）、`workout`（底栏进度、后台不计时长、记录再编辑、刷新后时长不丢）、`history`（训练日缺失时编辑有提示）、`a11y`（触摸 ≥44px、对比度 ≥4.5:1 深浅主题 × 计划页/进度页、`aria-current`/`aria-live`）、`chart`（一年数据下图表可读、周窗口与停训空档、视口变化重绘）、`progress`（未来日期不进统计、空态仍可导入备份、计划页已练次数字径）、`offline`（预缓存清单完整性、断网加载）、`devserver`（本地开发服务器健壮性）。每条用例还会检查 JS 报错与 4xx/5xx。
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

- **Service Worker 策略**：`sw.js` 对同源 GET 走 **network-first**（3s 超时回退缓存），离线兜底靠 `ASSETS` 预缓存。改线上文件**不需要**手动改版本号，用户下次打开自动是新的；`CACHE`（当前 `gym4-v21`）只用于 `activate` 时清理旧缓存，仍建议递增。新增静态文件必须同步加入 `ASSETS`，否则离线时缺失（`offline` 用例会检查清单完整性，并逐条断言清单里的路径都能取到 200）。**预缓存逐条写入**：`caches.addAll()` 是全有全无的，一条资源失效就整批失败、Service Worker 装不上、离线能力静默消失（页面仍能用，因为是 network-first）——所以 `install` 里改成逐条 `c.add(u).catch(warn)`。**`activate` 的清理只删 `gym4-` 前缀的缓存**：Cache Storage 按 origin 隔离，线上 origin 是 `xhugh.github.io`（不止本应用路径），删掉同 origin 其他应用的缓存会让对方的离线能力失效。
- **草稿不可覆盖**：草稿键为 `dayId@date`（`core.js` 的 `draftKey()`），同一天同一训练日只有一份。`getDraft()` 命中已有草稿时**一律续用**，绝不能覆盖——覆盖会丢掉用户已勾选的组（历史上出过这个 bug）。要丢弃用记录页草稿行的「✕」按钮。草稿的 `touched` 字段标记用户是否动过它：开了训练什么都没动就退出的空草稿会在渲染时清掉。**草稿身份只认 `dayId@date`**：导入的旧备份或手改 localStorage 可能把草稿存在别的键下，`core.js` 的 `normalizeDrafts()` 负责剔除坏草稿并把它们搬回规范键（`getDraft()` 也会按 `dayId+date` 兜底查找）。`finishWorkout()` 按规范键删除草稿，**不要用草稿对象自带的 `key` 字段**——它可能缺失，那样删的是 `drafts[undefined]`，草稿会留下来让同一份训练被重复完成、生成重复记录。
- **训练计时**：`elapsedMs` 是累计活跃时长，`lastResumedAt` 是本次开始时刻。切后台/锁屏走 `visibilitychange` 暂停，计时不增长；**暂停后要 `saveDB()` 落盘**。**`pagehide` 也要落盘**（刷新/关闭/跳走都会触发）——只靠 `visibilitychange` 不够：从后台切回前台后计时继续走，这中间没有任何落盘时机，页面一刷新这段就白丢了。`openWorkout()` 恢复草稿时会把残留的 `lastResumedAt` 间隔并回 `elapsedMs`（上限 2 小时，隔夜重开不算 10 小时训练）。**旧草稿缺 `elapsedMs` 时从 0 起算**，不要按 `startedAt` 推算——旧草稿的 `startedAt` 可能是几天前，推算会把数天算成训练时长（曾实测显示 `4320:01`）并污染 `durationMin`。`durationMin` 由 `elapsedMs` 得出。**草稿的计时字段按数值归一**：`elapsedMs` / `lastResumedAt` 不是有效数字时降级为「没累计过 / 没在计时」（数字字符串会被转成数字），而不是判成坏草稿——判坏草稿会连用户已勾选的组一起清掉。坏值会让计时器显示 `NaN:NaN`、写进记录的 `durationMin` 变成 `null`。`validateDB()` 也拒绝非数字的草稿计时字段。
- **HTML 转义**：`html` 不转义，只用于 `data.js` 等可信常量；动态数据（备注、动作名、导入内容）必须经 `esc()`。现有代码全部是 `html` + 显式 `esc`，照此处理。
- **残缺记录**：`db.sessions` 里可能混有缺 `date`、缺 `moves`，或某个动作缺 `sets`/`sets` 里混了 `null` 的记录（旧版本遗留或手改 localStorage）。读记录一律走 `core.js` 的 `validSessions()` 过滤，不要直接遍历 `db.sessions` 再访问 `s.moves`——漏判一处就会整页崩。`validSessions()` 要同时校验 `moves`、每个动作的 `sets` 数组，以及 `sets` 里的元素是对象：消费端直接 `m.sets.forEach` 再读 `x.done`，只查 `moves` 挡不住「sets 缺」和 `sets:[null]`。草稿同理走 `validDraft()`：**它也必须校验 `sets` 里的元素是对象**（消费端 `countDone()` 读 `s.done`、`setRow()` 读 `s.weight`），只查 `moves` 和 `sets` 是数组挡不住 `sets:[null]`；坏草稿在记录页渲染时清掉，`getDraft()` 会按计划重建，不能让它崩掉整页或变成删不掉的僵尸。`progress.js` 统计页与 `log.js` 记录页都会显示「有 N 条记录格式异常已跳过」。
- **容器类型校验**：`loadDB()` 负责把 `sessions`/`drafts` 的容器类型兜住——`sessions` 必须是数组、`drafts` 必须是普通对象，不满足就退化为空集合。`db.sessions.filter`、`delete db.drafts[k]` 遇到错类型会直接抛错（`Cannot delete property '0' of [object String]`），只判真值挡不住。跨标签页同步复用 `loadDB()`，自动受益。
- **主题防闪烁**：`index.html` `<head>` 的内联脚本在首屏前读取 `localStorage` 设置 `data-theme`；改主题逻辑时必须同时改它和 `js/core.js` 的 `applyTheme`。`applyTheme` 会派发 `themechange` 事件，Canvas 图表据此重绘（颜色取自 CSS 变量，不要在 `drawBars` 里硬编码颜色）。**canvas 的位图缓冲只在绘制时算一次**，所以 `js/progress.js` 必须监听 `resize` 按新宽度重绘——不重绘的话手机横屏、桌面缩放后图表会被 CSS 拉伸变形；绘制高度取 `canvas.clientHeight`（样式表是 190px），写死数值会造成常年的纵向拉伸。
- **弹层焦点不逸出**：`index.html` 的弹层声明了 `aria-modal="true"`，`js/core.js` 的 Tab 处理就必须在焦点位于弹层之外时把它拉回弹层内（只做首尾循环不够——焦点在背景页面时按 Tab 会走到背后的内容）。Esc 关闭后焦点回到打开弹层的那个控件。
- **计划数据与历史耦合**：训练日 `id`（`w1`–`w4`、`r1`）同时关联 CSS 变量 `--d-<id>` 和已存记录；动作历史按 `name` 匹配。重命名 id/动作名会让旧历史、草稿、最佳组对不上。
- **模块依赖环**：`log.js` 静态 import `plan.js`；反过来 `plan.js` 只能 `await import("./log.js")`，训练计数经 `app.js` 的 `setSessionCounter` 注入，避免循环依赖。
- **双主题颜色**：颜色分别定义在 `:root` 和 `:root[data-theme="dark"]`；新增训练日或颜色两边都要加，`--card-top` 在深色主题必须覆盖，否则白字压白底。**正文用的红色要 `--danger-ink`（浅 `#b91c1c` / 深 `#fca5a5`），不要用 `--danger`**——`--danger` 当文字色在浅底上只有 3.75:1，不达 AA。**关键数值（`.stat b`）用实色 `var(--brand-1)`，不要用渐变裁剪文字**：`background-clip: text` + `color: transparent` 的渐变末端 `--brand-2` 在浅色主题下对白卡片只有 2.43:1（32px 粗体阈值 3:1），而且 `color` 计算值是 transparent，`tests/run.js` 的 `contrastScan` 读不到它——等于既不达标也没有护栏。告警卡用 `.card-warn` 类，深色主题必须覆盖背景。`tests/run.js` 的 `contrastScan` 会把半透明背景逐层合成后计算对比度。
- **本地数据**：键名 `gym4.db.v1`（`sessions`/`drafts`）、`gym4.theme`、`gym4.persist.v1`、`gym4.backup.hint.v1`；无后端。改数据结构要考虑旧数据迁移（`log.js` 里有旧版草稿兼容代码）。导入 JSON 走 `validateDB()`（`sessions` 和 `drafts` 都校验，`rir`/`maxPain`/`durationMin` 必须是数字），结构不对的数据直接拒绝、不写盘。`saveDB()` 写盘失败会 toast 并返回 `false`：调用方只在成功时删草稿、提示成功；另一个标签页写入会触发 `storage` 同步（合并口径见下一条）。
- **跨标签页写入的合并口径**：`app.js` 的 `storage` 监听分两支——空闲时整量替换 `db.sessions` 与 `db.drafts`；训练中（`state.wo` 非空）把对方新增的 `sessions` 按 `id` 去重后并入，并把对方的**草稿快照覆盖进** `db.drafts`，只有本标签页正在编辑的那份草稿（同一对象引用）保持不动。必须覆盖而不是「只补本地没有的」：对方快照就是当前磁盘状态，本地若留着更旧的一版，下一次整量写盘会把对方刚填的重量与勾选覆盖掉（实测会让对方的草稿被判成空草稿而删除）。`saveDB()` 是整量写盘，内存里的 `db.drafts` 一旦陈旧就会连累别的标签页的数据。
- **记录定位以对象引用为准**：详情/编辑/删除都按被选中的记录对象本身定位（`indexOf`/`includes`），**不要用 `id` 匹配**——手改 localStorage 可能出现重复 `id`，按 id 过滤会把同 id 的记录一起删掉或改错。`validateDB()` 同时拒绝重复 id 的导入（双层防御）。`showSessionSheet` 兼容传 id 字符串（按第一条匹配，仅测试用），新入口一律传记录对象；编辑模式用 `state.wo.editingRef` 锚定打开时的那条记录。**引用会因跨标签页同步而失效**（空闲分支整量替换 `db.sessions` 会换掉全部对象），所以删除与编辑保存都走 `log.js` 的 `resolveSession()`：先按对象引用找，引用失效时按「`id` + 日期 + 训练日 + 动作数 + 组数」的签名找回同一条，签名命中不唯一就不猜（宁可提示「这条记录已经不在了」，也不要删错）。
- **编辑态判定不依赖记录 id**：编辑已有记录时用显式的 `state.wo.isEdit`，**不要用 `editingId` 的真值判断**——手改 localStorage 造出的记录可能没有 `id`（`validSessions()` 不要求 `id`，`validateDB()` 才要求），那时 `editingId` 是 `undefined`，会被误判成新建训练：按钮显示「完成训练」、保存时 `db.sessions.push()` 生成一条重复记录、离开提示也不触发。`editingId` 只是「这条记录的 id」这项数据。
- **编辑有修改时 beforeunload 提示**：编辑历史记录期间任何修改入口都会置位 `state.wo.editDirty`，`beforeunload` 据此弹浏览器原生离开确认；未编辑或没改过就不弹。**编辑草稿仍然只存内存**（刷新/关页即丢，原记录无损，这是既定取舍）；iOS Safari 与 PWA 独立窗口对该提示支持有限，为已知限制。
- **进度统计过滤未来日期**：`js/progress.js` 的 `countableSessions()` 过滤 `date > today()` 的记录，统计卡与两张图表共用过滤后的数组（未来日期只会来自手改/坏导入）；记录页历史列表**不走**此过滤，未来记录仍可查看。开始表单日期输入有 `max = today()` 与提交前双重校验，不能开始未来日期的训练。
- **容量图按自然周窗口取数**：`js/progress.js` 的 `aggregateByWeek()` 取「截至本周的最近 12 个自然周」，**没有训练的周记 0**——等距排布的柱形里，停训空档必须是 0 柱，否则「最近 12 个有训练的周」会把几周的停训压成相邻的柱，看不出停了几周。窗口内一次都没练时回退到最近 12 个有训练的周，保证「有数据但图表空白」不会发生。
- **进度页空态必须留导入入口**：`js/progress.js` 的 `renderProgress()` 在没有可统计记录时走 `renderEmptyState()`，**空态仍然渲染「导入备份」按钮**——`importData()` 全仓只有这一个入口，清缓存/换设备后（本地库为空）若没它，手里的备份就没地方导入。空态文案按成因分叉：真没记录说「还没有数据」，记录结构异常说「格式异常已跳过」，记录完好但日期在未来说「晚于今天」——不能一律说「还没有数据」，否则用户以为记录丢了。本地确实一条记录都没有时不给导出按钮（没东西可导），有记录但都不可用时仍要给导出（坏数据卡提示「导出备份后手动清理」）。

## 图标

`icons/app-icon.svg` 是母版，改动后用 Playwright Chromium 重新渲染：

```bash
node scripts/render-icons.js
```

仓库没有依赖清单，需本机已有 `playwright` + chromium（仅开发用，不影响 App 运行）。脚本通过字符串替换 SVG 里的 `rx="114"` 控制圆角，改母版时不要破坏该属性。

## 提交

Conventional Commits：`type(scope): subject`；历史 subject 使用中文。除用户明确要求外，不要 commit 或 push。线上由 GitHub Pages 托管（<https://xhugh.github.io/planner/>，仓库 `xHugh/planner`），`.nojekyll` 已存在；仓库没有 CI workflow，push 不会自动跑测试。
