/* 测试运行器
   用法：
     node tests/run.js              跑全部用例
     node tests/run.js flow         只跑名字含 "flow" 的用例
     node tests/run.js --url=http://127.0.0.1:8780   指定已启动的服务

   自带静态服务器，无需手动起服务。
   需要本机已有 playwright + chromium（仅开发用，不影响 App 运行），
   与 scripts/render-icons.js 同样的约定：仓库不引入 npm 依赖。 */
const path = require("path");
const { createServer } = require("http");
const { readFile, stat } = require("fs").promises;
const { execSync } = require("child_process");

// 依次尝试常见位置找到 playwright，避免要求在本仓库 npm i
function loadPlaywright() {
  const candidates = ["playwright", "playwright-core"];
  const roots = [
    process.cwd(),
    path.join(__dirname, ".."),
    "/tmp/pwtest",
    path.join(process.env.HOME || "", ".npm-global/lib/node_modules"),
    "/usr/local/lib/node_modules",
    "/opt/homebrew/lib/node_modules",
  ];
  for (const root of roots) {
    for (const name of candidates) {
      try {
        return require(require.resolve(name, { paths: [root] }));
      } catch {}
    }
  }
  // 最后尝试全局 npm root
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    for (const name of candidates) {
      try { return require(require.resolve(name, { paths: [globalRoot] })); } catch {}
    }
  } catch {}
  console.error(
    "\n  未找到 playwright。\n" +
    "  请先安装（仅开发用，App 本身零依赖）：\n" +
    "    mkdir -p /tmp/pwtest && cd /tmp/pwtest && npm i playwright@1\n" +
    "    PLAYWRIGHT_BROWSERS_PATH=/tmp/pwbrowsers npx playwright install chromium\n" +
    "  或在本仓库 npm i -D playwright 并执行 npx playwright install chromium\n"
  );
  process.exit(2);
}

const { chromium } = loadPlaywright();
const ROOT = path.join(__dirname, "..");
const PORT = 8781 + (process.pid % 300);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// ---------- 迷你断言 ----------
class Assert {
  constructor() { this.passed = 0; this.failed = []; this.current = ""; }
  group(name) { this.current = name; console.log(`\n  ${name}`); }
  ok(cond, msg) {
    if (cond) { this.passed++; console.log(`    ✓ ${msg}`); }
    else { this.failed.push(`${this.current} → ${msg}`); console.log(`    ✗ ${msg}`); }
    return !!cond;
  }
  eq(actual, expected, msg) {
    return this.ok(actual === expected, `${msg}${actual === expected ? "" : ` (得到 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)})`}`);
  }
}

// ---------- 工具 ----------
async function serve(root) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      const file = path.join(root, p);
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      await stat(file);
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("404");
    }
  });
  await new Promise(r => server.listen(PORT, "127.0.0.1", r));
  return server;
}

// 注入一条历史记录，用来检查有数据时的布局
const SEED = `
  const mk=(d,day,name,w,r,pain)=>({id:d,dayId:day,date:d,startedAt:Date.now()-3600000,durationMin:52,
    maxPain:pain||0,rir:2,note:"",
    moves:[{name,sets:[{weight:String(w),reps:String(r),done:true},{weight:String(w),reps:String(r-1),done:true}]}]});
  localStorage.setItem("gym4.db.v1", JSON.stringify({sessions:[
    mk("2026-10-12","w4","腿举机",180,10,0),
    mk("2026-10-13","w2","高位下拉",70,9,4),
    mk("2026-10-16","w1","坐姿推胸机",90,8,0),
    mk("2026-10-17","w3","坐姿肩推机",45,10,0)],drafts:{}}));
`;

