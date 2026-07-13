(function () {
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dataEl = document.getElementById("ledger-data");
  if (!dataEl) { return; }
  var SERIES = JSON.parse(dataEl.textContent).chart || [];
  var NS = "http://www.w3.org/2000/svg";
  var VW = 1000, VH = 300, PAD_T = 20, PAD_B = 14;

  function money(v) {
    return (v < 0 ? "-" : "") + "$" + Math.abs(Math.round(v)).toLocaleString("en-CA");
  }
  function compact(v) {
    var n = Math.abs(v);
    if (n >= 1e6) { return "$" + (n / 1e6).toFixed(1) + "M"; }
    if (n >= 1e3) { return "$" + Math.round(n / 1e3) + "K"; }
    return "$" + Math.round(n);
  }
  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) { e.setAttribute(k, attrs[k]); }
    return e;
  }

  var box = document.getElementById("ld-chart");
  var tip = document.getElementById("ld-tip");
  var tf = 0, coords = [];

  function slice() { return tf > 0 ? SERIES.slice(-tf) : SERIES; }

  function draw() {
    var pts = slice();
    box.querySelectorAll("svg").forEach(function (s) { s.remove(); });
    var svg = el("svg", { viewBox: "0 0 " + VW + " " + VH, preserveAspectRatio: "none",
      class: "chart", role: "img" });
    svg.setAttribute("aria-label", "Cumulative contributions");
    var defs = el("defs", {});
    var grad = el("linearGradient", { id: "ldFill", x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(el("stop", { offset: "0%", "stop-color": "var(--color-accent)", "stop-opacity": 0.16 }));
    grad.appendChild(el("stop", { offset: "100%", "stop-color": "var(--color-accent)", "stop-opacity": 0 }));
    defs.appendChild(grad);
    svg.appendChild(defs);
    [100, 200].forEach(function (y) {
      svg.appendChild(el("line", { x1: 0, y1: y, x2: VW, y2: y, stroke: "var(--color-divider)",
        "stroke-width": 1, "vector-effect": "non-scaling-stroke" }));
    });
    document.getElementById("ld-ymax").textContent = "";
    document.getElementById("ld-ymin").textContent = "";
    if (!pts.length) {
      var t = el("text", { x: VW / 2, y: VH / 2, "text-anchor": "middle", class: "chart-empty" });
      t.textContent = "no data";
      svg.appendChild(t);
      box.insertBefore(svg, box.firstChild);
      return;
    }
    var vals = pts.map(function (p) { return p.v; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var span = (mx - mn) || 1;
    var ph = VH - PAD_T - PAD_B;
    var xAt = function (i) { return pts.length === 1 ? VW / 2 : i / (pts.length - 1) * VW; };
    var yAt = function (v) { return PAD_T + ph - (v - mn) / span * ph; };
    coords = pts.map(function (p, i) { return { x: xAt(i), y: yAt(p.v), v: p.v, m: p.m }; });
    var line = coords.map(function (c, i) {
      return (i ? "L" : "M") + c.x.toFixed(1) + " " + c.y.toFixed(1);
    }).join(" ");
    var area = "M " + coords[0].x.toFixed(1) + " " + VH + " " + line.replace("M", "L") +
      " L " + coords[coords.length - 1].x.toFixed(1) + " " + VH + " Z";
    svg.appendChild(el("path", { d: area, fill: "url(#ldFill)" }));
    var path = el("path", { d: line, fill: "none", stroke: "var(--color-accent)", "stroke-width": 2,
      "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round", "stroke-linecap": "round",
      class: "ex-line" });
    svg.appendChild(path);
    if (!REDUCED) {
      var len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      requestAnimationFrame(function () { path.style.strokeDashoffset = 0; });
    }
    var vline = el("line", { y1: 0, y2: VH, stroke: "var(--color-accent)", "stroke-width": 1,
      "vector-effect": "non-scaling-stroke", class: "ex-scrub" });
    var dot = el("circle", { r: 4, fill: "var(--color-accent)", stroke: "var(--color-bg)",
      "stroke-width": 2, "vector-effect": "non-scaling-stroke", class: "ex-scrub" });
    svg.appendChild(vline);
    svg.appendChild(dot);
    box.insertBefore(svg, box.firstChild);
    document.getElementById("ld-ymax").textContent = compact(mx);
    document.getElementById("ld-ymin").textContent = compact(mn);
    box._scrub = { vline: vline, dot: dot };
  }

  box.addEventListener("mousemove", function (e) {
    if (!coords.length) { return; }
    var r = box.getBoundingClientRect();
    var ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    var i = Math.round(ratio * (coords.length - 1));
    var c = coords[i], s = box._scrub;
    if (!s) { return; }
    s.vline.setAttribute("x1", c.x); s.vline.setAttribute("x2", c.x);
    s.dot.setAttribute("cx", c.x); s.dot.setAttribute("cy", c.y);
    box.querySelector("svg").classList.add("scrubbing");
    tip.textContent = "";
    var pd = document.createElement("span");
    pd.className = "ex-tip-period";
    pd.textContent = c.m;
    var vv = document.createElement("strong");
    vv.className = "ex-tip-value";
    vv.textContent = money(c.v);
    tip.appendChild(pd);
    tip.appendChild(vv);
    tip.style.left = (c.x / VW) * 100 + "%";
    tip.style.top = (c.y / VH) * 100 + "%";
    tip.classList.add("show");
  });
  box.addEventListener("mouseleave", function () {
    tip.classList.remove("show");
    var svg = box.querySelector("svg");
    if (svg) { svg.classList.remove("scrubbing"); }
  });

  var tfHost = document.getElementById("ld-tf");
  if (tfHost) {
    tfHost.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tf]");
      if (!b) { return; }
      tf = parseInt(b.getAttribute("data-tf"), 10);
      tfHost.querySelectorAll("[data-tf]").forEach(function (x) { x.classList.toggle("on", x === b); });
      draw();
    });
  }

  var hkHost = document.getElementById("ld-hk");
  if (hkHost) {
    hkHost.addEventListener("click", function (e) {
      var b = e.target.closest("[data-hk]");
      if (!b) { return; }
      var k = b.getAttribute("data-hk");
      hkHost.querySelectorAll("[data-hk]").forEach(function (x) { x.classList.toggle("on", x === b); });
      document.querySelectorAll("#ld-holdings tr").forEach(function (tr) {
        tr.style.display = (k === "all" || tr.getAttribute("data-hk") === k) ? "" : "none";
      });
    });
  }

  draw();
})();
