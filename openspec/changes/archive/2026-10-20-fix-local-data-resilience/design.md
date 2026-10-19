# Design

## Context

数据全部存在浏览器 `localStorage` 的 `gym4.db.v1` 里，结构是 `{ sessions: [...], drafts: {...} }`，没有后端、没有 schema 版本号、没有迁移框架。`js/core.js` 里有两处"可用性判定"——`validSessions()` 过滤结构不可用的历史记录、`validDraft()` 判定草稿是否可用；`js/log.js` 的 `getDraft()` 负责草稿的读与建；`js/progress.js` 的 `validateDB()` 是导入前的唯一闸门。

现状约束（来自 `AGENTS.md` 与代码本身）：

- 记录页、进度页、训练页三个页面都直接遍历 `db.sessions` / `db.drafts`，任何一处漏判都会整页崩
- 草稿键约定是 `dayId@date`，`AGENTS.md` 明确要求"草稿不可覆盖"——`getDraft()` 命中已有草稿时必须续用
- `elapsedMs`（累计活跃时长）与 `lastResumedAt`（本次计时起点）是训练时长的唯一来源，`visibilitychange` 负责暂停
- 训练日 id 关联 CSS 变量与已存历史，重命名会让旧历史对不上——所以 `dayId` 缺失的历史记录是**预期内**的常态，不是异常数据
- 仓库零依赖、零构建，测试是自带的 `tests/run.js`（Playwright + Chromium，仅开发用）

具体缺陷与复现证据见 `proposal.md`；行为契约见 `specs/`。

## Goals / Non-Goals

**Goals:**

- 本地数据处于任意形态时，三个页面都能完成渲染，不出现未捕获异常
- 草稿在"读—续—存—完成"整条链路上只认一个键，不再出现重复记录或打开空表单
- 训练时长在页面生命周期事件（隐藏、刷新、关闭）之后不倒退、不归零
- 所有修复都收敛在既有边界内：`js/core.js` 放判定与归一化，`js/log.js` 放流程，`js/progress.js` 放导入闸门
- 每条修复都有对应的可执行回归用例

**Non-Goals:**

- 不改 `gym4.db.v1` 的结构，不加 schema 版本号，不写迁移脚本——修复全部在读取侧兼容
- 不改训练计划 `data.js`，不动训练日 id 与动作名
- 不重构页面结构、不做 UI 改动
- 不引入构建步骤、依赖、CI
- 不处理"训练日 id 被重命名后旧记录如何迁移"——这属于计划数据治理，超出本次范围

## Decisions

### 1. 判定与归一化都收敛到 `js/core.js` 的单一入口

`validDraft()` 补上与 `validSessions()` 对称的 `sets` 元素校验；`loadDB()` 校验 `sessions` / `drafts` 的容器类型，不合法就退化为空集合。

**替代方案**：在 `countDone()` / `setRow()` 消费端加判空。放弃——散点防御必然漏判，且项目已有 `validSessions()` 这个"集中定义 + 全量切换消费端"的先例，沿用它成本最低。

**为什么放在 `loadDB()` 而不是 `validSessions()`**：`db.sessions.filter` 本身就在 `validSessions()` 的第一行，类型错时炸在判定函数自己身上，判不住；而 `db.sessions.length`、`db.drafts[k]` 这类直接访问散落在 `renderLog`、`renderProgress`、`app.js` 的 storage 同步里。唯一入口 `loadDB()` 一次收口，跨标签页同步（`app.js` 复用 `loadDB()`）自动受益。

### 2. 草稿的唯一键是 `dayId@date`，对象内的 `key` 字段降级为冗余镜像

在 `getDraft()` 里统一归一化：命中已有草稿后强制 `dr.key = k`；若草稿存放在非规范键下，删旧键、搬到 `db.drafts[k]`。

**替代方案 (a)**：只在 `finishWorkout()` 改用 `dr.dayId + "@" + dr.date` 删除。放弃——只修好"删不掉"，修不好"「继续」打开空表单"（`getDraft` 按规范键查，找不到就新建一份）。

**替代方案 (b)**：加载时全库重建键。放弃——改动面大，且可能误删用户数据。

**为什么归一化而不是拒绝**：导入闸门 `validateDB()` 拒绝的是**结构非法**（缺 `id`、`date` 格式错、数字字段不是数字）；键与 `dayId@date` 不一致属于**可修复**，拒绝会让一份本可用的备份直接打不开，用户会卡在死路上。所以 `validateDB()` 不为键不一致报错，而是在写盘前走同一套归一化。

