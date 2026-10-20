# Tasks

## 1. 统计数值改用达标的实色（style.css）

- [x] 1.1 `style.css:765-776` 的 `.stat b` 改为实色文字（`color: var(--brand-1)`），去掉 `background` 渐变与 `background-clip: text`；确认深浅两个主题下对卡片背景的对比度都不低于 3:1；验证：用探针读 `getComputedStyle` 的 `--brand-1` 与卡片背景算对比度，浅色 ≥3:1、深色 ≥3:1
- [x] 1.2 把 `.stat b` 加进 `tests/run.js:1334` 的对比度扫描选择器列表（实色后扫描才有意义）；验证：`node tests/run.js a11y` 通过
- [x] 1.3 在 `a11y` 组新增断言「进度页统计数值对比度达标」，覆盖浅色与深色两个主题；验证：该断言在 1.1 落地前失败（浅色端 2.43:1）、落地后通过

## 2. 弹层焦点不逸出（js/core.js）

- [x] 2.1 `js/core.js:316-325` 的键盘处理：弹层打开且焦点不在弹层内时，Tab 被拦截并把焦点移到弹层内的第一个可聚焦元素；焦点已在弹层内时维持现有首尾循环；验证：`node tests/run.js a11y` 不回归
- [x] 2.2 新增用例「焦点在弹层外时按 Tab 焦点进入弹层」与「Esc 关闭后焦点回到触发元素」；验证：这两条在 2.1 落地前失败、落地后通过

## 3. 浏览器栏颜色跟随主题（index.html）

- [x] 3.1 `index.html` 的首屏内联主题脚本在设置 `data-theme` 的同时设置 `<meta name="theme-color">`，取值与 `js/core.js:139` 一致（深色 `#080d16`、浅色 `#eef2f8`）；验证：新增断言「首屏后 `meta[name=theme-color]` 的内容与当前主题一致」
- [x] 3.2 在 `js/core.js` 的 `applyTheme()` 旁留注释指明内联脚本必须同步该取值；验证：重新读取该文件确认注释在位

## 4. 集成验证

- [x] 4.1 全量 `node tests/run.js` 0 失败，并用 `GYM4_TZ=Pacific/Kiritimati node tests/run.js` 复跑确认与星期几无关；验证：两轮均 0 失败
- [x] 4.2 `openspec validate --changes` 与 `openspec validate --specs` 均通过；验证：两条命令退出码 0
- [x] 4.3 更新 `AGENTS.md` 的「关键约束」：补「统计数值用实色 `--brand-1`；渐变文字的 `color` 是 transparent，对比度扫描读不到，禁止给关键数值用渐变裁剪」一条；验证：重新读取该文件确认该约束在位

## Workflow follow-up

- 实现完成后走 `/openspec-sync-specs` 把新建的 `visual-contrast` 能力合并进主 specs，再走 `/openspec-archive-change` 归档。
- 归档后在浏览器手动过一遍：浅色主题看进度页三个数字（不再是渐变）、横屏与竖屏各看一次、打开详情弹层后用键盘 Tab 走一圈确认焦点不会跑到背景页面。
