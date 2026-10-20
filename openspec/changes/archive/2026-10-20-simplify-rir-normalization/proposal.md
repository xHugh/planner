# Proposal

## Why

上一轮 over-engineering review（`/ponytail-review`）在提交 `4575bd4` 上找出 4 处可删的复杂度：RIR 归一做了两遍、`snapInt()` 是只剩一个调用点的投机 helper、`app.js` 两个分支各读一次 `localStorage`、`tests/run.js` 里两段逐字重复的 `evaluate` 断言。这些都不改变可观察行为，只是让同一件事有两个实现、两处要同步。

## What Changes

- `js/log.js`：删除 `getDraft()` 出口的 RIR 归一（`openWorkout()` 对同一个草稿对象已经归一，全仓 `getDraft` 唯一调用方就是 `openWorkout`）；删除只剩一个调用点的 `snapInt(v, fallback)` helper，就地归一。
- `app.js`：`storage` 监听里两个分支各调一次 `loadDB()`，提到分支之前取一次共用。
- `tests/run.js`：两处逐字相同的「读 RIR 选中档」`page.evaluate` 改用本文件已有的 locator 写法（`.wo-summary .chips` → `.pick.on` → `allInnerTexts()`）。
- 顺带修正 `openspec/changes/archive/2026-10-20-fix-multitab-overwrite-and-rir-type/proposal.md` 里两个 bullet 被并成一行（markdown 换行丢失）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无）——纯重构，可观察行为不变，`.openspec.yaml` 标了 `skip_specs: true`。理由见 design.md「规格为何不动」。

## Impact

- 代码：`js/log.js`、`app.js`、`tests/run.js`。
- 规格、API、数据结构、依赖、存储键名：均不变。`openspec/specs/` 不需要动。
- 风险面：RIR 归一仍发生在训练页渲染之前——两条加载路径（记录页「继续」、编辑已有记录）都在 `openWorkout()` 里完成归一，训练页显示、`finishWorkout()` 写入记录、导出备份这三处看到的是同一个数字。
