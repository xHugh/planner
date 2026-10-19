# AGENTS.md

## 运行

```bash
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

- 纯前端 PWA：原生 JS + ES Modules + 单个 `style.css`，**无构建、无依赖、无 `package.json`、无测试/lint/typecheck**。不要引入打包器或 npm 依赖。
- 必须通过 HTTP 访问：`app.js` 是 module，`file://` 下 import 会被浏览器拦截；Service Worker 也只在 secure context（`localhost` 或 HTTPS）生效。README 里“可直接双击 `index.html`”的说法已过时。
- 没有自动化验证，改完在浏览器手动走一遍：三个 tab、开始/续练/完成训练、刷新后数据仍在、JSON 导入导出、三态主题、断网加载。

## 结构

- `app.js`：入口，只负责 tab 路由；页面渲染在 `js/*.js`。
- `js/core.js`：共享工具与全局单例——`tpl`/`html`、DOM 辅助、`db`（`localStorage` 单例）、`saveDB`、主题、Sheet。
- `js/plan.js`：计划页及计划/休息日 sheet；`js/log.js`：记录页与进行中的训练；`js/progress.js`：统计、Canvas 图表、导入导出。
- `data.js`：训练计划唯一数据源，改计划只改这里（`PLAN.days`、`PLAN.week`）。
- `index.html`：骨架、底部导航、sheet/workout dock/toast 容器；`style.css`：设计令牌、双主题（`<html data-theme="light|dark">`）、无障碍样式。

## 关键约束

- **Service Worker 缓存**：`sw.js` 是 cache-first。改动任何被缓存的静态资源后，必须递增 `CACHE` 版本号（当前 `gym4-v13`），否则用户一直看到旧版；新增静态文件必须同步加入 `ASSETS`，否则离线时缺失。调试旧缓存可清站点数据或改版本号。
- **HTML 转义**：`tpl` 自动转义；`html` 不转义。`html` 只用于 `data.js` 等可信常量；动态数据（备注、动作名、导入内容）必须经 `esc()`。现有代码大量是 `html` + 显式 `esc`，照此处理。
- **主题防闪烁**：`index.html` `<head>` 的内联脚本在首屏前读取 `localStorage` 设置 `data-theme`；改主题逻辑时必须同时改它和 `js/core.js` 的 `applyTheme`。
- **计划数据与历史耦合**：训练日 `id`（`w1`–`w4`、`r1`）同时关联 CSS 变量 `--d-<id>` 和已存记录；动作历史按 `name` 匹配。重命名 id/动作名会让旧历史、草稿、最佳组对不上。
- **模块依赖环**：`log.js` 静态 import `plan.js`；反过来 `plan.js` 只能 `await import("./log.js")`，训练计数经 `app.js` 的 `setSessionCounter` 注入，避免循环依赖。
- **双主题颜色**：颜色分别定义在 `:root` 和 `:root[data-theme="dark"]`；新增训练日或颜色两边都要加，`--card-top` 在深色主题必须覆盖，否则白字压白底。
- **本地数据**：键名 `gym4.db.v1`（`sessions`/`drafts`）和 `gym4.theme`；无后端。改数据结构要考虑旧数据迁移（`log.js` 里有旧版草稿兼容代码）。
- `README.md` 仍有过时内容（已删除的「器械」页、`app.js` 包含全部逻辑等），以代码和本文件为准。

## 图标

`icons/app-icon.svg` 是母版，改动后用 Playwright Chromium 重新渲染：

```bash
node scripts/render-icons.js
```

仓库没有依赖清单，需本机已有 `playwright` + chromium（仅开发用，不影响 App 运行）。脚本通过字符串替换 SVG 里的 `rx="114"` 控制圆角，改母版时不要破坏该属性。

## 提交

Conventional Commits：`type(scope): subject`；历史 subject 使用中文。除用户明确要求外，不要 commit 或 push。线上由 GitHub Pages 托管（<https://xhugh.github.io/planner/>，仓库 `xHugh/planner`），无 CI，`.nojekyll` 已存在。