**归一化的调用点**：`getDraft()`（读路径，命中即改写）、`importData()`（导入后）、`app.js` 的 storage 同步后。三处共用一个 `normalizeDrafts()`。

### 3. 计时的落盘与恢复各管一头

- **隐藏时落盘**：`visibilitychange` 隐藏时 `pauseClock(draft)` 之后补一次 `saveDB()`，把已累计时长与"计时已停"的状态写进草稿。
- **离开页面前落盘**：`pagehide` 触发时同样 `pauseClock(draft)` + `saveDB()`。刷新、关闭标签页、跳走都会触发它。
- **恢复时并回**：`openWorkout()` 恢复草稿时，若草稿里仍残留 `lastResumedAt`，先把 `now - lastResumedAt` 并入 `elapsedMs` 再 `resumeClock()`。

**为什么三处都要**：只做隐藏时落盘，覆盖不到"浏览器进程被强杀 / 页面被直接刷新"这类没走完隐藏流程的路径——实测刷新后草稿盘上 `elapsedMs` 仍是 0；只做 `pagehide` 落盘，则在"切后台 2 小时后回来"这种场景会把 2 小时算进训练时长（切后台期间计时本就应停）；只做恢复时并回，则"从后台切回前台后计时继续走、这中间没有任何落盘时机"，页面一刷新这段就白丢了——这是走查时实测到的真实缺口（00:05 刷新后变回 00:03），`pagehide` 补上后才闭合。

**并回间隔的上限**：并回量取 `min(now - lastResumedAt, 2 小时)`。2 小时是"单次训练的合理上限"，超过部分视为设备闲置。**替代方案**：不设上限——则隔夜重开 App 会把 10 小时记成训练时长，明显荒谬；设更小的上限（如 30 分钟）会截断真实的长训练。

**落盘频率**：只在隐藏与离开页面时各写一次，不做周期性写盘——训练中每勾选一组本来就会 `saveDB()`，这两处是补上"什么都没动就切走/刷新"的缺口。

### 4. 训练日 id 缺失的历史记录：编辑降级为明确提示，不静默失败

`showSessionSheet()` 的「编辑这条记录」按钮先判断该记录的 `dayId` 是否还在计划里；不在就不关弹层，改为 toast 说明"这条记录的训练日已不在当前计划里，无法编辑"。`openWorkout()` 自身也加同样的兜底提示。

**替代方案**：允许编辑计划外的 `dayId`（用记录自带的动作列表渲染训练页）。放弃——`renderWorkout()` 依赖计划的 `d.moves` 做"计划动作 vs 实际动作"的对照渲染（`findMove`、`extra` 分支），改成完全由记录驱动要重写这一整块，且这类记录本身极少。

**为什么不静默返回**：`dayId` 因计划改名而失效是 `AGENTS.md` 明确警告过的预期内场景，用户看到"点了没反应"无法自行判断原因。

### 5. 开发服务器按目录分隔符判定路径边界

`scripts/serve.js` 的路径穿越判断从 `file.startsWith(ROOT)` 收紧为 `file !== ROOT && !file.startsWith(ROOT + path.sep)`。

**为什么用分隔符**：同前缀的兄弟目录（如 `gym-pwa-backup/`）会被裸 `startsWith` 放行；补上分隔符后，判定边界就是目录而不是字符串前缀。

## Risks / Trade-offs

- **[隐藏时多一次 `localStorage` 写入]** → 只在 `visibilitychange` 触发时写一次，频率极低；写失败走既有 `saveDB()` 的失败提示路径，不阻断任何流程
- **[归一化会改写用户草稿的 `key` 字段]** → 只改 `key` 与存放位置，不动 `moves`/`sets`/备注等用户数据；归一化结果随下一次 `saveDB()` 落盘
- **[计时并回上限 2 小时可能截断超长训练]** → 真实单次训练超过 2 小时极罕见；相比"隔夜重开记成 10 小时"这个更常见的错误，该取舍明显更优
- **[`openWorkout` 的兜底 toast 只在训练日缺失时出现]** → 正常路径不新增任何提示
- **[收紧 `serve.js` 后仍可通过项目内的符号链接读到外部文件]** → 本次不处理符号链接；开发机本地工具，威胁模型有限
- **[读侧兼容而非数据迁移]** → 坏数据每次读取都要走一遍判定；数据量级在几百条记录，判定成本可忽略
