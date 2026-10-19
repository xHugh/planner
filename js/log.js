/* 记录页：开始表单、草稿列表、历史列表、会话详情
   训练进行中：openWorkout / renderWorkout / finishWorkout */
import { PLAN } from "../data.js";
import {
  html, list, esc, el, chips, setRow, moveBadge, fmtDate, pad, today,
  db, saveDB, toast, uid, setSheet, $, closeSheet, validSessions, validDraft,
  brokenCard, draftKey, normalizeDrafts
} from "./core.js";
import { dayById, plannedDayId } from "./plan.js";

/* ---------------- 数据工具 ---------------- */
export function lastEntry(moveName, beforeDate) {
  const sessions = validSessions().sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const s of sessions) {
    if (beforeDate && s.date > beforeDate) continue;
    const m = s.moves.find(x => x.name === moveName);
    if (m) return { date: s.date, move: m };
  }
  return null;
}

export function sessionsOfDay(dayId) {
  return validSessions().filter(s => s.dayId === dayId);
}

export function emptyMoves(day, date) {
  return day.moves.map((m, mi) => {
    const prev = lastEntry(m.name, date);
    const t = prev && prev.move.sets.filter(x => x.done && +x.weight)[0];
    const sets = [];
    for (let i = 0; i < m.sets; i++) {
      sets.push({ weight: t ? t.weight : "", reps: t && t.reps ? t.reps : "", done: false });
    }
    return { index: mi, name: m.name, sets };
  });
}

export function getDraft(dayId, date) {
  const k = draftKey(dayId, date);
  const d0 = dayById(dayId);
  // 已有草稿一律续用，绝不覆盖。
  // 早期版本在「开始今天」时会用空草稿覆盖同一天的旧草稿，导致已勾选的组和备注丢失。
  // 只有结构损坏的草稿（坏导入、手改 localStorage）才按计划重建，否则一开训练就崩。
  let dr = db.drafts[k];
  let from = k;
  if (!validDraft(dr)) {
    // 规范键下没有可用草稿：按 dayId+date 找一份。
    // 导入的旧备份或手改 localStorage 可能把草稿存在别的键下，
    // 只按规范键查会漏掉它——「继续」会打开空表单，原草稿还留在原地。
    const alt = Object.keys(db.drafts).find(x => {
      const o = db.drafts[x];
      return x !== k && validDraft(o) && o.dayId === dayId && o.date === date;
    });
    if (alt) { dr = db.drafts[alt]; from = alt; }
  }
  if (!validDraft(dr)) {
    const old = dr && typeof dr === "object" ? dr : {};
    dr = {
      key: k, dayId, date, startedAt: old.startedAt || null,
      elapsedMs: old.elapsedMs || 0, lastResumedAt: null, touched: false,
      moves: d0 ? emptyMoves(d0, date) : [],
      rir: old.rir != null ? old.rir : 2,
      pain: old.pain != null ? old.pain : 0,
      note: old.note || "",
    };
    db.drafts[k] = dr;
  } else {
    // 归一化：草稿身份只认 dayId@date，键不对就搬回规范键下
    dr.key = k;
    if (from !== k) {
      db.drafts[k] = dr;
      delete db.drafts[from];
    }
  }
  // 旧版草稿迁移：逐动作 rir/pain/note 收敛到训练级
  if (dr.rir == null || dr.pain == null) {
    const legacyPain = Math.max(...dr.moves.map(m => m.pain || 0), 0);
    const legacyNote = dr.moves.map(m => m.note).find(Boolean) || "";
    if (dr.rir == null) dr.rir = dr.moves[0]?.rir ?? 2;
    if (dr.pain == null) dr.pain = legacyPain;
    if (!dr.note) dr.note = legacyNote;
  }
  return dr;
}

export function findMove(draft, name) {
  return draft.moves.find(m => m.name === name) || null;
}

