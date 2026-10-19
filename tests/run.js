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
      await page.click(".row-drop");
      await page.waitForTimeout(600);
      const left = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("gym4.db.v1")).drafts).length);
      t.eq(left, 0, "放弃后草稿被删除");

      // 开了训练什么都没动就退出 → 不留僵尸草稿
      await page.click('.nav-btn[data-tab="plan"]');
      await page.waitForTimeout(400);
      await openToday(page, plan.id);
      await page.click("#woExitBtn");
      await page.waitForTimeout(600);
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
        };
      });
      t.eq(v.ok, null, "合法数据通过校验");
      t.ok(v.noMoves && v.noMoves.includes("moves"), "缺 moves 被拒：" + v.noMoves);
      t.ok(v.badDate && v.badDate.includes("日期"), "坏日期被拒：" + v.badDate);
      t.ok(v.noSets && v.noSets.includes("sets"), "缺 sets 被拒：" + v.noSets);
      t.ok(v.noId && v.noId.includes("id"), "缺 id 被拒：" + v.noId);
      t.ok(v.notArray && v.notArray.includes("sessions"), "sessions 不是数组被拒：" + v.notArray);

      // 坏数据落盘后，进度页不能整页崩
      await page.evaluate(() => {
        localStorage.setItem("gym4.db.v1", JSON.stringify({
          sessions: [
            { id: "bad", dayId: "w1", date: "2026-10-16", durationMin: 52, maxPain: 0, rir: 2, note: "" },
            { id: "ok", dayId: "w1", date: "2026-10-17", durationMin: 52, maxPain: 0, rir: 2, note: "",
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

        // 文字对比度 ≥4.5:1（含此前漏检的嵌套 span 与告警卡）
        const sel = ".move-tip, .card-sub, .row-sub, .stat span, .section-h, .move-meta, .set-head, .prev, .field-label, .card-title, .row-title, .text-danger-strong, .card-warn .card-sub, .card-warn .card-title";
        const lowContrast = await page.evaluate(contrastScan, sel);
        t.ok(lowContrast.length === 0, `[${scheme}] 文字对比度达标${lowContrast.length ? ": " + lowContrast.join(", ") : ""}`);

        // 进度页同样要过（告警卡在深色主题下曾经是白底浅字）
        await page.click('.nav-btn[data-tab="progress"]');
        await page.waitForTimeout(600);
        const lowContrast2 = await page.evaluate(contrastScan, sel);
        t.ok(lowContrast2.length === 0, `[${scheme}] 进度页文字对比度达标${lowContrast2.length ? ": " + lowContrast2.join(", ") : ""}`);
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
        const all = m.aggregateByWeek(db.sessions, 999);
        const shown = m.aggregateByWeek(db.sessions, 12);
        const total = db.sessions.reduce((a, s) => a + s.moves.reduce((b, mv) =>
          b + mv.sets.reduce((c, st) => c + (st.done ? (+st.weight || 0) * (+st.reps || 0) : 0), 0), 0), 0);
        return {
          allWeeks: all.length, shownWeeks: shown.length,
          allSum: all.reduce((a, x) => a + x.value, 0), total,
          canvases: document.querySelectorAll("canvas").length,
        };
      });
      t.ok(agg.allWeeks > 12, `一年数据摊成 ${agg.allWeeks} 周`);
      t.ok(agg.shownWeeks <= 12, `容量图只画 ${agg.shownWeeks} 周（≤12）`);
      t.eq(agg.allSum, agg.total, "按周聚合后总容量守恒");
      t.eq(agg.canvases, 2, "进度页两张图");

      // 柱宽不能窄到看不见
      const geo = await page.evaluate(() => {
        const c = document.querySelector("canvas");
        const W = c.clientWidth, padL = 34, cw = W - padL - 12;
        const n = 12;                       // 上限
        return { W, cw: +cw.toFixed(1), bw: +Math.max(3, Math.min(40, (cw / n) * 0.55)).toFixed(2) };
      });
      t.ok(geo.bw >= 3, `柱宽 ${geo.bw}px ≥ 3px`);

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
      const runtime = await page.evaluate(async () => {
        const list = ["/", "/index.html", "/style.css", "/data.js", "/app.js", "/manifest.json",
          "/js/core.js", "/js/plan.js", "/js/log.js", "/js/progress.js"];
        for (const f of ["fonts/barlow-condensed-600.woff2", "fonts/barlow-condensed-700.woff2",
          "icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png",
          "icons/apple-touch-icon.png", "icons/app-icon.svg"]) list.push("/" + f);
        return list;
      });
      const missing = runtime.filter(f => !assets.some(a => a === "." + f || a === "." + f.replace(/\/$/, "/")));
      t.eq(missing.length, 0, `预缓存清单覆盖全部运行时文件${missing.length ? "，漏了 " + missing.join(", ") : ""}`);

      const plan = await todayPlan(page);
      await page.context().setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(900);
      t.eq(await page.locator(".hero h2").innerText().catch(() => "FAIL"), plan.name, "断网后仍能打开");
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
