/* 计划页：今日大卡、一周安排、训练日卡片、计划弹层、休息日弹层 */
(function () {
  "use strict";
  var PLAN = window.PLAN;

  window.weekIndex = function (d) { return (d.getDay() + 6) % 7; };
  window.plannedDayId = function (d) { return PLAN.week[weekIndex(d)]; };
  window.dayById = function (id) {
    for (var i = 0; i < PLAN.days.length; i++) if (PLAN.days[i].id === id) return PLAN.days[i];
    return null;
  };

  window.renderPlan = function () {
    window.subEl.textContent = "4 分化 · 固定器械 · 减伤版";
    window.view.innerHTML = "";

    var now = new Date();
    var todayId = plannedDayId(now);
    var t = todayId ? dayById(todayId) : null;

    var hero = el("div", "hero");
    hero.innerHTML = html`
      <div class="eyebrow">📅 ${esc(PLAN.weekdays[weekIndex(now)])} · ${now.getMonth() + 1}月${now.getDate()}日</div>
      <h2>${esc(t ? t.name : "休息日")}</h2>
      <p>${esc(t ? t.focus + " · " + t.moves.length + " 个动作" : "建议 20-30 分钟低强度有氧，或完全休息")}</p>`;
    if (t) {
      var act = el("div", "actions");
      var b1 = el("button", "btn primary", "开始今天");
      b1.onclick = function () { window.openWorkout(t.id, window.today()); };
      var b2 = el("button", "btn ghost", "查看计划");
      b2.onclick = function () { window.showPlanSheet(t.id); };
      act.appendChild(b1); act.appendChild(b2);
      hero.appendChild(act);
    }
    window.view.appendChild(hero);

    var week = el("div", "week");
    PLAN.week.forEach(function (id, i) {
      var isToday = i === weekIndex(now);
      var c = el("button", "daychip" + (isToday ? " today" : "") + (id ? "" : " rest"));
      c.type = "button";
      if (id) c.setAttribute("data-day", id);
      c.setAttribute("aria-label", PLAN.weekdays[i] + " " + (id ? dayById(id).name : "休息"));
      c.innerHTML = html`<b>${id ? esc(dayById(id).short) : "休"}</b><span>${PLAN.weekdays[i].slice(1)}</span>`;
      c.onclick = function () {
        if (id) window.showPlanSheet(id);
        else window.showRestSheet(i);
      };
      week.appendChild(c);
    });
    window.view.appendChild(week);

    window.view.appendChild(el("div", "section-h", "5 个训练日"));
    PLAN.days.forEach(function (d) {
      var doneCount = window.sessionsOfDay(d.id).length;
      var c = el("div", "card");
      var setsTotal = d.moves.reduce(function (a, m) { return a + m.sets; }, 0);
      c.style.borderTop = "3px solid var(--d-" + d.id + ")";
      c.innerHTML = html`
        <div class="card-title"><span>${esc(d.name)}</span>
        ${doneCount ? '<span class="badge primary">已练 ' + doneCount + " 次</span>" : ""}</div>
        <p class="card-sub">${esc(d.focus)} · ${d.moves.length} 个动作 · ${setsTotal} 组</p>`;
      var btn = el("button", "btn sm outline", "查看动作 →");
      btn.style.marginTop = "12px";
      btn.onclick = function (e) { e.stopPropagation(); window.showPlanSheet(d.id); };
      c.appendChild(btn);
      c.onclick = function () { window.showPlanSheet(d.id); };
      window.view.appendChild(c);
    });

    var rc = el("div", "card");
    rc.innerHTML = html`<div class="card-title">🛡 减伤规则</div>
      <ol class="rules-list">${list(PLAN.rules, function (r) { return "<li>" + esc(r) + "</li>"; })}</ol>`;
    window.view.appendChild(rc);
  };

  window.showRestSheet = function (dayIdx) {
    var todayIdx = weekIndex(new Date());
    var nextIdx = -1;
    for (var k = 1; k <= 7; k++) {
      var j = (dayIdx + k) % 7;
      if (PLAN.week[j]) { nextIdx = j; break; }
    }
    var nextDay = nextIdx >= 0 ? dayById(PLAN.week[nextIdx]) : null;

    var headerHtml = html`
      <div class="card-title sheet-head-title-lg">${esc(PLAN.weekdays[dayIdx])} · 休息日</div>
      <p class="card-sub">肌肉在休息时生长。完全停练不会掉肌肉，但会掉训练状态。</p>`;

    var htmlBody = html`
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
      htmlBody += html`
        <div class="card card-fill">
          <div class="card-sub">下一个训练日</div>
          <div class="card-title">${esc(PLAN.weekdays[nextIdx])} · ${esc(nextDay.name)}</div>
          <p class="card-sub">${esc(nextDay.focus)}</p></div>`;
    }

    htmlBody += html`<p class="move-tip mt-16 text-center">休息日也可以开「记录」页补记，避免漏掉历史。</p>`;

    window.setSheet(headerHtml, htmlBody, null);
  };

  window.showPlanSheet = function (dayId) {
    var d = dayById(dayId);
    var headerHtml = html`
      <div class="card-title sheet-head-title">${esc(d.name)}</div>
      <p class="card-sub mb-12">${esc(d.focus)}</p>`;

    var htmlBody = list(d.moves, function (m, i) {
      return html`
        <div class="move">${moveBadge(i + 1).outerHTML}
          <div class="move-body"><div class="move-name">${esc(m.name)}
            ${i === 0 ? '<span class="badge primary">主项</span>' : ""}
            ${m.cardio ? '<span class="badge cardio">有氧</span>' : ""}</div>
          <div class="move-meta">${m.sets} 组 × ${m.lo === m.hi ? m.lo : m.lo + "-" + m.hi}${m.cardio ? " 分钟" : " 次"}</div>
          <div class="move-tip">${esc(m.tip)}</div></div></div>`;
    });

    var goBtn = el("button", "btn solid full", "按这个计划开练");
    goBtn.onclick = function () { window.closeSheet(); window.openWorkout(dayId, window.today()); };

    window.setSheet(headerHtml, htmlBody, goBtn);
  };

})();
