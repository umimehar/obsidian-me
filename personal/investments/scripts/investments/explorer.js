(function () {
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dataEl = document.getElementById("ex-data");
  if (!dataEl) { return; }
  var DATA = JSON.parse(dataEl.textContent);
  var SERIES = DATA.series, ACCOUNTS = DATA.accounts;

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

  function kpis(cfg, points) {
    if (!points.length) { return [["No data", "—"]]; }
    var total = points.reduce(function (s, p) { return s + p.value; }, 0);
    var peak = points.reduce(function (m, p) { return p.value > m.value ? p : m; }, points[0]);
    var last = points[points.length - 1];
    if (cfg.agg === "last") {
      return [["Latest", fmt(last.value, cfg.cur)], ["Peak", fmt(peak.value, cfg.cur)],
        [cfg.periodsLabel, String(points.length)]];
    }
    return [["Total", fmt(total, cfg.cur)],
      ["Best " + cfg.unit, fmt(peak.value, cfg.cur) + " (" + peak.key + ")"],
      ["Average", fmt(total / points.length, cfg.cur)]];
  }

  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) { e.setAttribute(k, attrs[k]); }
    return e;
  }

  function drawBars(svg, points, cfg, W, H) {
    var padL = 8, padR = 8, padB = 26, padT = 10;
    var pw = W - padL - padR, ph = H - padT - padB, base = padT + ph;
    var maxV = Math.max.apply(null,
      points.map(function (p) { return Math.abs(p.value); }).concat([1]));
    svg.appendChild(el("line", { x1: padL, y1: base, x2: W - padR, y2: base,
      stroke: "var(--chart-axis)", "stroke-width": 1 }));
    var band = pw / points.length, bw = Math.max(band - 10, 3);
    points.forEach(function (p, i) {
      var h = Math.abs(p.value) / maxV * ph;
      var x = padL + i * band + (band - bw) / 2, y = p.value < 0 ? base : base - h;
      var color = p.value < 0 ? "var(--data-outflow)" : cfg.color;
      var rect = el("rect", { x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1),
        height: Math.max(h, 0).toFixed(1), rx: 3, fill: color, class: "ex-bar" });
      rect.style.transformOrigin = x + "px " + base + "px";
      if (!REDUCED) { rect.style.transform = "scaleY(0)"; }
      var t = el("title", {});
      t.textContent = p.key + ": " + fmt(p.value, cfg.cur);
      rect.appendChild(t);
      svg.appendChild(rect);
      if (!REDUCED) {
        requestAnimationFrame(function () { rect.style.transform = "scaleY(1)"; });
      }
      if (points.length <= 18 || i % Math.ceil(points.length / 12) === 0) {
        var tx = el("text", { x: (x + bw / 2).toFixed(1), y: base + 16,
          "text-anchor": "middle", class: "chart-label" });
        tx.textContent = p.key.length > 4 ? p.key.slice(5) : p.key;
        svg.appendChild(tx);
      }
    });
  }

  function drawArea(svg, points, cfg, W, H, host) {
    var padL = 8, padR = 8, padB = 26, padT = 10;
    var pw = W - padL - padR, ph = H - padT - padB, base = padT + ph;
    var vals = points.map(function (p) { return p.value; });
    var maxV = Math.max.apply(null, vals.concat([1]));
    var minV = Math.min.apply(null, vals.concat([0]));
    var span = (maxV - minV) || 1;
    var xs = function (i) {
      return padL + (points.length === 1 ? pw / 2 : i / (points.length - 1) * pw);
    };
    var ys = function (v) { return base - (v - minV) / span * ph; };
    var line = points.map(function (p, i) {
      return (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(p.value).toFixed(1);
    }).join(" ");
    var area = "M" + xs(0).toFixed(1) + " " + base + " " + line.replace("M", "L") +
      " L" + xs(points.length - 1).toFixed(1) + " " + base + " Z";
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
        var tx = el("text", { x: xs(i).toFixed(1), y: base + 16,
          "text-anchor": "middle", class: "chart-label" });
        tx.textContent = p.key.length > 4 ? p.key.slice(2) : p.key;
        svg.appendChild(tx);
      }
    });
    wireScrubber(svg, points, cfg, xs, ys, base, padT, host);
  }

  function wireScrubber(svg, points, cfg, xs, ys, base, padT, host) {
    var vline = el("line", { y1: padT, y2: base, stroke: "var(--chart-axis)",
      "stroke-width": 1, class: "ex-scrub" });
    var dot = el("circle", { r: 4.5, fill: cfg.color, stroke: "var(--surface)",
      "stroke-width": 2, class: "ex-scrub" });
    svg.appendChild(vline);
    svg.appendChild(dot);
    var tip = host.querySelector(".ex-tip");
    tip.textContent = "";
    var tipKey = document.createElement("span");
    var tipVal = document.createElement("strong");
    tip.appendChild(tipKey);
    tip.appendChild(tipVal);
    svg.addEventListener("pointermove", function (ev) {
      var box = svg.getBoundingClientRect();
      var rel = (ev.clientX - box.left) / box.width * svg.viewBox.baseVal.width;
      var i = 0, best = 1e9;
      points.forEach(function (p, j) {
        var d = Math.abs(xs(j) - rel);
        if (d < best) { best = d; i = j; }
      });
      var px = xs(i), py = ys(points[i].value);
      vline.setAttribute("x1", px); vline.setAttribute("x2", px);
      dot.setAttribute("cx", px); dot.setAttribute("cy", py);
      svg.classList.add("scrubbing");
      tipKey.textContent = points[i].key;
      tipVal.textContent = fmt(points[i].value, cfg.cur);
      tip.style.left = (px / svg.viewBox.baseVal.width * 100) + "%";
      tip.classList.add("show");
    });
    svg.addEventListener("pointerleave", function () {
      svg.classList.remove("scrubbing");
      tip.classList.remove("show");
    });
  }

  function render(section, cfg, state) {
    cfg.cur = state.currency;
    var points = aggregate(cfg, state);
    var kpiHost = section.querySelector(".ex-kpis");
    kpiHost.textContent = "";
    kpis(cfg, points).forEach(function (k) {
      var tile = document.createElement("div");
      tile.className = "kpi";
      var lab = document.createElement("span");
      lab.className = "kpi-label";
      lab.textContent = k[0];
      var val = document.createElement("span");
      val.className = "kpi-value";
      val.textContent = k[1];
      tile.appendChild(lab);
      tile.appendChild(val);
      kpiHost.appendChild(tile);
    });
    var host = section.querySelector(".ex-chart");
    host.querySelectorAll("svg").forEach(function (s) { s.remove(); });
    var W = 720, H = 260;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H,
      class: "chart", preserveAspectRatio: "xMidYMid meet", role: "img" });
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
    } else if (cfg.type === "area") {
      drawArea(svg, points, cfg, W, H, host);
    } else {
      drawBars(svg, points, cfg, W, H);
    }
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
