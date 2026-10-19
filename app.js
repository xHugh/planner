/* 入口：路由、导航、初始化 */
import { $, $$ } from "./js/core.js";
import { renderPlan, setSessionCounter } from "./js/plan.js";
import { renderLog, sessionsOfDay } from "./js/log.js";
import { renderProgress } from "./js/progress.js";

const view = $("#view");
const subEl = $("#appbarSub");

// plan 页的「已练 N 次」计数由 log 页提供，避免循环依赖
setSessionCounter(id => sessionsOfDay(id).length);

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

$$(".nav-btn").forEach(b => {
  b.addEventListener("click", () => {
    setTab(b.getAttribute("data-tab"));
    RENDERERS[TAB]();
    window.scrollTo({ top: 0 });
  });
});

setTab(TAB);
RENDERERS[TAB]();
