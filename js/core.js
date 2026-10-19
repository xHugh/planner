/* 核心工具：模板、DOM、主题、存储、Sheet
   供 plan.js / log.js / progress.js 共享，无页面逻辑 */

/* ---------------- 模板 ---------------- */
// tpl`Hello ${name}` —— ${} 自动转义
export function tpl(strings) {
  const vals = Array.prototype.slice.call(arguments, 1);
  return strings.reduce((acc, s, i) => acc + s + (i < vals.length ? esc(vals[i]) : ""), "");
}
// html`` 标记内容已含 HTML，不转义（仅用于 PLAN 等可信数据）
export function html(strings) {
  const vals = Array.prototype.slice.call(arguments, 1);
  return strings.reduce((acc, s, i) => acc + s + (i < vals.length ? String(vals[i]) : ""), "");
}
// 数组渲染成 HTML 字符串
export function list(arr, fn) {
  return arr.map(fn).join("");
}

/* ---------------- DOM ---------------- */
export const $ = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

export function el(tag, cls, htmlStr) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (htmlStr != null) n.innerHTML = htmlStr;
  return n;
}

/* ---------------- 小组件 ---------------- */
export function moveBadge(n) {
  return el("div", "move-badge", String(n));
}

export function chips(options, current, onPick) {
  const box = el("div", "chips");
  options.forEach(o => {
    const cls = "pick" + (o.v === current ? " on" : "") + (o.warn ? " warn" : "") + (o.danger ? " danger" : "");
    const p = el("button", cls, o.label);
    p.type = "button";
    p.setAttribute("aria-pressed", o.v === current ? "true" : "false");
    p.onclick = () => {
      $$(".pick", box).forEach(x => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
      p.classList.add("on");
      p.setAttribute("aria-pressed", "true");
      onPick(o.v);
    };
    box.appendChild(p);
  });
  return box;
}

export function setRow(move, s, si, onToggle, onInput) {
  const r = el("div", "setrow");
  r.appendChild(el("div", "idx", String(si + 1)));

  const w = el("input");
  w.type = "number"; w.inputMode = "decimal"; w.step = "0.5";
  w.placeholder = "kg"; w.value = s.weight;
  w.setAttribute("aria-label", `第 ${si + 1} 组重量（公斤）`);
  w.oninput = () => onInput("weight", w.value);

  const reps = el("input");
  reps.type = "number"; reps.inputMode = "numeric";
  reps.placeholder = move.repsHint || (move.lo === move.hi ? String(move.lo) : move.lo + "-" + move.hi);
  reps.value = s.reps;
  reps.setAttribute("aria-label", `第 ${si + 1} 组次数`);
  reps.oninput = () => onInput("reps", reps.value);

  const cell = el("div", "done-cell");
  const ck = el("button", "check" + (s.done ? " on" : ""));
  ck.type = "button";
  ck.setAttribute("aria-label", (s.done ? "取消完成 第" : "标记完成 第") + (si + 1) + " 组");
  ck.setAttribute("aria-pressed", s.done ? "true" : "false");
  ck.onclick = () => {
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
}

/* ---------------- 工具 ---------------- */
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
export const pad = n => (n < 10 ? "0" + n : "" + n);
export const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => dateStr(new Date());
export function parseDate(s) {
  const p = s.split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
export function fmtDate(s) {
  const p = s.split("-");
  return p[1] + "/" + p[2];
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------------- Toast ---------------- */
const toastEl = document.getElementById("toast");
let toastTimer = null;
export function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2200);
}

/* ---------------- 主题 ---------------- */
const THEME_KEY = "gym4.theme";
const themeBtn = document.getElementById("themeBtn");
const THEME_LABEL = { auto: "跟随系统", light: "浅色", dark: "深色" };

export function getTheme() {
  try { return localStorage.getItem(THEME_KEY) || "auto"; } catch { return "auto"; }
}
const systemDark = () => window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

export function applyTheme(mode, announce) {
  const dark = mode === "dark" || (mode === "auto" && systemDark());
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  themeBtn.setAttribute("data-mode", mode);
  const shown = mode === "auto" ? "跟随系统（当前" + (dark ? "深色" : "浅色") + "）" : THEME_LABEL[mode];
  themeBtn.setAttribute("aria-label", "主题：" + shown + "，点击切换");
  themeBtn.title = shown;
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", dark ? "#080d16" : "#eef2f8");
  // 图表等按 CSS 变量着色的元素需要重画
  document.dispatchEvent(new CustomEvent("themechange"));
  if (announce) toast("主题：" + shown);
}

themeBtn.addEventListener("click", () => {
  const order = ["auto", "light", "dark"];
  const next = order[(order.indexOf(getTheme()) + 1) % order.length];
  try { localStorage.setItem(THEME_KEY, next); } catch {}
  applyTheme(next, true);
});
if (window.matchMedia) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSys = () => { if (getTheme() === "auto") applyTheme("auto", false); };
  if (mq.addEventListener) mq.addEventListener("change", onSys);
  else if (mq.addListener) mq.addListener(onSys);
}
applyTheme(getTheme(), false);

/* ---------------- 存储 ---------------- */
const DB_KEY = "gym4.db.v1";

export function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { sessions: [], drafts: {} };
    const d = JSON.parse(raw);
    if (!d.sessions) d.sessions = [];
    if (!d.drafts) d.drafts = {};
    return d;
  } catch {
    return { sessions: [], drafts: {} };
  }
}

