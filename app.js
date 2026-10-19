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

$$(".nav-btn").forEach(b => {
  b.addEventListener("click", () => {
    TAB = b.getAttribute("data-tab");
    $$(".nav-btn").forEach(x => x.classList.toggle("active", x === b));
    RENDERERS[TAB]();
    window.scrollTo({ top: 0 });
  });
});

RENDERERS[TAB]();