// ---------- 用例 ----------
const SUITES = [
  {
    name: "flow · 训练完整流程",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      t.eq(await page.locator(".hero h2").innerText(), "W1 胸+三头", "计划页渲染今日训练");
      t.eq(await page.locator(".daychip").count(), 7, "一周安排 7 格");
      t.eq(await page.locator(".week .daychip.rest").count(), 2, "两个休息日");

      // 休息日可点开
      await page.locator(".daychip").nth(2).click();
      await page.waitForTimeout(350);
      t.ok((await page.locator("#sheetBody").innerText()).includes("休息日"), "休息日弹层可打开");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      t.ok(!(await page.locator(".sheet-mask").isVisible()), "Esc 关闭弹层");

      // 计划弹层 → 开始训练
      await page.locator(".daychip").nth(0).click();
      await page.waitForTimeout(350);
      t.eq(await page.locator(".sheet-head-title").innerText(), "W1 胸+三头", "计划弹层标题");
      t.ok(await page.locator("#sheetFooter button.btn").isVisible(), "计划弹层底部有主操作");
      await page.click("#sheetFooter button.btn");
      await page.waitForTimeout(500);

      t.eq(await page.locator(".wo-summary").count(), 1, "训练页有汇总卡");
      t.eq(await page.locator(".wo-move").count(), 7, "7 个动作卡");

      // 填数据
      await page.locator("#view input[type=number]").nth(0).fill("88");
      await page.locator("#view input[type=number]").nth(1).fill("9");
      await page.locator("#view .check").nth(0).click();
      await page.waitForTimeout(300);
      t.ok((await page.locator("#woSub").innerText()).includes("1/"), "勾选后完成数更新");
      t.ok((await page.locator(".ring .lbl").innerText()).length > 0, "进度环显示百分比");

      // 训练级字段
      await page.locator(".wo-summary .chips").nth(0).locator(".pick").nth(2).click();
      await page.locator(".wo-summary .chips").nth(1).locator(".pick").nth(1).click();
      await page.locator("#view input[type=text]").first().fill("状态不错");
      await page.waitForTimeout(200);

      // 沉浸模式
      t.ok(await page.evaluate(() => document.body.classList.contains("in-workout")), "进入沉浸模式");
      t.eq(await page.evaluate(() => getComputedStyle(document.querySelector(".navbar")).display), "none", "沉浸模式隐藏全局底栏");

      // 完成训练
      await page.click("#woFinishBtn");
      await page.waitForTimeout(600);
      const s = await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions[0]);
      t.eq(s && s.dayId, "w1", "训练记录已保存");
      t.eq(s && s.rir, 2, "训练级 RIR 已保存");
      t.eq(s && s.maxPain, 2, "训练级疼痛已保存");
      t.eq(s && s.note, "状态不错", "训练级备注已保存");
      t.ok(s && s.moves.every(m => m.rir === undefined), "动作上不再重复存 rir/pain");
      t.ok(!(await page.evaluate(() => document.body.classList.contains("in-workout"))), "完成后退出沉浸模式");
      t.eq(await page.evaluate(() => getComputedStyle(document.querySelector(".navbar")).display), "grid", "底栏恢复");
    },
  },

  {
    name: "data · 旧数据兼容",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      // 旧版草稿：逐动作 rir/pain/note，无训练级字段
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [],
          drafts: { "w2@2026-10-19": {
            key: "w2@2026-10-19", dayId: "w2", date: "2026-10-19", startedAt: Date.now() - 6e5,
            moves: [{ index: 0, name: "高位下拉", sets: [{ weight: "70", reps: "9", done: true }], rir: 3, pain: 1, note: "旧版备注" }],
          } },
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      // 走「继续」入口（旧草稿已勾选，只能从这里续）
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(400);
      const draftRow = page.locator("#view .row-tap").first();
      t.eq(await draftRow.count(), 1, "旧草稿出现在未完成列表");
      t.ok((await draftRow.innerText()).includes("W2 背+二头"), "草稿行显示训练日名");
      t.ok((await draftRow.innerText()).includes("继续"), "草稿行有「继续」标识");
      await draftRow.click();
      await page.waitForTimeout(600);

      t.eq(await page.locator(".wo-summary").count(), 1, "旧草稿可打开");
      t.eq(await page.locator(".wo-summary .chips").nth(0).locator(".pick.on").innerText(), "RIR 3", "RIR 已迁移并回显");
      t.eq(await page.locator("#view input[type=text]").first().inputValue(), "旧版备注", "备注已迁移");

      const d = await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).drafts["w2@2026-10-19"]);
      t.eq(d.pain, 1, "疼痛已迁移（奇数）");
      t.ok(d.pain === 1 || d.pain === 2, "疼痛值已落盘");

      await page.click("#woFinishBtn");
      await page.waitForTimeout(600);
      const s = await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions[0]);
      t.eq(s && s.maxPain, 1, "旧草稿完成时疼痛兜底正确");
      t.eq(s && s.rir, 3, "旧草稿完成时 RIR 兜底正确");
    },
  },

  {
    name: "a11y · 无障碍",
    async run(page, t, base) {
      for (const scheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(base, { waitUntil: "networkidle" });
        await page.evaluate(SEED);
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(500);

        // 触摸目标 ≥44px
        const small = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('.check, .nav-btn, .daychip, .pick, .btn, .row-tap').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && (r.width < 44 || r.height < 44)) {
              out.push(`${el.className.split(" ")[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
            }
          });
          return out;
        });
        t.ok(small.length === 0, `[${scheme}] 触摸目标均 ≥44px${small.length ? ": " + small.join(", ") : ""}`);

        // 文字对比度 ≥4.5:1
        const lowContrast = await page.evaluate(() => {
          const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          const lum = a => 0.2126 * srgb(a[0]) + 0.7152 * srgb(a[1]) + 0.0722 * srgb(a[2]);
          const parse = v => (String(v).match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
          const bgOf = el => {
            let n = el;
            while (n) {
              const c = getComputedStyle(n).backgroundColor;
              if (c && !c.includes("rgba(0, 0, 0, 0)") && !c.includes("transparent")) return parse(c);
              n = n.parentElement;
            }
            return [255, 255, 255];
          };
          const out = [];
          document.querySelectorAll(".move-tip, .card-sub, .row-sub, .stat span, .section-h, .move-meta, .set-head, .prev, .field-label, .card-title, .row-title").forEach(el => {
            if (!el.textContent.trim()) return;
            const st = getComputedStyle(el);
            const size = parseFloat(st.fontSize), weight = +st.fontWeight || 400;
            const [hi, lo] = [lum(parse(st.color)), lum(bgOf(el))].sort((a, b) => b - a);
            const r = (hi + 0.05) / (lo + 0.05);
            const need = (size >= 18.66 || (size >= 14 && weight >= 700)) ? 3 : 4.5;
            if (r < need) out.push(`${el.className.split(" ")[0]} ${r.toFixed(2)}<${need}`);
          });
          return out;
        });
        t.ok(lowContrast.length === 0, `[${scheme}] 文字对比度达标${lowContrast.length ? ": " + lowContrast.join(", ") : ""}`);

        // 主题切换可用
        await page.click("#themeBtn");
        await page.waitForTimeout(350);
        const mode = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
        t.ok(["light", "dark"].includes(mode), `[${scheme}] 主题按钮可切换 (→${mode})`);

        // 无全局污染
        t.eq(await page.evaluate(() => typeof window.PLAN), "undefined", `[${scheme}] 无 window 全局泄漏`);
      }
    },
  },

  {
    name: "offline · 离线可用",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.waitForFunction(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return r && r.active && r.active.state === "activated";
      }, null, { timeout: 30000 });
      await page.waitForTimeout(2500);

      const cached = await page.evaluate(async () => {
        const k = await caches.keys();
        const c = await caches.open(k[0]);
        return (await c.keys()).map(r => new URL(r.url).pathname);
      });
      t.ok(cached.length >= 17, `预缓存 ${cached.length} 项`);
      for (const need of ["/js/core.js", "/js/plan.js", "/js/log.js", "/js/progress.js", "/app.js", "/data.js"]) {
        t.ok(cached.some(p => p.endsWith(need)), `缓存含 ${need}`);
      }
      t.ok(!cached.some(p => p.includes("/img/")), "已移除的图片不在缓存中");

      await page.context().setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(900);
      t.eq(await page.locator(".hero h2").innerText().catch(() => "FAIL"), "W1 胸+三头", "断网后仍能打开");
      t.eq(await page.locator(".daychip").count(), 7, "断网后周安排正常");
      await page.context().setOffline(false);
    },
  },
];

// ---------- 主流程 ----------
(async () => {
  const args = process.argv.slice(2);
  const filter = args.find(a => !a.startsWith("--")) || "";
  const urlArg = args.find(a => a.startsWith("--url="));
  const base = urlArg ? urlArg.slice(6) : `http://127.0.0.1:${PORT}/`;

  let server = null;
  if (!urlArg) {
    server = await serve(ROOT);
    console.log(`静态服务已启动：${base}`);
  }

  const browser = await chromium.launch();
  const t = new Assert();
  let errored = false;

  for (const suite of SUITES) {
    if (filter && !suite.name.includes(filter)) continue;
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    const page = await ctx.newPage();
    const jsErrors = [], badResponses = [];
    page.on("pageerror", e => jsErrors.push(e.message));
    page.on("console", m => { if (m.type() === "error") jsErrors.push(m.text()); });
    page.on("response", r => { if (r.status() >= 400) badResponses.push(r.status() + " " + r.url().split("/").pop()); });
    // 训练完成与删除记录会弹 confirm，默认接受
    page.on("dialog", d => d.accept());

    t.group(suite.name);
    try {
      await suite.run(page, t, base);
    } catch (e) {
      errored = true;
      t.ok(false, `用例执行异常：${e.message.split("\n")[0]}`);
    }
    t.ok(jsErrors.length === 0, `无 JS 报错${jsErrors.length ? ": " + jsErrors.slice(0, 2).join(" | ") : ""}`);
    t.ok(badResponses.length === 0, `无 4xx/5xx${badResponses.length ? ": " + badResponses.slice(0, 3).join(", ") : ""}`);

    await ctx.close();
  }

  await browser.close();
  if (server) server.close();

  console.log(`\n${"─".repeat(46)}`);
  console.log(`  通过 ${t.passed} 项，失败 ${t.failed.length} 项`);
  if (t.failed.length) {
    console.log("\n  失败明细：");
    t.failed.forEach(f => console.log(`    ✗ ${f}`));
  }
  console.log(`${"─".repeat(46)}\n`);
  process.exit(t.failed.length || errored ? 1 : 0);
})();
