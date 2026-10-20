# Tasks

## 1. RIR 类型归一（workout-draft）

- [x] 1.1 在 `js/log.js` 加 `snapInt(v, fallback)` 工具（`Number.isFinite(+v)` 判断，失败返回 fallback），并在 `getDraft()` 返回前把 `dr.rir` 归一为数字、默认值 2；编辑模式草稿的 `rir` 也走同一入口；验证：`node tests/run.js data` 不回归
- [x] 1.2 在 `tests/run.js` 新增回归用例「旧草稿动作级 rir 为字符串」：造 `rir: "2"` 的草稿 → 记录页「继续」打开 → 断言训练页 RIR 有一档选中 → 完成训练 → 断言写入记录的 `rir` 是 `number` 且该备份能再次通过 `validateDB()`；验证：`node tests/run.js draft` 通过

## 2. 跨标签页写入不互相覆盖（local-data-integrity）

- [x] 2.1 改 `app.js` 的 `storage` 监听：`state.wo` 非空时把新数据中当前内存没有的训练记录追加进 `db.sessions`（按 `id` 去重——`loadDB()` 每次 `JSON.parse` 都产生新对象，按引用比较会永远判为"新记录"而重复插入，实测造成同 id 记录翻倍），草稿容器保持本标签页自己的，然后才弹 toast；空闲时保持原整体替换 + `normalizeDrafts()` + 重绘；验证：`node tests/run.js data` 的既有「两个标签页相互同步」用例不回归
- [x] 2.2 在 `tests/run.js` 新增回归用例「训练中另一标签页完成训练」：A 打开训练并勾一组 → B 完成一次训练写盘 → A 输入备注等防抖落盘 → 断言 B 的记录仍在 `localStorage` 且 A 的草稿内容未被 B 替换；验证：`node tests/run.js data` 通过（该用例失败过：修复前记录数从 1 变 0）

## 3. 集成验证

- [x] 3.1 全量 `node tests/run.js`（0 失败），并 `GYM4_TZ=Pacific/Kiritimati node tests/run.js` 复跑确认星期几无关；验证：两轮均 0 失败（两轮均 276 项通过）
- [x] 3.2 `openspec validate --changes` 与 `openspec validate --specs` 均通过；验证：两条命令退出码 0（1 change + 8 specs 全过）

## Workflow follow-up

- 实现完成后走 `/openspec-sync-specs` 把两条 delta 合并进主 specs，再走 `/openspec-archive-change` 归档
- 归档后在浏览器手动过一遍：训练中开两个标签页同时操作、旧草稿字符串 RIR 打开后档位选中
