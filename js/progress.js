/* 进度页：统计卡片、容量/疼痛图表、最佳组表、数据导入导出 */
(function () {
  "use strict";

  window.renderProgress = function () {
    window.view.innerHTML = "";
    window.subEl.textContent = "训练量 · 最佳组 · 疼痛趋势";
    if (!db.sessions.length) {
      window.view.appendChild(el("div", "empty", "还没有数据。<br>完成一次训练后，这里会出现进度图表。"));
      return;
    }
    var list = db.sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    var sets = 0, vol = 0;
    list.forEach(function (s) {
      s.moves.forEach(function (m) {
        m.sets.forEach(function (x) {
          if (x.done) { sets++; vol += (+x.weight || 0) * (+x.reps || 0); }
        });
      });
    });

    var now = new Date();
    var wkStart = new Date(now); wkStart.setDate(now.getDate() - window.weekIndex(now)); wkStart.setHours(0, 0, 0, 0);
    var weekCount = list.filter(function (s) { return window.parseDate(s.date) >= wkStart; }).length;

    var stats = el("div", "stats");
    stats.innerHTML = html`
      <div class="stat"><b>${weekCount}</b><span>本周训练</span></div>
      <div class="stat"><b>${list.length}</b><span>累计训练</span></div>
      <div class="stat"><b>${Math.round(vol / 1000 * 10) / 10}t</b><span>累计容量</span></div>`;
    window.view.appendChild(stats);

    var c1 = el("div", "card");
    c1.innerHTML = html`
      <div class="card-title">📈 训练容量趋势</div>
      <p class="card-sub">重量 × 次数，按每次训练统计（kg）</p>`;
    var cv1 = el("canvas");
    c1.appendChild(cv1);
    window.view.appendChild(c1);
    drawBars(cv1, list.map(function (s) {
      var v = 0;
      s.moves.forEach(function (m) { m.sets.forEach(function (x) { if (x.done) v += (+x.weight || 0) * (+x.reps || 0); }); });
      return { label: window.fmtDate(s.date), value: v };
    }));

    var c2 = el("div", "card");
    c2.innerHTML = html`
      <div class="card-title">🏆 主项最佳组</div>
      <p class="card-sub">每个动作历史最重的有效组（重量 × 次数）</p>`;
    var best = {};
    list.forEach(function (s) {
      s.moves.forEach(function (m) {
        m.sets.forEach(function (x) {
          if (!x.done || !+x.weight) return;
          var w = +x.weight;
          if (!best[m.name] || w > best[m.name].w) best[m.name] = { w: w, r: x.reps, d: s.date };
        });
      });
    });
    var names = Object.keys(best);
    if (!names.length) {
      c2.innerHTML += '<div class="empty">暂无有效重量记录</div>';
    } else {
      var tb = html`<table class="data"><thead><tr><th>动作</th><th>最佳组</th><th>日期</th></tr></thead><tbody>`;
      names.sort(function (a, b) { return best[b].w - best[a].w; }).forEach(function (n) {
        tb += html`<tr><td>${esc(n)}</td><td>${best[n].w} kg × ${esc(best[n].r || "-")}</td><td>${window.fmtDate(best[n].d)}</td></tr>`;
      });
      tb += "</tbody></table>";
      c2.innerHTML += tb;
    }
    window.view.appendChild(c2);

    var c3 = el("div", "card");
    c3.innerHTML = html`
      <div class="card-title">❤️ 疼痛趋势</div>
      <p class="card-sub">每次训练的最高疼痛评分（0-10），≥4 应先停练该动作</p>`;
    var cv3 = el("canvas");
    c3.appendChild(cv3);
    window.view.appendChild(c3);
    drawBars(cv3, list.map(function (s) { return { label: window.fmtDate(s.date), value: s.maxPain || 0 }; }), { max: 10, colorDanger: true });

    var warnCount = list.filter(function (s) { return (s.maxPain || 0) >= 4; }).length;
    if (warnCount) {
      var wa = el("div", "card");
      wa.style.background = "linear-gradient(135deg, #fef2f2, #fff)";
      wa.style.border = "1px solid #fecaca";
      wa.innerHTML = html`
        <div class="card-title card-title-danger">⚠️ 有 ${warnCount} 次训练疼痛 ≥4</div>
        <p class="card-sub">建议检查动作幅度、重量与恢复情况；疼痛持续不缓解请咨询专业人士。</p>`;
      window.view.appendChild(wa);
    }

    var exp = el("button", "btn outline full", "⬇ 导出数据（JSON）");
    exp.style.marginTop = "6px";
    exp.onclick = window.exportData;
    window.view.appendChild(exp);

    var imp = el("button", "btn outline full", "⬆ 导入数据（JSON）");
    imp.style.marginTop = "10px";
    imp.onclick = window.importData;
    window.view.appendChild(imp);
  };

  function drawBars(canvas, data, opt) {
    opt = opt || {};
    var dpr = window.devicePixelRatio || 1;
    var W = canvas.clientWidth || 320;
    var H = 180;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    var padL = 34, padB = 22, padT = 10;
    var cw = W - padL - 12, ch = H - padT - padB;
    var max = opt.max || Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    var n = data.length;
    var bw = Math.min(40, (cw / n) * 0.55);
    var gap = cw / n;

    ctx.strokeStyle = "#eef2f8";
    ctx.lineWidth = 1;
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#94a3b8";
    for (var g = 0; g <= 4; g++) {
      var y = padT + ch - (ch * g / 4);
      ctx.beginPath();
      ctx.moveTo(padL, y); ctx.lineTo(W - 8, y); ctx.stroke();
      var lbl = opt.max ? (opt.max * g / 4) : Math.round(max * g / 4);
      ctx.textAlign = "right";
      ctx.fillText(lbl > 999 ? (lbl / 1000).toFixed(1) + "k" : lbl, padL - 6, y + 3);
    }

    data.forEach(function (d, i) {
      var x = padL + gap * i + (gap - bw) / 2;
      var h = ch * (d.value / max);
      var y = padT + ch - h;
      if (opt.colorDanger && d.value >= 4) {
        var gd = ctx.createLinearGradient(x, y, x, y + Math.max(h, 1));
        gd.addColorStop(0, "#f87171");
        gd.addColorStop(1, "#dc2626");
        ctx.fillStyle = gd;
      } else if (h > 0) {
        var g2 = ctx.createLinearGradient(x, y, x, y + h);
        g2.addColorStop(0, "#38bdf8");
        g2.addColorStop(1, "#2563eb");
        ctx.fillStyle = g2;
      } else {
        ctx.fillStyle = "#e2e8f0";
      }
      roundRect(ctx, x, y, bw, Math.max(h, 1), 4);
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "center";
      ctx.fillText(d.label, x + bw / 2, H - 6);
    });
  }

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

  window.exportData = function () {
    var blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gym4-backup-" + window.today() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  window.importData = function () {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.onchange = function () {
      var f = inp.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var d = JSON.parse(r.result);
          if (!d.sessions || !Array.isArray(d.sessions)) throw new Error("格式不对");
          if (!confirm("导入会覆盖当前所有记录（" + db.sessions.length + " 条），确定？")) return;
          db.sessions = d.sessions;
          db.drafts = d.drafts || {};
          saveDB();
          window.renderProgress();
          window.toast("导入成功");
        } catch (e) {
          window.toast("导入失败：" + e.message);
        }
      };
      r.readAsText(f);
    };
    inp.click();
  };

})();
