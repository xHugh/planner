/* 进度页：统计卡片、容量/疼痛图表、最佳组表、数据导入导出 */
import {
  html, list, esc, el, fmtDate, parseDate, dateStr, db, saveDB, toast, today, storage, validSessions,
  brokenCard, normalizeDrafts
} from "./core.js";
import { weekIndex } from "./plan.js";

/* ---------------- 图表数据 ---------------- */
const CHART_WEEKS = 12;   // 容量图最多显示最近 12 周
const CHART_SESSIONS = 12; // 疼痛图最多显示最近 12 次

function sessionVolume(s) {
  let v = 0;
  (s.moves || []).forEach(m => (m.sets || []).forEach(x => {
    if (x.done) v += (+x.weight || 0) * (+x.reps || 0);
  }));
  return v;
}

// 自然周起点（周一）
function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

// 按自然周聚合训练容量，只保留最近 n 周
export function aggregateByWeek(sessions, weeks) {
  const map = new Map();
  sessions.forEach(s => {
    const key = dateStr(weekStart(parseDate(s.date)));
    const v = sessionVolume(s);
    const cur = map.get(key);
    if (cur) cur.value += v;
    else map.set(key, { label: fmtDate(key), value: v });
  });
  const sorted = Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(e => e[1]);
  if (!sorted.length) return [];

  // 窗口：截至本周的最近 weeks 个自然周（周一起算），没有训练的周记 0。
  // 停训的空档在图上是 0 柱，不再被悄悄跳过——等距排布下看不出停了几周。
  const end = weekStart(new Date());
  const window = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i * 7);
    const key = dateStr(d);
    const hit = map.get(key);
    window.push({ label: fmtDate(key), value: hit ? hit.value : 0 });
  }
  if (window.some(w => w.value > 0)) return window;
  // 窗口内一次都没练：回退到最近 weeks 个有训练的周，保证「有数据但图表空白」不会发生
  return sorted.slice(-weeks);
}

// 进度统计口径：只计入日期不晚于今天的记录。
// 未来日期只会来自手改 localStorage 或旧备份导入，不进统计与图表；
// 记录页历史列表不走这里，未来记录仍可查看（spec: progress-stats）。
export function countableSessions(sessions) {
  const td = today();
  return sessions.filter(s => s.date <= td);
}

/* ---------------- 空态 ---------------- */
// 没有可统计的记录时，按「为什么没有」分三种说法，而不是笼统一句「还没有数据」：
//   total=0        本机确实一条记录都没有
//   broken>0       记录存在但结构异常，全部被跳过
//   future>0       记录本身完好，但训练日期晚于今天，不进统计
// 无论哪种都保留导入入口：清缓存、换设备后手里有备份却没地方导入，是最需要它的场景。
function renderEmptyState(view, info) {
  if (info.broken > 0) {
    view.appendChild(brokenCard(info.broken));
  }

  let msg;
  if (info.total === 0) {
    msg = "还没有数据。<br>完成一次训练后，这里会出现进度图表。";
  } else if (info.broken > 0 && info.future > 0) {
    msg = `本地 ${info.broken} 条记录格式异常已跳过，<br>另有 ${info.future} 条日期晚于今天，暂不计入统计。`;
  } else if (info.broken > 0) {
    msg = "没有可统计的训练记录。<br>本地记录格式异常，已全部跳过。";
  } else if (info.future > 0) {
    msg = `有 ${info.future} 条记录的日期晚于今天，<br>暂不计入统计。`;
  } else {
    msg = "还没有可统计的数据。";
  }
  view.appendChild(el("div", "empty", msg));

  // 导入入口：空库时恢复备份的唯一路径，不要求先造一条记录
  const imp = el("button", "btn outline full", "⬆ 导入备份（JSON）");
  imp.style.marginTop = "12px";
  imp.onclick = importData;
  view.appendChild(imp);

  // 本地确实一条记录都没有时没什么可导出的，不给导出按钮；
  // 有记录但都不可用时仍要能导出来手工清理（坏数据卡也是这么说的）
  if (info.total > 0) {
    const exp = el("button", "btn outline full", "⬇ 导出数据（JSON）");
    exp.style.marginTop = "6px";
    exp.onclick = exportData;
    view.appendChild(exp);
  }
}