// 模块级单例；各模块 import 同一个引用
export const db = loadDB();

export function saveDB() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    toast("存储失败：浏览器空间不足");
  }
}

// 可用记录：旧版本遗留或手改 localStorage 的残缺记录可能缺字段，
// 消费前统一过滤，避免各页面各自判空时漏掉一处
export function validSessions() {
  return db.sessions.filter(s => s && typeof s.date === "string" && Array.isArray(s.moves));
}

/* ---------------- 持久化存储 ----------------
   申请后浏览器不会在磁盘紧张时清掉本机数据（iOS 尤其重要）。 */
export const storage = { persisted: null };
const PERSIST_KEY = "gym4.persist.v1";

export function requestPersist() {
  if (storage.persisted !== null) return;
  try {
    if (!navigator.storage || !navigator.storage.persisted) return;
    navigator.storage.persisted().then(async p => {
      if (!p && navigator.storage.persist) {
        p = await navigator.storage.persist();
        try { localStorage.setItem(PERSIST_KEY, p ? "1" : "0"); } catch {}
      }
      storage.persisted = p;
      document.dispatchEvent(new CustomEvent("persistchange"));
    }).catch(() => {});
  } catch {}
}

/* ---------------- Sheet 三段式 ---------------- */
const sheet = document.getElementById("sheet");
const sheetHeader = document.getElementById("sheetHeader");
const sheetBody = document.getElementById("sheetBody");
const sheetFooter = document.getElementById("sheetFooter");

let lastFocus = null;

export function showSheet() {
  lastFocus = document.activeElement;
  sheet.classList.remove("hidden");
  sheet.scrollTop = 0;
  setTimeout(() => {
    const f = sheet.querySelector("button, a, [tabindex]:not([tabindex='-1'])");
    if (f) f.focus();
  }, 60);
}

export function closeSheet() {
  sheet.classList.add("hidden");
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  lastFocus = null;
}

export function setSheet(headerHtml, bodyHtml, footerEl) {
  sheetHeader.innerHTML =
    `<div class="sheet-header-main">${headerHtml}</div>` +
    '<button class="sheet-close-btn" type="button" aria-label="关闭">✕</button>';
  sheetHeader.querySelector(".sheet-close-btn").onclick = closeSheet;

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
  showSheet();
}

sheet.addEventListener("click", e => { if (e.target === sheet) closeSheet(); });

// Esc 关闭；Tab 焦点锁定在弹层内
document.addEventListener("keydown", e => {
  if (sheet.classList.contains("hidden")) return;
  if (e.key === "Escape") { closeSheet(); return; }
  if (e.key !== "Tab") return;
  const f = sheet.querySelectorAll("button, a[href], input, select, [tabindex]:not([tabindex='-1'])");
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ---------------- 顶栏滚动阴影 ---------------- */
const bar = document.querySelector(".appbar");
let lastScroll = -1;
window.addEventListener("scroll", () => {
  const y = window.pageYOffset || document.documentElement.scrollTop;
  if (Math.abs(y - lastScroll) < 6) return;
  lastScroll = y;
  bar.classList.toggle("scrolled", y > 6);
}, { passive: true });
