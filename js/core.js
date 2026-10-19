/* 核心工具：模板、DOM、主题、存储
   供 plan.js / log.js / progress.js 共享，无页面逻辑 */
(function () {
  "use strict";

  /* ---------------- 模板 ---------------- */
  // tpl`Hello ${name}` —— ${} 自动转义，html`` 标记信任富文本
  window.tpl = function (strings) {
    var vals = Array.prototype.slice.call(arguments, 1);
    return strings.reduce(function (acc, s, i) {
      return acc + s + (i < vals.length ? esc(vals[i]) : "");
    }, "");
  };
  // html`` 标记内容已含 HTML，不转义（仅用于 PLAN 等可信数据）
  window.html = function (strings) {
    var vals = Array.prototype.slice.call(arguments, 1);
    return strings.reduce(function (acc, s, i) {
      return acc + s + (i < vals.length ? String(vals[i]) : "");
    }, "");
  };
  // 数组渲染成 HTML 字符串
  window.list = function (arr, fn) { return arr.map(fn).join(""); };

  /* ---------------- DOM ---------------- */
  window.$ = function (sel, root) { return (root || document).querySelector(sel); };
  window.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  window.el = function (tag, cls, htmlStr) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (htmlStr != null) n.innerHTML = htmlStr;
    return n;
  };

  /* ---------------- 小组件 ---------------- */
  window.moveBadge = function (n) { return el("div", "move-badge", String(n)); };

  window.chips = function (options, current, onPick) {
    var box = el("div", "chips");
    options.forEach(function (o) {
      var cls = "pick" + (o.v === current ? " on" : "") + (o.warn ? " warn" : "") + (o.danger ? " danger" : "");
      var p = el("button", cls, o.label);
      p.type = "button";
      p.setAttribute("aria-pressed", o.v === current ? "true" : "false");
      p.onclick = function () {
        $$(".pick", box).forEach(function (x) { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
        p.classList.add("on");
        p.setAttribute("aria-pressed", "true");
        onPick(o.v);
      };
      box.appendChild(p);
    });
    return box;
  };

  window.setRow = function (move, s, si, onToggle, onInput) {
    var r = el("div", "setrow");
    r.appendChild(el("div", "idx", String(si + 1)));

    var w = el("input");
    w.type = "number"; w.inputMode = "decimal"; w.step = "0.5";
    w.placeholder = "kg"; w.value = s.weight;
    w.setAttribute("aria-label", "第 " + (si + 1) + " 组重量（公斤）");
    w.oninput = function () { onInput("weight", w.value); };

    var reps = el("input");
    reps.type = "number"; reps.inputMode = "numeric";
    reps.placeholder = move.lo === move.hi ? String(move.lo) : move.lo + "-" + move.hi;
    reps.value = s.reps;
    reps.setAttribute("aria-label", "第 " + (si + 1) + " 组次数");
    reps.oninput = function () { onInput("reps", reps.value); };

    var cell = el("div", "done-cell");
    var ck = el("button", "check" + (s.done ? " on" : ""));
    ck.type = "button";
    ck.setAttribute("aria-label", (s.done ? "取消完成 第" : "标记完成 第") + (si + 1) + " 组");
    ck.setAttribute("aria-pressed", s.done ? "true" : "false");
    ck.onclick = function () {
      ck.classList.toggle("on");
      ck.setAttribute("aria-label", (ck.classList.contains("on") ? "取消完成 第" : "标记完成 第") + (si + 1) + " 组");
      ck.setAttribute("aria-pressed", ck.classList.contains("on") ? "true" : "false");
      onToggle();
    };
    cell.appendChild(ck);

    r.appendChild(w);
    r.appendChild(reps);
    r.appendChild(cell);
    return r;
  };

  /* ---------------- 主题 ---------------- */
  var THEME_KEY = "gym4.theme";
  var themeBtn = document.getElementById("themeBtn");
  window.THEME_LABEL = { auto: "跟随系统", light: "浅色", dark: "深色" };

  window.getTheme = function () {
    try { return localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { return "auto"; }
  };
  function systemDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  window.applyTheme = function (mode, announce) {
    var dark = mode === "dark" || (mode === "auto" && systemDark());
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    themeBtn.setAttribute("data-mode", mode);
    var shown = mode === "auto" ? "跟随系统（当前" + (dark ? "深色" : "浅色") + "）" : THEME_LABEL[mode];
    themeBtn.setAttribute("aria-label", "主题：" + shown + "，点击切换");
    themeBtn.title = shown;
    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", dark ? "#080d16" : "#eef2f8");
    if (announce) window.toast("主题：" + shown);
  };

  themeBtn.addEventListener("click", function () {
    var order = ["auto", "light", "dark"];
    var next = order[(order.indexOf(getTheme()) + 1) % order.length];
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next, true);
  });
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onSys = function () { if (getTheme() === "auto") applyTheme("auto", false); };
    if (mq.addEventListener) mq.addEventListener("change", onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }
  applyTheme(getTheme(), false);

  /* ---------------- 存储 ---------------- */
  var DB_KEY = "gym4.db.v1";
  window.db = null;

  window.loadDB = function () {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (!raw) return { sessions: [], drafts: {} };
      var d = JSON.parse(raw);
      if (!d.sessions) d.sessions = [];
      if (!d.drafts) d.drafts = {};
      return d;
    } catch (e) {
      return { sessions: [], drafts: {} };
    }
  };
  window.saveDB = function () {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      window.toast("存储失败：浏览器空间不足");
    }
  };
  db = loadDB();

  /* ---------------- 工具 ---------------- */
  window.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  window.pad = function (n) { return n < 10 ? "0" + n : "" + n; };
  window.dateStr = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  window.today = function () { return dateStr(new Date()); };
  window.parseDate = function (s) {
    var p = s.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  };
  window.fmtDate = function (s) {
    var p = s.split("-");
    return p[1] + "/" + p[2];
  };
  window.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  window.toastEl = document.getElementById("toast");
  window.toastTimer = null;
  window.toast = function (msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.add("hidden"); }, 2200);
  };

  /* ---------------- Sheet 三段式 ---------------- */
  var sheet = document.getElementById("sheet");
  var sheetHeader = document.getElementById("sheetHeader");
  var sheetBody = document.getElementById("sheetBody");
  var sheetFooter = document.getElementById("sheetFooter");

  window.setSheet = function (headerHtml, bodyHtml, footerEl) {
    sheetHeader.innerHTML =
      '<div class="sheet-header-main">' + headerHtml + '</div>' +
      '<button class="sheet-close-btn" type="button" aria-label="关闭">✕</button>';
    var closeBtn = sheetHeader.querySelector(".sheet-close-btn");
    if (closeBtn) closeBtn.onclick = window.closeSheet;

    if (typeof bodyHtml === "string") sheetBody.innerHTML = bodyHtml;
    else { sheetBody.innerHTML = ""; sheetBody.appendChild(bodyHtml); }

    if (footerEl) {
      sheetFooter.innerHTML = "";
      sheetFooter.appendChild(footerEl);
      sheetFooter.classList.remove("hidden");
    } else {
      sheetFooter.innerHTML = "";
      sheetFooter.classList.add("hidden");
    }
    window.showSheet();
  };

  var lastFocus = null;
  window.showSheet = function () {
    lastFocus = document.activeElement;
    sheet.classList.remove("hidden");
    sheet.scrollTop = 0;
    setTimeout(function () {
      var f = sheet.querySelector("button, a, [tabindex]:not([tabindex='-1'])");
      if (f) f.focus();
    }, 60);
  };
  window.closeSheet = function () {
    sheet.classList.add("hidden");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  };
  sheet.addEventListener("click", function (e) { if (e.target === sheet) closeSheet(); });

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

  /* ---------------- 顶栏滚动 ---------------- */
  var bar = document.querySelector(".appbar");
  var lastScroll = -1;
  window.addEventListener("scroll", function () {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    if (Math.abs(y - lastScroll) < 6) return;
    lastScroll = y;
    bar.classList.toggle("scrolled", y > 6);
  }, { passive: true });

})();
