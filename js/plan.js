/* 计划页：今日大卡、一周安排、训练日卡片、计划弹层、休息日弹层 */
import { PLAN } from "../data.js";
import { html, list, esc, el, today, setSheet, moveBadge, closeSheet } from "./core.js";

export function weekIndex(d) { return (d.getDay() + 6) % 7; }
export function plannedDayId(d) { return PLAN.week[weekIndex(d)]; }
export function dayById(id) {
  return PLAN.days.find(d => d.id === id) || null;
}

// 会话计数由 app.js 注入，避免 plan <-> log 循环 import
let countSessionsOfDay = () => 0;
export function setSessionCounter(fn) { countSessionsOfDay = fn; }

export function renderPlan(view, subEl) {
  subEl.textContent = "4 分化 · 固定器械 · 减伤版";
  view.innerHTML = "";

  const now = new Date();
  const todayId = plannedDayId(now);
  const t = todayId ? dayById(todayId) : null;

  const hero = el("div", "hero");
  hero.innerHTML = html`
    <div class="eyebrow">📅 ${PLAN.weekdays[weekIndex(now)]} · ${now.getMonth() + 1}月${now.getDate()}日</div>
    <h2>${t ? esc(t.name) : "休息日"}</h2>
    <p>${t ? esc(t.focus) + " · " + t.moves.length + " 个动作" : "建议 20-30 分钟低强度有氧，或完全休息"}</p>`;
  if (t) {
    const act = el("div", "actions");
    const b1 = el("button", "btn primary", "开始今天");
    b1.onclick = async () => {
      const { openWorkout } = await import("./log.js");
      openWorkout(t.id, today());
    };
    const b2 = el("button", "btn ghost", "查看计划");
    b2.onclick = () => showPlanSheet(t.id);
    act.append(b1, b2);
    hero.appendChild(act);
  }
  view.appendChild(hero);

  const week = el("div", "week");
  PLAN.week.forEach((id, i) => {
    const isToday = i === weekIndex(now);
    const c = el("button", "daychip" + (isToday ? " today" : "") + (id ? "" : " rest"));
    c.type = "button";
    if (id) c.setAttribute("data-day", id);
    c.setAttribute("aria-label", PLAN.weekdays[i] + " " + (id ? dayById(id).name : "休息"));
    c.innerHTML = html`<b>${id ? esc(dayById(id).short) : "休"}</b><span>${PLAN.weekdays[i].slice(1)}</span>`;
    c.onclick = () => (id ? showPlanSheet(id) : showRestSheet(i));
    week.appendChild(c);
  });
  view.appendChild(week);

  view.appendChild(el("div", "section-h", "5 个训练日"));
  PLAN.days.forEach(d => {
    const doneCount = countSessionsOfDay(d.id);
    const c = el("div", "card");
    const setsTotal = d.moves.reduce((a, m) => a + m.sets, 0);
    c.style.borderTop = "3px solid var(--d-" + d.id + ")";
    c.innerHTML = html`
      <div class="card-title"><span>${esc(d.name)}</span>
      ${doneCount ? `<span class="badge primary">已练 ${doneCount} 次</span>` : ""}</div>
      <p class="card-sub">${esc(d.focus)} · ${d.moves.length} 个动作 · ${setsTotal} 组</p>`;
    const btn = el("button", "btn sm outline", "查看动作 →");
    btn.style.marginTop = "12px";
    btn.onclick = e => { e.stopPropagation(); showPlanSheet(d.id); };
    c.appendChild(btn);
    c.onclick = () => showPlanSheet(d.id);
    view.appendChild(c);
  });

  const rc = el("div", "card");
  rc.innerHTML = html`
    <div class="card-title">🛡 减伤规则</div>
    <ol class="rules-list">${list(PLAN.rules, r => "<li>" + esc(r) + "</li>")}</ol>`;
  view.appendChild(rc);
}

export function showRestSheet(dayIdx) {
  let nextIdx = -1;
  for (let k = 1; k <= 7; k++) {
    const j = (dayIdx + k) % 7;
    if (PLAN.week[j]) { nextIdx = j; break; }
  }
  const nextDay = nextIdx >= 0 ? dayById(PLAN.week[nextIdx]) : null;

  const headerHtml = html`
    <div class="card-title sheet-head-title-lg">${esc(PLAN.weekdays[dayIdx])} · 休息日</div>
    <p class="card-sub">肌肉在休息时生长。完全停练不会掉肌肉，但会掉训练状态。</p>`;

  let body = html`
    <div class="section-h section-h-tight">建议安排</div>
    <div class="move"><div class="move-thumb-time">20′</div>
      <div class="move-body"><div class="move-name">低强度有氧</div>
      <div class="move-meta">椭圆机 / 台阶机 / 快走，20-30 分钟</div>
      <div class="move-tip">强度控制在能正常说话的范围内，目的是促进血液循环、帮助恢复，<b>不要</b>做成力竭有氧。</div></div></div>
    <div class="move"><div class="move-thumb-time">10′</div>
      <div class="move-body"><div class="move-name">拉伸与放松</div>
      <div class="move-meta">胸、背、髋、腘绳肌各 30 秒</div>
      <div class="move-tip">训练后 24 小时内做静态拉伸，重点放在当天练过的肌群。</div></div></div>
    <div class="move"><div class="move-thumb-time">≥7h</div>
      <div class="move-body"><div class="move-name">睡够 7-9 小时</div>
      <div class="move-meta">蛋白质约 1.6-2.2 g/kg 体重</div>
      <div class="move-tip">恢复本身也是训练的一部分，尤其是每周练 5-6 天时。</div></div></div>`;

  if (nextDay) {
    body += html`
      <div class="card card-fill">
        <div class="card-sub">下一个训练日</div>
        <div class="card-title">${esc(PLAN.weekdays[nextIdx])} · ${esc(nextDay.name)}</div>
        <p class="card-sub">${esc(nextDay.focus)}</p></div>`;
  }
  body += html`<p class="move-tip mt-16 text-center">休息日也可以开「记录」页补记，避免漏掉历史。</p>`;

  setSheet(headerHtml, body, null);
}

export function showPlanSheet(dayId) {
  const d = dayById(dayId);
  const headerHtml = html`
    <div class="card-title sheet-head-title">${esc(d.name)}</div>
    <p class="card-sub mb-12">${esc(d.focus)}</p>`;

  const body = list(d.moves, (m, i) => html`
    <div class="move">${moveBadge(i + 1).outerHTML}
      <div class="move-body"><div class="move-name">${esc(m.name)}
        ${i === 0 ? '<span class="badge primary">主项</span>' : ""}
        ${m.cardio ? '<span class="badge cardio">有氧</span>' : ""}</div>
      <div class="move-meta">${m.sets} 组 × ${m.lo === m.hi ? m.lo : m.lo + "-" + m.hi}${m.cardio ? " 分钟" : " 次"}</div>
      <div class="move-tip">${esc(m.tip)}</div></div></div>`);

  const goBtn = el("button", "btn solid full", "按这个计划开练");
  goBtn.onclick = async () => {
    const { openWorkout } = await import("./log.js");
    closeSheet();
    openWorkout(dayId, today());
  };

  setSheet(headerHtml, body, goBtn);
}
