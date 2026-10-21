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
const { existsSync } = require("fs");
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

// 仓库的安装提示把浏览器装在 /tmp/pwbrowsers；没设环境变量时自动用上，免得装完又找不到
// 必须在 require("playwright") 之前设置，它启动时就读这个变量
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync("/tmp/pwbrowsers")) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = "/tmp/pwbrowsers";
}
const { chromium } = loadPlaywright();
const ROOT = path.join(__dirname, "..");
// 测试用的时区：换 GYM4_TZ 可以在别的星期几跑同一套用例
const TZ = process.env.GYM4_TZ || "Asia/Shanghai";
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
async function serve(root, port) {
  const server = createServer(async (req, res) => {
    let p;
    try {
      p = decodeURIComponent(req.url.split("?")[0]);
    } catch {
      // 非法 percent-encoding：与 scripts/serve.js 行为对齐，返回 400 而不是落到 404
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("400 Bad Request");
      return;
    }
    try {
      if (p === "/") p = "/index.html";
      const file = path.join(root, p);
      // 防路径穿越：按目录边界判定，不能用裸 startsWith——
      // 同前缀的兄弟目录（如 gym-pwa-backup/）会被裸前缀匹配放行
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      await stat(file);
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("404");
    }
  });
  await new Promise(r => server.listen(port || PORT, "127.0.0.1", r));
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

// 一年份的历史（260 条），用来检查图表在数据量变大后还能不能看
const SEED_BIG = `
  const names = ["坐姿推胸机","高位下拉","腿举机","绳索下压"];
  const sessions = [];
  for (let i = 0; i < 260; i++) {
    const d = new Date(2025, 9, 1 + i * 1.38), z = n => String(n).padStart(2, "0");
    sessions.push({id:"s"+i, dayId:"w1",
      date: d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate()),
      startedAt: Date.now(), durationMin:52, maxPain:0, rir:2, note:"",
      moves: names.map(nm => ({name:nm, sets:[{weight:"80",reps:"9",done:true}]}))});
  }
  localStorage.setItem("gym4.db.v1", JSON.stringify({sessions, drafts:{}}));
`;

// ---------- 与星期几无关的辅助 ----------
// 用例不该假设「今天是周一」：计划页的今日训练、首页有没有「开始今天」，
// 都随星期几变化，所以从 PLAN.week 现算。
async function todayPlan(page) {
  return page.evaluate(async () => {
    const { PLAN } = await import("./data.js");
    const d = new Date();
    const id = PLAN.week[(d.getDay() + 6) % 7];
    const day = PLAN.days.find(x => x.id === id);
    return {
      id: id || "w1",
      name: day ? day.name : "休息日",
      isRest: !id,
      move: day ? day.moves[0].name : "",
    };
  });
}

// 用周安排里的计划弹层打开指定训练日（不受今天星期几影响）
async function openDay(page, dayId) {
  await page.locator(`.daychip[data-day="${dayId}"]`).click();
  await page.waitForTimeout(350);
  await page.click("#sheetFooter button.btn");
  await page.waitForTimeout(600);
}

// toast 元素的 textContent 不会自动清空（只切 hidden 类），
// 同一页里上一次提示还在可见期内时会被下一次断言误匹配 —— 断言前先清空。
const clearToast = page => page.evaluate(() => {
  const el = document.getElementById("toast");
  if (el) el.textContent = "";
});

// 打开「今天」的训练：优先点首页的「开始今天」；今天休息时没有这个按钮，改走计划弹层
async function openToday(page, dayId) {
  const hero = page.locator(".hero .btn.primary");
  if (await hero.count() > 0) {
    await hero.click();
    await page.waitForTimeout(600);
  } else {
    await openDay(page, dayId);
  }
}

// 计时显示 "mm:ss" → 秒。用 split 解析，不能用 slice(0,2)：分钟 ≥100 时会算出 NaN
function toSec(s) {
  const [m, sec] = String(s).split(":").map(Number);
  return m * 60 + sec;
}

// ---------- 页面内跑的对比度扫描 ----------
// 半透明背景要逐层合成，否则算出来的对比度是假的
function contrastScan(selector) {
  const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = a => 0.2126 * srgb(a[0]) + 0.7152 * srgb(a[1]) + 0.0722 * srgb(a[2]);
  const parse = v => {
    const n = (String(v).match(/[-\d.]+/g) || []).map(Number);
    return { rgb: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 };
  };
  const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));
  const bgOf = el => {
    const stack = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.a > 0) stack.push(c);
      n = n.parentElement;
    }
    let bg = [255, 255, 255];
    for (let i = stack.length - 1; i >= 0; i--) bg = over(stack[i], bg);
    return bg;
  };
  const out = [];
  document.querySelectorAll(selector).forEach(el => {
    if (!el.textContent.trim()) return;
    const st = getComputedStyle(el);
    const size = parseFloat(st.fontSize), weight = +st.fontWeight || 400;
    const fg = parse(st.color);
    // 渐变裁剪文字的 color 是 transparent，会被当成黑字算出假的高对比度——直接判失败
    if (fg.a === 0) { out.push(`${el.className.split(" ")[0]} transparent`); return; }
    const [hi, lo] = [lum(fg.rgb), lum(bgOf(el))].sort((a, b) => b - a);
    const r = (hi + 0.05) / (lo + 0.05);
    const need = (size >= 18.66 || (size >= 14 && weight >= 700)) ? 3 : 4.5;
    if (r < need) out.push(`${el.className.split(" ")[0]} ${r.toFixed(2)}<${need}`);
  });
  return out;
}

