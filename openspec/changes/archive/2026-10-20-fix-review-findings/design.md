# Design

## Context

动机见 proposal.md。与方案相关的现状约束：

- `scripts/serve.js` 与 `tests/run.js` 各自内嵌一个零依赖静态服务器，互不引用（`serve.js` 被 `require` 会直接监听端口，无法作为共享模块引入）。
- `validateDB`（`js/progress.js`）是导入唯一入口；本地数据的另一条来源是用户手改 `localStorage`（仓库文档明确以此为设计前提），导入校验管不到它。
- 记录列表/详情/编辑/删除当前全部以 `id` 为定位键（`log.js` 的 `showSessionSheet(id)`、`filter(x => x.id !== s.id)`、`findIndex(x => x.id === wo.editingId)`）。`validSessions()` 基于 `filter` 产生，元素仍是 `db.sessions` 里的原对象，引用可回溯。
- 进度页统计基于 `renderProgress` 里排序后的 `sessions` 数组；历史列表在 `log.js` 中独立渲染。
- 编辑模式的草稿只在内存（`state.wo.draft`，`key: "edit:<id>"`），不写入 `db.drafts`——这是既定取舍，本次不变。

## Goals / Non-Goals

**Goals:**

- 畸形 URL 不再打崩任一本地服务器；两个服务器的路径边界判定一致。
- 重复 `id` 不可能通过导入进入；已存在的重复 `id`（手改数据）在查看/编辑/删除时只影响被选中的单条。
- 进度页统计与图表不被未来日期数据污染；开始表单选不到未来日期。
- 编辑有修改时刷新/关页触发浏览器原生离开确认。

**Non-Goals:**

- 不把编辑草稿持久化到 `localStorage`（用户已明确选择 beforeunload 方案）。
- 不自动清理已存在的未来日期记录或重复 `id` 记录（只按新契约对待它们）。
- 不处理双标签页同时编辑的竞争（现有「另一个标签页改了数据」提醒机制维持不变）。
- 不改动训练计时（`workout-timing`）与草稿续用/丢弃（`workout-draft` 既有需求）的任何行为。

## Decisions

1. **畸形路径用 `try/catch` 兜底返回 400**（`serve.js:35` 的 `decodeURIComponent` 移入 try）。备选：正则预校验 percent-encoding——被否，规则复杂且易漏，`catch URIError` 是语言级判据。进程存活靠「一切请求处理都在捕获范围内」保证，`stat`/`readFile` 已在既有 try 中。
2. **`tests/run.js` 复制同一行目录边界判定**（`file !== root && file.startsWith(root + path.sep)`），不抽共享模块——`serve.js` 是即启型 CLI 脚本，被 import 即监听端口，抽象成本高于两行重复；delta spec 已把该行为固化，两边不会漂移。
3. **重复 `id` 双层防御**：`validateDB` 拒绝重复 id（挡住导入来源）+ 操作层按对象引用定位（挡住手改来源）。只做其一都不完整：只做导入校验则手改数据仍会「删一条删两条」，只做引用定位则坏备份仍能导入。定位改造点：
   - 详情：`showSessionSheet` 接受记录对象（列表行点击传 `s`）；保留 `string` 入参兼容（按 `id` 找第一条），因为现有测试直接以 id 调用该函数。
   - 删除：`db.sessions.indexOf(被选对象)` 后 `splice`，不再 `filter(id)`。
   - 编辑：`state.wo` 记录 `editingRef`（打开编辑时的原对象引用），保存时 `db.sessions.indexOf(editingRef)`；返回 -1 走既有「这条记录已经不在了」分支——跨标签页同步替换过 `db.sessions` 数组时自然落到这里，无需新逻辑。
4. **未来日期过滤加在 `renderProgress` 的会话数组上**（`s.date <= today()`），只影响统计与图表；历史列表不过滤（progress-stats spec 场景明确要求历史仍可查看）。备选：在 `validSessions()` 里过滤——被否，会把记录从记录页隐藏，扩大影响面。日期输入加 `input.max = today()` 作为入口侧防御，并在「开始记录」点击时再校验一次（手输绕过 `max` 的场景）。
5. **`beforeunload` 用编辑脏标记触发**：`state.wo.editingId` 存在且本次编辑发生过任意输入/勾选（复用 renderWorkout 各 `oninput`/`onToggle` 回调，置 `wo.editDirty = true`）才 `preventDefault()`。备选：进入编辑即提示——被否，未做修改就刷新被浏览器拦一道是纯打扰；编辑草稿持久化——非目标，见 Non-Goals。处理器是模块级单例（`js/log.js`），条件依赖 `state.wo`，关闭/完成编辑后条件自然不成立，无需解绑。

## Risks / Trade-offs

- [beforeunload 在 iOS Safari 与 PWA 独立窗口支持有限，主要移动端场景可能不弹提示] → 用户已在方案选择时知悉并接受；编辑不落盘的既有取舍不变，最坏情况等同现状（本次编辑丢失，原记录无损）。
- [导入校验收紧后，手工合并过的旧备份（含重复 id）会被拒绝] → 错误信息明确指出「存在重复的记录 id」，用户去重后再导入；符合「坏数据不许进本地库」的既有原则。
- [Playwright 对 beforeunload 对话框的断言依赖 chromium 行为] → 测试套件本就只跑 chromium；用例通过 `page.on("dialog")` 捕获而非断言不可控的原生文案。
- [`showSessionSheet` 保留 id 字符串兼容分支，理论上可被误用退回 id 定位] → 列表与详情入口全部传对象；兼容分支仅服务既有测试调用，delta spec 的场景以对象路径验收。

## Migration Plan

无数据格式变更，无迁移。回滚即还原对应提交；已导入被拒的数据从未写盘，无需清理。

## Open Questions

无——编辑保护方案已在提案阶段由用户裁定（beforeunload），其余决策均已在 spec 场景层面收敛。
