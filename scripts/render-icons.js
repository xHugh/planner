/* 由 icons/app-icon.svg 渲染各尺寸 PNG。
   用法：node scripts/render-icons.js
   需要 playwright 与 chromium（仅开发时用，不影响 App 运行）。*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ICONS = path.join(ROOT, "icons");
const SRC = path.join(ICONS, "app-icon.svg");

// 普通图标：圆角随尺寸缩放，视觉上接近 iOS/Android 的 squircle
const PLAIN = [
  { size: 192, out: "icon-192.png" },
  { size: 512, out: "icon-512.png" },
  { size: 180, out: "apple-touch-icon.png", ratio: 0 }, // iOS 会自己切圆角
];

(async () => {
  const svg = fs.readFileSync(SRC, "utf8");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });

  for (const { size, out, ratio } of PLAIN) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: size, height: size });
    const r = ratio != null ? ratio : Math.round(size * 0.22);
    await page.setContent(
      `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">` +
        svg.replace(/rx="114"/g, `rx="${r}"`) +
        `</div></body>`
    );
    await page.screenshot({ path: path.join(ICONS, out), omitBackground: true });
    await page.close();
    console.log("✓", out, `${size}px`);
  }

  // maskable：全幅出血，内容整体缩到 ~74% 并居中，留足系统安全区
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 512, height: 512 });
  const maskable = svg
    .replace(/rx="114"/g, 'rx="0"')
    .replace('<rect x="104"', '<g transform="translate(66.6 66.6) scale(0.7392)"><rect x="104"')
    .replace("</svg>", "</g></svg>");
  await page.setContent(`<body style="margin:0">${maskable}</body>`);
  await page.screenshot({ path: path.join(ICONS, "icon-512-maskable.png") });
  await page.close();
  console.log("✓ icon-512-maskable.png 512px (安全区 74%)");

  await browser.close();
})();
