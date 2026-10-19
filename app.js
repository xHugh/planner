/* 入口：路由、导航、初始化 */
import { $, $$, requestPersist, toast, loadDB, db } from "./js/core.js";
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

// 另一个标签页改了数据：空闲时同步后重绘；训练中只提醒一次，避免用旧数据覆盖它
let warnedOtherTab = false;
window.addEventListener("storage", e => {
  if (e.key !== "gym4.db.v1" || !e.newValue) return;
  if (state.wo) {
    if (!warnedOtherTab) { warnedOtherTab = true; toast("另一个标签页改了数据，这里的保存可能覆盖它"); }
    return;
  }
  warnedOtherTab = false;
  const fresh = loadDB();
  db.sessions = fresh.sessions;
  db.drafts = fresh.drafts;
  RENDERERS[TAB]();
});

go(TAB);