export function countDone(dr) {
  let done = 0, total = 0;
  dr.moves.forEach(m => m.sets.forEach(s => { total++; if (s.done) done++; }));
  return { done, total };
}

// 切回记录页：tab 路由与 aria-current 由 app.js 统一维护，这里只发请求
function goLog() {
  document.dispatchEvent(new CustomEvent("navigate", { detail: { tab: "log" } }));
}

// 旧记录的动作级 note/rir/pain 带进编辑草稿，保存时原样写回，别在编辑时丢数据
function withLegacy(move, rec) {
  if (!rec) return move;
  if (typeof rec.note === "string" && rec.note) move.note = rec.note;
  if (rec.rir != null) move.rir = rec.rir;
  if (rec.pain != null) move.pain = rec.pain;
  return move;
}

// 疼痛只有偶数档；旧记录的 9 吸附到 10，避免编辑时没有任何一档选中
function snapPain(v) {
  const n = +v;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n % 2 === 1 ? n + 1 : n));
}

/* ---------------- 记录页 ---------------- */
export function renderLog(view, subEl) {
  view.innerHTML = "";
  subEl.textContent = "选择日期与训练日";
  let guess = plannedDayId(new Date()) || "w1";

  const c = el("div", "card start-card");
  c.innerHTML = html`
    <div class="card-title">▶ 开始一次训练</div>
    <p class="card-sub">记录只保存在这台设备，不上传</p>`;

  const grid = el("div", "start-grid");

  const dateBox = el("div");
  dateBox.appendChild(el("label", "field-label", "训练日期"));
  const inpDate = el("input");
  inpDate.type = "date";
  inpDate.value = today();
  // 只能选今天或更早：草稿身份是 训练日id@日期，未来日期没有意义（spec: workout-draft）
  inpDate.max = today();
  dateBox.appendChild(inpDate);

  const dayBox = el("div");
  dayBox.appendChild(el("label", "field-label", "训练日"));
  const chipsBox = chips(
    PLAN.days.map(d => ({ v: d.id, label: d.name.split(" ")[0] + " " + d.short })),
    guess,
    v => { guess = v; }
  );
  dayBox.appendChild(chipsBox);

  grid.append(dateBox, dayBox);
  c.appendChild(grid);

  const go = el("button", "btn solid full", "开始记录 →");
  go.style.marginTop = "16px";
  go.onclick = () => {
    if (!inpDate.value) { toast("请选择日期"); return; }
    // max 挡不住程序化赋值与个别浏览器的手输，提交前再校验一次
    if (inpDate.value > today()) { toast("训练日期不能晚于今天"); return; }
    openWorkout(guess, inpDate.value);
  };
  c.appendChild(go);
  view.appendChild(c);

  // 清理僵尸草稿：开了训练但什么都没动就退出；结构坏掉的草稿也一并删掉
  // normalizeDrafts() 顺带把草稿键归一化到 dayId@date（导入/手改的草稿可能存在别的键下）
  let dropped = normalizeDrafts();
  Object.keys(db.drafts).forEach(k => {
    const dr = db.drafts[k];
    if (dr.touched === false && countDone(dr).done === 0) {
      delete db.drafts[k];
      dropped = true;
    }
  });
  if (dropped) saveDB();

  const keys = Object.keys(db.drafts);
  if (keys.length) {
    view.appendChild(el("div", "section-h", "未完成的训练"));
    keys.forEach(k => {
      const dr = db.drafts[k];
      if (!validDraft(dr)) return;
      const d = dayById(dr.dayId);
      if (!d) return;
      const { done, total } = countDone(dr);
      const wrap = el("div", "row-wrap");
      const row = el("button", "row row-tap");
      row.type = "button";
      row.style.borderLeft = `3px solid var(--d-${dr.dayId})`;
      row.innerHTML = html`
        <div class="row-main">
          <div class="row-title">${esc(d.name)} · ${esc(fmtDate(dr.date))}</div>
          <div class="row-sub">已完成 ${done}/${total} 组</div>
        </div>
        <span class="row-resume">继续</span>`;
      row.setAttribute("aria-label", `继续 ${d.name} ${dr.date} 的训练`);
      row.onclick = () => openWorkout(dr.dayId, dr.date);
      wrap.appendChild(row);

      // 放弃草稿：唯一能丢弃未完成训练的入口
      const drop = el("button", "row-drop", "✕");
      drop.type = "button";
      drop.setAttribute("aria-label", `放弃 ${d.name} ${dr.date} 的未完成训练`);
      drop.onclick = () => {
        if (!confirm(`放弃 ${d.name} ${fmtDate(dr.date)} 的这次未完成训练？已填的数据会丢失。`)) return;
        const before = db.drafts[k];
        delete db.drafts[k];
        if (!saveDB()) { db.drafts[k] = before; return; }
        renderLog(view, subEl);
        toast("已放弃草稿");
      };
      wrap.appendChild(drop);
      view.appendChild(wrap);
    });
  }

  view.appendChild(el("div", "section-h", "训练历史"));
  if (!db.sessions.length) {
    view.appendChild(el("div", "empty", "<strong>🏋️</strong>还没有记录。<br>做完第一次训练后，这里会显示历史。"));
    return;
  }
  // 残缺记录无法显示，在这里说明去向，别让用户以为记录丢了
  const valid = validSessions();
  const broken = db.sessions.length - valid.length;
  if (broken) view.appendChild(brokenCard(broken));
  const listBox = el("div", "card");
  valid.sort((a, b) => (a.date < b.date ? 1 : -1)).forEach(s => {
    const d = dayById(s.dayId);
    let sets = 0, vol = 0;
    s.moves.forEach(m => m.sets.forEach(x => {
      if (x.done) { sets++; vol += (+x.weight || 0) * (+x.reps || 0); }
    }));
    const row = el("button", "row row-tap");
    row.type = "button";
    row.style.borderLeft = `3px solid var(--d-${s.dayId})`;
    row.innerHTML = html`
      <div class="row-main">
        <div class="row-title">${esc(d ? d.name : s.dayId)} · ${esc(fmtDate(s.date))}</div>
        <div class="row-sub">${sets} 组 · 容量 ${Math.round(vol)} kg · 时长 ${esc(s.durationMin || "—")} 分
          ${s.maxPain >= 4 ? ` · <span class="text-danger-strong">疼痛 ${esc(s.maxPain)}/10</span>` : ""}</div>
      </div>
      <span class="row-arrow" aria-hidden="true">›</span>`;
    row.setAttribute("aria-label", `查看 ${d ? d.name : s.dayId} ${s.date} 的训练详情`);
    row.onclick = () => showSessionSheet(s);
    listBox.appendChild(row);
  });
  view.appendChild(listBox);
}

