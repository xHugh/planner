/* 入口：路由、导航、草稿/会话工具、初始化 */
(function () {
  "use strict";
  var PLAN = window.PLAN;
  var view = document.getElementById("view");
  var subEl = document.getElementById("appbarSub");

  window.view = view;
  window.subEl = subEl;
  window.TAB = "plan";

  /* ---------------- 数据工具 ---------------- */
  window.lastEntry = function (moveName, beforeDate) {
    var list = db.sessions.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (beforeDate && s.date > beforeDate) continue;
      for (var j = 0; j < s.moves.length; j++) {
        if (s.moves[j].name === moveName) return { date: s.date, move: s.moves[j] };
      }
    }
    return null;
  };

  window.sessionsOfDay = function (dayId) {
    return db.sessions.filter(function (s) { return s.dayId === dayId; });
  };

  window.emptyMoves = function (day, date) {
    return day.moves.map(function (m, mi) {
      var prev = window.lastEntry(m.name, date);
      var t = prev && prev.move.sets.filter(function (x) { return x.done && +x.weight; })[0];
      var w = t ? t.weight : "";
      var reps = t && t.reps ? t.reps : "";
      var sets = [];
      for (var i = 0; i < m.sets; i++) sets.push({ weight: w, reps: reps, done: false });
      return { index: mi, name: m.name, sets: sets };
    });
  };

  window.getDraft = function (dayId, date, resume) {
    var k = dayId + "@" + date;
    var d0 = window.dayById(dayId);
    if (!resume && db.drafts[k] && d0) {
      var c0 = window.countDone(db.drafts[k]);
      if (c0.done > 0) {
        return { key: k, dayId: dayId, date: date, startedAt: null, fresh: true, moves: window.emptyMoves(d0, date), rir: 2, pain: 0, note: "" };
      }
    }
    if (!db.drafts[k]) {
      db.drafts[k] = { key: k, dayId: dayId, date: date, startedAt: null, moves: window.emptyMoves(d0, date), rir: 2, pain: 0, note: "" };
    }
    var dr = db.drafts[k];
    if (dr.rir == null || dr.pain == null) {
      var legacyPain = 0, legacyNote = "";
      dr.moves.forEach(function (m) {
        if (m.pain > legacyPain) legacyPain = m.pain;
        if (!legacyNote && m.note) legacyNote = m.note;
      });
      if (dr.rir == null) dr.rir = dr.moves[0] && dr.moves[0].rir != null ? dr.moves[0].rir : 2;
      if (dr.pain == null) dr.pain = legacyPain;
      if (dr.note == null || dr.note === "") dr.note = legacyNote;
    }
    return dr;
  };

  window.findMove = function (draft, name) {
    for (var i = 0; i < draft.moves.length; i++) if (draft.moves[i].name === name) return draft.moves[i];
    return null;
  };

  /* ---------------- 底部导航 ---------------- */
  $$(".nav-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      window.TAB = b.getAttribute("data-tab");
      $$(".nav-btn").forEach(function (x) { x.classList.toggle("active", x === b); });
      render();
      window.scrollTo({ top: 0 });
    });
  });

  function render() {
    if (window.TAB === "plan") window.renderPlan();
    else if (window.TAB === "log") window.renderLog();
    else if (window.TAB === "progress") window.renderProgress();
  }

  render();

})();
