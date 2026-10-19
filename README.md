# 铁馆计划 · 4 分化固定器械 PWA

**在线地址：<https://xhugh.github.io/planner/>**

一个纯前端、可离线使用的健身训练 App。无构建、无依赖，数据只存在本机浏览器。

手机打开上面的地址，Safari「分享 → 添加到主屏幕」或 Chrome「菜单 → 安装应用」即可离线使用。

## 快速开始

```bash
cd gym-pwa
node scripts/serve.js
```

浏览器打开 <http://127.0.0.1:8765/>。

> 必须用本地服务器打开。直接双击 `index.html`（`file://`）**不能**用——`app.js` 是 ES Module，`file://` 下 import 会被浏览器拦截。

### 装到手机（PWA）

1. 手机和电脑连同一个 Wi-Fi，让服务对外可访问：`node scripts/serve.js --host`；
2. 手机浏览器打开脚本提示的局域网地址（形如 `http://192.168.x.x:8765/`）；
3. iPhone Safari：分享 → **添加到主屏幕**；Android Chrome：菜单 → **安装应用 / 添加到主屏幕**。

装好后可全屏打开、离线运行（首次打开需联网缓存一次）。

> 注意：PWA 的 Service Worker 在 `http://` 下只有 `localhost` 被视为安全上下文。
> 用局域网 IP 打开时安装和离线缓存可能受限，正式使用建议用 HTTPS（任意静态托管都可以，例如 GitHub Pages）。

> 也可以用任何静态服务器，例如 `npx serve` 或 `python3 -m http.server`；
> `scripts/serve.js` 只是省掉额外安装。

## 功能

| 页面 | 内容 |
|---|---|
| 计划 | 今天练什么、一周安排、5 个训练日、7 条减伤规则 |
| 记录 | 选日期和训练日开练；按组填重量/次数、勾选完成；RIR、疼痛 0-10、备注；未完成训练自动存草稿（可继续或放弃）；历史记录可查看、编辑、删除 |
| 进度 | 本周/累计训练次数、累计容量（吨）、容量趋势（按周）、各动作最佳组、疼痛趋势、JSON 导入导出备份 |

顶栏右上角可切换主题：**跟随系统 / 浅色 / 深色**，选择记在本机。

训练中底部常驻进度条（完成组数 + 计时），滚到最后一个动作也看得到；计时只统计**活跃时间**，切后台或锁屏不计入时长。

## 数据

- 存储位置：浏览器 `localStorage`，键名 `gym4.db.v1`；
- 换手机 / 重装浏览器前，在「进度」页 **导出数据（JSON）**，在新设备上 **导入**；
- 导入会先做结构校验，坏数据直接拒绝，不会把本地库写坏；
- 清空浏览器数据会删除全部记录。App 会向浏览器申请**持久化存储**；若未获授予，进度页会提醒定期导出备份。

## 目录结构

```
gym-pwa/
├── index.html      页面骨架、底部导航、训练底栏
├── style.css       设计系统（令牌、深浅双主题、无障碍规格）
├── data.js         训练计划数据（唯一数据源，改计划只改这里）
├── app.js          入口：只做 tab 路由
├── js/core.js      共享工具：模板、DOM、主题、存储、Sheet
├── js/plan.js      计划页
├── js/log.js       记录页与进行中的训练
├── js/progress.js  统计、Canvas 图表、导入导出
├── sw.js           Service Worker，离线缓存
├── manifest.json   PWA 清单
├── fonts/          Barlow Condensed 拉丁子集（数字与计时用）
├── icons/          应用图标（app-icon.svg 为母版，其余由它渲染）
├── scripts/        开发脚本：本地服务器、图标渲染
├── tests/          自动化测试（Playwright，仅开发用）
└── .github/        CI：每次 push 跑自动化测试
```

整个 App 无外部依赖、无构建步骤，唯一的第三方资源是字体（Barlow Condensed，SIL OFL 1.1，见 `fonts/README.txt`）。

## 测试

```bash
node tests/run.js          # 跑全部用例
node tests/run.js flow     # 只跑名字含 "flow" 的用例
```

脚本自带静态服务器，不用先起服务。覆盖：

| 组 | 内容 |
|---|---|
| `flow` | 训练完整流程（选日期 → 填组次 → 勾选 → 完成 → 落盘） |
| `draft` | 草稿不会被「开始今天」覆盖、放弃草稿、空草稿自动清理 |
| `data` | 旧版草稿迁移、导入结构校验、残缺记录不影响页面 |
| `workout` | 底栏常驻进度、后台不计时长、已完成记录再编辑 |
| `a11y` | 触摸 ≥44px、对比度 ≥4.5:1（深浅主题 × 计划页/进度页）、`aria-current`/`aria-live` |
| `chart` | 一年数据下图表仍可读（≤12 个数据点、柱宽 ≥3px） |
| `offline` | 预缓存清单完整性、断网后仍能打开 |

需要本机已有 `playwright` + chromium（仅开发用），与 `scripts/render-icons.js` 同一约定；仓库本身不依赖 npm。

GitHub Actions 会在每次 push 到 `main` 和每次 PR 上自动跑同一套用例（workflow 里临时装 playwright，仓库不产生 `package.json`）。

## 修改训练计划

只改 `data.js` 里的 `PLAN.days`：

```js
{ name: "坐姿推胸机", sets: 4, lo: 8, hi: 10, tip: "技术要点" }
```

- `lo` / `hi` 是次数区间；两者相同则只显示一个数字；
- `cardio: true` 表示按分钟计的有氧动作；
- 改完刷新页面即可。已保存的历史记录不受影响（按动作名匹配）。

## 图标

`icons/app-icon.svg` 是母版。改完用它重新渲染各尺寸 PNG：

```bash
# 尺寸、圆角、maskable 安全区都在脚本里定义
node scripts/render-icons.js
```

`icon-512-maskable.png` 供 Android 自适应图标使用，内容缩到中心 74% 以内，保证圆形 / squircle 裁切不丢内容。
