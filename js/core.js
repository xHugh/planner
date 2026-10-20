/* 核心工具：模板、DOM、主题、存储、Sheet
   供 plan.js / log.js / progress.js 共享，无页面逻辑 */

/* ---------------- 模板 ---------------- */
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
    // 勾选时没填次数，onToggle 会补一个默认值；同步回显，别只写进数据
    if (!reps.value && s.reps != null && s.reps !== "") reps.value = s.reps;
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
  // theme-color 的取值要与 index.html 首屏内联脚本保持一致（两边都要改）
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
    if (!d || typeof d !== "object" || Array.isArray(d)) return { sessions: [], drafts: {} };
    // 容器类型不对（手改 localStorage、旧版遗留）时退化为空集合。
    // 只判真值不够：db.sessions.filter / delete db.drafts[k] 遇到非数组、非对象
    // 会直接抛错，把整页打崩。
    if (!Array.isArray(d.sessions)) d.sessions = [];
    if (!d.drafts || typeof d.drafts !== "object" || Array.isArray(d.drafts)) d.drafts = {};
    return d;
  } catch {
    return { sessions: [], drafts: {} };
  }
}

// 模块级单例；各模块 import 同一个引用
export const db = loadDB();

// 返回是否真的写进了 localStorage：调用方据此决定能不能提示成功、能不能丢草稿
export function saveDB() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return true;
  } catch {
    toast("存储失败：浏览器空间不足");
    return false;
  }
}

// 可用记录：旧版本遗留或手改 localStorage 的残缺记录可能缺字段，
// 消费前统一过滤，避免各页面各自判空时漏掉一处。
// 每个动作的 sets 必须是数组，sets 里的元素也必须是对象——消费端直接
// m.sets.forEach 再读 x.done，只查 moves 挡不住「sets 缺」和 sets:[null]。
export function validSessions() {
  return db.sessions.filter(s =>
    s && typeof s.date === "string" && Array.isArray(s.moves)
    && s.moves.every(m => m && Array.isArray(m.sets)
      && m.sets.every(x => x && typeof x === "object")));
}

// 草稿结构是否可用：缺 moves / sets 的草稿会让记录页和训练页崩。
// 每个动作的 sets 必须是数组，sets 里的元素也必须是对象——消费端直接
// m.sets.forEach 再读 x.done / x.weight，只查 moves 挡不住「sets 缺」和 sets:[null]。
export function validDraft(dr) {
  return !!dr && typeof dr === "object" && !Array.isArray(dr)
    && typeof dr.dayId === "string" && typeof dr.date === "string"
    && Array.isArray(dr.moves)
    && dr.moves.every(m => m && typeof m.name === "string" && Array.isArray(m.sets)
      && m.sets.every(x => x && typeof x === "object"));
}

// 草稿的唯一键：同一天同一训练日只有一份
export const draftKey = (dayId, date) => dayId + "@" + date;

// 草稿身份归一化：结构坏的直接剔除，键不唯一的搬到 dayId@date 规范键下。
// 键不唯一会让「继续」打开空表单（getDraft 按规范键查不到）、让完成训练删不掉草稿
// （finishWorkout 按 dr.key 删，删成了 drafts[undefined]），进而重复生成记录。
//
// 抽成纯函数：传入草稿容器，返回归一化后的容器与是否变化的标记，调用方自己决定要不要替换。
// 草稿对象保持引用（只补 key 字段）——训练中的草稿正靠这个引用与 db.drafts 保持同步，
// 换成副本会让训练页的改动写不回本地库。
export function normalizeDraftMap(drafts) {
  const out = {};
  let changed = false;
  const canonical = new Set();   // 已经被规范键占用的身份
  Object.keys(drafts).forEach(k => {
    const dr = drafts[k];
    if (!validDraft(dr)) { changed = true; return; }
    const nk = draftKey(dr.dayId, dr.date);
    if (k !== nk || dr.key !== nk) changed = true;
    dr.key = nk;
    if (out[nk]) {
      // 同一身份出现两份：规范键下的那份优先，
      // 否则「继续」打开的是哪一份会取决于键的插入顺序。
      if (k === nk) { out[nk] = dr; canonical.add(nk); }
      return;
    }
    out[nk] = dr;
    if (k === nk) canonical.add(nk);
  });
  return { out, changed };
}

// 直接作用于 db.drafts 的包装：返回是否发生过归一化
export function normalizeDrafts() {
  const { out, changed } = normalizeDraftMap(db.drafts);
  db.drafts = out;
  return changed;
}

// 「有 N 条记录格式异常」告警卡：记录页与进度页共用
export function brokenCard(count) {
  const w = el("div", "card card-warn");
  w.innerHTML = html`
    <div class="card-title card-title-danger">⚠️ 有 ${count} 条记录格式异常已跳过</div>
    <p class="card-sub">这些记录缺少动作数据，无法显示或统计。可在进度页导出备份后手动清理。</p>`;
  return w;
}

/* ---------------- 持久化存储 ----------------
   申请后浏览器不会在磁盘紧张时清掉本机数据（iOS 尤其重要）。 */
export const storage = { persisted: null };
const PERSIST_KEY = "gym4.persist.v1";

// 上次的结果先在首屏用上，异步核验回来再更新
try {
  const saved = localStorage.getItem(PERSIST_KEY);
  if (saved === "1") storage.persisted = true;
  else if (saved === "0") storage.persisted = false;
} catch {}

export function requestPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persisted) return;
    navigator.storage.persisted().then(async p => {
      if (!p && navigator.storage.persist) p = await navigator.storage.persist();
      storage.persisted = p;
      try { localStorage.setItem(PERSIST_KEY, p ? "1" : "0"); } catch {}
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
  // 焦点在弹层之外：aria-modal="true" 承诺键盘焦点留在弹层内，先把它拉回来
  if (!sheet.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
    return;
  }
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