/* ---------------- 页面 ---------------- */
let active = false;

export function renderProgress(view, subEl) {
  view.innerHTML = "";
  active = true;
  subEl.textContent = "训练量 · 最佳组 · 疼痛趋势";

  // 防御：结构异常的历史记录跳过，不让整页崩掉
  const valid = validSessions();
  const broken = db.sessions.length - valid.length;
  // 未来日期的记录不进统计与图表（口径见 countableSessions）
  const sessions = countableSessions(valid).sort((a, b) => (a.date < b.date ? -1 : 1));

  if (!sessions.length) {
    renderEmptyState(view, {
      total: db.sessions.length,
      broken,
      future: valid.length - sessions.length,
    });
    return;
  }
  if (broken) view.appendChild(brokenCard(broken));

  const vol = sessions.reduce((a, s) => a + sessionVolume(s), 0);

  const now = new Date();
  const wkStart = new Date(now);
  wkStart.setDate(now.getDate() - weekIndex(now));
  wkStart.setHours(0, 0, 0, 0);
  const weekCount = sessions.filter(s => parseDate(s.date) >= wkStart).length;

  const stats = el("div", "stats");
  stats.innerHTML = html`
    <div class="stat"><b>${weekCount}</b><span>本周训练</span></div>
    <div class="stat"><b>${sessions.length}</b><span>累计训练</span></div>
    <div class="stat"><b>${Math.round(vol / 1000 * 10) / 10}t</b><span>累计容量</span></div>`;
  view.appendChild(stats);

  const volumeByWeek = aggregateByWeek(sessions, CHART_WEEKS);
  const c1 = el("div", "card");
  c1.innerHTML = html`
    <div class="card-title">📈 训练容量趋势</div>
    <p class="card-sub">重量 × 次数，按自然周汇总（kg），最近 ${volumeByWeek.length} 周</p>`;
  const cv1 = el("canvas");
  c1.appendChild(cv1);
  view.appendChild(c1);
  drawBars(cv1, volumeByWeek);

  const c2 = el("div", "card");
  c2.innerHTML = html`
    <div class="card-title">🏆 各动作最佳组</div>
    <p class="card-sub">每个动作历史最重的有效组（重量 × 次数）</p>`;
  const best = {};
  sessions.forEach(s => s.moves.forEach(m => (m.sets || []).forEach(x => {
    if (!x.done || !+x.weight) return;
    const w = +x.weight;
    if (!best[m.name] || w > best[m.name].w) best[m.name] = { w, r: x.reps, d: s.date };
  })));
  const names = Object.keys(best).sort((a, b) => best[b].w - best[a].w);
  if (!names.length) {
    c2.innerHTML += '<div class="empty">暂无有效重量记录</div>';
  } else {
    c2.innerHTML += html`<table class="data">
      <thead><tr><th>动作</th><th>最佳组</th><th>日期</th></tr></thead>
      <tbody>${list(names, n => html`<tr><td>${esc(n)}</td><td>${best[n].w} kg × ${esc(best[n].r || "-")}</td><td>${esc(fmtDate(best[n].d))}</td></tr>`)}</tbody>
    </table>`;
  }
  view.appendChild(c2);

  const c3 = el("div", "card");
  c3.innerHTML = html`
    <div class="card-title">❤️ 疼痛趋势</div>
    <p class="card-sub">每次训练的最高疼痛评分（0-10），≥4 应先停练该动作</p>`;
  const cv3 = el("canvas");
  c3.appendChild(cv3);
  view.appendChild(c3);
  drawBars(cv3, sessions.slice(-CHART_SESSIONS).map(s => ({ label: fmtDate(s.date), value: s.maxPain || 0 })),
    { max: 10, colorDanger: true });

  const warnCount = sessions.filter(s => (s.maxPain || 0) >= 4).length;
  if (warnCount) {
    const wa = el("div", "card card-warn");
    wa.innerHTML = html`
      <div class="card-title card-title-danger">⚠️ 有 ${warnCount} 次训练疼痛 ≥4</div>
      <p class="card-sub">建议检查动作幅度、重量与恢复情况；疼痛持续不缓解请咨询专业人士。</p>`;
    view.appendChild(wa);
  }

  // 存储提醒：浏览器可能在长期不用时清掉本地数据
  const needBackup = shouldHintBackup();
  if (storage.persisted === false || needBackup) {
    const ps = el("div", "card card-warn");
    const title = storage.persisted === false ? "💾 建议定期导出备份" : "💾 记录已经不少了";
    const sub = storage.persisted === false
      ? "当前浏览器未授予持久化存储，长期不使用可能清除本机记录。导出 JSON 存一份到网盘更保险。"
      : "导出一份 JSON 备份，换设备或清缓存都不怕。";
    ps.innerHTML = html`
      <div class="card-title card-title-danger">${title}</div>
      <p class="card-sub">${sub}</p>`;
    const pe = el("button", "btn outline full", "⬇ 导出备份");
    pe.style.marginTop = "10px";
    pe.onclick = exportData;
    ps.appendChild(pe);
    view.appendChild(ps);
  }

  const exp = el("button", "btn outline full", "⬇ 导出数据（JSON）");
  exp.style.marginTop = "6px";
  exp.onclick = exportData;
  view.appendChild(exp);

  const imp = el("button", "btn outline full", "⬆ 导入数据（JSON）");
  imp.style.marginTop = "10px";
  imp.onclick = importData;
  view.appendChild(imp);
}