export function showSessionSheet(target) {
  // 只认可用记录：残缺记录（缺 date 或 moves）在列表里也不会出现。
  // 定位以记录对象本身为准——手改数据可能有重复 id，按 id 只能猜到第一条；
  // 字符串入参仅作兼容（按 id 找第一条），列表入口一律传记录对象。
  const valid = validSessions();
  const s = typeof target === "string"
    ? valid.find(x => x.id === target)
    : (target && valid.includes(target) ? target : null);
  if (!s) return;
  const d = dayById(s.dayId);

  let sets = 0, vol = 0;
  s.moves.forEach(m => m.sets.forEach(x => {
    if (x.done) { sets++; vol += (+x.weight || 0) * (+x.reps || 0); }
  }));

  const headerHtml = html`
    <div class="card-title sheet-head-title">${esc(d ? d.name : s.dayId)}</div>
    <p class="card-sub">${esc(fmtDate(s.date))} · ${sets} 组 · 容量 ${Math.round(vol)} kg</p>`;

  let body = "";
  if (s.rir != null || s.maxPain != null) {
    body += html`
      <div class="flex-gap-8 mb-6">
        <span class="badge primary">RIR ${esc(s.rir != null ? s.rir : "—")}</span>
        <span class="badge${(s.maxPain || 0) >= 4 ? "" : " cardio"}">疼痛 ${esc(s.maxPain || 0)}/10</span>
        ${s.durationMin ? `<span class="badge">${esc(s.durationMin)} 分钟</span>` : ""}
      </div>`;
  }
  if (s.note) body += html`<p class="move-tip mt-4">${esc(s.note)}</p>`;
  s.moves.forEach(m => {
    body += html`<div class="mt-14"><div class="move-name">${esc(m.name)}</div>`;
    body += html`<table class="data"><thead><tr><th>组</th><th>重量 kg</th><th>次数</th><th>完成</th></tr></thead>
      <tbody>${list(m.sets, (x, i) => html`<tr><td>${i + 1}</td><td>${esc(x.weight || "-")}</td><td>${esc(x.reps || "-")}</td><td>${x.done ? "✓" : "—"}</td></tr>`)}</tbody></table>`;
    if (m.note) body += html`<div class="move-tip">备注：${esc(m.note)}</div>`;
    if (m.rir != null) body += html`<div class="move-tip">RIR ${esc(m.rir)} · 疼痛 ${esc(m.pain || 0)}/10</div>`;
    body += "</div>";
  });

  const foot = el("div", "sheet-actions");
  const editBtn = el("button", "btn solid full", "编辑这条记录");
  editBtn.onclick = () => {
    // 训练日已不在当前计划里（改过 data.js 的 day id 等）就别关弹层后毫无反应，
    // 给一句能读懂的提示，用户才知道这条记录为什么点不动
    if (!dayById(s.dayId)) {
      toast("这条记录的训练日已不在当前计划里，无法编辑");
      return;
    }
    closeSheet();
    openWorkout(s.dayId, s.date, { session: s });
  };
  const delBtn = el("button", "btn danger full", "删除这条记录");
  delBtn.onclick = () => {
    if (!confirm(`删除 ${fmtDate(s.date)} 的这条训练记录？此操作不可撤销。`)) return;
    // 按被选中的对象定位：重复 id（手改数据）时按 id 过滤会把同 id 的记录一起删掉
    const idx = db.sessions.indexOf(s);
    if (idx < 0) { closeSheet(); toast("这条记录已经不在了"); return; }
    db.sessions.splice(idx, 1);
    if (!saveDB()) { db.sessions.splice(idx, 0, s); return; }
    closeSheet();
    goLog();
    toast("已删除");
  };
  foot.append(editBtn, delBtn);

  setSheet(headerHtml, body, foot);
}

