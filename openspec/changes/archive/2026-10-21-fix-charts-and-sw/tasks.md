# Tasks

## 1. 容量趋势图的周窗口（js/progress.js）

- [x] 1.1 `aggregateByWeek()`（`js/progress.js:28-41`）改为按截至本周的最近 12 个自然周取数：先算出窗口内各自然周的容量，没有训练的周填 0；窗口内完全没有训练时回退到最近 12 个有训练的周；返回结果带上实际周数；验证：`node tests/run.js chart` 通过
- [x] 1.2 图表说明文字（`js/progress.js:134`）改为显示实际使用的周数，与横轴柱数一致；验证：`node tests/run.js chart` 通过
- [x] 1.3 更新 `chart` 组里依赖「有数据的周」的断言（`tests/run.js:1383-1399` 的 `allWeeks` / `shownWeeks` / 总容量守恒）以匹配新口径，并保留「按周聚合后总容量守恒」这一条；验证：`node tests/run.js chart` 通过
- [x] 1.4 新增用例「停训空档在图上可见」：造「12 周里有 3 周无训练」的数据 → 断言容量图的柱数等于窗口周数、无训练的那几周取值为 0（通过导出的聚合结果断言，不依赖像素）；验证：该用例在 1.1 落地前失败、落地后通过
- [x] 1.5 新增用例「窗口内没有训练时图表不为空」：造「最近 12 周无训练、更早有训练」的数据 → 断言容量图仍有柱子且含更早那周的数据；验证：该用例在 1.1 落地前失败、落地后通过
- [x] 1.6 「🏆 主项最佳组」卡片的标题与内容对齐：卡片实际列出的是全部动作（`js/progress.js:145` 聚合所有 `moves`），标题改为「各动作最佳组」，副标题保持「每个动作历史最重的有效组」；验证：`node tests/run.js progress` 通过

## 2. 图表重绘与量程（js/progress.js）

- [x] 2.1 `paintBars()`（`js/progress.js:242-250`）的绘制高度改为取 `canvas.clientHeight`（回退 190），消除与 `style.css:779` 的 190px 不一致造成的纵向拉伸；验证：`node tests/run.js chart` 通过
- [x] 2.2 新增 `resize` 监听（防抖约 120ms），对仍连接在文档上的 canvas 按新尺寸重绘；验证：`node tests/run.js chart` 通过
- [x] 2.3 新增用例「视口尺寸变化后图表按新尺寸重绘」：记录 canvas 的 `clientWidth` 与 `width`（位图缓冲）→ 改变视口宽度 → 断言 `width` 随新的 `clientWidth` 变化而不是保持旧值；验证：该用例在 2.2 落地前失败、落地后通过
- [x] 2.4 疼痛趋势图不再让最后两个 x 轴标签重叠（`js/progress.js:304`）：末位标签与前一个标签间距不足时不重复绘制；验证：`node tests/run.js chart` 通过
- [x] 2.5 排序比较器改为按规范返回 0（`js/progress.js:38`、`:104`），疼痛值超出 0–10 量程时按量程截断（`js/progress.js:287`），使柱子不画出图表区域；验证：`node tests/run.js chart` 与 `progress` 组通过

## 3. 计划页口径（js/plan.js、app.js）

- [x] 3.1 `app.js:11` 注入的会话计数只计入训练日期不晚于今天的记录，与 `countableSessions()` 同一规则；验证：`node tests/run.js flow` 不回归
- [x] 3.2 `js/plan.js:55` 的「5 个训练日」改为从 `PLAN.days.length` 现算；验证：`node tests/run.js flow` 通过
- [x] 3.3 新增用例「计划页已练次数不计入未来日期的记录」：造一条未来日期的记录 → 打开计划页 → 断言该训练日的徽标不出现或次数为 0、且进度页的累计训练同样不计入；验证：该用例在 3.1 落地前失败、落地后通过

## 4. 预缓存容错（sw.js）

- [x] 4.1 `sw.js:29-35` 的 `caches.addAll(ASSETS)` 改为逐条 `c.add(u).catch(warn)`，单条失败不阻断安装与激活；验证：`node tests/run.js offline` 通过
- [x] 4.2 在 `offline` 组补一条断言「预缓存清单里每条路径都能取到 200」，让清单里的失效条目在测试阶段暴露（当前的清单比对是写死列表之间的比对，挡不住失效条目）；验证：`node tests/run.js offline` 通过

## 5. 集成验证

- [x] 5.1 全量 `node tests/run.js` 0 失败，并用 `GYM4_TZ=Pacific/Kiritimati node tests/run.js` 复跑确认与星期几无关；验证：两轮均 0 失败
- [x] 5.2 `openspec validate --changes` 与 `openspec validate --specs` 均通过；验证：两条命令退出码 0
- [x] 5.3 更新 `AGENTS.md` 的「关键约束」：补「容量图按自然周窗口取数（空周补 0，窗口内无数据时回退）」「canvas 尺寸随视口变化重绘」「预缓存逐条写入不阻断安装」三条；验证：重新读取该文件确认三条约束在位

## Workflow follow-up

- 实现完成后走 `/openspec-sync-specs` 把四条 delta 合并进主 specs（其中 `progress-charts` 与 `plan-overview` 是新建能力），再走 `/openspec-archive-change` 归档。
- 归档后在浏览器手动过一遍：停训两周后看容量图（应有 0 柱与空档）、横屏手机看图表是否变形、计划页徽标与进度页数字是否一致。
