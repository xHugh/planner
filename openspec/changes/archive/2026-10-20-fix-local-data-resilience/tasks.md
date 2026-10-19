# Tasks

## 1. 本地数据校验收口

- [x] 1.1 `js/core.js` 的 `validDraft()` 补上与 `validSessions()` 对称的 `sets` 元素对象校验（每个动作的 `sets` 里每个元素必须是非 null 的对象）。验证：`validDraft` 对 `moves:[{name:"x",sets:[null]}]` 判定为不可用
- [x] 1.2 `js/core.js` 的 `loadDB()` 校验容器类型：`sessions` 必须是数组、`drafts` 必须是普通对象，不满足时退化为空集合再返回。验证：落盘 `{"sessions":{}}` 与 `{"drafts":"abc"}` 时 `db.sessions` / `db.drafts` 为可用的空集合
- [x] 1.3 `tests/run.js` 补回归用例：草稿 `sets:[null]` 不崩记录页且被清理；`sessions` 非数组、`drafts` 非对象时三个页面都能渲染。验证：`node tests/run.js` 全绿且新用例真实命中（不是恒真断言）
- [x] 1.4 `AGENTS.md` 的「残缺记录」条目补上：草稿同样要校验 `sets` 元素、容器类型异常退化为空集合。验证：条目文字与实现一致

## 2. 草稿身份归一化

- [x] 2.1 `js/core.js` 新增 `normalizeDrafts()`：结构损坏的草稿直接剔除；结构可用但键不唯一的草稿搬到 `dayId@date` 规范键下并把对象内的 `key` 补成规范键。验证：同一草稿处理后 `db.drafts` 里只剩一份且键为 `dayId@date`
- [x] 2.2 `js/log.js` 的 `getDraft()` 命中已有草稿后走归一化（补 `dr.key`、搬迁到规范键），命中失败才按计划新建。验证：草稿缺 `key` 时加载后 `dr.key` 为规范键
- [x] 2.3 `js/log.js` 的 `finishWorkout()` 改为按规范键 `dayId@date` 删除草稿，不再依赖草稿对象自带的 `key` 字段。验证：草稿缺 `key` 时完成训练后草稿被删除
- [x] 2.4 `js/progress.js` 的 `importData()` 与 `app.js` 的 storage 同步在写盘/替换后各调用一次 `normalizeDrafts()`。验证：导入一份键不一致的备份后草稿被归一化且不残留副本
- [x] 2.5 `tests/run.js` 补回归用例：草稿缺 `key` → 完成训练后草稿消失、记录数不重复；草稿存放在非规范键下 → 「继续」打开的是原数据、落盘后不残留第二份草稿。验证：`node tests/run.js` 全绿
- [x] 2.6 `AGENTS.md` 的「草稿不可覆盖」条目补上：草稿唯一键是 `dayId@date`，加载时归一化，完成训练后按规范键删除。验证：条目文字与实现一致

## 3. 训练时长跨页面生命周期不丢

- [x] 3.1 `js/log.js` 的 `visibilitychange` 处理器在 `pauseClock()` 之后补一次 `saveDB()`，把已累计时长与"计时已停"的状态落盘。验证：切后台后草稿盘上 `elapsedMs` 为已累计值且 `lastResumedAt` 为空
- [x] 3.2 `js/log.js` 的 `openWorkout()` 恢复草稿时，若草稿仍残留 `lastResumedAt`，先把 `now - lastResumedAt` 并入 `elapsedMs`（上限 2 小时）再 `resumeClock()`。验证：草稿残留 `lastResumedAt` 时恢复后 `elapsedMs` 不小于该间隔
- [x] 3.3 `tests/run.js` 补回归用例：训练中刷新页面后从记录页「继续」，计时不小于刷新前显示的时长。验证：`node tests/run.js` 全绿，且用例断言的是"不倒退"而非固定值
- [x] 3.4 `AGENTS.md` 的「训练计时」条目补上：暂停后要落盘、恢复时并回间隔（上限 2 小时）。验证：条目文字与实现一致
- [x] 3.5 `js/log.js` 增加 `pagehide` 钩子：离开页面前 `pauseClock` + `saveDB()` 落盘。验证：走查脚本里「切后台→回前台→刷新」后计时不倒退（`00:05 → 00:05`；加这条之前是 `00:05 → 00:03`）
- [x] 3.6 `tests/run.js` 的「刷新后时长不丢」用例扩展为先切后台再回前台再刷新，覆盖走查发现的缺口。验证：用例在缺少 `pagehide` 落盘时会失败

## 4. 历史记录编辑的降级路径

- [x] 4.1 `js/log.js` 的 `showSessionSheet()`：编辑按钮在目标 `dayId` 不在当前计划里时给出 toast 并保持弹层打开，不关弹层也不进入空白训练页。验证：`dayId` 缺失的记录点「编辑」后有可读提示、弹层仍在
- [x] 4.2 `js/log.js` 的 `openWorkout()` 对 `dayById()` 返回 null 的情况给出同样的兜底提示。验证：直接以未知 `dayId` 调用 `openWorkout` 时有提示且不渲染空白训练页
- [x] 4.3 `tests/run.js` 补回归用例：`dayId` 不在计划中的历史记录点「编辑这条记录」后仍停留在详情弹层并出现提示。验证：`node tests/run.js` 全绿

## 5. 开发服务器路径边界

- [x] 5.1 `scripts/serve.js` 的路径穿越判断从 `file.startsWith(ROOT)` 收紧为 `file !== ROOT && !file.startsWith(ROOT + path.sep)`。验证：请求项目内文件返回 200、请求同前缀兄弟目录返回 403、请求不存在的路径返回 404（用 curl 手工验证即可，本组不并入浏览器用例）

## 6. 集成验证

- [x] 6.1 `node tests/run.js` 全量通过（含本次新增用例），且每条用例的 JS 报错与 4xx/5xx 检查无新增失败。验证：退出码为 0
- [x] 6.2 `openspec validate fix-local-data-resilience` 通过。验证：命令无报错输出
- [x] 6.3 人工在浏览器走一遍：开始训练 → 勾选 → 切后台 → 回前台 → 刷新 → 继续 → 完成训练，确认时长不倒退、草稿被清除、记录只生成一条。验证：观察记录页与进度页

## Workflow follow-up

- 全部任务完成并通过后，把 change 归档（`openspec archive fix-local-data-resilience`），5 个 capability 的 spec 合并进 `openspec/specs/`。
- 归档后核对 `openspec/specs/` 下 5 个 capability 的 spec 完整，`openspec list --specs` 能列出它们。
