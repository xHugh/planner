# Tasks

## 1. 规格措辞订正（openspec/specs）

- [x] 1.1 `openspec/specs/session-history/spec.md` 的「编辑记录的疼痛值为奇数」场景 THEN 改为「向上取偶（1 取 2、9 取 10）」，与 `js/log.js:111-115` 的 `snapPain()` 一致；验证：`openspec validate --specs` 通过
- [x] 1.2 `openspec/specs/workout-draft/spec.md` 的「空草稿自动清理」需求描述判据改为「草稿仍处于未改动状态、且未勾选任何组」，并补一条场景「只写了备注没有勾选组的草稿被保留」；验证：`openspec validate --specs` 通过
- [x] 1.3 `openspec/specs/local-data-integrity/spec.md` 的「导入数据必须先校验后写盘」补一条场景「覆盖确认说明草稿也会被替换」；验证：`openspec validate --specs` 通过

## 2. 导入确认文案（js/progress.js）

- [x] 2.1 `js/progress.js:407` 的确认文案改为同时说明现有记录与草稿都会被替换；验证：新增断言「导入确认文案里提到草稿」

## 3. 补零覆盖场景的回归用例（tests/run.js）

- [x] 3.1 「删除记录时写盘失败」：造一条有效记录 → 详情弹层 → 注入 `Storage.prototype.setItem` 抛错 → 点「删除这条记录」并确认 → 断言提示含「存储失败」且不含「已删除」、记录仍在 `localStorage`；验证：新增用例通过
- [x] 3.2 「放弃草稿时写盘失败」：造一份 `touched` 草稿 → 注入写失败 → 点草稿行的「✕」并确认 → 断言提示含「存储失败」且不含「已放弃草稿」、草稿仍在 `localStorage`；验证：新增用例通过
- [x] 3.3 「空闲时另一标签页删除记录」：同一 context 开两个页面 → 页面 B 删除一条记录 → 断言页面 A 的历史列表在 1 秒内去掉该条，且 A 随后任意一次写盘不会把它写回来；验证：新增用例通过
- [x] 3.4 「隔夜后继续草稿的 2 小时上限」：造 `elapsedMs: 600000` 且 `lastResumedAt` 为 8 小时前的草稿 → 记录页「继续」→ 断言计时落在 10:00–12:00 之间而不是 ≥18:00；验证：新增用例通过
- [x] 3.5 「未来周不挤占容量图槽位」：造 12 个过去周各一条记录 + 1 条未来周的记录 → 断言容量图的槽位里没有未来周、窗口内的真实训练周按序显示；验证：新增用例通过
- [x] 3.6 「全部记录都不可用」：造两条缺 `moves` 的记录 → 记录页断言出现「有 2 条记录格式异常已跳过」、历史列表为空、无未捕获异常；验证：新增用例通过
- [x] 3.7 「草稿的 RIR 缺失或不是有效数字」：造 `rir: "abc"`（以及一份无 `rir`）的草稿 → 记录页「继续」→ 断言 RIR 档位选中的是「RIR 2」→ 完成训练 → 断言写入记录的 `rir` 是数字 2；验证：新增用例通过

## 4. 修同义反复的断言（tests/run.js）

- [x] 4.1 柱宽断言（`tests/run.js:1402-1408`）改为扫描 canvas 像素量出实际柱宽，断言 ≥3px；验证：临时改 `js/progress.js:267` 的宽度公式会让该断言失败，手工验证后改回
- [x] 4.2 预缓存清单断言（`tests/run.js:1602-1615`）改为在 Node 侧用 `fs.readdirSync` 枚举 `js/`、`fonts/`、`icons/` 与根目录的运行时文件再比对 `ASSETS`，并补一条「清单里每条路径都能取到 200」；验证：临时在 `js/` 下放一个未加进 `ASSETS` 的文件会让该断言失败，手工验证后删掉
- [x] 4.3 确认框纳入断言：runner 统计 dialog 次数，删除记录与放弃草稿两条路径各断言弹出 1 次确认框；验证：新增断言通过
- [x] 4.4 toast 断言前先清空 `#toast` 的文本内容，避免匹配到上一次的提示；验证：全量 `node tests/run.js` 通过
- [x] 4.5 种子日期改为相对今天（`tests/run.js:610-624` 的 2026-10-14~17），与 `tests/run.js:1435-1444` 已有写法一致；验证：全量测试通过

## 5. 开发服务器端口解析（scripts/serve.js）

- [x] 5.1 `scripts/serve.js:16` 的端口解析改为先取数字再判断是否为整数，端口 0 保留（交由系统分配随机端口），其余非法值回落到 8765；验证：`node scripts/serve.js 0` 能启动并打印实际端口

## 6. 文档同步

- [x] 6.1 `README.md:84-92` 的测试分组表补上 `progress`（未来日期不进统计、空态仍可导入备份）与 `devserver`（本地开发服务器）两组；`README.md:60` 的 `app.js` 职责描述订正为「tab 路由 + 跨标签页数据同步 + 训练次数注入」；验证：重新读取该文件确认
- [x] 6.2 `AGENTS.md` 的「测试」段分组列表补上 `progress` 与 `devserver` 两组；验证：重新读取该文件确认

## 7. 集成验证

- [x] 7.1 全量 `node tests/run.js` 0 失败，并用 `GYM4_TZ=Pacific/Kiritimati node tests/run.js` 复跑确认与星期几无关；验证：两轮均 0 失败
- [x] 7.2 `openspec validate --changes` 与 `openspec validate --specs` 均通过；验证：两条命令退出码 0
- [x] 7.3 确认工作区改动范围只包含本变更相关的文件（`git status`），不夹带无关修改；验证：`git status` 输出逐项核对

## Workflow follow-up

- 实现完成后走 `/openspec-sync-specs` 把三条 delta 合并进主 specs，再走 `/openspec-archive-change` 归档。
- 归档后在浏览器手动过一遍：导入一份备份确认新的确认文案；删除记录与放弃草稿各确认一次弹出了确认框。
