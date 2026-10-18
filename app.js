/* 铁馆计划 —— 纯前端 PWA，无构建、无依赖 */
(function () {
  "use strict";

  var PLAN = window.PLAN;
  var DB_KEY = "gym4.db.v1";
  var TAB = "plan";
  var view = document.getElementById("view");
  var sheet = document.getElementById("sheet");
  var sheetBody = document.getElementById("sheetBody");
  var toastEl = document.getElementById("toast");
  var subEl = document.getElementById("appbarSub");
  var bar = document.querySelector(".appbar");

  /* ---------------- 主题：auto / light / dark ---------------- */
  var THEME_KEY = "gym4.theme";
  var themeBtn = document.getElementById("themeBtn");
  var THEME_LABEL = { auto: "跟随系统", light: "浅色", dark: "深色" };

  function getTheme() {
    try { return localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { return "auto"; }
  }
  function systemDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function applyTheme(mode, announce) {
    var dark = mode === "dark" || (mode === "auto" && systemDark());
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    themeBtn.setAttribute("data-mode", mode);
    var shown = mode === "auto" ? "跟随系统（当前" + (dark ? "深色" : "浅色") + "）" : THEME_LABEL[mode];
    themeBtn.setAttribute("aria-label", "主题：" + shown + "，点击切换");
    themeBtn.title = shown;
    // 状态栏颜色同步，避免与页面配色割裂
    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", dark ? "#080d16" : "#eef2f8");
    if (announce) toast("主题：" + shown);
  }
  themeBtn.addEventListener("click", function () {
    var order = ["auto", "light", "dark"];
    var next = order[(order.indexOf(getTheme()) + 1) % order.length];
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next, true);
  });
  // auto 模式下跟随系统实时变化
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onSys = function () { if (getTheme() === "auto") applyTheme("auto", false); };
    if (mq.addEventListener) mq.addEventListener("change", onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }
  applyTheme(getTheme(), false);

  /* ---------------- 存储 ---------------- */
  function loadDB() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (!raw) return { sessions: [], drafts: {} };
      var db = JSON.parse(raw);
      if (!db.sessions) db.sessions = [];
      if (!db.drafts) db.drafts = {};
      return db;
    } catch (e) {
      return { sessions: [], drafts: {} };
    }
  }
  var db = loadDB();
  function saveDB() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      toast("存储失败：浏览器空间不足");
    }
  }

  /* ---------------- 工具 ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function dateStr(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function today() { return dateStr(new Date()); }
  function parseDate(s) {
    var p = s.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function dayById(id) {
    for (var i = 0; i < PLAN.days.length; i++) if (PLAN.days[i].id === id) return PLAN.days[i];
    return null;
  }
  // 周一=0 … 周日=6
  function weekIndex(d) { return (d.getDay() + 6) % 7; }
  function plannedDayId(d) { return PLAN.week[weekIndex(d)]; }
  function fmtDate(s) {
    var d = parseDate(s);
    return pad(d.getMonth() + 1) + "/" + pad(d.getDate());
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.add("hidden"); }, 1800);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function moveKey(di, mi) { return di + ":" + mi; }

  // 该动作在历史记录里的最近一次（按日期倒序找第一个有该动作的记录）
  // beforeDate 为"当天"时，同日已完成的训练也要参与，否则一天练两次就取不到参考值
  function lastEntry(moveName, beforeDate) {
    var list = db.sessions.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (beforeDate && s.date > beforeDate) continue;
      for (var j = 0; j < s.moves.length; j++) {
        if (s.moves[j].name === moveName) return { date: s.date, move: s.moves[j] };
      }
    }
    return null;
  }
  function sessionsOfDay(dayId) {
    return db.sessions.filter(function (s) { return s.dayId === dayId; });
  }

  /* ---------------- 草稿 ---------------- */
  function emptyMoves(day, date) {
    return day.moves.map(function (m, mi) {
      var prev = lastEntry(m.name, date);
      var t = prev && prev.move.sets.filter(function (x) { return x.done && +x.weight; })[0];
      var w = t ? t.weight : "";
      var reps = t && t.reps ? t.reps : "";
      var sets = [];
      for (var i = 0; i < m.sets; i++) sets.push({ weight: w, reps: reps, done: false });
      return { index: mi, name: m.name, sets: sets, rir: 2, pain: 0, note: "" };
    });
  }

  function getDraft(dayId, date, resume) {
    var k = dayId + "@" + date;
    var d0 = dayById(dayId);
    // "开始今天"：同一天同一训练日的新一次训练，不能续上已勾选的旧草稿
    if (!resume && db.drafts[k] && d0) {
      var c0 = countDone(db.drafts[k]);
      if (c0.done > 0) {
        return { key: k, dayId: dayId, date: date, startedAt: null, fresh: true, moves: emptyMoves(d0, date) };
      }
    }
    if (!db.drafts[k]) {
      var d = dayById(dayId);
      db.drafts[k] = { key: k, dayId: dayId, date: date, startedAt: null, moves: emptyMoves(d, date) };
    }
    return db.drafts[k];
  }
  function findMove(draft, name) {
    for (var i = 0; i < draft.moves.length; i++) if (draft.moves[i].name === name) return draft.moves[i];
    return null;
  }

  /* ---------------- 底部导航 ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll(".nav-btn"), function (b) {
    b.addEventListener("click", function () {
      TAB = b.getAttribute("data-tab");
      Array.prototype.forEach.call(document.querySelectorAll(".nav-btn"), function (x) {
        x.classList.toggle("active", x === b);
      });
      render();
      window.scrollTo({ top: 0 });
    });
  });

  function render() {
    if (TAB === "plan") renderPlan();
    else if (TAB === "log") renderLog();
    else if (TAB === "progress") renderProgress();
  }

  /* ---------------- 计划页 ---------------- */
  function renderPlan() {
    view.innerHTML = "";
    subEl.textContent = "4 分化 · 固定器械 · 减伤版";

    var now = new Date();
    var todayId = plannedDayId(now);
    var t = todayId ? dayById(todayId) : null;

    var hero = el("div", "hero");
    hero.innerHTML =
      '<div class="eyebrow">📅 ' + PLAN.weekdays[weekIndex(now)] + " · " + pad(now.getMonth() + 1) + "月" + now.getDate() + "日</div>" +
      "<h2>" + (t ? esc(t.name) : "休息日") + "</h2>" +
      "<p>" + (t ? esc(t.focus) + " · " + t.moves.length + " 个动作" : "建议 20-30 分钟低强度有氧，或完全休息") + "</p>";
    if (t) {
      var act = el("div", "actions");
      var b1 = el("button", "btn primary", "开始今天");
      b1.onclick = function () { openWorkout(t.id, today()); };
      var b2 = el("button", "btn ghost", "查看计划");
      b2.onclick = function () { showPlanSheet(t.id); };
      act.appendChild(b1); act.appendChild(b2);
      hero.appendChild(act);
    }
    view.appendChild(hero);

    // 周安排
    var week = el("div", "week");
    PLAN.week.forEach(function (id, i) {
      var isToday = i === weekIndex(now);
      var c = el("button", "daychip" + (isToday ? " today" : "") + (id ? "" : " rest"));
      c.type = "button";
      if (id) c.setAttribute("data-day", id);
      c.setAttribute("aria-label", PLAN.weekdays[i] + " " + (id ? dayById(id).name : "休息"));
      c.innerHTML = "<b>" + (id ? esc(dayById(id).short) : "休") + "</b><span>" + PLAN.weekdays[i].slice(1) + "</span>";
      c.onclick = function () {
        if (id) showPlanSheet(id);
        else showRestSheet(i);
      };
      week.appendChild(c);
    });
    view.appendChild(week);

    view.appendChild(el("div", "section-h", "5 个训练日"));
    PLAN.days.forEach(function (d) {
      var doneCount = sessionsOfDay(d.id).length;
      var c = el("div", "card");
      var setsTotal = d.moves.reduce(function (a, m) { return a + m.sets; }, 0);
      var accent = "var(--d-" + d.id + ")";
      c.style.borderTop = "3px solid " + accent;
      c.innerHTML =
        '<div class="card-title"><span>' + esc(d.name) + "</span>" +
        (doneCount ? '<span class="badge primary">已练 ' + doneCount + " 次</span>" : "") + "</div>" +
        '<p class="card-sub">' + esc(d.focus) + " · " + d.moves.length + " 个动作 · " + setsTotal + " 组</p>";
      var btn = el("button", "btn sm outline", "查看动作 →");
      btn.style.marginTop = "12px";
      btn.onclick = function () { showPlanSheet(d.id); };
      c.appendChild(btn);
      view.appendChild(c);
    });

    // 规则
    var rc = el("div", "card");
    rc.innerHTML = '<div class="card-title">🛡 减伤规则</div><ol style="margin:12px 0 0 18px;padding:0;font-size:13px;line-height:1.85;color:var(--muted)">' +
      PLAN.rules.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ol>";
    view.appendChild(rc);
  }

  function showRestSheet(dayIdx) {
    var todayIdx = weekIndex(new Date());
    var isToday = dayIdx === todayIdx;
    var nextIdx = -1;
    for (var k = 1; k <= 7; k++) {
      var j = (dayIdx + k) % 7;
      if (PLAN.week[j]) { nextIdx = j; break; }
    }
    var nextDay = nextIdx >= 0 ? dayById(PLAN.week[nextIdx]) : null;

    var html =
      '<div class="card-title" style="font-size:19px">' + esc(PLAN.weekdays[dayIdx]) + " · 休息日" + "</div>" +
      '<p class="card-sub">肌肉在休息时生长。完全停练不会掉肌肉，但会掉训练状态。</p>';

    html += '<div class="section-h" style="margin-top:20px">建议安排</div>';
    html +=
      '<div class="move"><div class="move-thumb placeholder" style="background:var(--fill)">20′</div>' +
      '<div class="move-body"><div class="move-name">低强度有氧</div>' +
      '<div class="move-meta">椭圆机 / 台阶机 / 快走，20-30 分钟</div>' +
      '<div class="move-tip">强度控制在能正常说话的范围内，目的是促进血液循环、帮助恢复，<b>不要</b>做成力竭有氧。</div></div></div>';

    html +=
      '<div class="move"><div class="move-thumb placeholder" style="background:var(--fill)">10′</div>' +
      '<div class="move-body"><div class="move-name">拉伸与放松</div>' +
      '<div class="move-meta">胸、背、髋、腘绳肌各 30 秒</div>' +
      '<div class="move-tip">训练后 24 小时内做静态拉伸，重点放在当天练过的肌群。</div></div></div>';

    html +=
      '<div class="move"><div class="move-thumb placeholder" style="background:var(--fill)">≥7h</div>' +
      '<div class="move-body"><div class="move-name">睡够 7-9 小时</div>' +
      '<div class="move-meta">蛋白质约 1.6-2.2 g/kg 体重</div>' +
      '<div class="move-tip">恢复本身也是训练的一部分，尤其是每周练 5-6 天时。</div></div></div>';

    if (nextDay) {
      html +=
        '<div class="card" style="margin:18px 0 0;background:var(--fill);box-shadow:none">' +
        '<div class="card-sub">下一个训练日</div>' +
        '<div class="card-title" style="margin:4px 0 0">' + esc(PLAN.weekdays[nextIdx]) + " · " + esc(nextDay.name) + "</div>" +
        '<p class="card-sub" style="margin-top:4px">' + esc(nextDay.focus) + "</p></div>";
    }

    html += '<p class="move-tip" style="margin-top:16px;text-align:center">休息日也可以开「记录」页补记，避免漏掉历史。</p>';

    sheetBody.innerHTML = html;
    showSheet();
  }

  function showPlanSheet(dayId) {
    var d = dayById(dayId);
    var html = '<div class="card-title" style="font-size:18px">' + esc(d.name) + "</div>" +
      '<p class="card-sub" style="margin-bottom:12px">' + esc(d.focus) + "</p>";
    d.moves.forEach(function (m, i) {
      var thumb = '<div class="move-badge">' + (i + 1) + "</div>";
      html += '<div class="move">' + thumb +
        '<div class="move-body"><div class="move-name">' + esc(m.name) +
        (i === 0 ? '<span class="badge primary">主项</span>' : "") +
        (m.cardio ? '<span class="badge cardio">有氧</span>' : "") + "</div>" +
        '<div class="move-meta">' + m.sets + " 组 × " + (m.lo === m.hi ? m.lo : m.lo + "-" + m.hi) + (m.cardio ? " 分钟" : " 次") + "</div>" +
        '<div class="move-tip">' + esc(m.tip) + "</div></div></div>";
    });
    var act = el("div");
    act.style.cssText = "display:flex;gap:10px;margin-top:16px";
    var go = el("button", "btn solid full", "按这个计划开练");
    go.onclick = function () { closeSheet(); openWorkout(dayId, today()); };
    act.appendChild(go);
    html += '<div id="sheetActSlot"></div>';
    sheetBody.innerHTML = html;
    sheetBody.appendChild(act);
    showSheet();
  }

  /* ---------------- 训练完成度圆环 ---------------- */
  function ringSvg(done, total) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    var R = 23;
    var C = 2 * Math.PI * R;
    return '<div class="ring">' +
      '<svg viewBox="0 0 58 58" aria-hidden="true">' +
      '<defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#2563eb"/><stop offset="100%" stop-color="#06b6d4"/>' +
      "</linearGradient></defs>" +
      '<circle cx="29" cy="29" r="' + R + '" fill="none" stroke="var(--fill)" stroke-width="6"/>' +
      '<circle cx="29" cy="29" r="' + R + '" fill="none" stroke="url(#ringGrad)" stroke-width="6" stroke-linecap="round"' +
      ' stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct / 100)).toFixed(1) + '"/>' +
      "</svg>" +
      '<div class="lbl">' + pct + '%</div></div>';
  }

  /* ---------------- 记录页 ---------------- */
  function renderLog() {
    view.innerHTML = "";
    subEl.textContent = "选择日期与训练日";
    var date = today();
    var guess = plannedDayId(new Date());
    if (!guess) guess = "w1";

    var c = el("div", "card");
    c.innerHTML = '<div class="card-title">▶ 开始一次训练</div><p class="card-sub">记录只保存在这台设备，不上传</p>';

    var lbl1 = el("label", "field-label", "训练日期");
    var inpDate = el("input");
    inpDate.type = "date";
    inpDate.value = date;
    inpDate.style.textAlign = "left";
    var lbl2 = el("label", "field-label", "训练日");
    var chips = el("div", "chips");
    PLAN.days.forEach(function (d) {
      var p = el("button", "pick" + (d.id === guess ? " on" : ""), d.name.split(" ")[0] + " " + d.short);
      p.onclick = function () {
        Array.prototype.forEach.call(chips.children, function (x) { x.classList.remove("on"); });
        p.classList.add("on");
        chips.dataset.pick = d.id;
      };
      chips.appendChild(p);
    });
    chips.dataset.pick = guess;

    var go = el("button", "btn solid full", "开始记录 →");
    go.style.marginTop = "18px";
    go.onclick = function () {
      if (!inpDate.value) { toast("请选择日期"); return; }
      openWorkout(chips.dataset.pick, inpDate.value);
    };

    c.appendChild(lbl1); c.appendChild(inpDate);
    c.appendChild(lbl2); c.appendChild(chips);
    c.appendChild(go);
    view.appendChild(c);

    // 进行中的草稿
    var keys = Object.keys(db.drafts);
    if (keys.length) {
      view.appendChild(el("div", "section-h", "未完成的训练"));
      keys.forEach(function (k) {
        var dr = db.drafts[k];
        if (!dr || !dr.moves) return;
        var d = dayById(dr.dayId);
        if (!d) return;
        var doneSets = 0, total = 0;
        dr.moves.forEach(function (m) { m.sets.forEach(function (s) { total++; if (s.done) doneSets++; }); });
        var row = el("div", "row");
        row.style.borderLeft = "3px solid var(--d-" + dr.dayId + ")";
        row.style.paddingLeft = "12px";
        row.innerHTML = '<div class="row-main"><div class="row-title">' + esc(d.name) + " · " + fmtDate(dr.date) + "</div>" +
          '<div class="row-sub">已完成 ' + doneSets + "/" + total + ' 组</div></div>';
        var rb = el("button", "btn sm solid", "继续");
        rb.onclick = function () { openWorkout(dr.dayId, dr.date, true); };
        row.appendChild(rb);
        view.appendChild(row);
      });
    }

    // 历史
    view.appendChild(el("div", "section-h", "训练历史"));
    if (!db.sessions.length) {
      view.appendChild(el("div", "empty", "<strong>🏋️</strong>还没有记录。<br>做完第一次训练后，这里会显示历史。"));
      return;
    }
    var list = el("div", "card");
    db.sessions.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (s) {
      var d = dayById(s.dayId);
      var sets = 0, vol = 0;
      s.moves.forEach(function (m) {
        m.sets.forEach(function (x) {
          if (x.done) { sets++; vol += (+x.weight || 0) * (+x.reps || 0); }
        });
      });
      // 整行可点开详情：按钮而非 div，才能被键盘和读屏访问
      var row = el("button", "row row-tap");
      row.type = "button";
      row.style.borderLeft = "3px solid var(--d-" + s.dayId + ")";
      row.style.paddingLeft = "12px";
      row.innerHTML = '<div class="row-main"><div class="row-title">' + esc(d ? d.name : s.dayId) + " · " + fmtDate(s.date) + "</div>" +
        '<div class="row-sub">' + sets + " 组 · 容量 " + Math.round(vol) + " kg · 时长 " + (s.durationMin || "—") + " 分" +
        (s.maxPain >= 4 ? ' · <span style="color:var(--danger);font-weight:700">疼痛 ' + s.maxPain + "/10</span>" : "") + "</div></div>";
      var del = el("span", "btn sm danger", "删除");
      del.setAttribute("role", "button");
      del.tabIndex = 0;
      var doDel = function (e) {
        e.stopPropagation();
        if (confirm("删除这条训练记录？")) {
          db.sessions = db.sessions.filter(function (x) { return x.id !== s.id; });
          saveDB(); renderLog(); toast("已删除");
        }
      };
      del.onclick = doDel;
      del.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); doDel(e); } };
      row.onclick = function () { showSessionSheet(s.id); };
      row.appendChild(del);
      list.appendChild(row);
    });
    view.appendChild(list);
  }

  function showSessionSheet(id) {
    var s = db.sessions.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    var d = dayById(s.dayId);
    var html = '<div class="card-title" style="font-size:18px">' + esc(d ? d.name : s.dayId) + "</div>" +
      '<p class="card-sub">' + s.date + " · 时长 " + (s.durationMin || "—") + " 分钟</p>";
    s.moves.forEach(function (m) {
      html += '<div style="margin-top:14px"><div class="move-name">' + esc(m.name) + "</div>";
      var rows = m.sets.map(function (x, i) {
        return "<tr><td>" + (i + 1) + "</td><td>" + esc(x.weight || "-") + "</td><td>" + esc(x.reps || "-") + "</td><td>" + (x.done ? "✓" : "—") + "</td></tr>";
      }).join("");
      html += '<table class="data"><thead><tr><th>组</th><th>重量 kg</th><th>次数</th><th>完成</th></tr></thead><tbody>' + rows + "</tbody></table>";
      if (m.note) html += '<div class="move-tip">备注：' + esc(m.note) + "</div>";
      html += '<div class="move-tip">RIR ' + m.rir + " · 疼痛 " + m.pain + "/10</div></div>";
    });
    sheetBody.innerHTML = html;
    showSheet();
  }

  /* ---------------- 训练进行中 ---------------- */
  var wo = null; // { draft, timerId }

  function openWorkout(dayId, date, resume) {
    var d = dayById(dayId);
    if (!d) return;
    var draft = getDraft(dayId, date, resume);
    if (draft.fresh) { delete draft.fresh; db.drafts[draft.key] = draft; }
    if (!draft.startedAt) { draft.startedAt = Date.now(); saveDB(); }
    wo = { draft: draft, timerId: null };
    TAB = "log";
    renderWorkout(d);
    window.scrollTo({ top: 0 });
  }

  function closeWorkout(save) {
    if (wo && wo.timerId) clearInterval(wo.timerId);
    var f = view.querySelector(".fab");
    if (f) f.remove();
    wo = null;
    if (save) saveDB();
    renderLog();
  }

  function renderWorkout(d) {
    view.innerHTML = "";
    var dr = wo.draft;

    var head = el("div", "card");
    var totalSets = 0, doneSets = 0;
    dr.moves.forEach(function (m) { m.sets.forEach(function (s) { totalSets++; if (s.done) doneSets++; }); });
    head.innerHTML =
      '<div class="wo-head"><div style="flex:1;min-width:0"><div class="card-title">' + esc(d.name) + "</div>" +
      '<p class="card-sub" id="woSub">' + dr.date + " · 已完成 " + doneSets + "/" + totalSets + " 组</p></div>" +
      '<div style="display:flex;align-items:center;gap:10px">' +
      ringSvg(doneSets, totalSets) +
      '<div id="timer" class="timer">--:--</div></div></div>';
    view.appendChild(head);

    var bar = el("div");
    bar.style.cssText = "display:flex;gap:8px;margin-bottom:12px";
    var cancel = el("button", "btn sm outline full", "保存并退出");
    cancel.onclick = function () { closeWorkout(true); toast("已保存草稿"); };
    bar.appendChild(cancel);
    view.appendChild(bar);

    d.moves.forEach(function (m, mi) {
      var st = findMove(dr, m.name);
      if (!st) return;
      var card = el("div", "card");
      var prev = lastEntry(m.name, dr.date);
      var prevTxt = "";
      if (prev) {
        var pw = prev.move.sets.filter(function (x) { return x.weight; }).map(function (x) { return x.weight + "kg×" + (x.reps || "?"); }).slice(0, 3).join(" / ");
        if (pw) prevTxt = "上次 " + fmtDate(prev.date) + "：" + pw;
      }
      var thumb = '<div class="move-badge">' + (mi + 1) + "</div>";
      card.innerHTML =
        '<div class="move" style="border:0;padding:0">' + thumb + '<div class="move-body">' +
        '<div class="move-name">' + esc(m.name) + "</div>" +
        '<div class="move-meta">目标 ' + m.sets + " 组 × " + (m.lo === m.hi ? m.lo : m.lo + "-" + m.hi) + (m.cardio ? " 分钟" : " 次") + "</div>" +
        (prevTxt ? '<div class="move-tip">' + esc(prevTxt) + "</div>" : "") +
        "</div></div>";

      var setHead = el("div", "setrow");
      setHead.innerHTML = '<div class="set-head">组</div><div class="set-head">重量 kg</div><div class="set-head">次数</div><div class="set-head">完成</div>';
      card.appendChild(setHead);

      st.sets.forEach(function (s, si) {
        var r = el("div", "setrow");
        var idx = el("div", "idx", String(si + 1));
        var w = el("input"); w.type = "number"; w.inputMode = "decimal"; w.step = "0.5"; w.placeholder = "kg"; w.value = s.weight;
        var reps = el("input"); reps.type = "number"; reps.inputMode = "numeric"; reps.placeholder = m.lo + "-" + m.hi; reps.value = s.reps;
        var cell = el("div", "done-cell");
        // 对勾由 CSS ::before 绘制，这里不再放文本，避免两份重叠溢出
        var ck = el("button", "check" + (s.done ? " on" : ""));
        ck.type = "button";
        ck.setAttribute("aria-label", (s.done ? "取消完成 第" : "标记完成 第") + (si + 1) + " 组");
        ck.setAttribute("aria-pressed", s.done ? "true" : "false");
        ck.onclick = function () {
          s.done = !s.done;
          if (s.done && !s.reps) s.reps = m.lo;
          ck.classList.toggle("on", s.done);
          ck.setAttribute("aria-label", (s.done ? "取消完成 第" : "标记完成 第") + (si + 1) + " 组");
          ck.setAttribute("aria-pressed", s.done ? "true" : "false");
          saveDB();
        };
        w.oninput = function () { s.weight = w.value; saveDB(); };
        reps.oninput = function () { s.reps = reps.value; saveDB(); };
        cell.appendChild(ck);
        r.appendChild(idx); r.appendChild(w); r.appendChild(reps); r.appendChild(cell);
        card.appendChild(r);
      });

      // 按上次一键填入
      if (prev) {
        var fill = el("button", "btn sm outline", "按上次重量填入");
        fill.style.marginTop = "10px";
        fill.onclick = function () {
          var target = prev.move.sets.filter(function (x) { return x.weight; })[0];
          if (!target) { toast("上次没有重量记录"); return; }
          st.sets.forEach(function (s) { s.weight = target.weight; });
          saveDB();
          renderWorkout(d);
          toast("已填入 " + target.weight + " kg");
        };
        card.appendChild(fill);
      }

      // RIR
      card.appendChild(el("label", "field-label", "RIR（结束该动作时还剩几次余力）"));
      var rir = el("div", "chips");
      [0, 1, 2, 3, 4].forEach(function (v) {
        var p = el("button", "pick" + (st.rir === v ? " on" : "") + (v <= 1 ? " warn" : ""), "RIR " + v);
        p.onclick = function () {
          st.rir = v; saveDB();
          Array.prototype.forEach.call(rir.children, function (x) { x.classList.remove("on"); });
          p.classList.add("on");
        };
        rir.appendChild(p);
      });
      card.appendChild(rir);

      // 疼痛
      card.appendChild(el("label", "field-label", "疼痛评分（0 = 无痛，10 = 无法忍受）"));
      var pain = el("div", "chips");
      [0, 2, 4, 6, 8].forEach(function (v) {
        var p = el("button", "pick" + (st.pain === v ? " on" : "") + (v >= 4 ? " danger" : ""), String(v));
        p.onclick = function () {
          st.pain = v; saveDB();
          Array.prototype.forEach.call(pain.children, function (x) { x.classList.remove("on"); });
          p.classList.add("on");
          if (v >= 4) toast("疼痛 ≥4：停止该动作并考虑就医");
        };
        pain.appendChild(p);
      });
      card.appendChild(pain);

      // 备注
      card.appendChild(el("label", "field-label", "备注（动作感受 / 调整）"));
      var note = el("input"); note.type = "text"; note.placeholder = "例如：左肩有轻微夹痛，改用蝴蝶机";
      note.style.textAlign = "left";
      note.value = st.note || "";
      note.oninput = function () { st.note = note.value; saveDB(); };
      card.appendChild(note);

      view.appendChild(card);
    });

    // 计时器
    var tEl = $("#timer");
    function tick() {
      var sec = Math.floor((Date.now() - dr.startedAt) / 1000);
      tEl.textContent = String(Math.floor(sec / 60)).padStart(2, "0") + ":" + pad(sec % 60);
    }
    tick();
    if (wo.timerId) clearInterval(wo.timerId);
    wo.timerId = setInterval(tick, 1000);

    // 完成按钮：页面底部 + 悬浮按钮（长列表里不必滚到底）
    var fin = el("button", "btn solid full", "完成本次训练");
    fin.style.marginTop = "6px";
    finishBtn = fin;
    var fab = el("button", "fab", "完成训练");
    fab.onclick = function () { finishWorkout(d); };
    view.appendChild(fab);

    // 勾选后实时刷新完成数与进度环
    var counter = function () {
      var c = countDone(dr);
      var sub = head.querySelector("#woSub");
      if (sub) sub.textContent = dr.date + " · 已完成 " + c.done + "/" + c.total + " 组";
      var ring = head.querySelector(".ring");
      if (ring) {
        var pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
        var C = 2 * Math.PI * 23;
        var fg = ring.querySelector("svg circle:last-child");
        if (fg) fg.setAttribute("stroke-dashoffset", (C * (1 - pct / 100)).toFixed(1));
        var lbl = ring.querySelector(".lbl");
        if (lbl) lbl.textContent = pct + "%";
      }
      return c.done;
    };
    counter();
    wo.counter = counter;
    fin.addEventListener("click", function () { finishWorkout(d); });
    view.appendChild(fin);

    var back = el("button", "btn full outline", "回到记录列表");
    back.style.marginTop = "10px";
    back.onclick = function () { closeWorkout(true); };
    view.appendChild(back);
  }

  var finishBtn = null;

  function countDone(dr) {
    var done = 0, total = 0;
    dr.moves.forEach(function (m) { m.sets.forEach(function (s) { total++; if (s.done) done++; }); });
    return { done: done, total: total };
  }

  function finishWorkout(d) {
    var dr = wo.draft;
    var c = countDone(dr);
    if (!c.done) { toast("还没有勾选任何一组"); return; }
    if (!confirm("完成这次训练？已完成 " + c.done + "/" + c.total + " 组")) return;
    var duration = Math.round((Date.now() - dr.startedAt) / 60000);
    var maxPain = 0;
    var moves = dr.moves.map(function (m) {
      if (m.pain > maxPain) maxPain = m.pain;
      return {
        name: m.name,
        rir: m.rir, pain: m.pain, note: m.note || "",
        sets: m.sets.map(function (s) { return { weight: s.weight, reps: s.reps, done: !!s.done }; }),
      };
    });
    db.sessions.push({
      id: uid(), dayId: d.id, date: dr.date, startedAt: dr.startedAt,
      durationMin: Math.max(duration, 1), moves: moves, maxPain: maxPain,
    });
    delete db.drafts[dr.key];
    saveDB();
    if (wo.timerId) clearInterval(wo.timerId);
    var fb = view.querySelector(".fab");
    if (fb) fb.remove();
    wo = null;
    toast("训练已保存");
    renderLog();
  }

  /* ---------------- 进度页 ---------------- */
  function renderProgress() {
    view.innerHTML = "";
    subEl.textContent = "训练量 · 最佳组 · 疼痛趋势";
    if (!db.sessions.length) {
      view.appendChild(el("div", "empty", "还没有数据。<br>完成一次训练后，这里会出现进度图表。"));
      return;
    }
    var list = db.sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    var sets = 0, vol = 0, pains = [];
    list.forEach(function (s) {
      s.moves.forEach(function (m) {
        m.sets.forEach(function (x) {
          if (x.done) { sets++; vol += (+x.weight || 0) * (+x.reps || 0); }
        });
      });
      pains.push(s.maxPain || 0);
    });

    // 本周次数
    var now = new Date();
    var wkStart = new Date(now); wkStart.setDate(now.getDate() - weekIndex(now)); wkStart.setHours(0, 0, 0, 0);
    var weekCount = list.filter(function (s) { return parseDate(s.date) >= wkStart; }).length;

    var stats = el("div", "stats");
    stats.innerHTML =
      '<div class="stat"><b>' + weekCount + "</b><span>本周训练</span></div>" +
      '<div class="stat"><b>' + list.length + "</b><span>累计训练</span></div>" +
      '<div class="stat"><b>' + Math.round(vol / 1000 * 10) / 10 + "t</b><span>累计容量</span></div>";
    view.appendChild(stats);

    // 容量趋势
    var c1 = el("div", "card");
    c1.innerHTML = '<div class="card-title">📈 训练容量趋势</div><p class="card-sub">重量 × 次数，按每次训练统计（kg）</p>';
    var cv1 = el("canvas");
    c1.appendChild(cv1);
    view.appendChild(c1);
    drawBars(cv1, list.map(function (s) {
      var v = 0;
      s.moves.forEach(function (m) { m.sets.forEach(function (x) { if (x.done) v += (+x.weight || 0) * (+x.reps || 0); }); });
      return { label: fmtDate(s.date), value: v };
    }));

    // 主项最佳组
    var c2 = el("div", "card");
    c2.innerHTML = '<div class="card-title">🏆 主项最佳组</div><p class="card-sub">每个动作历史最重的有效组（重量 × 次数）</p>';
    var best = {};
    list.forEach(function (s) {
      s.moves.forEach(function (m) {
        m.sets.forEach(function (x) {
          if (!x.done || !+x.weight) return;
          var w = +x.weight;
          if (!best[m.name] || w > best[m.name].w) best[m.name] = { w: w, r: x.reps, d: s.date };
        });
      });
    });
    var names = Object.keys(best);
    if (!names.length) {
      c2.innerHTML += '<div class="empty">暂无有效重量记录</div>';
    } else {
      var tb = '<table class="data"><thead><tr><th>动作</th><th>最佳组</th><th>日期</th></tr></thead><tbody>';
      names.sort(function (a, b) { return best[b].w - best[a].w; }).forEach(function (n) {
        tb += "<tr><td>" + esc(n) + "</td><td>" + best[n].w + " kg × " + esc(best[n].r || "-") + "</td><td>" + fmtDate(best[n].d) + "</td></tr>";
      });
      tb += "</tbody></table>";
      c2.innerHTML += tb;
    }
    view.appendChild(c2);

    // 疼痛趋势
    var c3 = el("div", "card");
    c3.innerHTML = '<div class="card-title">❤️ 疼痛趋势</div><p class="card-sub">每次训练的最高疼痛评分（0-10），≥4 应先停练该动作</p>';
    var cv3 = el("canvas");
    c3.appendChild(cv3);
    view.appendChild(c3);
    drawBars(cv3, list.map(function (s, i) { return { label: fmtDate(s.date), value: s.maxPain || 0 }; }), { max: 10, colorDanger: true });

    var warnCount = list.filter(function (s) { return (s.maxPain || 0) >= 4; }).length;
    if (warnCount) {
      var wa = el("div", "card");
      wa.style.background = "linear-gradient(135deg, #fef2f2, #fff)";
      wa.style.border = "1px solid #fecaca";
      wa.innerHTML = '<div class="card-title" style="color:#dc2626">⚠️ 有 ' + warnCount +
        " 次训练疼痛 ≥4</div><p class=\"card-sub\">建议检查动作幅度、重量与恢复情况；疼痛持续不缓解请咨询专业人士。</p>";
      view.appendChild(wa);
    }

    // 导出
    var exp = el("button", "btn outline full", "⬇ 导出数据（JSON）");
    exp.style.marginTop = "6px";
    exp.onclick = exportData;
    view.appendChild(exp);

    var imp = el("button", "btn outline full", "⬆ 导入数据（JSON）");
    imp.style.marginTop = "10px";
    imp.onclick = importData;
    view.appendChild(imp);
  }

  function drawBars(canvas, data, opt) {
    opt = opt || {};
    var dpr = window.devicePixelRatio || 1;
    var W = canvas.clientWidth || 320;
    var H = 180;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    if (!data.length) return;
    var padL = 34, padB = 26, padT = 10, padR = 8;
    var max = opt.max || Math.max.apply(null, data.map(function (d) { return d.value; })) || 1;
    max = max * 1.15;
    // 网格
    ctx.strokeStyle = "#eef2f8";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g++) {
      var y = padT + (H - padT - padB) * (g / 3);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      var val = max * (1 - g / 3);
      ctx.fillText(val >= 1000 ? Math.round(val / 1000) + "k" : Math.round(val), 2, y + 3);
    }
    var n = data.length;
    var bw = Math.min(28, Math.max(6, (W - padL - padR) / n * 0.62));
    var step = (W - padL - padR) / n;
    data.forEach(function (d, i) {
      var h = (H - padT - padB) * Math.min(1, d.value / max);
      var x = padL + step * i + (step - bw) / 2;
      var y = H - padB - h;
      if (opt.colorDanger && d.value >= 4) {
        var gd = ctx.createLinearGradient(x, y, x, y + Math.max(h, 1));
        gd.addColorStop(0, "#f87171");
        gd.addColorStop(1, "#dc2626");
        ctx.fillStyle = gd;
      } else if (h > 0) {
        var g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, "#38bdf8");
        g.addColorStop(1, "#2563eb");
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = "#e2e8f0";
      }
      roundRect(ctx, x, y, bw, Math.max(h, 1), 4);
      ctx.fill();
      if (n <= 10 || i % Math.ceil(n / 8) === 0) {
        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "center";
        ctx.fillText(d.label, x + bw / 2, H - padB + 14);
        ctx.textAlign = "left";
      }
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gym4-backup-" + today() + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function importData() {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.onchange = function () {
      var f = inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var d = JSON.parse(fr.result);
          if (!d || !Array.isArray(d.sessions)) throw new Error("格式不对");
          if (!confirm("导入将覆盖当前记录，继续？")) return;
          db = { sessions: d.sessions, drafts: d.drafts || {} };
          saveDB(); renderProgress(); toast("导入成功");
        } catch (e) { toast("导入失败：" + e.message); }
      };
      fr.readAsText(f);
    };
    inp.click();
  }

  /* ---------------- 底部弹层 ---------------- */
  var lastFocus = null;
  function showSheet() {
    lastFocus = document.activeElement;
    sheet.classList.remove("hidden");
    sheet.scrollTop = 0;
    // 焦点移入弹层，键盘用户可直接操作；关闭时归还原处
    setTimeout(function () {
      var f = sheet.querySelector("button, a, [tabindex]:not([tabindex='-1'])");
      if (f) f.focus();
    }, 60);
  }
  function closeSheet() {
    sheet.classList.add("hidden");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }
  sheet.addEventListener("click", function (e) { if (e.target === sheet) closeSheet(); });

  // Esc 关闭弹层；Tab 焦点锁定在弹层内
  document.addEventListener("keydown", function (e) {
    if (sheet.classList.contains("hidden")) return;
    if (e.key === "Escape") { closeSheet(); return; }
    if (e.key !== "Tab") return;
    var f = sheet.querySelectorAll("button, a[href], input, select, [tabindex]:not([tabindex='-1'])");
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // 记录页里勾选后刷新头部计数
  document.addEventListener("click", function (e) {
    if (e.target.classList && e.target.classList.contains("check") && wo && wo.counter) {
      setTimeout(wo.counter, 0);
    }
  });

  // 顶栏滚动后加描边与阴影
  var lastScroll = -1;
  window.addEventListener("scroll", function () {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    if (Math.abs(y - lastScroll) < 6) return;
    lastScroll = y;
    bar.classList.toggle("scrolled", y > 6);
  }, { passive: true });

  render();
})();
