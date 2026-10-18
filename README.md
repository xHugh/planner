# 铁馆计划 · 4 分化固定器械 PWA

**在线地址：<https://xhugh.github.io/planner/>**

一个纯前端、可离线使用的健身训练 App。无构建、无依赖，数据只存在本机浏览器。

手机打开上面的地址，Safari「分享 → 添加到主屏幕」或 Chrome「菜单 → 安装应用」即可离线使用。

## 快速开始

```bash
cd gym-pwa
python3 -m http.server 8765
```

浏览器打开 <http://127.0.0.1:8765/>。

> 必须用本地服务器打开。直接双击 `index.html`（`file://`）也能用，但 Service Worker 不生效，也就不能离线。

### 装到手机（PWA）

1. 手机和电脑连同一个 Wi-Fi，把服务改成对外可访问：`python3 -m http.server 8765 --bind 0.0.0.0`；
2. 手机浏览器打开 `http://<电脑局域网 IP>:8765/`；
3. iPhone Safari：分享 → **添加到主屏幕**；Android Chrome：菜单 → **安装应用 / 添加到主屏幕**。

装好后可全屏打开、离线运行（首次打开需联网缓存一次）。

> 注意：PWA 的 Service Worker 在 `http://` 下只有 `localhost` 被视为安全上下文。
> 用局域网 IP 打开时安装和离线缓存可能受限，正式使用建议用 HTTPS（任意静态托管都可以，例如 GitHub Pages）。

## 功能

| 页面 | 内容 |
|---|---|
| 计划 | 今天练什么、一周安排、5 个训练日、7 条减伤规则 |
| 记录 | 选日期和训练日开练；按组填重量/次数、勾选完成；RIR、疼痛 0-10、备注；未完成训练自动存草稿；历史记录可查看、删除 |
| 进度 | 本周/累计训练次数、累计容量（吨）、容量趋势图、各动作最佳组、疼痛趋势、JSON 导入导出备份 |
| 器械 | 15 张固定器械实拍图 + 对应训练日和技术要点 + 图片授权 |

## 数据

- 存储位置：浏览器 `localStorage`，键名 `gym4.db.v1`；
- 换手机 / 重装浏览器前，在「进度」页 **导出数据（JSON）**，在新设备上 **导入**；
- 清空浏览器数据会删除全部记录。

## 目录结构

```
gym-pwa/
├── index.html      页面骨架、底部导航
├── style.css       设计系统（令牌、深浅双主题、无障碍规格）
├── data.js         训练计划数据（唯一数据源，改计划只改这里）
├── app.js          全部逻辑：路由、记录、图表、存储、主题
├── sw.js           Service Worker，离线缓存
├── manifest.json   PWA 清单
├── fonts/          Barlow Condensed 拉丁子集（数字与计时用）
└── icons/          应用图标（app-icon.svg 为母版，其余由它渲染）
```

整个 App 无外部依赖、无构建步骤，唯一的第三方资源是字体（Barlow Condensed，SIL OFL 1.1，见 `fonts/README.txt`）。

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
