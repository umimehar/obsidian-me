(function () {
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var el0 = document.getElementById("ledger-data");
  if (!el0) { return; }
  var L = JSON.parse(el0.textContent).ledger;
  var ACCTS = L.accounts, MONTHS = L.months, LIMITS = L.limits;
  var KIND_ID = {};
  ACCTS.forEach(function (a) { KIND_ID[a.id] = a.kind; });
  var REG = { TFSA: "TFSA", ManagedTFSA: "TFSA", FHSA: "FHSA", RRSP: "RRSP", RESP: "RESP" };
  var NS = "http://www.w3.org/2000/svg";

  // Per-account, forward-filled monthly arrays aligned to MONTHS.
  var idx = {}; MONTHS.forEach(function (m, i) { idx[m] = i; });
  var flow = {}, acbFF = {}, cashFF = {};
  ACCTS.forEach(function (a) {
    flow[a.id] = MONTHS.map(function () {
      return { contrib: 0, income: 0, inflow: 0, outflow: 0 };
    });
    acbFF[a.id] = MONTHS.map(function () { return 0; });
    cashFF[a.id] = MONTHS.map(function () { return 0; });
  });
  L.series.forEach(function (s) {
    var f = flow[s.account_id][idx[s.month]];
    f.contrib = s.contrib; f.income = s.income; f.inflow = s.inflow; f.outflow = s.outflow;
    if (s.acb != null) { acbFF[s.account_id][idx[s.month]] = s.acb; }
    if (s.cash != null) { cashFF[s.account_id][idx[s.month]] = s.cash; }
  });
  // forward fill acb/cash
  ACCTS.forEach(function (a) {
    var seenA = false, seenC = false, la = 0, lc = 0;
    var sa = {}, sc = {};
    L.series.forEach(function (s) { if (s.account_id === a.id) {
      if (s.acb != null) { sa[s.month] = true; }
      if (s.cash != null) { sc[s.month] = true; }
    } });
    for (var i = 0; i < MONTHS.length; i++) {
      if (sa[MONTHS[i]]) { seenA = true; la = acbFF[a.id][i]; } else if (seenA) { acbFF[a.id][i] = la; }
      if (sc[MONTHS[i]]) { seenC = true; lc = cashFF[a.id][i]; } else if (seenC) { cashFF[a.id][i] = lc; }
    }
  });

  var state = { accts: null, range: "all" };

  function selected() {
    return state.accts || ACCTS.map(function (a) { return a.id; });
  }
  function rangeIdx() {
    var last = MONTHS.length - 1;
    if (state.range === "all") { return MONTHS.map(function (_, i) { return i; }); }
    if (state.range === "ytd") {
      var y = MONTHS[last].slice(0, 4);
      return MONTHS.map(function (m, i) { return i; }).filter(function (i) {
        return MONTHS[i].slice(0, 4) === y;
      });
    }
    var n = state.range === "1y" ? 12 : 36;
    var out = [];
    for (var i = Math.max(0, MONTHS.length - n); i < MONTHS.length; i++) { out.push(i); }
    return out;
  }
  function grainOf(ris) { return ris.length > 24 ? "year" : "month"; }
  function pkey(m, g) { return g === "year" ? m.slice(0, 4) : m; }

  function money(v) {
    return (v < 0 ? "-" : "") + "$" + Math.abs(Math.round(v)).toLocaleString("en-CA");
  }
  function compact(v) {
    var n = Math.abs(v), s = v < 0 ? "-" : "";
    if (n >= 1e6) { return s + "$" + (n / 1e6).toFixed(1) + "M"; }
    if (n >= 1e3) { return s + "$" + Math.round(n / 1e3) + "K"; }
    return s + "$" + Math.round(n);
  }
  function monLabel(m) {
    var mm = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return mm[parseInt(m.slice(5), 10) - 1] + " " + m.slice(0, 4);
  }
  function svgEl(t, a) { var e = document.createElementNS(NS, t); for (var k in a) { e.setAttribute(k, a[k]); } return e; }

  // ---- aggregation over the current filter -------------------------------
  function seriesStock(ris, fieldFF) {
    var accts = selected();
    return ris.map(function (i) {
      var v = 0; accts.forEach(function (id) { v += fieldFF[id][i]; }); return { i: i, v: v };
    });
  }
  function contribCum(ris) {
    var accts = selected(), running = 0, byMonth = {};
    // cumulative across ALL months up to each index (to-date semantics)
    for (var i = 0; i < MONTHS.length; i++) {
      accts.forEach(function (id) { running += flow[id][i].contrib; });
      byMonth[i] = running;
    }
    return ris.map(function (i) { return { i: i, v: byMonth[i] }; });
  }
  function flowSum(ris, field) {
    var accts = selected();
    return ris.map(function (i) {
      var v = 0; accts.forEach(function (id) { v += flow[id][i][field]; }); return { i: i, v: v };
    });
  }
  function bucketLast(points, g) {
    var out = [], seen = {};
    points.forEach(function (p) {
      var k = pkey(MONTHS[p.i], g);
      if (seen[k] === undefined) { seen[k] = out.length; out.push({ key: k, v: p.v }); }
      else { out[seen[k]].v = p.v; }
    });
    return out;
  }
  function bucketSum(points, g) {
    var out = [], seen = {};
    points.forEach(function (p) {
      var k = pkey(MONTHS[p.i], g);
      if (seen[k] === undefined) { seen[k] = out.length; out.push({ key: k, v: p.v }); }
      else { out[seen[k]].v += p.v; }
    });
    return out;
  }

  // ---- headline + waterfall ----------------------------------------------
  function render() {
    var ris = rangeIdx(), g = grainOf(ris), endI = ris[ris.length - 1], accts = selected();
    var invested = 0, cash = 0, contribToDate = 0, income = 0;
    accts.forEach(function (id) { invested += acbFF[id][endI]; cash += cashFF[id][endI]; });
    for (var i = 0; i <= endI; i++) { accts.forEach(function (id) { contribToDate += flow[id][i].contrib; }); }
    ris.forEach(function (i) { accts.forEach(function (id) { income += flow[id][i].income; }); });
    var growth = invested - contribToDate;

    document.getElementById("asof").textContent = "Reviewed " + monLabel(MONTHS[endI]);
    scopeCaption(ris, accts);
    headline([
      ["Invested at cost", money(invested), "Adjusted cost of positions still held."],
      ["Contributions", money(contribToDate), "Gross deposits coded as contributions."],
      ["Income received", money(income), "Dividends and interest in the period."],
      ["Cash on hand", money(cash), "Uninvested cash at period end."],
      ["Growth beyond contributions", money(growth),
        "Cost base above contributions: transfers in and reinvested income."],
    ]);
    waterfall(contribToDate, growth, invested, cash);

    capitalChart(ris, g);
    barChart("inc", bucketSum(flowSum(ris, "income"), g), false);
    cashflowChart(ris, g);
    roomBars(endI, accts);
    acctTable(ris, endI, accts);
    holdTable(accts, invested);
  }

  function scopeCaption(ris, accts) {
    var s = document.getElementById("fb-scope");
    var na = state.accts ? accts.length + (accts.length === 1 ? " account" : " accounts") : "All accounts";
    var dr = state.range === "all"
      ? monLabel(MONTHS[ris[0]]) + " – " + monLabel(MONTHS[ris[ris.length - 1]])
      : monLabel(MONTHS[ris[0]]) + " – " + monLabel(MONTHS[ris[ris.length - 1]]);
    s.textContent = na + " · " + dr;
  }

  function headline(items) {
    var host = document.getElementById("headline");
    host.textContent = "";
    items.forEach(function (it, k) {
      var d = document.createElement("div");
      d.className = k === 0 ? "hero-cell lead" : "hero-cell";
      var lab = document.createElement("div"); lab.className = "hero-cell-label"; lab.textContent = it[0];
      var val = document.createElement("div"); val.className = "hero-cell-value"; val.textContent = it[1];
      var note = document.createElement("div"); note.className = "hero-cell-note"; note.textContent = it[2];
      d.appendChild(lab); d.appendChild(val); d.appendChild(note); host.appendChild(d);
    });
  }

  function waterfall(contrib, growth, invested, cash) {
    var host = document.getElementById("waterfall");
    var max = Math.max(invested, 1);
    var parts = [
      { label: "Contributions", v: contrib, from: 0 },
      { label: "+ Transfers & reinvested", v: growth, from: contrib },
      { label: "Invested at cost", v: invested, from: 0, total: true },
      { label: "Cash on hand", v: cash, from: 0, stub: true },
    ];
    host.textContent = "";
    parts.forEach(function (p) {
      var row = document.createElement("div"); row.className = "wf-row" + (p.total ? " total" : "");
      var lab = document.createElement("div"); lab.className = "wf-label"; lab.textContent = p.label;
      var track = document.createElement("div"); track.className = "wf-track";
      var bar = document.createElement("div");
      bar.className = "wf-bar" + (p.total ? " wf-total" : "") + (p.stub ? " wf-stub" : "");
      bar.style.marginLeft = (Math.max(p.from, 0) / max * 100) + "%";
      bar.style.width = (Math.abs(p.v) / max * 100) + "%";
      track.appendChild(bar);
      var val = document.createElement("div"); val.className = "wf-val"; val.textContent = money(p.v);
      row.appendChild(lab); row.appendChild(track); row.appendChild(val); host.appendChild(row);
    });
  }

  // ---- charts -------------------------------------------------------------
  function chartFrame(id) {
    var box = document.getElementById(id);
    box.querySelectorAll("svg").forEach(function (s) { s.remove(); });
    var svg = svgEl("svg", { viewBox: "0 0 1000 300", preserveAspectRatio: "none",
      class: "chart", role: "img" });
    [100, 200].forEach(function (y) {
      svg.appendChild(svgEl("line", { x1: 0, y1: y, x2: 1000, y2: y, stroke: "var(--color-divider)",
        "stroke-width": 1, "vector-effect": "non-scaling-stroke" }));
    });
    box.insertBefore(svg, box.firstChild);
    return { box: box, svg: svg };
  }
  function setY(id, mx, mn) {
    document.getElementById(id + "-ymax").textContent = compact(mx);
    document.getElementById(id + "-ymin").textContent = compact(mn);
  }

  function capitalChart(ris, g) {
    var cap = bucketLast(seriesStock(ris, acbFF).map(function (p, k) {
      return { i: p.i, v: p.v + seriesStock(ris, cashFF)[k].v };
    }), g);
    var contrib = bucketLast(contribCum(ris), g);
    var f = chartFrame("cap"), svg = f.svg;
    if (!cap.length) { return; }
    var mx = Math.max.apply(null, cap.map(function (p) { return p.v; }).concat([1]));
    var xA = function (i) { return cap.length === 1 ? 500 : i / (cap.length - 1) * 1000; };
    var yA = function (v) { return 290 - v / mx * 280; };
    var line = cap.map(function (p, i) { return (i ? "L" : "M") + xA(i).toFixed(1) + " " + yA(p.v).toFixed(1); }).join(" ");
    var area = "M " + xA(0) + " 300 " + line.replace("M", "L") + " L " + xA(cap.length - 1) + " 300 Z";
    svg.appendChild(svgEl("path", { d: area, fill: "url(#capFill)" }));
    var defs = svgEl("defs", {});
    var grad = svgEl("linearGradient", { id: "capFill", x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "var(--color-accent)", "stop-opacity": 0.18 }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "var(--color-accent)", "stop-opacity": 0 }));
    defs.appendChild(grad); svg.appendChild(defs);
    svg.appendChild(svgEl("path", { d: line, fill: "none", stroke: "var(--color-accent)",
      "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }));
    var cline = contrib.map(function (p, i) { return (i ? "L" : "M") + xA(i).toFixed(1) + " " + yA(p.v).toFixed(1); }).join(" ");
    svg.appendChild(svgEl("path", { d: cline, fill: "none", stroke: "var(--color-text)",
      "stroke-width": 1, "stroke-dasharray": "3 3", "vector-effect": "non-scaling-stroke" }));
    setY("cap", mx, 0);
    legend("cap", [["Capital at cost", "var(--color-accent)", "area"], ["Contributions", "var(--color-text)", "dash"]]);
    hover("cap", cap, xA, yA, function (i) {
      return [cap[i].key, money(cap[i].v), "contributions " + money(contrib[i] ? contrib[i].v : 0)];
    });
  }

  function barChart(id, data, diverging) {
    var f = chartFrame(id), svg = f.svg;
    document.getElementById(id + "-legend").textContent = "";
    if (!data.length) { setY(id, 0, 0); return; }
    var vals = data.map(function (p) { return p.v; });
    var mx = Math.max.apply(null, vals.concat([1])), mn = Math.min.apply(null, vals.concat([0]));
    var zero = diverging ? 290 - (0 - mn) / (mx - mn || 1) * 280 : 290;
    var scale = diverging ? 280 / (mx - mn || 1) : 280 / (mx || 1);
    var band = 1000 / data.length, bw = Math.max(band - 8, 2);
    data.forEach(function (p, i) {
      var h = Math.abs(p.v) * scale, x = i * band + (band - bw) / 2;
      var y = p.v >= 0 ? zero - h : zero;
      var rect = svgEl("rect", { x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1),
        height: Math.max(h, 0).toFixed(1), fill: p.v < 0 ? "var(--color-neutral-500)" : "var(--color-accent)",
        class: "ex-bar" });
      rect.style.transformOrigin = x + "px " + zero + "px";
      if (!REDUCED) { rect.style.transform = "scaleY(0)"; }
      svg.appendChild(rect);
      if (!REDUCED) { requestAnimationFrame(function () { rect.style.transform = "scaleY(1)"; }); }
    });
    setY(id, mx, diverging ? mn : 0);
    hover(id, data, function (i) { return i * band + band / 2; },
      function () { return 20; },
      function (i) { return [data[i].key, money(data[i].v), ""]; });
  }

  function cashflowChart(ris, g) {
    var inflow = bucketSum(flowSum(ris, "inflow"), g);
    var outflow = bucketSum(flowSum(ris, "outflow"), g);
    var net = inflow.map(function (p, i) { return { key: p.key, v: p.v + outflow[i].v }; });
    var f = chartFrame("cf"), svg = f.svg;
    if (!inflow.length) { setY("cf", 0, 0); return; }
    var mx = Math.max.apply(null, inflow.map(function (p) { return p.v; }).concat([1]));
    var mn = Math.min.apply(null, outflow.map(function (p) { return p.v; }).concat([0]));
    var rng = (mx - mn) || 1, zero = 290 - (0 - mn) / rng * 280, scale = 280 / rng;
    var band = 1000 / inflow.length, bw = Math.max(band - 8, 2);
    function bar(p, i, up) {
      var h = Math.abs(p.v) * scale, x = i * band + (band - bw) / 2;
      var y = up ? zero - h : zero;
      var rect = svgEl("rect", { x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1),
        height: Math.max(h, 0).toFixed(1), fill: up ? "var(--color-accent)" : "var(--color-neutral-500)" });
      svg.appendChild(rect);
    }
    inflow.forEach(function (p, i) { bar(p, i, true); });
    outflow.forEach(function (p, i) { bar(p, i, false); });
    svg.appendChild(svgEl("line", { x1: 0, y1: zero, x2: 1000, y2: zero, stroke: "var(--color-divider)",
      "stroke-width": 1, "vector-effect": "non-scaling-stroke" }));
    setY("cf", mx, mn);
    legend("cf", [["In", "var(--color-accent)", "box"], ["Out", "var(--color-neutral-500)", "box"]]);
    hover("cf", net, function (i) { return i * band + band / 2; }, function () { return 20; },
      function (i) { return [net[i].key, "net " + money(net[i].v),
        money(inflow[i].v) + " in · " + money(outflow[i].v) + " out"]; });
  }

  function legend(id, items) {
    var host = document.getElementById(id + "-legend");
    host.textContent = "";
    items.forEach(function (it) {
      var s = document.createElement("span"); s.className = "leg";
      var sw = document.createElement("span"); sw.className = "leg-sw leg-" + it[2];
      sw.style.background = it[2] === "dash" ? "transparent" : it[1];
      if (it[2] === "dash") { sw.style.borderTop = "1px dashed " + it[1]; }
      s.appendChild(sw); s.appendChild(document.createTextNode(it[0])); host.appendChild(s);
    });
  }

  function hover(id, data, xA, yA, fmt) {
    var box = document.getElementById(id), tip = document.getElementById(id + "-tip");
    var svg = box.querySelector("svg");
    var vline = svgEl("line", { y1: 0, y2: 300, stroke: "var(--color-accent)", "stroke-width": 1,
      "vector-effect": "non-scaling-stroke", class: "ex-scrub" });
    svg.appendChild(vline);
    box.onmousemove = function (e) {
      var r = box.getBoundingClientRect();
      var ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      var i = Math.round(ratio * (data.length - 1));
      if (i < 0 || !data[i]) { return; }
      var x = xA(i);
      vline.setAttribute("x1", x); vline.setAttribute("x2", x);
      svg.classList.add("scrubbing");
      var parts = fmt(i);
      tip.textContent = "";
      var a = document.createElement("span"); a.className = "ex-tip-period"; a.textContent = parts[0];
      var b = document.createElement("strong"); b.className = "ex-tip-value"; b.textContent = parts[1];
      tip.appendChild(a); tip.appendChild(b);
      if (parts[2]) { var c = document.createElement("span"); c.className = "ex-tip-meta"; c.textContent = parts[2]; tip.appendChild(c); }
      tip.style.left = (x / 1000 * 100) + "%"; tip.style.top = "6px";
      tip.classList.add("show");
    };
    box.onmouseleave = function () { tip.classList.remove("show"); svg.classList.remove("scrubbing"); };
  }

  // ---- room, tables -------------------------------------------------------
  function roomBars(endI, accts) {
    var host = document.getElementById("room");
    var year = MONTHS[endI].slice(0, 4);
    var by = {}; ["TFSA", "FHSA", "RRSP", "RESP"].forEach(function (k) { by[k] = 0; });
    accts.forEach(function (id) {
      var g = REG[KIND_ID[id]]; if (!g) { return; }
      var used = 0; for (var i = 0; i <= endI; i++) { if (MONTHS[i].slice(0, 4) === year) { used += flow[id][i].contrib; } }
      by[g] += used;
    });
    host.textContent = "";
    ["TFSA", "FHSA", "RRSP", "RESP"].forEach(function (k) {
      var lim = (LIMITS[k] || {})[year] || 0; if (!lim && !by[k]) { return; }
      var pct = lim ? Math.min(100, Math.round(by[k] / lim * 100)) : 0;
      var row = document.createElement("div"); row.className = "room-row";
      row.innerHTML = "";
      var lab = document.createElement("div"); lab.className = "room-k"; lab.textContent = k + " " + year;
      var track = document.createElement("div"); track.className = "room-track";
      var fill = document.createElement("div"); fill.className = "room-fill"; fill.style.width = pct + "%";
      track.appendChild(fill);
      var val = document.createElement("div"); val.className = "room-v";
      val.textContent = money(by[k]) + " / " + money(lim) + " · " + pct + "%";
      row.appendChild(lab); row.appendChild(track); row.appendChild(val); host.appendChild(row);
    });
  }

  function acctTable(ris, endI, accts) {
    var rows = {};
    ACCTS.forEach(function (a) {
      if (accts.indexOf(a.id) < 0) { return; }
      var contrib = 0, income = 0;
      for (var i = 0; i <= endI; i++) { contrib += flow[a.id][i].contrib; }
      ris.forEach(function (i) { income += flow[a.id][i].income; });
      (rows[a.kind] = rows[a.kind] || []).push({ a: a, contrib: contrib, income: income,
        acb: acbFF[a.id][endI], cash: cashFF[a.id][endI] });
    });
    var html = '<table class="table"><thead><tr><th>Account</th><th class="num">Contributed</th>' +
      '<th class="num">At cost</th><th class="num">Cash</th><th class="num">Income</th></tr></thead><tbody>';
    Object.keys(rows).sort().forEach(function (kind) {
      rows[kind].forEach(function (r) {
        html += '<tr><td><span class="badge">' + esc(kind) + "</span> " + esc(r.a.name) +
          ' <span class="chip-id">' + esc(r.a.short_id) + "</span></td>" +
          '<td class="num">' + money(r.contrib) + "</td><td class=\"num\">" + money(r.acb) +
          '</td><td class="num">' + money(r.cash) + '</td><td class="num pos">' + money(r.income) + "</td></tr>";
      });
    });
    document.getElementById("acct-table").innerHTML = html + "</tbody></table>";
  }

  function holdTable(accts, invested) {
    var hs = L.holdings.filter(function (h) { return accts.indexOf(h.account_id) >= 0; });
    var di = 0, dic = 0, rest = [];
    hs.forEach(function (h) {
      if (KIND_ID[h.account_id] === "DirectIndexing") { di += h.acb; dic += 1; }
      else { rest.push(h); }
    });
    rest.sort(function (a, b) { return b.acb - a.acb; });
    var total = invested || 1;
    var html = '<table class="table"><thead><tr><th>Security</th><th>Account</th>' +
      '<th class="num">Shares</th><th class="num">At cost</th><th class="num">Weight</th></tr></thead><tbody>';
    if (di > 0) {
      html += '<tr><td><strong>Direct Indexing</strong> <span class="chip-id">' + dic +
        ' holdings</span></td><td><span class="badge">DirectIndexing</span></td>' +
        '<td class="num">—</td><td class="num">' + money(di) + '</td><td class="num">' +
        Math.round(di / total * 100) + "%</td></tr>";
    }
    rest.slice(0, 40).forEach(function (h) {
      html += "<tr><td><strong>" + esc(h.symbol) + '</strong></td><td><span class="badge">' +
        esc(KIND_ID[h.account_id]) + '</span></td><td class="num">' + (+h.qty.toFixed(4)) +
        '</td><td class="num">' + money(h.acb) + '</td><td class="num">' +
        Math.round(h.acb / total * 100) + "%</td></tr>";
    });
    document.getElementById("hold-table").innerHTML = html + "</tbody></table>";
  }

  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  // ---- filter bar wiring --------------------------------------------------
  var bar = document.getElementById("filterbar");
  function paintChips() {
    bar.querySelector("[data-all]").classList.toggle("on", !state.accts);
    bar.querySelectorAll(".chip.acct").forEach(function (c) {
      var on = state.accts && state.accts.indexOf(c.getAttribute("data-acct")) >= 0;
      c.classList.toggle("on", !!on);
    });
  }
  bar.querySelector(".fb-accounts").addEventListener("click", function (e) {
    var chip = e.target.closest("button"); if (!chip) { return; }
    if (chip.hasAttribute("data-all")) { state.accts = null; }
    else if (chip.classList.contains("kind-toggle")) {
      var kind = chip.getAttribute("data-kind");
      var ids = ACCTS.filter(function (a) { return a.kind === kind; }).map(function (a) { return a.id; });
      var set = state.accts ? state.accts.slice() : [];
      var allIn = ids.every(function (id) { return set.indexOf(id) >= 0; });
      ids.forEach(function (id) {
        var at = set.indexOf(id);
        if (allIn && at >= 0) { set.splice(at, 1); } else if (!allIn && at < 0) { set.push(id); }
      });
      state.accts = set.length ? set : null;
    } else if (chip.classList.contains("acct")) {
      var id = chip.getAttribute("data-acct");
      var s = state.accts ? state.accts.slice() : [];
      var i = s.indexOf(id); if (i >= 0) { s.splice(i, 1); } else { s.push(id); }
      state.accts = s.length ? s : null;
    }
    paintChips(); render();
  });
  bar.querySelector(".fb-dates").addEventListener("click", function (e) {
    var b = e.target.closest("[data-range]"); if (!b) { return; }
    state.range = b.getAttribute("data-range");
    bar.querySelectorAll("[data-range]").forEach(function (x) { x.classList.toggle("on", x === b); });
    render();
  });

  paintChips();
  render();
})();