const BACKUP_HINT_KEY = "gym4.backup.hint.v1";
function shouldHintBackup() {
  if (db.sessions.length <= 30) return false;
  try {
    if (localStorage.getItem(BACKUP_HINT_KEY)) return false;
    localStorage.setItem(BACKUP_HINT_KEY, "1");
  } catch {}
  return true;
}

/* ---------------- Canvas 图表 ---------------- */
function roundRect(ctx, x, y, w, h, r) {
  if (h < r) r = h;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 记录已画的图，主题切换时按新配色重画
let charts = [];

export function drawBars(canvas, data, opt = {}) {
  // 只保留仍挂在页面上的图：旧 canvas 脱离 DOM 后若还被数组引用，
  // 反复进出进度页会越攒越多（每次渲染都新建 canvas）
  charts = charts.filter(c => c.canvas.isConnected && c.canvas !== canvas);
  charts.push({ canvas, data, opt });
  paintBars(canvas, data, opt);
}

function paintBars(canvas, data, opt) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 320;
  // 高度取 canvas 的实际 CSS 高度（样式表里是 190px），写死 180 会让每张图纵向拉伸 5.6%
  const H = canvas.clientHeight || 190;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // 颜色走 CSS 变量，深浅主题各自生效
  const cs = getComputedStyle(document.documentElement);
  const cLine = (cs.getPropertyValue("--line") || "#dde4ee").trim();
  const cMuted = (cs.getPropertyValue("--muted") || "#55647a").trim();
  // 柱子颜色也走主题令牌，别在画布上写死，深浅主题各自生效
  const cBrand1 = (cs.getPropertyValue("--brand-1") || "#2563eb").trim();
  const cBrand2 = (cs.getPropertyValue("--brand-2") || "#06b6d4").trim();
  const cDanger = (cs.getPropertyValue("--danger") || "#ef4444").trim();
  const cDangerInk = (cs.getPropertyValue("--danger-ink") || "#b91c1c").trim();

  const padL = 34, padB = 22, padT = 10;
  const cw = W - padL - 12, ch = H - padT - padB;
  const max = opt.max || (data.length ? Math.max(...data.map(d => d.value), 1) : 1);
  const n = data.length;
  const gap = cw / Math.max(n, 1);
  const bw = Math.max(3, Math.min(40, gap * 0.55));
  const labelEvery = opt.labelEvery || Math.max(1, Math.ceil(n / Math.max(1, Math.floor(cw / 34))));

  ctx.strokeStyle = cLine;
  ctx.lineWidth = 1;
  ctx.font = "10px sans-serif";
  ctx.fillStyle = cMuted;
  for (let g = 0; g <= 4; g++) {
    const y = padT + ch - (ch * g / 4);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - 8, y);
    ctx.stroke();
    const v = opt.max ? (opt.max * g / 4) : Math.round(max * g / 4);
    ctx.textAlign = "right";
    ctx.fillText(v > 999 ? (v / 1000).toFixed(1) + "k" : v, padL - 6, y + 3);
  }

  let lastLabel = -Infinity;
  data.forEach((d, i) => {
    const x = padL + gap * i + (gap - bw) / 2;
    // 超出量程的值（手改/坏导入）按量程截断，不让柱子画出图表区域
    const val = Math.max(0, Math.min(max, d.value || 0));
    const h = ch * (val / max);
    const y = padT + ch - h;
    if (opt.colorDanger && d.value >= 4) {
      const g = ctx.createLinearGradient(x, y, x, y + Math.max(h, 1));
      g.addColorStop(0, cDanger);
      g.addColorStop(1, cDangerInk);
      ctx.fillStyle = g;
    } else if (h > 0) {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, cBrand2);
      g.addColorStop(1, cBrand1);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = cLine;
    }
    roundRect(ctx, x, y, bw, Math.max(h, 1), 4);
    ctx.fill();
    // 末位标签与前一个画过的标签太近时不再画，否则会叠字
    if (i % labelEvery === 0 || (i === n - 1 && i - lastLabel >= labelEvery)) {
      ctx.fillStyle = cMuted;
      ctx.textAlign = "center";
      ctx.fillText(d.label, x + bw / 2, H - 6);
      lastLabel = i;
    }
  });
}