// ---------- 用例 ----------
const SUITES = [
  {
    name: "flow · 红旗警示渲染",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const flagItems = await page.locator(".card-warn .rules-list li");
      const { PLAN } = await page.evaluate(async () => {
        const m = await import("./data.js");
        return { PLAN: m.PLAN };
      });
      t.eq(await flagItems.count(), PLAN.redFlags.length, "红旗警示条目全部渲染");
      t.ok((await page.locator(".card-warn .card-title").innerText()).includes("红旗警示"), "警示卡标题存在");
      const first = await flagItems.first().innerText();
      t.ok(PLAN.redFlags.includes(first), "警示条目内容与数据源一致（文本转义无损）");
    },
  },

  {
    name: "flow · 训练完整流程",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const plan = await todayPlan(page);
      t.eq(await page.locator(".hero h2").innerText(), plan.name, "计划页渲染今日训练");
      t.eq(await page.locator(".daychip").count(), 7, "一周安排 7 格");
      t.eq(await page.locator(".week .daychip.rest").count(), 2, "两个休息日");

      // 休息日可点开
      await page.locator(".week .daychip.rest").first().click();
      await page.waitForTimeout(350);
      t.ok((await page.locator("#sheetBody").innerText()).includes("休息日"), "休息日弹层可打开");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      t.ok(!(await page.locator(".sheet-mask").isVisible()), "Esc 关闭弹层");

      // 计划弹层 → 开始训练
      await page.locator('.daychip[data-day="w1"]').click();
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
      // 完成后应该落到记录页，底栏高亮与 aria-current 跟着走
      t.eq(await page.getAttribute(".nav-btn.active", "data-tab"), "log", "完成后导航高亮到记录页");
      t.eq(await page.getAttribute('.nav-btn[data-tab="log"]', "aria-current"), "page", "记录页有 aria-current");
      t.ok((await page.locator("#view").innerText()).includes("训练历史"), "完成后显示记录页内容");
    },
  },

  {
    name: "draft · 草稿不会被覆盖",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const today = await page.evaluate(() => {
        const d = new Date(), z = n => String(n).padStart(2, "0");
        return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
      });
      const plan = await todayPlan(page);
      // 造一份「已勾选 1 组 + 有备注」的当天草稿（用今天该练的那个训练日）
      await page.evaluate(({ d, id, move }) => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [], drafts: {
          [id + "@" + d]: {
            key: id + "@" + d, dayId: id, date: d, startedAt: Date.now() - 6e5, touched: true,
            moves: [{ index: 0, name: move, sets: [{ weight: "80", reps: "9", done: true }] }],
            rir: 2, pain: 0, note: "我的草稿备注",
          },
        }}));
      }, { d: today, id: plan.id, move: plan.move });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      // 开始今天的训练——以前这里会把草稿冲掉
      await openToday(page, plan.id);
      await page.waitForTimeout(700);
      const dr = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("gym4.db.v1")).drafts)[0]);
      t.ok(dr, "草稿还在");
      t.eq(dr && dr.moves[0].sets[0].done, true, "已勾选的组没有被清空");
      t.eq(dr && dr.moves[0].sets[0].weight, "80", "已填的重量没有被清空");
      t.eq(dr && dr.note, "我的草稿备注", "备注没有被清空");

      // 记录页里能看到并能放弃
      await page.click("#woExitBtn");
      await page.waitForTimeout(600);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      t.eq(await page.locator(".row-drop").count(), 1, "草稿行有「放弃」按钮");
      let dropDialogs = 0;
      page.on("dialog", () => { dropDialogs++; });
      await clearToast(page);
      await page.click(".row-drop");
      await page.waitForTimeout(600);
      t.eq(dropDialogs, 1, "放弃草稿前弹出了确认框");
      t.ok((await page.locator("#toast").innerText()).includes("已放弃草稿"), "提示已放弃草稿");
      const left = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("gym4.db.v1")).drafts).length);
      t.eq(left, 0, "放弃后草稿被删除");

      // 开了训练什么都没动就退出 → 不留僵尸草稿
      await page.click('.nav-btn[data-tab="plan"]');
      await page.waitForTimeout(400);
      await openToday(page, plan.id);
      await clearToast(page);
      await page.click("#woExitBtn");
      await page.waitForTimeout(300);
      t.ok((await page.locator("#toast").innerText()).includes("没有记录"), "空草稿退出时如实提示");
      await page.waitForTimeout(300);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      t.eq(await page.locator(".row-drop").count(), 0, "空草稿不留在「未完成的训练」里");
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
      t.eq(d.pain, 2, "旧疼痛值 1 就近吸附到偶数档 2");

      await page.click("#woFinishBtn");
      await page.waitForTimeout(600);
      const s = await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions[0]);
      t.eq(s && s.maxPain, 2, "旧草稿完成时疼痛兜底正确（吸附后的值）");
      t.eq(s && s.rir, 3, "旧草稿完成时 RIR 兜底正确");
    },
  },

  {
    // RIR 类型不归一会让 chips()（=== 比较）所有档位落空，finishWorkout 又把字符串
    // 原样写回记录——产出的备份连 validateDB 都拒绝（rir 必须是数字），变成一次性废纸。
    name: "data · 字符串 RIR 归一为数字",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        const z = n => String(n).padStart(2, "0");
        const d = new Date(), date = d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
        // 旧版草稿：逐动作 rir 是字符串，无训练级字段
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [],
          drafts: {
            ["w1@" + date]: {
              key: "w1@" + date, dayId: "w1", date, startedAt: Date.now() - 6e5, touched: true,
              moves: [{ index: 0, name: "坐姿推胸机", rir: "2", pain: 0,
                sets: [{ weight: "80", reps: "9", done: true }] }],
            },
          },
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(700);

      // 归一前这里会是 0 档选中：字符串 "2" !== 数字 2
      const rirOn = await page.locator(".wo-summary .chips").nth(0).locator(".pick.on").allInnerTexts();
      t.eq(rirOn.length, 1, "字符串 RIR 打开后恰有一档选中：" + JSON.stringify(rirOn));
      t.eq(rirOn[0], "RIR 2", "选中的是对应的那一档");

      await page.click("#woFinishBtn");
      await page.waitForTimeout(800);
      const rec = await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("gym4.db.v1"));
        const s = raw.sessions[0];
        return { rir: s && s.rir, rirType: s && typeof s.rir };
      });
      t.eq(rec.rirType, "number", "写入记录的 RIR 是数字（实得 " + rec.rirType + "）");
      t.eq(rec.rir, 2, "写入记录的 RIR 值正确");

      // 这份备份必须还能再导入，否则等于一次性废纸
      const reimport = await page.evaluate(async () => {
        const m = await import("./js/progress.js");
        return m.validateDB(JSON.parse(localStorage.getItem("gym4.db.v1")));
      });
      t.eq(reimport, null, "归一后的备份能再次通过导入校验" + (reimport ? "：" + reimport : ""));

      // 编辑入口同样归一：手改记录的 rir 是字符串时，训练页也要有档位选中
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [{
          id: "strRir", dayId: "w1", date: "2026-10-16", durationMin: 40, maxPain: 2, rir: "3", note: "",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] }], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(400);
      await page.click('#sheetFooter button:has-text("编辑这条记录")');
      await page.waitForTimeout(700);
      const editOn = await page.locator(".wo-summary .chips").nth(0).locator(".pick.on").allInnerTexts();
      t.eq(editOn.length, 1, "编辑字符串 RIR 的记录后恰有一档选中：" + JSON.stringify(editOn));
      await page.click("#woFinishBtn");
      await page.waitForTimeout(800);
      const saved = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("gym4.db.v1")).sessions[0];
        return { rir: s && s.rir, rirType: s && typeof s.rir };
      });
      t.eq(saved.rirType, "number", "编辑保存后 RIR 仍是数字（实得 " + saved.rirType + "）");
      t.eq(saved.rir, 3, "编辑保存后 RIR 值未被改写");
    },
  },

  {
    name: "workout · 训练中与编辑",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      // 固定打开 W1（组数固定 21），不受今天星期几影响
      await openDay(page, "w1");

      // 底栏常驻进度
      t.eq(await page.locator("#woDockCount").innerText(), "已完成 0/21 组", "底栏初始显示完成数");
      await page.locator("#view .check").nth(0).click();
      await page.waitForTimeout(300);
      t.ok((await page.locator("#woDockCount").innerText()).includes("1/"), "勾选后底栏完成数更新");
      t.eq(await page.locator("#view input[type=number]").nth(1).inputValue(), "8", "勾选后默认次数回显到输入框");
      const w = await page.evaluate(() => document.getElementById("woDockFill").style.width);
      t.ok(w && w !== "0%", "底栏进度条有宽度：" + w);
      t.ok(/^\d{2}:\d{2}$/.test(await page.locator("#woDockTimer").innerText()), "底栏有计时");

      // 后台不计时长
      const t0 = await page.locator("#woDockTimer").innerText();
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(2200);
      const t1 = await page.locator("#woDockTimer").innerText();
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(1200);
      const t2 = await page.locator("#woDockTimer").innerText();
      t.eq(t0, t1, "切到后台 2 秒后计时不变");
      t.ok(t1 !== t2, "回到前台后计时继续");

      // 完成 → 编辑 → 保存
      await page.click("#woFinishBtn");
      await page.waitForTimeout(700);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(500);
      t.ok(await page.locator('#sheetFooter button:has-text("编辑这条记录")').count() === 1, "详情弹层有编辑按钮");
      await page.click('#sheetFooter button:has-text("编辑这条记录")');
      await page.waitForTimeout(700);
      t.eq(await page.locator("#woFinishBtn").innerText(), "保存修改", "编辑时主按钮变为「保存修改」");
      t.eq(await page.locator(".wo-move").count(), 7, "编辑界面列出全部动作");
      await page.locator("#view input[type=number]").nth(0).fill("123");
      await page.click("#woFinishBtn");
      await page.waitForTimeout(800);
      const s = await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions);
      t.eq(s.length, 1, "编辑后没有多出第二条记录");
      t.eq(s[0] && s[0].moves[0].sets[0].weight, "123", "修改已写回");
      t.eq(s[0] && s[0].moves[0].sets[0].done, true, "已完成状态保留");
    },
  },

  {
    name: "data · 导入校验与容错",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });

      const v = await page.evaluate(async () => {
        const m = await import("./js/progress.js");
        const good = { sessions: [{ id: "a", date: "2026-01-01", dayId: "w1",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] }] };
        return {
          ok: m.validateDB(good),
          noMoves: m.validateDB({ sessions: [{ id: "a", date: "2026-01-01", dayId: "w1" }] }),
          badDate: m.validateDB({ sessions: [{ id: "a", date: "x", dayId: "w1", moves: [] }] }),
          noSets: m.validateDB({ sessions: [{ id: "a", date: "2026-01-01", moves: [{ name: "x" }] }] }),
          noId: m.validateDB({ sessions: [{ date: "2026-01-01", moves: [] }] }),
          notArray: m.validateDB({ sessions: {} }),
          badDraft: m.validateDB({ sessions: [], drafts: { "w1@2026-10-20": {
            key: "w1@2026-10-20", dayId: "w1", date: "2026-10-20", touched: false } } }),
          badNumber: m.validateDB({ sessions: [{ id: "a", date: "2026-01-01", moves: [], durationMin: "<img>x" }] }),
          dupId: m.validateDB({ sessions: [
            { id: "a", date: "2026-01-01", moves: [] },
            { id: "a", date: "2026-01-02", moves: [] }] }),
          uniqueOk: m.validateDB({ sessions: [
            { id: "a", date: "2026-01-01", moves: [] },
            { id: "b", date: "2026-01-02", moves: [] }] }),
        };
      });
      t.eq(v.ok, null, "合法数据通过校验");
      t.ok(v.noMoves && v.noMoves.includes("moves"), "缺 moves 被拒：" + v.noMoves);
      t.ok(v.badDate && v.badDate.includes("日期"), "坏日期被拒：" + v.badDate);
      t.ok(v.noSets && v.noSets.includes("sets"), "缺 sets 被拒：" + v.noSets);
      t.ok(v.noId && v.noId.includes("id"), "缺 id 被拒：" + v.noId);
      t.ok(v.notArray && v.notArray.includes("sessions"), "sessions 不是数组被拒：" + v.notArray);
      t.ok(v.badDraft && v.badDraft.includes("草稿"), "缺 moves 的草稿被拒：" + v.badDraft);
      t.ok(v.badNumber && v.badNumber.includes("必须是数字"), "非数字 durationMin 被拒：" + v.badNumber);
      t.ok(v.dupId && v.dupId.includes("重复的记录 id"), "重复 id 被拒：" + v.dupId);
      t.eq(v.uniqueOk, null, "id 全部唯一时校验通过");

      // 真实导入流程：重复 id 的备份被拒后，现有记录保持不变
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [{ id: "keep", date: "2026-01-01", dayId: "w1",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] }], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.click('.nav-btn[data-tab="progress"]');
      await page.waitForTimeout(500);
      const fsMod = require("fs");
      const dupFile = path.join("/tmp", `gym4-dup-${process.pid}.json`);
      fsMod.writeFileSync(dupFile, JSON.stringify({ sessions: [
        { id: "dup", date: "2026-01-01", moves: [] },
        { id: "dup", date: "2026-01-02", moves: [] }], drafts: {} }));
      await clearToast(page);
      const [fc] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.click('#view button:has-text("导入数据")'),
      ]);
      await fc.setFiles(dupFile);
      await page.waitForTimeout(500);
      const impToast = await page.locator("#toast").innerText();
      t.ok(impToast.includes("重复的记录 id"), "导入被拒并说明重复 id：" + impToast);
      const afterImp = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.map(s => s.id));
      t.eq(afterImp.length, 1, "拒绝后现有记录条数不变");
      t.eq(afterImp[0], "keep", "拒绝后仍是原有记录，未被覆盖");
      fsMod.unlinkSync(dupFile);

      // 坏数据落盘后，进度页不能整页崩
      // 日期一律相对今天现算：用例不假设具体日期（写死 2026-10-14 之类会随时间失效）
      await page.evaluate(() => {
        const z = n => String(n).padStart(2, "0");
        const ds = off => { const d = new Date(); d.setDate(d.getDate() + off);
          return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [
            { id: "bad", dayId: "w1", date: ds(-4), durationMin: 52, maxPain: 0, rir: 2, note: "" },
            // moves 在、但某个动作缺 sets：消费端会直接 m.sets.forEach，过滤必须挡掉
            { id: "badSets", dayId: "w1", date: ds(-5), durationMin: 40, maxPain: 0, rir: 2, note: "",
              moves: [{ name: "上斜推胸机" }] },
            // sets 是数组但元素是 null：消费端直接读 x.done，过滤必须挡掉
            { id: "badNull", dayId: "w1", date: ds(-6), durationMin: 40, maxPain: 0, rir: 2, note: "",
              moves: [{ name: "蝴蝶机夹胸", sets: [null] }] },
            { id: "ok", dayId: "w1", date: ds(-3), durationMin: 52, maxPain: 0, rir: 2, note: "",
              moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] },
          ], drafts: {},
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="progress"]');
      await page.waitForTimeout(600);
      t.ok(await page.locator(".stat").count() >= 3, "残缺记录不影响统计渲染");
      t.ok((await page.locator("#view").innerText()).includes("格式异常"), "残缺记录有提示");
      t.ok((await page.locator("#view").innerText()).includes("有 3 条记录格式异常已跳过"), "缺 sets 和 sets:[null] 都算残缺");

      // 同一条残缺记录在记录页也不能把页面打崩：历史列表、开始新训练、详情弹窗
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(600);
      t.eq(await page.locator("#view .row-tap").count(), 1, "记录页只列出可用记录");
      t.ok((await page.locator("#view").innerText()).includes("W1 胸+三头"), "可用记录正常显示");
      t.ok((await page.locator("#view").innerText()).includes("格式异常"), "残缺记录在记录页有提示");

      await page.locator("#view .btn.solid.full").first().click();
      await page.waitForTimeout(600);
      t.ok(await page.locator(".wo-move").count() > 0, "残缺记录不影响开始新训练");
      await page.click("#woExitBtn");
      await page.waitForTimeout(500);

      const sheet = await page.evaluate(async () => {
        const m = await import("./js/log.js");
        const out = [];
        for (const id of ["bad", "badSets", "badNull"]) {
          try { m.showSessionSheet(id); out.push("no throw"); }
          catch (e) { out.push(e.constructor.name + ": " + e.message); }
        }
        return out;
      });
      t.eq(sheet[0], "no throw", "残缺记录的详情弹窗不抛错");
      t.eq(sheet[1], "no throw", "缺 sets 的记录详情弹窗不抛错");
      t.eq(sheet[2], "no throw", "sets:[null] 的记录详情弹窗不抛错");

      // 草稿里缺 moves（坏导入、手改）不能崩记录页，也不能变成删不掉又看不见的僵尸
      await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("gym4.db.v1"));
        raw.drafts["w2@2026-10-18"] = { key: "w2@2026-10-18", dayId: "w2", date: "2026-10-18", touched: false };
        localStorage.setItem("gym4.db.v1", JSON.stringify(raw));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      t.eq(await page.locator("#view .row-drop").count(), 0, "坏草稿不显示");
      t.eq(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("gym4.db.v1")).drafts).length), 0, "坏草稿被清理");

      // 落盘的数字字段是字符串时，渲染不能把它当 HTML 执行
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [{ id: "xss", dayId: "w1", date: "2026-10-16", moves: [],
            durationMin: '<img src=x onerror="window.__pwned=1">' }],
          drafts: {},
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.evaluate(() => { window.__pwned = 0; });
      await page.waitForTimeout(300);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      t.eq(await page.evaluate(() => window.__pwned), 0, "注入串不会被执行");
      t.ok((await page.locator("#view").innerText()).includes("<img"), "注入串按文本显示");
    },
  },

  {
    name: "data · 坏草稿与坏容器不崩页",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });

      // 草稿的 sets 里混了 null：消费端直接读 x.done，校验必须挡掉
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [], drafts: {
            "w1@2026-10-18": {
              key: "w1@2026-10-18", dayId: "w1", date: "2026-10-18", touched: false,
              moves: [{ index: 0, name: "坐姿推胸机", sets: [null] }],
            },
          },
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(600);
      t.ok((await page.locator("#view").innerText()).includes("训练历史"), "坏草稿不打断记录页渲染");
      t.eq(await page.locator("#view .row-drop").count(), 0, "坏草稿不显示在未完成列表");
      t.eq(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("gym4.db.v1")).drafts).length), 0, "坏草稿被清理");

      // 同一份坏草稿开训练页也不能崩
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [], drafts: {
            "w1@2026-10-18": {
              key: "w1@2026-10-18", dayId: "w1", date: "2026-10-18", touched: true,
              moves: [{ index: 0, name: "坐姿推胸机", sets: [null] }],
            },
          },
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="plan"]');
      await page.waitForTimeout(400);
      await page.locator(".daychip[data-day='w1']").click();
      await page.waitForTimeout(350);
      await page.click("#sheetFooter button.btn");
      await page.waitForTimeout(700);
      t.ok(await page.locator(".wo-move").count() > 0, "坏草稿不影响开始新训练");

      // 容器类型不对时退化为空集合，三个页面都得能渲染
      for (const [label, raw] of [
        ["sessions 不是数组", JSON.stringify({ sessions: {}, drafts: {} })],
        ["drafts 不是对象", JSON.stringify({ sessions: [], drafts: "abc" })],
      ]) {
        await page.evaluate(v => localStorage.setItem("gym4.db.v1", v), raw);
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(500);
        t.eq(await page.locator(".hero h2").count(), 1, `${label}：计划页能渲染`);
        t.eq(await page.locator(".daychip").count(), 7, `${label}：周安排正常`);
        await page.click('.nav-btn[data-tab="log"]');
        await page.waitForTimeout(500);
        t.ok(await page.locator("#view .btn.solid.full").count() > 0, `${label}：记录页能渲染`);
        await page.click('.nav-btn[data-tab="progress"]');
        await page.waitForTimeout(500);
        t.ok(await page.locator("#view .empty").count() > 0, `${label}：进度页能渲染`);
      }
    },
  },

  {
    name: "draft · 草稿身份归一化",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });

      // 草稿缺 key：加载时补齐，完成训练后必须被删掉（否则同一份训练能重复完成）
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [],
          drafts: {
            "w1@2026-10-18": {
              // 故意不写 key
              dayId: "w1", date: "2026-10-18", startedAt: Date.now() - 6e5, elapsedMs: 6e5, lastResumedAt: null, touched: true,
              moves: [{ index: 0, name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }],
              rir: 2, pain: 0, note: "",
            },
          },
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      const dr = await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).drafts["w1@2026-10-18"]);
      t.eq(dr && dr.key, "w1@2026-10-18", "草稿缺 key 时被补齐为规范键");

      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(700);
      await page.click("#woFinishBtn");
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("gym4.db.v1"));
        return { sessions: raw.sessions.length, drafts: Object.keys(raw.drafts).length };
      });
      t.eq(after.sessions, 1, "完成训练生成 1 条记录");
      t.eq(after.drafts, 0, "草稿缺 key 时完成训练后草稿被删除");

      // 草稿存在非规范键下：续用必须拿到原数据，且搬迁后不残留第二份
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [],
          drafts: {
            "legacy-key": {
              key: "legacy-key", dayId: "w1", date: "2026-10-19", startedAt: Date.now() - 6e5, elapsedMs: 6e5,
              lastResumedAt: null, touched: true,
              moves: [{ index: 0, name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }],
              rir: 2, pain: 0, note: "非规范键的草稿",
            },
          },
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      const opened = await page.evaluate(async () => {
        const m = await import("./js/log.js");
        m.openWorkout("w1", "2026-10-19");
        await new Promise(r => setTimeout(r, 400));
        return {
          weight: document.querySelector("#view input[type=number]").value,
          note: document.querySelector("#view input[type=text]").value,
          keys: Object.keys(JSON.parse(localStorage.getItem("gym4.db.v1")).drafts),
        };
      });
      t.eq(opened.weight, "80", "非规范键的草稿被续用，重量不丢");
      t.eq(opened.note, "非规范键的草稿", "非规范键的草稿被续用，备注不丢");
      t.eq(opened.keys.length, 1, "搬迁后不残留第二份草稿");
      t.eq(opened.keys[0], "w1@2026-10-19", "草稿被搬到规范键 dayId@date");

      // normalizeDraftMap 是纯函数：返回归一化后的容器与是否变化的标记，不增删传入容器的键
      const norm = await page.evaluate(async () => {
        const m = await import("./js/core.js");
        const src = {
          "w1@2026-01-05": { key: "w1@2026-01-05", dayId: "w1", date: "2026-01-05", moves: [] },
          "legacy": { key: "legacy", dayId: "w2", date: "2026-01-06", moves: [] },
          "broken": { dayId: "w3", date: "2026-01-07" },
        };
        const out = m.normalizeDraftMap(src);
        return {
          changed: out.changed,
          keys: Object.keys(out.out).sort(),
          movedKey: out.out["w2@2026-01-06"] && out.out["w2@2026-01-06"].key,
          srcKeys: Object.keys(src).sort(),
        };
      });
      t.eq(norm.changed, true, "归一化报告键需要搬迁/剔除");
      t.eq(norm.keys.join(","), "w1@2026-01-05,w2@2026-01-06", "非规范键被搬到规范键、坏草稿被剔除");
      t.eq(norm.movedKey, "w2@2026-01-06", "搬迁后草稿的 key 字段被补齐");
      t.eq(norm.srcKeys.join(","), "broken,legacy,w1@2026-01-05", "归一化不增删传入容器里的键");
    },
  },

  {
    name: "workout · 刷新后时长不丢",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      await openDay(page, "w1");
      // 勾一组：草稿 touched=true，不会被当成空草稿清掉
      await page.locator("#view .check").first().click();
      await page.waitForTimeout(2600);

      // 切后台再回前台：回前台后计时继续走，这段时间同样不能丢
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(2200);
      const before = await page.locator("#woDockTimer").innerText();

      // 训练中刷新页面：已累计的时长不能丢
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      t.eq(await page.locator("#view .row-tap").count(), 1, "刷新后草稿还在未完成列表");
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(800);
      const after = await page.locator("#woDockTimer").innerText();

      t.ok(/^\d{2}:\d{2}$/.test(before), `刷新前有计时：${before}`);
      t.ok(/^\d{2}:\d{2}$/.test(after), `刷新后有计时：${after}`);
      t.ok(toSec(after) >= toSec(before), `刷新后计时不倒退（${before} → ${after}）`);
    },
  },

  {
    // 旧草稿（计时功能上线前创建）没有已累计时长字段：
    // 恢复时不能按 startedAt 推算，否则数天的间隔会被算成训练时长
    name: "workout · 旧草稿时长从 0 起算",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        const z = n => String(n).padStart(2, "0");
        const d = new Date();
        const date = d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [],
          drafts: {
            ["w1@" + date]: {
              key: "w1@" + date, dayId: "w1", date,
              startedAt: Date.now() - 3 * 24 * 3600 * 1000, // 3 天前开始
              touched: true, rir: 2, pain: 0, note: "",
              moves: [{ index: 0, name: "坐姿推胸机", sets: [{ weight: "60", reps: "10", done: true }] }],
            },
          },
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(800);

      const shown = await page.locator("#woDockTimer").innerText();
      t.ok(toSec(shown) < 60, `旧草稿恢复后时长从 0 起算（显示 ${shown}）`);

      // 完成训练：写入记录的时长必须与实际操作一致，不能是数天
      await page.click("#woFinishBtn");
      await page.waitForTimeout(700);
      const dur = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("gym4.db.v1")).sessions[0];
        return s && s.durationMin;
      });
      t.eq(dur, 1, `写入记录的时长为 1 分钟（实得 ${dur}）`);
    },
  },

  {
    name: "workout · 编辑有修改离开提示",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [
          { id: "e1", dayId: "w1", date: "2026-10-16", durationMin: 40, maxPain: 0, rir: 2, note: "",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "8", done: true }] }] },
        ], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      // 1) 非编辑状态刷新：不弹离开确认
      let dialogs = 0;
      const onDlg = () => { dialogs++; };
      page.on("dialog", onDlg);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      t.eq(dialogs, 0, "非编辑状态刷新不弹离开确认");

      // 2) 进入编辑但未修改：刷新不弹
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(400);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(400);
      await page.click('#sheetFooter button:has-text("编辑这条记录")');
      await page.waitForTimeout(600);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      t.eq(dialogs, 0, "编辑未修改时刷新不弹离开确认");

      // 3) 编辑并修改后刷新：弹原生离开确认（runner 的 dialog 监听会自动接受，刷新照常完成）
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(400);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(400);
      await page.click('#sheetFooter button:has-text("编辑这条记录")');
      await page.waitForTimeout(600);
      await page.locator("#view input[type=number]").nth(0).fill("95");
      await page.waitForTimeout(200);
      await page.reload();
      await page.waitForTimeout(400);
      t.eq(dialogs, 1, "编辑有修改时刷新弹出离开确认");
      page.off("dialog", onDlg);
    },
  },

  {
    name: "history · 训练日缺失时编辑有提示",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      // 训练日 id 不在当前计划里（改过 data.js 的 day id 就会这样）
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [{
            id: "orphan", dayId: "w9", date: "2026-10-16", durationMin: 50, maxPain: 0, rir: 2, note: "",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }],
          }],
          drafts: {},
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      t.eq(await page.locator("#view .row-tap").count(), 1, "训练日缺失的记录仍能列出");
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(500);
      t.eq(await page.locator('#sheetFooter button:has-text("编辑这条记录")').count(), 1, "详情弹层有编辑按钮");

      await clearToast(page);
      await page.click('#sheetFooter button:has-text("编辑这条记录")');
      await page.waitForTimeout(600);
      t.ok(await page.locator(".sheet-mask").isVisible(), "点编辑后弹层没有消失");
      t.ok((await page.locator("#toast").innerText()).includes("当前计划"), "给出可读提示：" + (await page.locator("#toast").innerText()));
      t.eq(await page.locator(".wo-summary").count(), 0, "没有进入空白的训练页");
    },
  },

  {
    name: "history · 重复 id 单条操作",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      // 两条 id 相同的记录（模拟手改 localStorage），日期与内容不同便于区分
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [
          { id: "dup", dayId: "w1", date: "2026-10-16", durationMin: 30, maxPain: 0, rir: 2, note: "记录A",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "8", done: true }] }] },
          { id: "dup", dayId: "w2", date: "2026-10-17", durationMin: 50, maxPain: 0, rir: 2, note: "记录B",
            moves: [{ name: "高位下拉", sets: [{ weight: "70", reps: "9", done: true }] }] },
        ], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      t.eq(await page.locator("#view .row-tap").count(), 2, "重复 id 的两条记录都列出");

      // 列表按日期降序：第 1 行是记录B(10/17)，第 2 行是记录A(10/16)
      // 点第 2 行 → 详情必须是记录A（对象定位，不是 id 猜到的第一条）
      await page.locator("#view .row-tap").nth(1).click();
      await page.waitForTimeout(400);
      const head = await page.locator("#sheetHeader .card-sub").innerText();
      t.ok(head.includes("10/16"), "点第二行打开第二条的详情：" + head.trim());
      t.ok((await page.locator("#sheetBody").innerText()).includes("记录A"), "详情内容是被点击的那条");

      // 编辑记录A → 只有它被更新，记录B 保持原内容
      await page.click('#sheetFooter button:has-text("编辑这条记录")');
      await page.waitForTimeout(600);
      await page.locator("#view input[type=number]").nth(0).fill("111");
      await page.click("#woFinishBtn");
      await page.waitForTimeout(700);
      let recs = await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions);
      t.eq(recs.length, 2, "编辑保存后仍是两条记录");
      let byDate = Object.fromEntries(recs.map(s => [s.date, s]));
      t.eq(byDate["2026-10-16"].moves[0].sets[0].weight, "111", "被编辑的那条已更新");
      t.eq(byDate["2026-10-17"].moves[0].sets[0].weight, "70", "另一条保持原内容");

      // 删除记录A → 记录B 不被误删（删除前必须弹确认框）
      let delDialogs = 0;
      page.on("dialog", () => { delDialogs++; });
      await page.locator("#view .row-tap").nth(1).click();
      await page.waitForTimeout(400);
      await page.click('#sheetFooter button:has-text("删除这条记录")');
      await page.waitForTimeout(600);
      t.eq(delDialogs, 1, "删除记录前弹出了确认框");
      recs = await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions);
      t.eq(recs.length, 1, "删除一条后只剩一条");
      t.eq(recs[0] && recs[0].date, "2026-10-17", "保留的是另一条，未被误删");
      t.eq(recs[0] && recs[0].moves[0].sets[0].weight, "70", "保留的记录内容未变");
    },
  },

  {
    name: "workout · 输入防抖落盘",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      await openDay(page, "w1");
      // 输入备注后不等防抖窗口，立即退出：内容不能丢
      await page.locator("#view input[type=text]").first().fill("睡得不好");
      await page.click("#woExitBtn");
      await page.waitForTimeout(600);
      const note = await page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem("gym4.db.v1"));
        const k = Object.keys(d.drafts)[0];
        return k ? d.drafts[k].note : null;
      });
      t.eq(note, "睡得不好", "输入后立即退出，备注不丢（退出时冲刷防抖）");

      // 输入重量后等防抖窗口过去：内容要落盘
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(500);
      await page.locator(".wo-move").first().locator("input").first().fill("60");
      await page.waitForTimeout(600);
      const w = await page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem("gym4.db.v1"));
        const k = Object.keys(d.drafts)[0];
        return d.drafts[k].moves[0].sets[0].weight;
      });
      t.eq(w, "60", "停手 300ms 后重量已落盘");

      // 勾选一个组后立即退出：勾选与备注都在
      await page.locator("#view .check").first().click();
      await page.waitForTimeout(200);
      await page.click("#woExitBtn");
      await page.waitForTimeout(600);
      const done = await page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem("gym4.db.v1"));
        const k = Object.keys(d.drafts)[0];
        return d.drafts[k].moves[0].sets[0].done;
      });
      t.eq(done, true, "勾选后退出，勾选状态保留");
    },
  },

  {
    name: "draft · 记录页草稿清理写盘失败回滚",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      // 场景一：空草稿（touched=false 且没勾过组）被清理时写盘失败 → 内存里要回来
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [], drafts: {
          "w1@2026-10-18": {
            key: "w1@2026-10-18", dayId: "w1", date: "2026-10-18", touched: false,
            moves: [{ index: 0, name: "坐姿推胸机", sets: [{ weight: "", reps: "", done: false }] }],
          },
        }}));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.evaluate(() => {
        window.__setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); };
      });
      await clearToast(page);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      t.ok((await page.locator("#toast").innerText()).includes("存储失败"), "清理空草稿写盘失败时提示失败");
      t.eq(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("gym4.db.v1")).drafts).length), 1,
        "空草稿回到清理前状态（本地未写坏）");
      // UI 子句：界面按回滚后的列表渲染，草稿行要重新出现，不得出现「磁盘上有、界面看不见」
      t.eq(await page.locator("#view .section-h", { hasText: "未完成的训练" }).count(), 1,
        "写盘失败后「未完成的训练」标题仍在");
      t.eq(await page.locator("#view .row-tap").count(), 1, "写盘失败后草稿行仍在未完成列表里");
      await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
      // 恢复写盘后再次渲染：清理正常生效
      await page.click('.nav-btn[data-tab="plan"]');
      await page.waitForTimeout(300);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      t.eq(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("gym4.db.v1")).drafts).length), 0,
        "写盘恢复后空草稿被正常清理");

      // 场景二：结构损坏的草稿被清理时写盘失败 → 容器整体回滚
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [],
          drafts: {
            "w1@2026-10-18": { key: "w1@2026-10-18", dayId: "w1", date: "2026-10-18", touched: false },
            "x@2026-10-19": "not-an-object",
          },
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        window.__setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); };
      });
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      t.ok((await page.locator("#toast").innerText()).includes("存储失败"), "清理坏草稿写盘失败时提示失败");
      t.ok(await page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem("gym4.db.v1")).drafts;
        return "w1@2026-10-18" in d && "x@2026-10-19" in d;
      }), "坏草稿容器回到清理前状态");
      await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
    },
  },

  {
    name: "data · 写盘失败与旧记录编辑",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      await openDay(page, "w1");
      await page.locator("#view .check").first().click();
      await page.waitForTimeout(200);

      // localStorage 写失败（配额满 / 私有模式）：不能提示成功，也不能丢掉训练页
      await page.evaluate(() => {
        window.__setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); };
      });
      await clearToast(page);
      await page.click("#woFinishBtn");
      await page.waitForTimeout(400);
      t.ok((await page.locator("#toast").innerText()).includes("存储失败"), "写盘失败时保留错误提示");
      t.eq(await page.locator(".wo-summary").count(), 1, "写盘失败时留在训练页");
      t.eq(await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.length), 0, "写盘失败时没有假装保存");
      await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
      await page.click("#woFinishBtn");
      await page.waitForTimeout(700);
      t.eq(await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.length), 1, "恢复后可以正常完成");

      // 旧记录的动作级 note/rir/pain 编辑保存后不能丢；疼痛 9 吸附到 10
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [{
          id: "legacy", dayId: "w1", date: "2026-10-16", durationMin: 50, maxPain: 9, rir: 2, note: "训练级备注",
          moves: [{ name: "坐姿推胸机", note: "动作备注", rir: 3, pain: 1,
                    sets: [{ weight: "80", reps: "9", done: true }] }],
        }], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(400);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(400);
      await page.click('#sheetFooter button:has-text("编辑这条记录")');
      await page.waitForTimeout(600);
      t.eq(await page.locator(".wo-summary .chips").nth(1).locator(".pick.on").innerText(), "10", "旧疼痛值 9 吸附到 10");
      await page.click("#woFinishBtn");
      await page.waitForTimeout(700);
      const rec = await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions[0]);
      t.eq(rec.moves[0].note, "动作备注", "动作级备注保留");
      t.eq(rec.moves[0].rir, 3, "动作级 RIR 保留");
      t.eq(rec.moves[0].pain, 1, "动作级疼痛保留");
      t.eq(rec.maxPain, 10, "训练级疼痛吸附为 10");
    },
  },

  {
    name: "data · 两个标签页相互同步",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const other = await page.context().newPage();
      other.on("dialog", d => d.accept());
      await other.goto(base, { waitUntil: "networkidle" });
      await other.waitForTimeout(400);

      // A 完成一次训练
      await openDay(page, "w1");
      await page.locator("#view .check").first().click();
      await page.click("#woFinishBtn");
      await page.waitForTimeout(700);
      t.eq(await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.length), 1, "A 保存了 1 条记录");

      // B 空闲时收到 storage 事件并同步，之后再保存不能把 A 的记录冲掉
      await other.waitForTimeout(1200);
      await other.click('.nav-btn[data-tab="log"]');
      await other.waitForTimeout(500);
      t.eq(await other.locator("#view .row-tap").count(), 1, "B 同步到了 A 的记录");
      await other.locator("#view .btn.solid.full").first().click();
      await other.waitForTimeout(500);
      await other.locator("#view .check").first().click();
      await other.waitForTimeout(400);
      t.eq(await other.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.length), 1, "B 保存时没有覆盖 A 的记录");
      await other.close();
    },
  },

  {
    // 训练中（state.wo 非空）收到另一标签页的写入时，若只提醒不合并，
    // 本标签页随后任何一次 saveDB()（含 300ms 输入防抖触发的那次）都会把内存里的
    // 旧 sessions 整量写回，抹掉对方刚写入的记录。修复前实测记录数从 1 变 0。
    name: "data · 训练中不覆盖另一标签页的写入",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const other = await page.context().newPage();
      other.on("dialog", d => d.accept());
      await other.goto(base, { waitUntil: "networkidle" });
      await other.waitForTimeout(400);

      // A 训练中：开 w1 并勾一组（草稿 touched=true，不会被当成空草稿清掉）
      await page.evaluate(async () => {
        const m = await import("./js/log.js");
        m.openWorkout("w1", "2026-01-05");
      });
      await page.waitForTimeout(500);
      await page.locator("#view .check").first().click();
      await page.waitForTimeout(500);

      // B 完成一次训练并写盘 → 触发 A 的 storage 事件（A 在训练中，只提醒+合并）
      await other.evaluate(async () => {
        const m = await import("./js/log.js");
        m.openWorkout("w2", "2026-01-06");
      });
      await other.waitForTimeout(500);
      await other.locator("#view .check").first().click();
      await other.waitForTimeout(300);
      await other.click("#woFinishBtn");
      await other.waitForTimeout(800);

      const afterB = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.length);
      t.eq(afterB, 1, "B 完成后本地有 1 条记录");

      // A 输入备注 → 300ms 防抖落盘。修复前这里会把 B 的记录整量抹掉
      await page.locator("#view input[type=text]").first().fill("A 训练中的备注");
      await page.waitForTimeout(1200);

      const afterA = await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("gym4.db.v1"));
        return {
          count: raw.sessions.length,
          dates: raw.sessions.map(s => s.date).sort(),
          // 合并不能把 A 正在编辑的草稿换成 B 的
          draftKeys: Object.keys(raw.drafts),
        };
      });
      // A 还在训练中（未完成），所以本地应只有 B 那 1 条；
      // 修复前这里是 0 条——A 的防抖落盘把 B 的记录整量抹掉了
      t.eq(afterA.count, 1, "A 输入落盘后记录数不减少（实得 " + afterA.count + " 条）");
      t.ok(afterA.dates.includes("2026-01-06"), "B 的记录仍在：" + JSON.stringify(afterA.dates));
      t.ok(afterA.draftKeys.includes("w1@2026-01-05"), "A 正在训练的草稿未被替换：" + JSON.stringify(afterA.draftKeys));

      // A 的备注确实落盘了（合并不能以丢自己的输入为代价）
      const note = await page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem("gym4.db.v1")).drafts["w1@2026-01-05"];
        return d && d.note;
      });
      t.eq(note, "A 训练中的备注", "A 自己的输入也已落盘");

      await other.close();
    },
  },

  {
    // 训练中的标签页收到 storage 事件时只合并 sessions、从不刷新 db.drafts，
    // 而 saveDB() 是整量写盘 → 本标签页下一次落盘会把对方新建的草稿连同用户填的重量一起抹掉。
    // 修复前实测：A 输入备注触发防抖落盘后，磁盘上只剩 A 的草稿。
    name: "data · 训练中不抹掉另一标签页的草稿",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const other = await page.context().newPage();
      other.on("dialog", d => d.accept());
      await other.goto(base, { waitUntil: "networkidle" });
      await other.waitForTimeout(400);

      // A 训练中：开 w1 草稿并勾一组（touched=true，不会被当成空草稿清掉）
      await page.evaluate(async () => {
        const m = await import("./js/log.js");
        m.openWorkout("w1", "2026-01-05");
      });
      await page.waitForTimeout(500);
      await page.locator("#view .check").first().click();
      await page.waitForTimeout(400);

      // B 为另一个训练日建一份带内容的草稿：填重量 + 勾一组，然后「保存并退出」变空闲
      await other.evaluate(async () => {
        const m = await import("./js/log.js");
        m.openWorkout("w2", "2026-01-06");
      });
      await other.waitForTimeout(500);
      await other.locator("#view .wo-move input[type=number]").first().fill("100");
      await other.locator("#view .check").first().click();
      await other.waitForTimeout(400);
      await other.click("#woExitBtn");
      await other.waitForTimeout(700);

      const afterB = await other.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("gym4.db.v1"));
        return { keys: Object.keys(raw.drafts) };
      });
      t.ok(afterB.keys.includes("w2@2026-01-06"), "B 的草稿已落盘：" + JSON.stringify(afterB.keys));

      // A 输入备注 → 300ms 防抖落盘（整量写 db）。修复前这里会把 B 的草稿整个抹掉
      await page.locator("#view input[type=text]").first().fill("A 训练中的备注");
      await page.waitForTimeout(1200);

      const afterA = await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("gym4.db.v1"));
        const w2 = raw.drafts["w2@2026-01-06"];
        return {
          keys: Object.keys(raw.drafts),
          w2Weight: w2 && w2.moves && w2.moves[0] && w2.moves[0].sets[0] && w2.moves[0].sets[0].weight,
          w2Done: !!(w2 && w2.moves && w2.moves[0] && w2.moves[0].sets[0] && w2.moves[0].sets[0].done),
          w1Note: (raw.drafts["w1@2026-01-05"] || {}).note,
        };
      });
      t.ok(afterA.keys.includes("w2@2026-01-06"), "A 落盘后 B 的草稿仍在：" + JSON.stringify(afterA.keys));
      t.eq(String(afterA.w2Weight), "100", "B 草稿里填的重量没丢");
      t.ok(afterA.w2Done, "B 草稿里勾选的组没丢");
      t.eq(afterA.w1Note, "A 训练中的备注", "A 自己的草稿与输入仍在");

      // 同一个训练日与日期：对方也建了草稿时，A 正在编辑的那份不被替换
      await other.evaluate(async () => {
        const m = await import("./js/log.js");
        m.openWorkout("w1", "2026-01-05");
      });
      await other.waitForTimeout(500);
      await other.locator("#view .wo-move input[type=number]").first().fill("999");
      await other.locator("#view .check").first().click();
      await other.waitForTimeout(400);
      await other.click("#woExitBtn");
      await other.waitForTimeout(700);

      await page.locator("#view input[type=text]").first().fill("A 训练中的备注 2");
      await page.waitForTimeout(1200);

      const own = await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("gym4.db.v1"));
        const w1 = raw.drafts["w1@2026-01-05"];
        return {
          count: Object.keys(raw.drafts).length,
          note: w1 && w1.note,
          weight: w1 && w1.moves && w1.moves[0] && w1.moves[0].sets[0] && w1.moves[0].sets[0].weight,
        };
      });
      t.eq(own.count, 2, "同一训练日没有留下两份草稿");
      t.eq(own.note, "A 训练中的备注 2", "A 正在编辑的草稿没被对方的草稿替换");
      t.ok(String(own.weight) !== "999", "A 正在编辑的草稿内容没被对方覆盖");

      await other.close();
    },
  },

  {
    // 空闲分支整量替换 db.sessions 后，已打开的详情弹层持有的记录对象变成游离引用，
    // 删除走 indexOf 返回 -1 → 只弹「这条记录已经不在了」，记录其实没删。
    name: "data · 跨标签页同步后仍能删除所选记录",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.setItem("gym4.db.v1", JSON.stringify({
        sessions: [{ id: "s1", dayId: "w1", date: "2026-01-05", durationMin: 30, rir: 2, maxPain: 0, note: "",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] }],
        drafts: {},
      })));
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(400);

      // 另一个标签页写入 → 本页 storage 事件 → db.sessions 被整量替换
      const other = await page.context().newPage();
      await other.goto(base, { waitUntil: "networkidle" });
      await other.waitForTimeout(400);
      await other.evaluate(() => localStorage.setItem("gym4.db.v1", JSON.stringify({
        sessions: [
          { id: "s1", dayId: "w1", date: "2026-01-05", durationMin: 30, rir: 2, maxPain: 0, note: "",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] },
          { id: "s2", dayId: "w2", date: "2026-01-06", durationMin: 25, rir: 2, maxPain: 0, note: "",
            moves: [{ name: "高位下拉", sets: [{ weight: "70", reps: "9", done: true }] }] },
        ],
        drafts: {},
      })));
      await page.waitForTimeout(1000);

      await page.click("#sheetFooter .btn.danger");
      await page.waitForTimeout(600);

      const ids = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.map(s => s.id));
      t.ok(!ids.includes("s1"), "被选中的那条记录已删除：" + JSON.stringify(ids));
      t.ok(ids.includes("s2"), "另一个标签页写入的记录仍在：" + JSON.stringify(ids));
      const toast = (await page.locator("#toast").innerText()).trim();
      t.ok(toast.includes("已删除"), "提示是「已删除」：" + toast);

      await other.close();
    },
  },

  {
    // 同上，但走编辑路径：保存时按对象引用定位，返回 -1 → 编辑被丢弃。
    name: "data · 跨标签页同步后仍能保存对所选记录的编辑",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.setItem("gym4.db.v1", JSON.stringify({
        sessions: [{ id: "s1", dayId: "w1", date: "2026-01-05", durationMin: 30, rir: 2, maxPain: 0, note: "",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] }],
        drafts: {},
      })));
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(400);

      const other = await page.context().newPage();
      await other.goto(base, { waitUntil: "networkidle" });
      await other.waitForTimeout(400);
      await other.evaluate(() => localStorage.setItem("gym4.db.v1", JSON.stringify({
        sessions: [
          { id: "s1", dayId: "w1", date: "2026-01-05", durationMin: 30, rir: 2, maxPain: 0, note: "",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] },
          { id: "s2", dayId: "w2", date: "2026-01-06", durationMin: 25, rir: 2, maxPain: 0, note: "",
            moves: [{ name: "高位下拉", sets: [{ weight: "70", reps: "9", done: true }] }] },
        ],
        drafts: {},
      })));
      await page.waitForTimeout(1000);

      await page.click("#sheetFooter .btn.solid");
      await page.waitForTimeout(800);
      await page.locator("#view .wo-move input[type=number]").first().fill("95");
      await page.waitForTimeout(300);
      await page.click("#woFinishBtn");
      await page.waitForTimeout(900);

      const rec = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.find(s => s.id === "s1"));
      t.ok(rec, "所选记录还在");
      t.eq(String(rec && rec.moves[0].sets[0].weight), "95", "编辑被保存到所选的那条记录");
      const ids = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.map(s => s.id));
      t.ok(ids.includes("s2"), "另一个标签页写入的记录不受影响：" + JSON.stringify(ids));

      await other.close();
    },
  },

  {
    // 手改 localStorage 造一条没有 id 的记录（导入路径会被 validateDB 拒绝，只有手改能进来）。
    // 修复前 editingId 为 undefined → 按钮显示「完成训练」→ 保存时新建一条重复记录。
    name: "data · 编辑没有 id 的记录不生成重复记录",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [
          { dayId: "w1", date: "2026-01-05", durationMin: 30, rir: 2, maxPain: 0, note: "",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] },
        ], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(400);
      await page.click('#sheetFooter button:has-text("编辑这条记录")');
      await page.waitForTimeout(700);

      const btn = (await page.locator("#woFinishBtn").innerText()).trim();
      t.eq(btn, "保存修改", "没有 id 的记录进入的是编辑态：" + btn);

      // 改过内容后离开页面要弹未保存提示（编辑态的判定不依赖记录 id）
      // 只计数：runner 已经注册了接受确认框的处理器
      let dialogs = 0;
      page.on("dialog", () => { dialogs++; });
      await page.locator("#view .wo-move input[type=number]").first().fill("95");
      await page.waitForTimeout(300);
      await page.reload({ waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(500);
      t.ok(dialogs > 0, "编辑态改过内容后离开会提示未保存");

      // 重新进入编辑并保存：原记录被更新，不产生重复记录
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(400);
      await page.click('#sheetFooter button:has-text("编辑这条记录")');
      await page.waitForTimeout(700);
      await page.locator("#view .wo-move input[type=number]").first().fill("95");
      await page.waitForTimeout(300);
      await page.click("#woFinishBtn");
      await page.waitForTimeout(900);

      const recs = await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions);
      t.eq(recs.length, 1, "保存后仍只有一条记录（没有新建重复记录）：" + JSON.stringify(recs.map(r => r.date)));
      t.eq(String(recs[0].moves[0].sets[0].weight), "95", "原记录被更新为修改后的重量");
    },
  },

  {
    // 草稿的计时字段是字符串（手改或导入）时，计时器会显示 NaN:NaN，
    // 写进记录的 durationMin 变成 null（时长丢失）。
    name: "workout · 草稿计时字段非法时不出现 NaN",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [], drafts: {
          "w1@2026-01-05": {
            key: "w1@2026-01-05", dayId: "w1", date: "2026-01-05", startedAt: Date.now() - 600000,
            elapsedMs: "abc", lastResumedAt: "xyz", touched: true, rir: 2, pain: 0, note: "",
            moves: [{ index: 0, name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }],
          },
        } }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(800);

      const shown = await page.locator("#woDockTimer").innerText();
      t.ok(!/NaN/.test(shown), "计时不显示 NaN：" + shown);

      await page.click("#woFinishBtn");
      await page.waitForTimeout(900);
      const dur = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem("gym4.db.v1")).sessions[0];
        return s && s.durationMin;
      });
      t.ok(typeof dur === "number" && isFinite(dur), "写入记录的时长是有限数字：" + dur);
    },
  },

  {
    // pagehide 会暂停计时，但页面从往返缓存恢复时没有 visibilitychange，
    // 计时会一直停在恢复前的读数上。
    name: "workout · 页面从往返缓存恢复后继续计时",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        const m = await import("./js/log.js");
        m.openWorkout("w1", "2026-01-05");
      });
      await page.waitForTimeout(800);

      const t1 = await page.locator("#woDockTimer").innerText();
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      await page.waitForTimeout(1600);
      const t2 = await page.locator("#woDockTimer").innerText();
      t.eq(t2, t1, "进入往返缓存后计时暂停：" + t1 + " → " + t2);

      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
      await page.waitForTimeout(1600);
      const t3 = await page.locator("#woDockTimer").innerText();
      t.ok(t3 !== t2, "从往返缓存恢复后计时继续：" + t2 + " → " + t3);
    },
  },

  {
    name: "data · 导入拒绝非数字草稿计时字段",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      const v = await page.evaluate(async () => {
        const m = await import("./js/progress.js");
        const mk = extra => ({ sessions: [], drafts: { "w1@2026-01-05": Object.assign({
          key: "w1@2026-01-05", dayId: "w1", date: "2026-01-05",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }],
        }, extra) } });
        // 空 moves 的草稿也要拦：计时校验曾嵌在按动作的循环里，moves:[] 会整段跳过
        const mkEmpty = extra => ({ sessions: [], drafts: { "w1@2026-01-05": Object.assign({
          key: "w1@2026-01-05", dayId: "w1", date: "2026-01-05", moves: [],
        }, extra) } });
        return {
          badElapsed: m.validateDB(mk({ elapsedMs: "abc" })),
          badResumed: m.validateDB(mk({ lastResumedAt: "xyz" })),
          badEmptyElapsed: m.validateDB(mkEmpty({ elapsedMs: "abc" })),
          badEmptyResumed: m.validateDB(mkEmpty({ lastResumedAt: "xyz" })),
          okNull: m.validateDB(mk({ elapsedMs: 600000, lastResumedAt: null })),
          okEmpty: m.validateDB(mkEmpty({})),
        };
      });
      t.ok(v.badElapsed && v.badElapsed.includes("elapsedMs"), "非数字 elapsedMs 被拒：" + v.badElapsed);
      t.ok(v.badResumed && v.badResumed.includes("lastResumedAt"), "非数字 lastResumedAt 被拒：" + v.badResumed);
      t.ok(v.badEmptyElapsed && v.badEmptyElapsed.includes("elapsedMs"), "空 moves 草稿的非数字 elapsedMs 被拒：" + v.badEmptyElapsed);
      t.ok(v.badEmptyResumed && v.badEmptyResumed.includes("lastResumedAt"), "空 moves 草稿的非数字 lastResumedAt 被拒：" + v.badEmptyResumed);
      t.eq(v.okNull, null, "合法的计时字段通过校验");
      t.eq(v.okEmpty, null, "空 moves 的合法草稿通过校验");

      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [{ id: "keep", date: "2026-01-01", dayId: "w1",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] }], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.click('.nav-btn[data-tab="progress"]');
      await page.waitForTimeout(500);
      const fsMod = require("fs");
      const badFile = path.join("/tmp", `gym4-badtime-${process.pid}.json`);
      fsMod.writeFileSync(badFile, JSON.stringify({ sessions: [], drafts: { "w1@2026-01-05": {
        key: "w1@2026-01-05", dayId: "w1", date: "2026-01-05", elapsedMs: "abc",
        moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] } } }));
      const [fc] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.click('#view button:has-text("导入数据")'),
      ]);
      await fc.setFiles(badFile);
      await page.waitForTimeout(500);
      const impToast = await page.locator("#toast").innerText();
      t.ok(impToast.includes("elapsedMs"), "导入被拒并说明哪一项不合法：" + impToast);
      const afterImp = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.map(s => s.id));
      t.eq(afterImp.length, 1, "拒绝后现有记录条数不变");
      t.eq(afterImp[0], "keep", "拒绝后仍是原有记录");
      fsMod.unlinkSync(badFile);
    },
  },

  {
    // 规范键与非规范键指向同一次训练时，归一化必须保留规范键下的那份，
    // 否则「继续」打开的是哪一份变得不确定（修复前由键的插入顺序决定）。
    name: "draft · 规范键优先",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [], drafts: {
          "w1@2026-01-05": {
            key: "w1@2026-01-05", dayId: "w1", date: "2026-01-05", startedAt: Date.now() - 60000,
            elapsedMs: 60000, lastResumedAt: null, touched: true, rir: 2, pain: 0, note: "规范键的备注",
            moves: [{ index: 0, name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }],
          },
          "legacy-key": {
            key: "legacy-key", dayId: "w1", date: "2026-01-05", startedAt: Date.now() - 60000,
            elapsedMs: 60000, lastResumedAt: null, touched: true, rir: 2, pain: 0, note: "非规范键的备注",
            moves: [{ index: 0, name: "坐姿推胸机", sets: [{ weight: "999", reps: "3", done: true }] }],
          },
        } }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(700);

      const st = await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("gym4.db.v1"));
        const d = raw.drafts["w1@2026-01-05"];
        return { keys: Object.keys(raw.drafts), note: d && d.note, weight: d && d.moves[0].sets[0].weight };
      });
      t.eq(st.keys.length, 1, "归一化后只剩一份草稿：" + JSON.stringify(st.keys));
      t.eq(st.note, "规范键的备注", "保留的是规范键下的那份草稿");
      t.eq(String(st.weight), "80", "规范键草稿的重量没被覆盖");
    },
  },

  {
    // 记录数组里有 null 元素时，跨标签页合并不能整段抛错（修复前 map(s => s.id) 会 TypeError，
    // 合并与提示都被打断）。
    name: "data · 记录数组含 null 时跨标签页合并不崩",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [
          null,
          { id: "ok1", date: "2026-01-05", dayId: "w1", durationMin: 30, rir: 2, maxPain: 0, note: "",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] },
        ], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      // A 训练中 → 走合并分支
      await page.evaluate(async () => {
        const m = await import("./js/log.js");
        m.openWorkout("w1", "2026-01-05");
      });
      await page.waitForTimeout(700);

      const other = await page.context().newPage();
      await other.goto(base, { waitUntil: "networkidle" });
      await other.waitForTimeout(400);
      await other.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [
          null,
          { id: "ok1", date: "2026-01-05", dayId: "w1", durationMin: 30, rir: 2, maxPain: 0, note: "",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] },
          { id: "new1", date: "2026-01-06", dayId: "w2", durationMin: 25, rir: 2, maxPain: 0, note: "",
            moves: [{ name: "高位下拉", sets: [{ weight: "70", reps: "9", done: true }] }] },
        ], drafts: {} }));
      });
      await page.waitForTimeout(1200);

      const toast = (await page.locator("#toast").innerText()).trim();
      t.ok(toast.includes("另一个标签页"), "合并分支正常执行并提示：" + toast);
      const mem = await page.evaluate(async () => {
        const core = await import("./js/core.js");
        return core.db.sessions.filter(Boolean).map(s => s.id);
      });
      t.ok(mem.includes("new1"), "对方新增的可用记录被并入内存：" + JSON.stringify(mem));

      await other.close();
    },
  },

  {
    // 规格：删除记录时写盘失败 → 记录回到删除前状态，不提示成功
    name: "data · 删除记录时写盘失败可回滚",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [
          { id: "s1", dayId: "w1", date: "2026-01-05", durationMin: 30, rir: 2, maxPain: 0, note: "",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] },
        ], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(400);

      await page.evaluate(() => {
        window.__setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); };
      });
      await page.click("#sheetFooter .btn.danger");
      await page.waitForTimeout(600);
      const toast = (await page.locator("#toast").innerText()).trim();
      t.ok(toast.includes("存储失败"), "提示写盘失败：" + toast);
      t.ok(!toast.includes("已删除"), "不提示删除成功：" + toast);
      const ids = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.map(s => s.id));
      t.eq(ids.join(","), "s1", "写盘失败时磁盘上的记录保持原样");

      await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
      await page.click("#sheetFooter .btn.danger");
      await page.waitForTimeout(700);
      const after = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.length);
      t.eq(after, 0, "写盘恢复后可以正常删除");
    },
  },

  {
    // 规格：放弃草稿时写盘失败 → 草稿回到丢弃前的状态，不提示成功
    name: "data · 放弃草稿时写盘失败可回滚",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [], drafts: {
          "w1@2026-01-05": {
            key: "w1@2026-01-05", dayId: "w1", date: "2026-01-05", startedAt: Date.now() - 6e5,
            elapsedMs: 6e5, lastResumedAt: null, touched: true, rir: 2, pain: 0, note: "",
            moves: [{ index: 0, name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }],
          },
        } }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(600);

      await page.evaluate(() => {
        window.__setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); };
      });
      await page.locator("#view .row-drop").first().click();
      await page.waitForTimeout(600);
      const toast = (await page.locator("#toast").innerText()).trim();
      t.ok(toast.includes("存储失败"), "提示写盘失败：" + toast);
      t.ok(!toast.includes("已放弃草稿"), "不提示放弃成功：" + toast);
      const keys = await page.evaluate(() =>
        Object.keys(JSON.parse(localStorage.getItem("gym4.db.v1")).drafts));
      t.eq(keys.join(","), "w1@2026-01-05", "写盘失败时草稿还在");
    },
  },

  {
    // 规格：空闲时另一标签页删除记录 → 本标签页同步到删除后的数据
    name: "data · 空闲时另一标签页删除记录会同步",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [
          { id: "s1", dayId: "w1", date: "2026-01-05", durationMin: 30, rir: 2, maxPain: 0, note: "",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] },
        ], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(600);
      t.eq(await page.locator("#view .row-tap").count(), 1, "A 的历史列表里有这条记录");

      const other = await page.context().newPage();
      await other.goto(base, { waitUntil: "networkidle" });
      await other.waitForTimeout(400);
      await other.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [], drafts: {} }));
      });
      await page.waitForTimeout(1200);

      t.eq(await page.locator("#view .row-tap").count(), 0, "A 的历史列表去掉了被删除的记录");
      const txt = await page.locator("#view").innerText();
      t.ok(txt.includes("格式异常") || txt.includes("还没有记录"), "页面按删除后的状态渲染：" + txt.slice(0, 20));

      // A 随后触发一次写盘（开一个草稿），被删除的记录不该被写回来
      await page.evaluate(async () => {
        const m = await import("./js/log.js");
        m.openWorkout("w1", "2026-01-05");
      });
      await page.waitForTimeout(700);
      const ids = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.map(s => s.id));
      t.eq(ids.length, 0, "A 后续写盘不会把被删除的记录写回来：" + JSON.stringify(ids));

      await other.close();
    },
  },

  {
    // 规格：隔夜后继续草稿，单次并入的间隔不超过 2 小时
    name: "workout · 隔夜后继续草稿不超过 2 小时上限",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [], drafts: {
          "w1@2026-01-05": {
            key: "w1@2026-01-05", dayId: "w1", date: "2026-01-05", startedAt: Date.now() - 6e5,
            elapsedMs: 600000,                    // 已累计 10 分钟
            lastResumedAt: Date.now() - 8 * 3600 * 1000,  // 8 小时前被中断
            touched: true, rir: 2, pain: 0, note: "",
            moves: [{ index: 0, name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }],
          },
        } }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(600);
      await page.locator("#view .row-tap").first().click();
      await page.waitForTimeout(800);

      const shown = (await page.locator("#woDockTimer").innerText()).trim();
      const sec = toSec(shown);
      t.ok(sec <= 600 + 7200 + 15, "整夜中断只补 2 小时上限（10 分钟 + 2 小时）：" + shown);
      t.ok(sec >= 600 + 7200 - 15, "确实补到了 2 小时上限：" + shown);
      t.ok(sec < 600 + 8 * 3600, "没有把整夜都算成训练时长：" + shown);
    },
  },

  {
    // 规格：未来周不占据容量图的 12 个槽位
    name: "progress · 未来周不挤占容量图槽位",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      const r = await page.evaluate(async () => {
        const m = await import("./js/progress.js");
        const z = n => String(n).padStart(2, "0");
        const monday = w => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - w * 7);
          return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };
        const future = new Date(); future.setDate(future.getDate() + 14);
        const mk = (id, date, weight) => ({ id, dayId: "w1", date, durationMin: 30, rir: 2, maxPain: 0, note: "",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: String(weight), reps: "10", done: true }] }] });
        const sessions = [];
        for (let i = 0; i < 12; i++) sessions.push(mk("p" + i, monday(i), 80));
        sessions.push(mk("future", future.getFullYear() + "-" + z(future.getMonth() + 1) + "-" + z(future.getDate()), 999));
        const counted = m.countableSessions(sessions);
        const agg = m.aggregateByWeek(counted, 12);
        return {
          counted: counted.length, weeks: agg.length,
          futureInChart: agg.some(x => x.value === 9990),
          weeksWithData: agg.filter(x => x.value > 0).length,
        };
      });
      t.eq(r.counted, 12, "未来周的记录被过滤掉");
      t.eq(r.weeks, 12, "槽位仍是 12 个");
      t.ok(!r.futureInChart, "未来周的容量没有进图");
      t.eq(r.weeksWithData, 12, "12 个真实训练周都按序显示");
    },
  },

  {
    // 规格：历史列表只列可用记录，全部不可用时给出残缺提示
    name: "session · 全部记录都不可用",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [
          { id: "b1", dayId: "w1", date: "2026-01-01", durationMin: 40, rir: 2, maxPain: 0, note: "" },
          { id: "b2", dayId: "w2", date: "2026-01-02", durationMin: 40, rir: 2, maxPain: 0, note: "" },
        ], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(700);

      const txt = await page.locator("#view").innerText();
      t.ok(txt.includes("有 2 条记录格式异常已跳过"), "残缺去向有明确提示：" + txt.slice(0, 40));
      t.eq(await page.locator("#view .row-tap").count(), 0, "历史列表为空（没有可列的记录）");
    },
  },

  {
    // 规格：草稿的 RIR 缺失或不是有效数字时取默认值 2
    name: "draft · RIR 缺失或非法时取默认值",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      for (const draft of [
        { key: "w1@2026-01-05", dayId: "w1", date: "2026-01-05", rir: "abc" },
        { key: "w2@2026-01-06", dayId: "w2", date: "2026-01-06" },
      ]) {
        await page.evaluate(d => {
          localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [], drafts: {
            [d.key]: Object.assign({
              startedAt: Date.now() - 6e5, elapsedMs: 6e5, lastResumedAt: null, touched: true,
              pain: 0, note: "",
              moves: [{ index: 0, name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }],
            }, d),
          } }));
        }, draft);
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(500);
        await page.click('.nav-btn[data-tab="log"]');
        await page.waitForTimeout(600);
        await page.locator("#view .row-tap").first().click();
        await page.waitForTimeout(800);

        const picked = await page.locator(".wo-summary .chips").nth(0).locator(".pick.on").allInnerTexts();
        t.eq(picked.join(","), "RIR 2", draft.key + " 的 RIR 取默认值 2：" + picked.join(","));

        await page.click("#woFinishBtn");
        await page.waitForTimeout(900);
        const rec = await page.evaluate(() => JSON.parse(localStorage.getItem("gym4.db.v1")).sessions[0]);
        t.eq(typeof rec.rir, "number", "写入记录的 RIR 是数字");
        t.eq(rec.rir, 2, "写入记录的 RIR 是 2");
      }
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
          document.querySelectorAll('.check, .nav-btn, .daychip, .pick, .btn, .row-tap, .row-drop').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && (r.width < 44 || r.height < 44)) {
              out.push(`${el.className.split(" ")[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
            }
          });
          return out;
        });
        t.ok(small.length === 0, `[${scheme}] 触摸目标均 ≥44px${small.length ? ": " + small.join(", ") : ""}`);

        // 文字对比度 ≥4.5:1（含此前漏检的嵌套 span 与告警卡；.appbar-title 也纳入扫描）
        const sel = ".move-tip, .card-sub, .row-sub, .stat span, .stat b, .section-h, .move-meta, .set-head, .prev, .field-label, .card-title, .row-title, .text-danger-strong, .card-warn .card-sub, .card-warn .card-title, .appbar-title";
        const lowContrast = await page.evaluate(contrastScan, sel);
        t.ok(lowContrast.length === 0, `[${scheme}] 文字对比度达标${lowContrast.length ? ": " + lowContrast.join(", ") : ""}`);

        // 进度页同样要过（告警卡在深色主题下曾经是白底浅字）
        await page.click('.nav-btn[data-tab="progress"]');
        await page.waitForTimeout(600);
        const lowContrast2 = await page.evaluate(contrastScan, sel);
        t.ok(lowContrast2.length === 0, `[${scheme}] 进度页文字对比度达标${lowContrast2.length ? ": " + lowContrast2.join(", ") : ""}`);
        // 统计数值单独断言：它曾是渐变裁剪文字（color 为 transparent），扫描读不到
        const statLow = await page.evaluate(contrastScan, ".stat b");
        t.ok(statLow.length === 0, `[${scheme}] 统计数值对比度达标${statLow.length ? ": " + statLow.join(", ") : ""}`);
        // 渐变裁剪文字的 color 计算值是 transparent，扫描会把它当成黑字算出假的高对比度，
        // 所以先确认它用的是实色
        const statColor = await page.evaluate(() => {
          const el = document.querySelector(".stat b");
          return el ? getComputedStyle(el).color : "";
        });
        t.ok(statColor && !/rgba\(.*,\s*0\)/.test(statColor), `[${scheme}] 统计数值用实色而非渐变裁剪（color=${statColor}）`);
        // 应用栏标题曾是渐变裁剪文字：滚动后浅色主题实测掉到 2.54:1，必须用实色
        const appbarColor = await page.evaluate(() => {
          const el = document.querySelector(".appbar-title");
          return el ? getComputedStyle(el).color : "";
        });
        t.ok(appbarColor && !/rgba\(.*,\s*0\)/.test(appbarColor), `[${scheme}] 应用栏标题用实色而非渐变裁剪（color=${appbarColor}）`);
        t.ok(await page.locator(".card-warn").count() >= 1, `[${scheme}] 疼痛告警卡存在`);

        // 导航语义
        t.eq(await page.getAttribute(".nav-btn.active", "aria-current"), "page", `[${scheme}] 当前页有 aria-current`);

        // 主题切换可用
        await page.click("#themeBtn");
        await page.waitForTimeout(350);
        const mode = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
        t.ok(["light", "dark"].includes(mode), `[${scheme}] 主题按钮可切换 (→${mode})`);

        // 无全局污染
        t.eq(await page.evaluate(() => typeof window.PLAN), "undefined", `[${scheme}] 无 window 全局泄漏`);
      }

      // 训练中的读屏播报
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      t.eq(await page.getAttribute("#toast", "role"), "status", "toast 有 role=status");
      await openDay(page, "w1");
      t.eq(await page.getAttribute("#woSub", "aria-live"), "polite", "训练进度有 aria-live");
      t.ok((await page.getAttribute(".ring", "aria-label") || "").includes("组"), "进度环有可读标签");
      await page.locator("#view .check").nth(0).click();
      await page.waitForTimeout(300);
      t.ok((await page.getAttribute(".ring", "aria-label") || "").includes("1"), "勾选后读屏标签更新");
    },
  },

  {
    // 弹层声明了 aria-modal="true"，但焦点在弹层之外时按 Tab 会跑到背后的页面。
    name: "a11y · 弹层焦点不逸出",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.locator('.daychip[data-day="w1"]').click();
      await page.waitForTimeout(500);
      const opened = await page.evaluate(() => document.getElementById("sheet").contains(document.activeElement));
      t.ok(opened, "弹层打开后焦点在弹层内");

      // 把焦点移到弹层背后的页面元素上（#view 在 #sheet 之前，默认 Tab 不会进弹层）
      await page.evaluate(() => {
        const el = document.querySelector("#view button, #view .daychip");
        if (el) el.focus();
      });
      const outside = await page.evaluate(() => document.getElementById("sheet").contains(document.activeElement));
      t.ok(!outside, "焦点已移到弹层之外的页面元素上");

      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);
      const inside = await page.evaluate(() => document.getElementById("sheet").contains(document.activeElement));
      t.ok(inside, "按 Tab 后焦点被拉回弹层内");

      // Esc 关闭后焦点回到触发元素
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      const back = await page.evaluate(() =>
        document.activeElement === document.querySelector('.daychip[data-day="w1"]'));
      t.ok(back, "Esc 关闭后焦点回到触发元素");
    },
  },

  {
    name: "a11y · 首屏浏览器栏颜色跟随主题",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      const src = await page.evaluate(async () => (await fetch("index.html")).text());
      const inline = (src.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
      t.ok(inline.includes("theme-color"), "首屏内联脚本里设置了 theme-color（不只是静态 meta 标签）");
      const meta = await page.evaluate(() => {
        const m = document.querySelector('meta[name="theme-color"]');
        return { content: m && m.getAttribute("content"), theme: document.documentElement.getAttribute("data-theme") };
      });
      t.ok(meta.content, "页面里有 theme-color meta：" + meta.content);
      const want = meta.theme === "dark" ? "#080d16" : "#eef2f8";
      t.eq(meta.content, want, "theme-color 与当前主题一致");
    },
  },

  {
    name: "chart · 数据多时仍可读",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(SEED_BIG);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="progress"]');
      await page.waitForTimeout(900);

      const agg = await page.evaluate(async () => {
        const m = await import("./js/progress.js");
        const db = JSON.parse(localStorage.getItem("gym4.db.v1"));
        const wide = m.aggregateByWeek(db.sessions, 999);
        const shown = m.aggregateByWeek(db.sessions, 12);
        const total = db.sessions.reduce((a, s) => a + s.moves.reduce((b, mv) =>
          b + mv.sets.reduce((c, st) => c + (st.done ? (+st.weight || 0) * (+st.reps || 0) : 0), 0), 0), 0);
        return {
          shownWeeks: shown.length, wideWeeks: wide.length,
          shownSum: shown.reduce((a, x) => a + x.value, 0),
          wideSum: wide.reduce((a, x) => a + x.value, 0), total,
          canvases: document.querySelectorAll("canvas").length,
        };
      });
      t.eq(agg.shownWeeks, 12, `容量图固定画 ${agg.shownWeeks} 个自然周`);
      t.eq(agg.wideSum, agg.total, "按周聚合后总容量守恒");
      t.ok(agg.shownSum < agg.total, "12 周窗口只含窗口内的容量");
      t.eq(agg.canvases, 2, "进度页两张图");

      // 柱宽不能窄到看不见：直接量 canvas 像素（复算公式量的是被测代码自己，不是渲染结果）
      const geo = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        const ctx = c.getContext("2d");
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const w = c.width, h = c.height;
        const colH = [];
        for (let x = 0; x < w; x++) {
          let n = 0;
          for (let y = 0; y < h; y++) { if (d[(y * w + x) * 4 + 3] > 20) n++; }
          colH.push(n);
        }
        // 网格线只有 1px 高，柱子是实心高柱：按最大列高的一半取阈值
        const thresh = Math.max(...colH) * 0.5;
        let best = 0, run = 0;
        for (let x = 0; x < w; x++) {
          if (colH[x] > thresh) { run++; best = Math.max(best, run); } else run = 0;
        }
        const dpr = window.devicePixelRatio || 1;
        return { bufW: w, cssW: c.clientWidth, barW: +(best / dpr).toFixed(1) };
      });
      t.ok(geo.barW >= 3, `柱宽 ${geo.barW}px ≥ 3px（canvas ${geo.bufW}px 缓冲 / ${geo.cssW}px CSS）`);

      // 深色主题下不能再出现整条近白网格线
      await page.evaluate(() => localStorage.setItem("gym4.theme", "dark"));
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="progress"]');
      await page.waitForTimeout(800);
      const bright = await page.evaluate(() => {
        let n = 0;
        document.querySelectorAll("canvas").forEach(c => {
          const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
          for (let i = 0; i < d.length; i += 4) {
            if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 220) n++;
          }
        });
        return n;
      });
      t.ok(bright < 100, `深色主题下 canvas 近白像素 ${bright} 个（网格线已改用主题色）`);
    },
  },

  {
    // 容量图取数窗口：截至本周的最近 12 个自然周，空周记 0；
    // 窗口内完全没有训练时回退到最近 12 个有训练的周，保证图表不为空。
    name: "chart · 周窗口与停训空档",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      const r = await page.evaluate(async () => {
        const m = await import("./js/progress.js");
        const z = n => String(n).padStart(2, "0");
        const monday = w => {
          const d = new Date();
          d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - w * 7);
          return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
        };
        const mk = (w, weight) => ({ id: "s" + w, dayId: "w1", date: monday(w), durationMin: 30,
          rir: 2, maxPain: 0, note: "",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: String(weight), reps: "10", done: true }] }] });
        // 最近 12 周里跳过 3 周（停训）
        const gap = [];
        for (let i = 0; i < 12; i++) { if (i !== 2 && i !== 5 && i !== 9) gap.push(mk(i, 80)); }
        const agg = m.aggregateByWeek(gap, 12);
        // 全部训练都在 12 周窗口之外
        const old = [mk(20, 80), mk(21, 90)];
        const fallback = m.aggregateByWeek(old, 12);
        return {
          len: agg.length,
          zeros: agg.filter(x => x.value === 0).length,
          nonZero: agg.filter(x => x.value > 0).length,
          fallbackLen: fallback.length,
          fallbackHasData: fallback.some(x => x.value > 0),
        };
      });
      t.eq(r.len, 12, "容量图的窗口是 12 个自然周");
      t.eq(r.zeros, 3, "停训的三周在图上是 0（而不是被跳过）：" + r.zeros);
      t.eq(r.nonZero, 9, "有训练的 9 周照常显示");
      t.ok(r.fallbackLen > 0, "窗口内没有训练时图表不为空：" + r.fallbackLen);
      t.ok(r.fallbackHasData, "回退后仍能看到更早的训练");
    },
  },

  {
    // canvas 的位图缓冲只在绘制时算一次，窗口尺寸变化后会被 CSS 拉伸变形。
    name: "chart · 视口变化后图表重绘",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [
          { id: "s1", dayId: "w1", date: new Date().toISOString().slice(0, 10), durationMin: 30,
            rir: 2, maxPain: 0, note: "",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "10", done: true }] }] },
        ], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="progress"]');
      await page.waitForTimeout(900);

      const before = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        return { cw: c.clientWidth, w: c.width, dpr: window.devicePixelRatio };
      });
      await page.setViewportSize({ width: 760, height: 844 });
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        return { cw: c.clientWidth, w: c.width, dpr: window.devicePixelRatio };
      });
      t.ok(after.cw !== before.cw, "视口宽度确实变了：" + before.cw + " → " + after.cw);
      t.ok(after.w !== before.w, "canvas 的位图缓冲被重建：" + before.w + " → " + after.w);
      t.eq(after.w, Math.round(after.cw * after.dpr), "位图缓冲与 CSS 宽度匹配（不被拉伸）");
    },
  },

  {
    name: "progress · 未来日期不进统计",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      // 三条记录：3 天前、今天、7 天后（日期在页面内现算，用例不假设具体日期）
      await page.evaluate(() => {
        const z = n => String(n).padStart(2, "0");
        const ds = off => { const d = new Date(); d.setDate(d.getDate() + off);
          return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };
        const mk = (id, date, w) => ({ id, dayId: "w1", date, durationMin: 30, maxPain: 0, rir: 2, note: "",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: String(w), reps: "10", done: true }] }] });
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [
          mk("past", ds(-3), 80), mk("today", ds(0), 90), mk("future", ds(7), 999),
        ], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.click('.nav-btn[data-tab="progress"]');
      await page.waitForTimeout(600);

      const stats = await page.locator(".stat b").allInnerTexts();
      t.eq(stats[1], "2", "累计训练不含未来日期记录：" + stats.join(" / "));
      t.eq(stats[2], "1.7t", "累计容量只含过去与今天（未来 999×10 被排除）：" + stats[2]);

      // 图表数据口径：countableSessions 过滤后再聚合，未来周不占槽位
      const agg = await page.evaluate(async () => {
        const m = await import("./js/progress.js");
        const db = JSON.parse(localStorage.getItem("gym4.db.v1"));
        const counted = m.countableSessions(db.sessions);
        const weeks = m.aggregateByWeek(counted, 999);
        return { counted: counted.length, sum: weeks.reduce((a, x) => a + x.value, 0) };
      });
      t.eq(agg.counted, 2, "countableSessions 过滤掉未来记录");
      t.eq(agg.sum, 1700, "图表数据总容量只含过去与今天");

      // 历史列表不受过滤影响，未来记录仍可查看
      await page.click('.nav-btn[data-tab="log"]');
      await page.waitForTimeout(500);
      t.eq(await page.locator("#view .row-tap").count(), 3, "记录页历史列表仍显示未来日期的记录");

      // 开始表单日期上限：max 是今天；程序化塞未来日期提交被拒
      const maxInfo = await page.evaluate(() => {
        const inp = document.querySelector("#view input[type=date]");
        const z = n => String(n).padStart(2, "0");
        const d = new Date();
        return { max: inp && inp.max, today: d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) };
      });
      t.eq(maxInfo.max, maxInfo.today, "开始表单日期输入的 max 是今天");
      await page.evaluate(() => {
        const inp = document.querySelector("#view input[type=date]");
        const d = new Date(); d.setDate(d.getDate() + 1);
        const z = n => String(n).padStart(2, "0");
        inp.value = d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
      });
      await clearToast(page);
      await page.click("#view .btn.solid.full");
      await page.waitForTimeout(500);
      t.eq(await page.locator(".wo-summary").count(), 0, "未来日期不被提交，未进入训练页");
      t.ok((await page.locator("#toast").innerText()).includes("不能晚于今天"), "给出可读提示");

      // 补记过去的日期仍可用
      await page.evaluate(() => {
        const inp = document.querySelector("#view input[type=date]");
        const d = new Date(); d.setDate(d.getDate() - 3);
        const z = n => String(n).padStart(2, "0");
        inp.value = d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
      });
      await page.click("#view .btn.solid.full");
      await page.waitForTimeout(500);
      t.eq(await page.locator(".wo-summary").count(), 1, "过去日期可以正常开始补记");
    },
  },

  {
    // 计划页的「已练 N 次」徽标与进度页口径必须一致：未来日期的记录不计入。
    name: "progress · 计划页已练次数不计入未来记录",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        const z = n => String(n).padStart(2, "0");
        const ds = off => { const d = new Date(); d.setDate(d.getDate() + off);
          return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };
        const mk = (id, date) => ({ id, dayId: "w1", date, durationMin: 30, rir: 2, maxPain: 0, note: "",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] });
        localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [
          mk("future", ds(7)), mk("past", ds(-3)),
        ], drafts: {} }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.click('.nav-btn[data-tab="plan"]');
      await page.waitForTimeout(600);

      const badges = await page.locator(".card .badge.primary").allInnerTexts();
      const w1 = badges.filter(b => b.includes("已练"));
      // 种子有 1 条过去 + 1 条未来的记录：徽标只能算过去的这条
      t.eq(w1.join(","), "已练 1 次", "计划页不把未来日期的记录算进「已练 N 次」：" + JSON.stringify(badges));

      // 进度页同样不计入，两个页面口径一致
      await page.click('.nav-btn[data-tab="progress"]');
      await page.waitForTimeout(600);
      const stats = await page.locator(".stat b").allInnerTexts();
      t.eq(stats[1], "1", "进度页累计训练同样只算过去与今天的记录：" + stats.join(" / "));
    },
  },

  {
    name: "progress · 空态仍可导入备份",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });

      // 本地一条记录都没有：空态必须留有导入入口，
      // 否则清缓存/换设备后手里的备份没地方导入
      await page.evaluate(() => localStorage.setItem("gym4.db.v1", JSON.stringify({ sessions: [], drafts: {} })));
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.click('.nav-btn[data-tab="progress"]');
      await page.waitForTimeout(500);

      const emptyBtns = await page.evaluate(() =>
        [...document.querySelectorAll("#view button")].map(b => b.innerText.trim()));
      t.ok(emptyBtns.some(b => b.includes("导入")), "空库时进度页有导入入口：" + JSON.stringify(emptyBtns));
      t.ok(!emptyBtns.some(b => b.includes("导出")), "空库时没有可导出的内容，不给导出按钮");

      // 真的走一次导入：备份文件 → 记录写入 → 统计按备份渲染
      const fsMod = require("fs");
      const backupFile = path.join("/tmp", `gym4-empty-import-${process.pid}.json`);
      fsMod.writeFileSync(backupFile, JSON.stringify({
        sessions: [{ id: "imp1", dayId: "w1", date: "2026-01-05", durationMin: 40, maxPain: 0, rir: 2, note: "",
          moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] }],
        drafts: {},
      }));
      // 导入前的覆盖确认框：原文必须说明草稿也会被替换（只说记录会误导）
      page.removeAllListeners("dialog");
      let impDialogMsg = "";
      page.on("dialog", d => { impDialogMsg = d.message(); d.accept(); });
      const [fc] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.click('#view button:has-text("导入备份")'),
      ]);
      await fc.setFiles(backupFile);
      await page.waitForTimeout(700);
      t.ok(impDialogMsg.includes("草稿"), "覆盖确认里说明了草稿也会被替换：" + impDialogMsg);
      const imported = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gym4.db.v1")).sessions.map(s => s.id));
      t.eq(imported.length, 1, "空库也能成功导入备份");
      t.eq(imported[0], "imp1", "导入的是备份里的记录");
      t.ok((await page.locator("#view .stat").count()) >= 3, "导入后进度页按备份渲染统计");
      fsMod.unlinkSync(backupFile);

      // 记录全都被过滤（结构异常）：不得说「还没有数据」，且仍要有导入入口
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [
            { id: "b1", dayId: "w1", date: "2026-01-01", durationMin: 40 },
            { id: "b2", dayId: "w2", date: "2026-01-02", durationMin: 40 },
          ], drafts: {},
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.click('.nav-btn[data-tab="progress"]');
      await page.waitForTimeout(500);
      const brokenText = await page.locator("#view").innerText();
      t.ok(!brokenText.includes("还没有数据"), "记录格式异常时不显示「还没有数据」");
      t.ok(brokenText.includes("格式异常"), "说明是格式异常：" + brokenText.replace(/\s+/g, " ").slice(0, 60));
      t.ok((await page.locator('#view button:has-text("导入备份")').count()) === 1, "全坏数据时导入入口仍在");

      // 记录本身完好、只是日期都在未来：同样不得说「还没有数据」
      await page.evaluate(() => {
        const z = n => String(n).padStart(2, "0");
        const d = new Date(); d.setDate(d.getDate() + 7);
        const future = d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [{ id: "f1", dayId: "w1", date: future, durationMin: 40, maxPain: 0, rir: 2, note: "",
            moves: [{ name: "坐姿推胸机", sets: [{ weight: "80", reps: "9", done: true }] }] }],
          drafts: {},
        }));
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.click('.nav-btn[data-tab="progress"]');
      await page.waitForTimeout(500);
      const futureText = await page.locator("#view").innerText();
      t.ok(!futureText.includes("还没有数据"), "记录日期都在未来时不显示「还没有数据」");
      t.ok(futureText.includes("晚于今天"), "说明是日期晚于今天：" + futureText.replace(/\s+/g, " ").slice(0, 60));
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

      // 预缓存清单要覆盖所有运行时文件，新增文件漏加会在这里暴露
      const swSrc = await page.evaluate(async () => (await fetch("sw.js")).text());
      const assets = (swSrc.match(/var ASSETS = \[([\s\S]*?)\];/) || [, ""])[1]
        .split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
      // 运行时文件从磁盘枚举（写死列表的话，新增文件漏加 ASSETS 仍会绿）
      const fsMod = require("fs");
      const pathMod = require("path");
      const runtime = ["/", "/index.html", "/style.css", "/data.js", "/app.js", "/manifest.json"];
      for (const dir of ["js", "fonts", "icons"]) {
        for (const f of fsMod.readdirSync(pathMod.join(ROOT, dir))) {
          if (f.endsWith(".js") || f.endsWith(".woff2") || f.endsWith(".png") || f.endsWith(".svg")) {
            runtime.push("/" + dir + "/" + f);
          }
        }
      }
      const missing = runtime.filter(f => !assets.some(a => a === "." + f || a === "." + f.replace(/\/$/, "/")));
      t.eq(missing.length, 0, `预缓存清单覆盖全部运行时文件${missing.length ? "，漏了 " + missing.join(", ") : ""}`);

      // 清单里的每条路径都要真的能取到：addAll 遇到一条失效就整批失败，
      // 离线能力会静默消失，而上面的清单比对挡不住失效条目
      const badPaths = await page.evaluate(async (list) => {
        const out = [];
        for (const a of list) {
          const url = a === "./" ? location.href.replace(/[^/]*$/, "") : location.href.replace(/[^/]*$/, "") + a.replace(/^\.\//, "");
          try {
            const res = await fetch(url);
            if (!res.ok) out.push(a + " → " + res.status);
          } catch (e) { out.push(a + " → " + e.message); }
        }
        return out;
      }, assets);
      t.eq(badPaths.length, 0, `预缓存清单里每条路径都能取到${badPaths.length ? "，失效: " + badPaths.join(", ") : ""}`);

      const plan = await todayPlan(page);
      await page.context().setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(900);
      t.eq(await page.locator(".hero h2").innerText().catch(() => "FAIL"), plan.name, "断网后仍能打开");
      t.eq(await page.locator(".daychip").count(), 7, "断网后周安排正常");
      await page.context().setOffline(false);
    },
  },

  {
    // 缓存清理只能删本应用的：Cache Storage 按 origin 隔离，
    // 同 origin 上其他应用（旧版 CACHE 名）的缓存不属于本应用，删掉会让对方离线失效
    name: "offline · 缓存清理只影响本应用",
    async run(page, t, base) {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.waitForFunction(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return r && r.active && r.active.state === "activated";
      }, null, { timeout: 30000 });
      await page.waitForTimeout(1500);

      const cur = await page.evaluate(async () => {
        const k = await caches.keys();
        return k.find(x => x.indexOf("gym4-") === 0) || null;
      });
      t.ok(cur, "本应用缓存已建立：" + cur);

      // 造两个缓存：其他应用的 + 本应用的旧版本
      await page.evaluate(async () => {
        const other = await caches.open("other-app-v1");
        await other.put("/other", new Response("other-app-data"));
        const old = await caches.open("gym4-v01");
        await old.put("/old", new Response("old"));
      });

      // 换 script URL 重新注册，触发一次新的 install → activate
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.register("sw.js?probe=2");
        await navigator.serviceWorker.ready;
        const w = reg.installing || reg.waiting || reg.active;
        if (w && w.state !== "activated") {
          await new Promise(res => {
            const h = () => { if (w.state === "activated") { w.removeEventListener("statechange", h); res(); } };
            w.addEventListener("statechange", h);
          });
        }
      });
      await page.waitForTimeout(1500);

      const keys = await page.evaluate(() => caches.keys());
      t.ok(keys.includes("other-app-v1"), "其他应用的缓存没有被删：" + JSON.stringify(keys));
      const otherData = await page.evaluate(async () => {
        const c = await caches.open("other-app-v1");
        const r = await c.match("/other");
        return r ? await r.text() : "MISSING";
      });
      t.eq(otherData, "other-app-data", "其他应用的缓存内容未被改动");
      t.ok(!keys.includes("gym4-v01"), "本应用的旧版本缓存被清理：" + JSON.stringify(keys));
      t.ok(keys.includes(cur), "本应用当前版本的缓存保留");
    },
  },

  {
    // scripts/serve.js 与本文件自带服务器的健壮性：畸形 URL 不打崩、路径穿越被拒
    name: "devserver · 本地开发服务器",
    async run(page, t, base) {
      const { spawn } = require("child_process");
      const httpRequest = require("http").request;
      const get = (port, p) => new Promise(resolve => {
        const req = httpRequest({ host: "127.0.0.1", port, path: p }, res => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        });
        req.on("error", e => resolve("ERR:" + e.message.split(" ")[0]));
        req.end();
      });

      // —— scripts/serve.js：非法 percent-encoding 返回 400，进程不退出 ——
      const port = 9781 + (process.pid % 200);
      const child = spawn("node", [path.join(ROOT, "scripts", "serve.js"), String(port)]);
      let childExited = false;
      child.on("exit", () => { childExited = true; });
      await new Promise(r => setTimeout(r, 700));

      t.eq(await get(port, "/%"), 400, "serve.js：非法编码路径返回 400");
      t.ok(!childExited, "serve.js：畸形请求后进程没有退出");
      t.eq(await get(port, "/index.html"), 200, "serve.js：畸形请求之后服务仍可用");
      t.eq(await get(port, "/../" + path.basename(ROOT) + "-probe/x"), 403,
        "serve.js：同前缀兄弟目录被 403 拒绝");
      child.kill();

      // —— 测试运行器自带服务器：同一目录边界与 400 行为 ——
      const altPort = 10100 + (process.pid % 100);
      const s2 = await serve(ROOT, altPort);
      t.eq(await get(altPort, "/../" + path.basename(ROOT) + "-probe/x"), 403,
        "测试服务器：同前缀兄弟目录被 403 拒绝");
      t.eq(await get(altPort, "/%"), 400, "测试服务器：非法编码路径返回 400");
      t.eq(await get(altPort, "/index.html"), 200, "测试服务器：正常文件可访问");
      s2.close();
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

  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.error(
      "\n  启动 Chromium 失败：" + e.message.split("\n")[0] + "\n" +
      "  请安装浏览器（仅开发用，App 本身零依赖）：\n" +
      "    mkdir -p /tmp/pwtest && cd /tmp/pwtest && npm i playwright@1\n" +
      "    PLAYWRIGHT_BROWSERS_PATH=/tmp/pwbrowsers npx playwright install chromium\n" +
      "  或把 PLAYWRIGHT_BROWSERS_PATH 指向已安装浏览器的目录。\n"
    );
    if (server) server.close();
    process.exit(2);
  }
  const t = new Assert();
  let errored = false;

  for (const suite of SUITES) {
    if (filter && !suite.name.includes(filter)) continue;
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: "zh-CN",
      timezoneId: TZ,
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
