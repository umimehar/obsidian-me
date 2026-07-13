(function () {
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dataEl = document.getElementById("ex-data");
  if (!dataEl) { return; }
  var DATA = JSON.parse(dataEl.textContent);
  var SERIES = DATA.series;

  function fmt(v, cur) {
    var s = (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-CA",
      { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return cur ? s + " " + cur : s;
  }
  function periodKey(month, period) {
    return period === "year" ? month.slice(0, 4) : month;
  }

  function aggregate(cfg, state) {
    var rows = SERIES.filter(function (r) {
      if (r.currency !== state.currency) { return false; }
      if (state.accounts && state.accounts.indexOf(r.account_id) < 0) { return false; }
      return r[cfg.metric] !== null && r[cfg.metric] !== undefined;
    });
    var buckets = {};
    rows.forEach(function (r) {
      var k = periodKey(r.month, state.period);
      if (cfg.agg === "last") {
        buckets[k] = buckets[k] || {};
        var acc = buckets[k][r.account_id];
        if (!acc || r.month >= acc.month) {
          buckets[k][r.account_id] = { month: r.month, v: r[cfg.metric] };
        }
      } else {
        buckets[k] = (buckets[k] || 0) + r[cfg.metric];
      }
    });
    return Object.keys(buckets).sort().map(function (k) {
      var v = cfg.agg === "last"
        ? Object.keys(buckets[k]).reduce(function (s, a) { return s + buckets[k][a].v; }, 0)
        : buckets[k];
      return { key: k, value: Math.round(v * 100) / 100 };
    });
  }

  function currenciesFor(state) {
    var set = {};
    SERIES.forEach(function (r) {
      if (state.accounts && state.accounts.indexOf(r.account_id) < 0) { return; }
      set[r.currency] = true;
    });
    return Object.keys(set).sort();
  }

  function scope(state) {
    if (!state.accounts) { return "all accounts"; }
    return state.accounts.length + (state.accounts.length === 1 ? " account" : " accounts");
  }

  function kpis(cfg, points, state) {
    if (!points.length) { return [["No data", "—", "No rows match the current filter."]]; }
    var total = points.reduce(function (s, p) { return s + p.value; }, 0);
    var peak = points.reduce(function (m, p) { return p.value > m.value ? p : m; }, points[0]);
    var last = points[points.length - 1];
    var lbl = cfg.label.toLowerCase();
    if (cfg.agg === "last") {
      return [
        ["Latest", fmt(last.value, cfg.cur),
          "The " + lbl + " at the most recent period (" + last.key + ") for " + scope(state) + "."],
        ["Peak", fmt(peak.value, cfg.cur),
          "The highest " + lbl + " reached in any period (" + peak.key + ")."],
        [cfg.periodsLabel, String(points.length),
          "Number of " + cfg.unit + "s with data in the current view."]
      ];
    }
    return [
      ["Total", fmt(total, cfg.cur),
        "Sum of " + lbl + " across every " + cfg.unit + " shown, for " + scope(state) + "."],
      ["Best " + cfg.unit, fmt(peak.value, cfg.cur) + " (" + peak.key + ")",
        "The single " + cfg.unit + " with the highest " + lbl + "."],
      ["Average", fmt(total / points.length, cfg.cur),
        "Mean " + lbl + " per " + cfg.unit + " across the " + points.length + " shown."]
    ];
  }

  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) { e.setAttribute(k, attrs[k]); }
    return e;
  }

  function axisLabel(svg, x, base, text) {
    var t = el("text", { x: x.toFixed(1), y: base + 16, "text-anchor": "middle",
      class: "chart-label" });
    t.textContent = text;
    svg.appendChild(t);
  }

  function drawBars(svg, points, cfg, W, H) {
    var padL = 8, padR = 8, padB = 26, padT = 10;
    var pw = W - padL - padR, ph = H - padT - padB, base = padT + ph;
    var maxV = Math.max.apply(null,
      points.map(function (p) { return Math.abs(p.value); }).concat([1]));
    svg.appendChild(el("line", { x1: padL, y1: base, x2: W - padR, y2: base,
      stroke: "var(--chart-axis)", "stroke-width": 1 }));
    var band = pw / points.length, bw = Math.max(band - 10, 3);
    var xAt = function (i) { return padL + i * band + band / 2; };
    var tops = [];
    points.forEach(function (p, i) {
      var h = Math.abs(p.value) / maxV * ph;
      var x = xAt(i) - bw / 2, y = p.value < 0 ? base : base - h;
      tops.push(p.value < 0 ? base : base - h);
      var color = p.value < 0 ? "var(--data-outflow)" : cfg.color;
      var rect = el("rect", { x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1),
        height: Math.max(h, 0).toFixed(1), rx: 3, fill: color, class: "ex-bar" });
      rect.style.transformOrigin = x + "px " + base + "px";
      if (!REDUCED) { rect.style.transform = "scaleY(0)"; }
      svg.appendChild(rect);
      if (!REDUCED) {
        requestAnimationFrame(function () { rect.style.transform = "scaleY(1)"; });
      }
      if (points.length <= 18 || i % Math.ceil(points.length / 12) === 0) {
        axisLabel(svg, xAt(i), base, p.key.length > 4 ? p.key.slice(5) : p.key);
      }
    });
    return { xAt: xAt, yAt: function (i) { return tops[i]; }, base: base, top: padT };
  }

  function drawArea(svg, points, cfg, W, H) {
    var padL = 8, padR = 8, padB = 26, padT = 10;
    var pw = W - padL - padR, ph = H - padT - padB, base = padT + ph;
    var vals = points.map(function (p) { return p.value; });
    var maxV = Math.max.apply(null, vals.concat([1]));
    var minV = Math.min.apply(null, vals.concat([0]));
    var span = (maxV - minV) || 1;
    var xAt = function (i) {
      return padL + (points.length === 1 ? pw / 2 : i / (points.length - 1) * pw);
    };
    var yAt = function (i) { return base - (points[i].value - minV) / span * ph; };
    var line = points.map(function (p, i) {
      return (i ? "L" : "M") + xAt(i).toFixed(1) + " " + yAt(i).toFixed(1);
    }).join(" ");
    var area = "M" + xAt(0).toFixed(1) + " " + base + " " + line.replace("M", "L") +
      " L" + xAt(points.length - 1).toFixed(1) + " " + base + " Z";
    svg.appendChild(el("path", { d: area, fill: "url(#ex-grad)", class: "ex-area" }));
    var path = el("path", { d: line, fill: "none", stroke: cfg.color, "stroke-width": 2.4,
      "stroke-linejoin": "round", "stroke-linecap": "round", class: "ex-line" });
    svg.appendChild(path);
    if (!REDUCED) {
      var len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      requestAnimationFrame(function () { path.style.strokeDashoffset = 0; });
    }
    points.forEach(function (p, i) {
      if (points.length <= 18 || i % Math.ceil(points.length / 12) === 0) {
        axisLabel(svg, xAt(i), base, p.key.length > 4 ? p.key.slice(2) : p.key);
      }
    });
    return { xAt: xAt, yAt: yAt, base: base, top: padT };
  }

  function tipHtml(points, i, cfg) {
    var p = points[i];
    var period = document.createElement("span");
    period.className = "ex-tip-period";
    period.textContent = (cfg.unit === "year" ? "Year " : "") + p.key;
    var value = document.createElement("strong");
    value.className = "ex-tip-value";
    value.textContent = fmt(p.value, cfg.cur);
    var meta = document.createElement("span");
    meta.className = "ex-tip-meta";
    var deltaTxt = cfg.label;
    if (i > 0) {
      var d = p.value - points[i - 1].value;
      var arrow = d > 0 ? "▲" : (d < 0 ? "▼" : "·");
      deltaTxt += " · " + arrow + " " + fmt(Math.abs(d), cfg.cur) + " vs prev";
    }
    meta.textContent = deltaTxt;
    return [period, value, meta];
  }

  function wirePointer(svg, points, cfg, geom, host) {
    var vline = el("line", { y1: geom.top, y2: geom.base, stroke: "var(--chart-axis)",
      "stroke-width": 1, class: "ex-scrub" });
    var dot = el("circle", { r: 4.5, fill: cfg.color, stroke: "var(--surface)",
      "stroke-width": 2, class: "ex-scrub" });
    svg.appendChild(vline);
    svg.appendChild(dot);
    var tip = host.querySelector(".ex-tip");
    svg.addEventListener("pointermove", function (ev) {
      var box = svg.getBoundingClientRect();
      var rel = (ev.clientX - box.left) / box.width * svg.viewBox.baseVal.width;
      var i = 0, best = 1e9;
      points.forEach(function (p, j) {
        var d = Math.abs(geom.xAt(j) - rel);
        if (d < best) { best = d; i = j; }
      });
      var px = geom.xAt(i), py = geom.yAt(i);
      vline.setAttribute("x1", px); vline.setAttribute("x2", px);
      dot.setAttribute("cx", px); dot.setAttribute("cy", py);
      svg.classList.add("scrubbing");
      tip.textContent = "";
      tipHtml(points, i, cfg).forEach(function (n) { tip.appendChild(n); });
      tip.style.left = (px / svg.viewBox.baseVal.width * 100) + "%";
      tip.classList.add("show");
    });
    svg.addEventListener("pointerleave", function () {
      svg.classList.remove("scrubbing");
      tip.classList.remove("show");
    });
  }

  function renderKpis(section, cfg, points, state) {
    var host = section.querySelector(".ex-kpis");
    host.textContent = "";
    kpis(cfg, points, state).forEach(function (k) {
      var tile = document.createElement("div");
      tile.className = "kpi";
      var head = document.createElement("span");
      head.className = "kpi-label";
      head.textContent = k[0];
      if (k[2]) {
        var hint = document.createElement("span");
        hint.className = "hint";
        hint.setAttribute("tabindex", "0");
        hint.setAttribute("role", "note");
        hint.setAttribute("aria-label", k[2]);
        hint.textContent = "i";
        var bubble = document.createElement("span");
        bubble.className = "hint-bubble";
        bubble.textContent = k[2];
        hint.appendChild(bubble);
        head.appendChild(hint);
      }
      var val = document.createElement("span");
      val.className = "kpi-value";
      val.textContent = k[1];
      tile.appendChild(head);
      tile.appendChild(val);
      host.appendChild(tile);
    });
  }

  function render(section, cfg, state) {
    cfg.cur = state.currency;
    var points = aggregate(cfg, state);
    renderKpis(section, cfg, points, state);
    var host = section.querySelector(".ex-chart");
    host.querySelectorAll("svg").forEach(function (s) { s.remove(); });
    var W = 720, H = 260;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H,
      class: "chart", preserveAspectRatio: "xMidYMid meet", role: "img" });
    svg.setAttribute("aria-label", cfg.label + " by " + cfg.unit);
    var defs = el("defs", {});
    var grad = el("linearGradient", { id: "ex-grad", x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(el("stop", { offset: "0%", "stop-color": cfg.color, "stop-opacity": 0.28 }));
    grad.appendChild(el("stop", { offset: "100%", "stop-color": cfg.color, "stop-opacity": 0 }));
    defs.appendChild(grad);
    svg.appendChild(defs);
    if (!points.length) {
      var t = el("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "chart-empty" });
      t.textContent = "no data for this selection";
      svg.appendChild(t);
      host.insertBefore(svg, host.firstChild);
      return;
    }
    var geom = cfg.type === "area"
      ? drawArea(svg, points, cfg, W, H)
      : drawBars(svg, points, cfg, W, H);
    wirePointer(svg, points, cfg, geom, host);
    host.insertBefore(svg, host.firstChild);
  }

  function chipList(section, state, cfg) {
    var host = section.querySelector(".ex-chips");
    function paint() {
      host.querySelectorAll(".chip").forEach(function (c) {
        var id = c.getAttribute("data-id");
        var on = id === "all"
          ? !state.accounts
          : (state.accounts && state.accounts.indexOf(id) >= 0);
        c.classList.toggle("on", !!on);
      });
    }
    host.addEventListener("click", function (ev) {
      var chip = ev.target.closest(".chip");
      if (!chip) { return; }
      var id = chip.getAttribute("data-id");
      if (id === "all") {
        state.accounts = null;
      } else {
        var set = state.accounts ? state.accounts.slice() : [];
        var at = set.indexOf(id);
        if (at >= 0) { set.splice(at, 1); } else { set.push(id); }
        state.accounts = set.length ? set : null;
      }
      var curs = currenciesFor(state);
      if (curs.indexOf(state.currency) < 0 && curs.length) { state.currency = curs[0]; }
      syncCurrency(section, state, cfg);
      paint();
      render(section, cfg, state);
    });
    paint();
  }

  function syncCurrency(section, state, cfg) {
    var host = section.querySelector(".ex-cur");
    if (!host) { return; }
    var curs = currenciesFor(state);
    host.style.display = curs.length > 1 ? "" : "none";
    host.textContent = "";
    curs.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "seg-btn" + (c === state.currency ? " on" : "");
      b.setAttribute("data-cur", c);
      b.textContent = c;
      host.appendChild(b);
    });
  }

  document.querySelectorAll(".explorer").forEach(function (section) {
    var cfg = {
      metric: section.getAttribute("data-metric"), agg: section.getAttribute("data-agg"),
      type: section.getAttribute("data-type"),
      color: "var(--data-" + section.getAttribute("data-color") + ")",
      label: section.getAttribute("data-label") || "value",
      explain: section.getAttribute("data-explain") || "",
      unit: "year", periodsLabel: "Years"
    };
    var curs = currenciesFor({ accounts: null });
    var state = { period: "year",
      currency: curs.indexOf("CAD") >= 0 ? "CAD" : (curs[0] || "CAD"), accounts: null };
    section.querySelector(".ex-seg").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-period]");
      if (!b) { return; }
      state.period = b.getAttribute("data-period");
      cfg.unit = state.period;
      cfg.periodsLabel = state.period === "year" ? "Years" : "Months";
      section.querySelectorAll("[data-period]").forEach(function (x) {
        x.classList.toggle("on", x === b);
      });
      render(section, cfg, state);
    });
    var curHost = section.querySelector(".ex-cur");
    if (curHost) {
      curHost.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-cur]");
        if (!b) { return; }
        state.currency = b.getAttribute("data-cur");
        curHost.querySelectorAll("[data-cur]").forEach(function (x) {
          x.classList.toggle("on", x === b);
        });
        render(section, cfg, state);
      });
    }
    chipList(section, state, cfg);
    syncCurrency(section, state, cfg);
    render(section, cfg, state);
  });
})();