// 视口尺寸变化后按新尺寸重绘：位图缓冲只在绘制时算一次，
// 不重绘的话会被 CSS 拉伸变形（手机横屏、桌面缩放）。
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    charts = charts.filter(c => c.canvas.isConnected);
    charts.forEach(c => paintBars(c.canvas, c.data, c.opt));
  }, 120);
});

// 主题切换后重画（配色变了，图形本身不变）
document.addEventListener("themechange", () => {
  charts = charts.filter(c => c.canvas.isConnected);
  charts.forEach(c => paintBars(c.canvas, c.data, c.opt));
});
document.addEventListener("tabchange", e => {
  active = e.detail && e.detail.tab === "progress";
});
document.addEventListener("persistchange", () => {
  if (!active) return;
  const view = document.getElementById("view");
  const sub = document.getElementById("appbarSub");
  if (view && sub) renderProgress(view, sub);
});

/* ---------------- 导入导出 ---------------- */
export function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gym4-backup-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 结构校验：返回 null 表示通过，否则返回问题描述
export function validateDB(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return "不是有效的 JSON 对象";
  if (!Array.isArray(d.sessions)) return "缺少 sessions 数组";
  if (d.drafts != null) {
    if (typeof d.drafts !== "object" || Array.isArray(d.drafts)) return "drafts 必须是对象";
    for (const k of Object.keys(d.drafts)) {
      const dr = d.drafts[k];
      if (!dr || typeof dr !== "object" || Array.isArray(dr)) return `草稿 ${k} 不是对象`;
      if (typeof dr.dayId !== "string" || typeof dr.date !== "string") return `草稿 ${k} 缺少训练日或日期`;
      if (!Array.isArray(dr.moves)) return `草稿 ${k} 缺少 moves`;
      // 计时字段必须是数字：坏值会让计时器显示 NaN、写进记录的时长变成 null。
      // 按草稿层级校验，不能嵌进按动作的循环——moves 为空时也要拦住
      for (const f of ["elapsedMs", "lastResumedAt"]) {
        const v = dr[f];
        if (v != null && (typeof v !== "number" || !Number.isFinite(v))) {
          return `草稿 ${k} 的 ${f} 必须是数字`;
        }
      }
      for (const m of dr.moves) {
        if (!m || typeof m.name !== "string" || !Array.isArray(m.sets)) return `草稿 ${k} 的动作数据无效`;
        for (const st of m.sets) {
          if (!st || typeof st !== "object") return `草稿 ${k} 有无效的组`;
        }
      }
    }
  }
  // id 唯一：重复 id 会让详情/编辑/删除按 id 匹配到错误的记录
  const ids = new Set();
  for (let i = 0; i < d.sessions.length; i++) {
    const s = d.sessions[i];
    if (!s || typeof s !== "object") return `第 ${i + 1} 条记录不是对象`;
    if (typeof s.id !== "string" || !s.id) return `第 ${i + 1} 条记录缺少 id`;
    if (ids.has(s.id)) return `第 ${i + 1} 条记录存在重复的记录 id：${s.id}`;
    ids.add(s.id);
    if (typeof s.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return `第 ${i + 1} 条记录的日期格式不对`;
    if (!Array.isArray(s.moves)) return `第 ${i + 1} 条记录缺少 moves`;
    for (let j = 0; j < s.moves.length; j++) {
      const m = s.moves[j];
      if (!m || typeof m.name !== "string" || !m.name) return `第 ${i + 1} 条记录的动作名无效`;
      if (!Array.isArray(m.sets)) return `第 ${i + 1} 条记录的「${m.name}」缺少 sets`;
      for (const st of m.sets) {
        if (!st || typeof st !== "object") return `第 ${i + 1} 条记录的「${m.name}」有无效的组`;
        const w = st.weight, r = st.reps;
        if (w != null && typeof w !== "string" && typeof w !== "number") return `第 ${i + 1} 条记录重量格式不对`;
        if (r != null && typeof r !== "string" && typeof r !== "number") return `第 ${i + 1} 条记录次数格式不对`;
      }
    }
    // 这几个字段会直接进 innerHTML，必须是数字，否则就是注入点
    for (const f of ["rir", "maxPain", "durationMin"]) {
      const v = s[f];
      if (v != null && (typeof v !== "number" || !Number.isFinite(v))) return `第 ${i + 1} 条记录的 ${f} 必须是数字`;
    }
  }
  return null;
}

export function importData() {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "application/json";
  inp.onchange = () => {
    const f = inp.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let d;
      try {
        d = JSON.parse(r.result);
      } catch (e) {
        toast("导入失败：不是合法 JSON");
        return;
      }
      // 先校验再写盘：坏数据不许进本地库
      const bad = validateDB(d);
      if (bad) { toast("导入失败：" + bad); return; }
      // 导入会同时替换记录与草稿，确认框要把两样都说清楚
      if (!confirm(`导入会覆盖当前所有记录（${db.sessions.length} 条）与未完成的训练草稿，确定？`)) return;
      const prev = { sessions: db.sessions, drafts: db.drafts };
      db.sessions = d.sessions;
      db.drafts = d.drafts || {};
      // 导入的草稿键未必是 dayId@date（外部备份、手改），归一化后再落盘
      normalizeDrafts();
      if (!saveDB()) {
        // 写盘失败就回滚，别让界面显示成导入成功
        db.sessions = prev.sessions;
        db.drafts = prev.drafts;
        return;
      }
      renderProgress(document.getElementById("view"), document.getElementById("appbarSub"));
      toast("导入成功");
    };
    r.readAsText(f);
  };
  inp.click();
}
