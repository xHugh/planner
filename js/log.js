/* 记录页：开始表单、草稿列表、历史列表、会话详情
   训练进行中：openWorkout / closeWorkout / renderWorkout / finishWorkout */
(function () {
  "use strict";
  var PLAN = window.PLAN;

  /* ---------------- 记录页 ---------------- */
  window.renderLog = function () {
    window.view.innerHTML = "";
    window.subEl.textContent = "选择日期与训练日";
    var date = window.today();
    var guess = plannedDayId(new Date());
    if (!guess) guess = "w1";

    var c = el("div", "card start-card");
    c.innerHTML = html`
      <div class="card-title">▶ 开始一次训练</div>
      <p class="card-sub">记录只保存在这台设备，不上传</p>`;

    var grid = el("div", "start-grid");

    var dateBox = el("div");
    dateBox.appendChild(el("label", "field-label", "训练日期"));
    var inpDate = el("input");
    inpDate.type = "date";
    inpDate.value = date;
    dateBox.appendChild(inpDate);

    var dayBox = el("div");
    dayBox.appendChild(el("label", "field-label", "训练日"));
    var chipsBox = chips(
      PLAN.days.map(function (d) {
        return { v: d.id, label: d.name.split(" ")[0] + " " + d.short };
      }),
      guess,
      function () {}
    );
    chipsBox.dataset.pick = guess;
    chipsBox.addEventListener("click", function (e) {
      var btn = e.target.closest(".pick");
      if (!btn) return;
      chipsBox.dataset.pick = btn.textContent.trim().split(" ")[0].toLowerCase();
    });
    dayBox.appendChild(chipsBox);

    grid.appendChild(dateBox);
    grid.appendChild(dayBox);
    c.appendChild(grid);

    var go = el("button", "btn solid full", "开始记录 →");
    go.style.marginTop = "16px";
    go.onclick = function () {
      if (!inpDate.value) { toast("请选择日期"); return; }
      window.openWorkout(chipsBox.dataset.pick, inpDate.value);
    };
    c.appendChild(go);
    window.view.appendChild(c);

    var keys = Object.keys(db.drafts);
    if (keys.length) {
      window.view.appendChild(el("div", "section-h", "未完成的训练"));
      keys.forEach(function (k) {
        var dr = db.drafts[k];
        if (!dr || !dr.moves) return;
        var d = dayById(dr.dayId);
        if (!d) return;
        var doneSets = 0, total = 0;
        dr.moves.forEach(function (m) { m.sets.forEach(function (s) { total++; if (s.done) doneSets++; }); });
        var row = el("button", "row row-tap");
        row.type = "button";
        row.style.borderLeft = "3px solid var(--d-" + dr.dayId + ")";
        row.innerHTML = html`
          <div class="row-main">
            <div class="row-title">${esc(d.name)} · ${fmtDate(dr.date)}</div>
            <div class="row-sub">已完成 ${doneSets}/${total} 组</div>
          </div>
          <span class="row-arrow" aria-hidden="true">›</span>`;
        row.setAttribute("aria-label", "继续 " + d.name + " " + dr.date + " 的训练");
        row.onclick = function () { window.openWorkout(dr.dayId, dr.date, true); };
        window.view.appendChild(row);
      });
    }

    window.view.appendChild(el("div", "section-h", "训练历史"));
    if (!db.sessions.length) {
      window.view.appendChild(el("div", "empty", "<strong>🏋️</strong>还没有记录。<br>做完第一次训练后，这里会显示历史。"));
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
      var row = el("button", "row row-tap");
      row.type = "button";
      row.style.borderLeft = "3px solid var(--d-" + s.dayId + ")";
      row.innerHTML = html`
        <div class="row-main">
          <div class="row-title">${esc(d ? d.name : s.dayId)} · ${fmtDate(s.date)}</div>
          <div class="row-sub">${sets} 组 · 容量 ${Math.round(vol)} kg · 时长 ${s.durationMin || "—"} 分
            ${s.maxPain >= 4 ? ' · <span class="text-danger-strong">疼痛 ' + s.maxPain + "/10</span>" : ""}</div>
        </div>
        <span class="row-arrow" aria-hidden="true">›</span>`;
      row.setAttribute("aria-label", "查看 " + (d ? d.name : s.dayId) + " " + s.date + " 的训练详情");
      row.onclick = function () { window.showSessionSheet(s.id); };
      list.appendChild(row);
    });
    window.view.appendChild(list);
  };

  window.showSessionSheet = function (id) {
    var s = db.sessions.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    var d = dayById(s.dayId);

    var sets = 0, vol = 0;
    s.moves.forEach(function (m) {
      m.sets.forEach(function (x) { if (x.done) { sets++; vol += (+x.weight || 0) * (+x.reps || 0); } });
    });

    var headerHtml = html`
      <div class="card-title sheet-head-title">${esc(d ? d.name : s.dayId)}</div>
      <p class="card-sub">${fmtDate(s.date)} · ${sets} 组 · 容量 ${Math.round(vol)} kg</p>`;

    var htmlBody = "";
    if (s.rir != null || s.maxPain != null) {
      htmlBody += html`
        <div class="flex-gap-8 mb-6">
          <span class="badge primary">RIR ${s.rir != null ? s.rir : "—"}</span>
          <span class="badge${(s.maxPain || 0) >= 4 ? "" : " cardio"}">疼痛 ${s.maxPain || 0}/10</span>
          ${s.durationMin ? '<span class="badge">' + s.durationMin + " 分钟</span>" : ""}
        </div>`;
    }
    if (s.note) htmlBody += html`<p class="move-tip mt-4">${esc(s.note)}</p>`;
    s.moves.forEach(function (m) {
      htmlBody += html`<div class="mt-14"><div class="move-name">${esc(m.name)}</div>`;
      var rows = list(m.sets, function (x, i) {
        return html`<tr><td>${i + 1}</td><td>${esc(x.weight || "-")}</td><td>${esc(x.reps || "-")}</td><td>${x.done ? "✓" : "—"}</td></tr>`;
      });
      htmlBody += html`<table class="data"><thead><tr><th>组</th><th>重量 kg</th><th>次数</th><th>完成</th></tr></thead><tbody>${rows}</tbody></table>`;
      if (m.note) htmlBody += html`<div class="move-tip">备注：${esc(m.note)}</div>`;
      if (m.rir != null) htmlBody += html`<div class="move-tip">RIR ${m.rir} · 疼痛 ${m.pain || 0}/10</div>`;
    });

    var delBtn = el("button", "btn danger full", "删除这条记录");
    delBtn.onclick = function () {
      if (!confirm("删除 " + fmtDate(s.date) + " 的这条训练记录？此操作不可撤销。")) return;
      db.sessions = db.sessions.filter(function (x) { return x.id !== s.id; });
      saveDB();
      window.closeSheet();
      window.renderLog();
      toast("已删除");
    };

    window.setSheet(headerHtml, htmlBody, delBtn);
  };

  /* ---------------- 训练进行中 ---------------- */
  window.wo = null;

  window.setWorkoutMode = function (on) {
    document.body.classList.toggle("in-workout", !!on);
    if (window.workoutDock) window.workoutDock.classList.toggle("hidden", !on);
  };

  window.openWorkout = function (dayId, date, resume) {
    var d = dayById(dayId);
    if (!d) return;
    var draft = window.getDraft(dayId, date, resume);
    if (draft.fresh) { delete draft.fresh; db.drafts[draft.key] = draft; }
    if (!draft.startedAt) { draft.startedAt = Date.now(); }
    saveDB();
    wo = { draft: draft, timerId: null };
    window.TAB = "log";
    setWorkoutMode(true);
    window.renderWorkout(d);
    window.scrollTo({ top: 0 });
  };

  window.closeWorkout = function (save) {
    if (wo && wo.timerId) clearInterval(wo.timerId);
    wo = null;
    setWorkoutMode(false);
    if (save) saveDB();
    window.renderLog();
  };

  function ringSvg(done, total) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    var R = 23, C = 2 * Math.PI * R;
    return html`
      <div class="ring">
        <svg viewBox="0 0 58 58" aria-hidden="true">
          <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#2563eb"/><stop offset="100%" stop-color="#06b6d4"/>
          </linearGradient></defs>
          <circle cx="29" cy="29" r="${R}" fill="none" stroke="var(--fill)" stroke-width="6"/>
          <circle cx="29" cy="29" r="${R}" fill="none" stroke="url(#ringGrad)" stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"/>
        </svg>
        <div class="lbl">${pct}%</div></div>`;
  }

  window.renderWorkout = function (d) {
    window.view.innerHTML = "";
    var dr = wo.draft;

    var totalSets = 0, doneSets = 0;
    dr.moves.forEach(function (m) { m.sets.forEach(function (s) { totalSets++; if (s.done) doneSets++; }); });

    var head = el("div", "card wo-summary");
    head.innerHTML = html`
      <div class="wo-head">
        <div class="wo-head-main">
          <div class="card-title">${esc(d.name)}</div>
          <p class="card-sub" id="woSub">${dr.date} · 已完成 ${doneSets}/${totalSets} 组</p>
        </div>
        <div class="flex-center">${ringSvg(doneSets, totalSets)}<div id="timer" class="timer">--:--</div></div>
      </div>`;

    head.appendChild(el("label", "field-label", "RIR · 这次整体留了几分余力"));
    head.appendChild(chips(
      [0, 1, 2, 3, 4].map(function (v) { return { v: v, label: "RIR " + v, warn: v <= 1 }; }),
      dr.rir,
      function (v) { dr.rir = v; saveDB(); }
    ));

    head.appendChild(el("label", "field-label", "疼痛评分（0 = 无痛，10 = 无法忍受）"));
    var painShown = dr.pain % 2 === 1 ? dr.pain + 1 : dr.pain;
    head.appendChild(chips(
      [0, 2, 4, 6, 8].map(function (v) { return { v: v, label: String(v), danger: v >= 4 }; }),
      painShown,
      function (v) {
        dr.pain = v; saveDB();
        if (v >= 4) toast("疼痛 ≥4：停止该动作并考虑就医");
      }
    ));

    head.appendChild(el("label", "field-label", "备注（今天的整体感受 / 调整）"));
    var note = el("input"); note.type = "text";
    note.placeholder = "例如：睡眠不足，整体降了 5kg";
    note.value = dr.note || "";
    note.oninput = function () { dr.note = note.value; saveDB(); };
    head.appendChild(note);
    window.view.appendChild(head);

    d.moves.forEach(function (m, mi) {
      var st = window.findMove(dr, m.name);
      if (!st) return;
      var card = el("div", "card wo-move");
      var prev = window.lastEntry(m.name, dr.date);
      var prevTxt = "";
      if (prev) {
        var pw = prev.move.sets.filter(function (x) { return x.weight; }).map(function (x) { return x.weight + "kg×" + (x.reps || "?"); }).slice(0, 3).join(" / ");
        if (pw) prevTxt = "上次 " + fmtDate(prev.date) + "：" + pw;
      }
      var thumb = moveBadge(mi + 1);
      card.innerHTML = html`
        <div class="move move-flat">
          <div class="move-body">
            <div class="move-name">${esc(m.name)}</div>
            <div class="move-meta">目标 ${m.sets} 组 × ${m.lo === m.hi ? m.lo : m.lo + "-" + m.hi}${m.cardio ? " 分钟" : " 次"}
              ${prevTxt ? ' · <span class="prev">' + esc(prevTxt) + "</span>" : ""}</div>
          </div></div>`;
      card.querySelector(".move").insertBefore(thumb, card.querySelector(".move-body"));

      var setHead = el("div", "setrow");
      setHead.innerHTML = '<div class="set-head">组</div><div class="set-head">重量 kg</div><div class="set-head">次数</div><div class="set-head">完成</div>';
      card.appendChild(setHead);

      st.sets.forEach(function (s, si) {
        card.appendChild(setRow(m, s, si,
          function () {
            s.done = !s.done;
            if (s.done && !s.reps) s.reps = m.lo;
            saveDB();
          },
          function (field, value) { s[field] = value; saveDB(); }
        ));
      });

      if (prev) {
        var fill = el("button", "btn sm outline fill-btn", "按上次重量填入");
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

      window.view.appendChild(card);
    });

    var tEl = $("#timer");
    function tick() {
      var sec = Math.floor((Date.now() - dr.startedAt) / 1000);
      tEl.textContent = String(Math.floor(sec / 60)).padStart(2, "0") + ":" + pad(sec % 60);
    }
    tick();
    if (wo.timerId) clearInterval(wo.timerId);
    wo.timerId = setInterval(tick, 1000);

    var counter = function () {
      var c = window.countDone(dr);
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

    window.woFinishBtn.onclick = function () { window.finishWorkout(d); };
    window.woExitBtn.onclick = function () { window.closeWorkout(true); toast("已保存草稿"); };
  };

  window.countDone = function (dr) {
    var done = 0, total = 0;
    dr.moves.forEach(function (m) { m.sets.forEach(function (s) { total++; if (s.done) done++; }); });
    return { done: done, total: total };
  };

  window.finishWorkout = function (d) {
    var dr = wo.draft;
    var c = countDone(dr);
    if (!c.done) { toast("还没有勾选任何一组"); return; }
    if (!confirm("完成这次训练？已完成 " + c.done + "/" + c.total + " 组")) return;
    var duration = Math.round((Date.now() - dr.startedAt) / 60000);
    var maxPain = 0;
    dr.moves.forEach(function (m) { if (m.pain > maxPain) maxPain = m.pain; });
    var moves = dr.moves.map(function (m) {
      return {
        name: m.name,
        sets: m.sets.map(function (s) { return { weight: s.weight, reps: s.reps, done: !!s.done }; }),
      };
    });
    db.sessions.push({
      id: uid(), dayId: d.id, date: dr.date, startedAt: dr.startedAt,
      durationMin: Math.max(duration, 1), moves: moves,
      rir: dr.rir != null ? dr.rir : 2,
      maxPain: Math.max(dr.pain || 0, maxPain),
      note: dr.note || "",
    });
    delete db.drafts[dr.key];
    saveDB();
    if (wo.timerId) clearInterval(wo.timerId);
    wo = null;
    setWorkoutMode(false);
    toast("训练已保存");
    window.renderLog();
  };

})();
