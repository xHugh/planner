/* 入口：路由、导航、初始化 */
import { $, $$, requestPersist, toast, loadDB, db, normalizeDrafts } from "./js/core.js";
import { renderPlan, setSessionCounter } from "./js/plan.js";
import { renderLog, sessionsOfDay, state } from "./js/log.js";
import { renderProgress } from "./js/progress.js";

const view = $("#view");
const subEl = $("#appbarSub");

// plan 页的「已练 N 次」计数由 log 页提供，避免循环依赖
setSessionCounter(id => sessionsOfDay(id).length);

// 申请持久化存储，避免浏览器长期不用时清掉本机记录
requestPersist();

const RENDERERS = {
  plan: () => renderPlan(view, subEl),
  log: () => renderLog(view, subEl),
  progress: () => renderProgress(view, subEl),
};

let TAB = "plan";

function setTab(tab) {
  TAB = tab;
  $$(".nav-btn").forEach(x => {
    const on = x.getAttribute("data-tab") === tab;
    x.classList.toggle("active", on);
    if (on) x.setAttribute("aria-current", "page");
    else x.removeAttribute("aria-current");
  });
  document.dispatchEvent(new CustomEvent("tabchange", { detail: { tab } }));
}

// 唯一的切页入口：底栏高亮、aria-current、页面渲染一起更新
function go(tab) {
  if (!RENDERERS[tab]) return;
  setTab(tab);
  RENDERERS[tab]();
  window.scrollTo({ top: 0 });
}

$$(".nav-btn").forEach(b => {
  b.addEventListener("click", () => go(b.getAttribute("data-tab")));
});

// 页面内部（完成训练、删除记录）请求切页；log.js 不用反向 import app.js
document.addEventListener("navigate", e => {
  const tab = e.detail && e.detail.tab;
  if (tab) go(tab);
});

// 本地库是「最后写入胜出」的整量写盘模型：训练中若只提醒不合并，本标签页随后任何一次
// saveDB()（含输入防抖触发的那次）都会把内存里的旧 sessions 整量写回，抹掉对方刚写入的记录。
// 草稿容器保持本标签页自己的：正在训练的草稿不能被对方的内容替换。
let warnedOtherTab = false;
window.addEventListener("storage", e => {
  if (e.key !== "gym4.db.v1" || !e.newValue) return;
  const fresh = loadDB();
  if (state.wo) {
    // 去重按 id：loadDB() 每次 JSON.parse 都产生全新对象，引用比较（includes）对内存里
    // 已有的记录也永远返回 false，会把已有记录再 push 一遍造成同 id 记录翻倍。
    const have = new Set(db.sessions.map(s => s.id));
    fresh.sessions.forEach(s => { if (s && !have.has(s.id)) { db.sessions.push(s); have.add(s.id); } });
    if (!warnedOtherTab) { warnedOtherTab = true; toast("另一个标签页改了数据，已并入这次的记录"); }
    return;
  }
  warnedOtherTab = false;
  db.sessions = fresh.sessions;
  db.drafts = fresh.drafts;
  // 另一个标签页写来的草稿键未必规范，归一化后再渲染
  normalizeDrafts();
  RENDERERS[TAB]();
});

go(TAB);