/* ---------------- 训练进行中 ---------------- */
export const state = { wo: null };

// 编辑历史记录且改过内容时，刷新/关闭/跳走要弹浏览器原生离开确认（「更改可能不会保存」）。
// 未进入编辑、或进入编辑后没改过任何字段就不打扰。
// 已知限制：iOS Safari 与 PWA 独立窗口对该提示支持有限（方案选择时已确认接受）。
window.addEventListener("beforeunload", e => {
  const wo = state.wo;
  if (wo && wo.editingId && wo.editDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

const workoutDock = document.getElementById("workoutDock");
const woExitBtn = document.getElementById("woExitBtn");
const woFinishBtn = document.getElementById("woFinishBtn");
const woDockFill = document.getElementById("woDockFill");
const woDockCount = document.getElementById("woDockCount");
const woDockTimer = document.getElementById("woDockTimer");

function setWorkoutMode(on) {
  document.body.classList.toggle("in-workout", !!on);
  workoutDock.classList.toggle("hidden", !on);
}

/* ---------------- 计时：只统计活跃时间 ----------------
   锁屏 / 切到后台的时间不算训练时长，切回来接着走。 */
const MAX_RESUME_GAP_MS = 2 * 60 * 60 * 1000; // 恢复时最多补 2 小时，避免隔夜重开记成 10 小时训练
function elapsedOf(dr) {
  return (dr.elapsedMs || 0) + (dr.lastResumedAt ? Date.now() - dr.lastResumedAt : 0);
}
function pauseClock(dr) {
  if (dr && dr.lastResumedAt) {
    dr.elapsedMs = (dr.elapsedMs || 0) + (Date.now() - dr.lastResumedAt);
    dr.lastResumedAt = null;
  }
}
function resumeClock(dr) { if (dr) dr.lastResumedAt = Date.now(); }
function fmtElapsed(ms) {
  const sec = Math.floor(ms / 1000);
  return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + pad(sec % 60);
}
function stopTimer() {
  if (state.wo && state.wo.timerId) { clearInterval(state.wo.timerId); state.wo.timerId = null; }
}
function tickTimer() {
  const wo = state.wo;
  if (!wo) return;
  const txt = fmtElapsed(elapsedOf(wo.draft));
  const t = $("#timer");
  if (t) t.textContent = txt;
  if (woDockTimer) woDockTimer.textContent = txt;
}
function startTimer() {
  stopTimer();
  tickTimer();
  if (state.wo) state.wo.timerId = setInterval(tickTimer, 1000);
}
document.addEventListener("visibilitychange", () => {
  if (!state.wo) return;
  if (document.hidden) {
    pauseClock(state.wo.draft);
    // 暂停后立刻落盘：页面被刷新、被关掉时，已累计的时长不能丢
    saveDB();
    stopTimer();
  } else { resumeClock(state.wo.draft); startTimer(); }
});

// 刷新 / 关闭 / 跳走都会触发 pagehide：把当前累计时长落盘。
// 只靠 visibilitychange 不够——从后台切回前台后计时继续走，
// 但这中间没有任何落盘时机，页面一刷新这段时间就白丢了。
window.addEventListener("pagehide", () => {
  if (!state.wo) return;
  pauseClock(state.wo.draft);
  saveDB();
});

function ringSvg(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const R = 23, C = 2 * Math.PI * R;
  return html`
    <div class="ring" role="img" aria-label="已完成 ${done} / ${total} 组">
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

export function openWorkout(dayId, date, opts) {
  const d = dayById(dayId);
  if (!d) {
    // 兜底：训练日不在计划里就不要渲染一个空白的训练页
    toast("这个训练日已不在当前计划里，无法打开训练");
    return;
  }
  const o = opts || {};
  let draft, editingId = null;

  if (o.session) {
    // 编辑已完成的记录：草稿只存在内存，保存前不落盘
    const s = o.session;
    editingId = s.id;
    const recorded = new Map((s.moves || []).map(m => [m.name, m]));
    const moves = [];
    d.moves.forEach(m => {
      const rec = recorded.get(m.name);
      recorded.delete(m.name);
      const sets = [];
      const n = Math.max(m.sets, rec ? rec.sets.length : 0);
      for (let i = 0; i < n; i++) {
        const rs = rec ? rec.sets[i] : null;
        sets.push({
          weight: rs && rs.weight != null ? rs.weight : "",
          reps: rs && rs.reps != null ? rs.reps : "",
          done: rs ? !!rs.done : false,
        });
      }
      moves.push(withLegacy({ index: moves.length, name: m.name, sets }, rec));
    });
    // 计划里已删掉、但历史里还留着的动作：照样可见可改，不丢数据
    recorded.forEach(rec => {
      moves.push(withLegacy({
        index: moves.length, name: rec.name,
        sets: (rec.sets || []).map(s => ({
          weight: s.weight != null ? s.weight : "",
          reps: s.reps != null ? s.reps : "",
          done: !!s.done,
        })),
      }, rec));
    });
    draft = {
      key: "edit:" + s.id, dayId, date, startedAt: s.startedAt || Date.now(),
      elapsedMs: (s.durationMin || 0) * 60000, lastResumedAt: null, touched: true,
      moves, rir: s.rir ?? 2, pain: s.maxPain ?? 0, note: s.note || "",
    };
  } else {
    draft = getDraft(dayId, date);
    if (!draft.startedAt) draft.startedAt = Date.now();
    if (draft.elapsedMs == null) draft.elapsedMs = Math.max(0, Date.now() - draft.startedAt);
    if (draft.touched == null) draft.touched = true;
  }
  draft.pain = snapPain(draft.pain);
  // 草稿里还留着上次计时的起点（页面被刷新/关掉，来不及落盘）：
  // 把这段间隔并进已累计时长，否则恢复后计时会从零重来。
  // 上限 2 小时：隔夜再打开 App 不该被记成 10 小时训练。
  if (draft.lastResumedAt) {
    const gap = Math.max(0, Date.now() - draft.lastResumedAt);
    draft.elapsedMs = (draft.elapsedMs || 0) + Math.min(gap, MAX_RESUME_GAP_MS);
    draft.lastResumedAt = null;
  }
  resumeClock(draft);
  if (!editingId) saveDB();
  // editingRef：编辑锚定打开时的那条记录对象本身（重复 id 手改数据时不误伤别的记录）
  // editDirty：本次编辑是否改过任何字段，供 beforeunload 决定是否提示离开
  state.wo = { draft, timerId: null, editingId, editingRef: o.session || null, editDirty: false };
  setWorkoutMode(true);
  renderWorkout(d);
  window.scrollTo({ top: 0 });
}

export function closeWorkout(save) {
  if (state.wo) pauseClock(state.wo.draft);
  if (save && !saveDB()) {
    // 没写进磁盘就别退出训练页，时钟接着走，让用户能重试
    if (state.wo) { resumeClock(state.wo.draft); startTimer(); }
    return false;
  }
  stopTimer();
  state.wo = null;
  setWorkoutMode(false);
  goLog();
  return true;
}

export function renderWorkout(d) {
  const view = $("#view");
  view.innerHTML = "";
  const { wo } = state;
  const dr = wo.draft;
  // 编辑模式脏标记：任何修改入口都置位，beforeunload 据此提示离开
  const markDirty = () => { wo.editDirty = true; };
  const { done: doneSets, total: totalSets } = countDone(dr);

  const head = el("div", "card wo-summary");
  head.innerHTML = html`
    <div class="wo-head">
      <div class="wo-head-main">
        <div class="card-title">${esc(d.name)}</div>
        <p class="card-sub" id="woSub" aria-live="polite">${esc(dr.date)} · 已完成 ${doneSets}/${totalSets} 组</p>
      </div>
      <div class="flex-center">${ringSvg(doneSets, totalSets)}<div id="timer" class="timer">--:--</div></div>
    </div>`;

  head.appendChild(el("label", "field-label", "RIR · 这次整体留了几分余力"));
  head.appendChild(chips(
    [0, 1, 2, 3, 4].map(v => ({ v, label: "RIR " + v, warn: v <= 1 })),
    dr.rir,
    v => { markDirty(); dr.rir = v; dr.touched = true; saveDB(); }
  ));

  head.appendChild(el("label", "field-label", "疼痛评分（0 = 无痛，10 = 无法忍受）"));
  // 偶数刻度；旧记录的奇数值在 openWorkout 里已就近吸附
  const painShown = snapPain(dr.pain);
  head.appendChild(chips(
    [0, 2, 4, 6, 8, 10].map(v => ({ v, label: String(v), danger: v >= 4 })),
    painShown,
    v => {
      markDirty();
      dr.pain = v; dr.touched = true; saveDB();
      if (v >= 4) toast("疼痛 ≥4：停止该动作并考虑就医");
    }
  ));

  head.appendChild(el("label", "field-label", "备注（今天的整体感受 / 调整）"));
  const note = el("input");
  note.type = "text";
  note.placeholder = "例如：睡眠不足，整体降了 5kg";
  note.value = dr.note || "";
  note.oninput = () => { markDirty(); dr.note = note.value; dr.touched = true; saveDB(); };
  head.appendChild(note);
  view.appendChild(head);

  // 计划里的动作 + 历史里还留着但计划已删的动作，合并成一份渲染列表
  const renderList = [];
  const used = new Set();
  d.moves.forEach((m, mi) => {
    const st = findMove(dr, m.name);
    if (!st) return;
    used.add(m.name);
    renderList.push({ plan: m, st, badge: mi + 1 });
  });
  dr.moves.forEach((st) => {
    if (used.has(st.name)) return;
    renderList.push({
      plan: { name: st.name, sets: st.sets.length, lo: 0, hi: 0, repsHint: "?" },
      st, badge: renderList.length + 1, extra: true,
    });
  });

  renderList.forEach(({ plan: m, st, badge, extra }) => {
    const card = el("div", "card wo-move");
    const prev = lastEntry(m.name, dr.date);
    const prevWeights = prev && prev.move.sets.filter(x => x.weight);
    const prevTxt = prevWeights && prevWeights.length
      ? "上次 " + fmtDate(prev.date) + "：" +
        prevWeights.slice(0, 3).map(x => `${x.weight}kg×${x.reps || "?"}`).join(" / ")
      : "";

    const thumb = moveBadge(badge);
    const target = extra
      ? `历史记录 · ${m.sets} 组`
      : `目标 ${m.sets} 组 × ${m.lo === m.hi ? m.lo : m.lo + "-" + m.hi}${m.cardio ? " 分钟" : " 次"}`;
    card.innerHTML = html`
      <div class="move move-flat">
        <div class="move-body">
          <div class="move-name">${esc(m.name)}</div>
          <div class="move-meta">${target}
            ${prevTxt ? ` · <span class="prev">${esc(prevTxt)}</span>` : ""}</div>
        </div></div>`;
    card.querySelector(".move").insertBefore(thumb, card.querySelector(".move-body"));

    const setHead = el("div", "setrow");
    setHead.innerHTML = '<div class="set-head">组</div><div class="set-head">重量 kg</div><div class="set-head">次数</div><div class="set-head">完成</div>';
    card.appendChild(setHead);

    st.sets.forEach((s, si) => {
      card.appendChild(setRow(m, s, si,
        () => {
          markDirty();
          s.done = !s.done;
          if (s.done && !s.reps && !extra) s.reps = m.lo;
          dr.touched = true;
          saveDB();
        },
        (field, value) => { markDirty(); s[field] = value; dr.touched = true; saveDB(); }
      ));
    });

    if (prev && prevWeights && prevWeights.length) {
      const fill = el("button", "btn sm outline fill-btn", "按上次重量填入");
      fill.onclick = () => {
        const target = prev.move.sets.find(x => x.weight);
        if (!target) { toast("上次没有重量记录"); return; }
        markDirty();
        st.sets.forEach(s => { s.weight = target.weight; });
        dr.touched = true;
        saveDB();
        renderWorkout(d);
        toast("已填入 " + target.weight + " kg");
      };
      card.appendChild(fill);
    }

    view.appendChild(card);
  });

  startTimer();

  const counter = () => {
    const c = countDone(dr);
    const sub = $("#woSub");
    if (sub) sub.textContent = `${dr.date} · 已完成 ${c.done}/${c.total} 组`;
    const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    const ring = head.querySelector(".ring");
    if (ring) {
      const C = 2 * Math.PI * 23;
      const fg = ring.querySelector("svg circle:last-child");
      if (fg) fg.setAttribute("stroke-dashoffset", (C * (1 - pct / 100)).toFixed(1));
      ring.querySelector(".lbl").textContent = pct + "%";
      ring.setAttribute("aria-label", `已完成 ${c.done} / ${c.total} 组`);
    }
    if (woDockCount) woDockCount.textContent = `已完成 ${c.done}/${c.total} 组`;
    if (woDockFill) woDockFill.style.width = pct + "%";
    return c.done;
  };
  counter();
  wo.counter = counter;

  woFinishBtn.textContent = wo.editingId ? "保存修改" : "完成训练";
  woExitBtn.textContent = wo.editingId ? "放弃修改" : "保存并退出";
  woFinishBtn.onclick = () => finishWorkout(d);
  woExitBtn.onclick = () => {
    if (wo.editingId) { closeWorkout(false); toast("已放弃修改"); return; }
    const hasContent = dr.touched === true || countDone(dr).done > 0;
    if (!closeWorkout(true)) return;
    toast(hasContent ? "已保存草稿" : "这次没有记录任何内容");
  };
}

// 文档级委托：勾选或点击完成训练时刷新头部进度条与圆环
document.addEventListener("click", e => {
  if (!state.wo) return;
  if (e.target.closest && e.target.closest(".check") && state.wo.counter) state.wo.counter();
});

export function finishWorkout(d) {
  const { wo } = state;
  const dr = wo.draft;
  const c = countDone(dr);
  if (!c.done) { toast("还没有勾选任何一组"); return; }

  // 兼容旧版草稿：逐动作疼痛取最大值并入训练级
  const legacyPain = Math.max(...dr.moves.map(m => m.pain || 0), 0);
  // 动作级 note/rir/pain 是旧版字段，编辑时原样保留，不要悄悄删掉
  const moves = dr.moves.map(m => {
    const out = {
      name: m.name,
      sets: m.sets.map(s => ({ weight: s.weight, reps: s.reps, done: !!s.done })),
    };
    if (m.note) out.note = m.note;
    if (m.rir != null) out.rir = m.rir;
    if (m.pain != null) out.pain = m.pain;
    return out;
  });

  if (wo.editingId) {
    // 编辑模式：覆盖原记录，id 与时长保持不变
    if (!confirm(`保存修改？将更新 ${fmtDate(dr.date)} 的这条记录。`)) return;
    // 按打开编辑时的记录对象定位；对象不在当前数组（跨标签页同步替换过）走既有提示
    const idx = db.sessions.indexOf(wo.editingRef);
    if (idx < 0) { toast("这条记录已经不在了"); return; }
    const before = db.sessions[idx];
    db.sessions[idx] = {
      ...before,
      date: dr.date, moves,
      rir: dr.rir ?? 2,
      maxPain: Math.max(dr.pain || 0, legacyPain),
      note: dr.note || "",
    };
    if (!saveDB()) { db.sessions[idx] = before; return; }
    stopTimer();
    state.wo = null;
    setWorkoutMode(false);
    toast("已更新");
    goLog();
    return;
  }

  if (!confirm(`完成这次训练？已完成 ${c.done}/${c.total} 组`)) return;

  const duration = Math.round(elapsedOf(dr) / 60000);
  db.sessions.push({
    id: uid(), dayId: d.id, date: dr.date, startedAt: dr.startedAt,
    durationMin: Math.max(duration, 1), moves,
    rir: dr.rir ?? 2,
    maxPain: Math.max(dr.pain || 0, legacyPain),
    note: dr.note || "",
  });
  // 草稿按规范键 dayId@date 删除，不依赖草稿对象自带的 key：
  // 导入或手改的草稿可能没有 key，那样删的是 drafts[undefined]，草稿会留下来
  // 让同一份训练可以被重复完成，生成重复记录。
  const dk = draftKey(dr.dayId, dr.date);
  delete db.drafts[dk];
  if (!saveDB()) {
    // 写盘失败：回滚内存状态，训练页保持打开，错误提示留在屏幕上
    db.sessions.pop();
    db.drafts[dk] = dr;
    return;
  }
  stopTimer();
  state.wo = null;
  setWorkoutMode(false);
  toast("训练已保存");
  goLog();
}
