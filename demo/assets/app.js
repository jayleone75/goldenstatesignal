/* Golden State Signal — demo app.
   Vanilla JS, no framework, no build step — matches the rest of the site.
   Everything here is read-only: it filters and renders data already fetched
   as static JSON. There is no write path, no API call, nothing to secure. */
(function () {
  "use strict";

  var state = { key: "dmv", data: null, keyword: "", category: "all" };
  var cache = {};

  function money(v) {
    v = Number(v || 0);
    if (Math.abs(v) >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (Math.abs(v) >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
    return "$" + v.toFixed(0);
  }
  function fullMoney(v) { return "$" + Math.round(v || 0).toLocaleString("en-US"); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function load(key) {
    if (cache[key]) return Promise.resolve(cache[key]);
    return fetch("data/" + key + ".json")
      .then(function (r) {
        if (!r.ok) throw new Error("failed to load " + key);
        return r.json();
      })
      .then(function (d) { cache[key] = d; return d; });
  }

  function switchDept(key) {
    state.key = key; state.keyword = ""; state.category = "all";
    document.getElementById("keyword").value = "";
    document.querySelectorAll(".dept-switch button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.key === key);
    });
    document.querySelectorAll(".panel, .stat-row").forEach(function (p) {
      p.style.opacity = "0.4";
    });
    load(key).then(function (d) {
      state.data = d;
      render();
      document.querySelectorAll(".panel, .stat-row").forEach(function (p) {
        p.style.opacity = "1";
      });
    });
  }

  function render() {
    var d = state.data;
    if (!d) return;
    renderStats(d);
    renderCategoryChart(d);
    renderYearChart(d);
    renderSuppliers(d);
    renderWorkforce(d);
    renderTiers(d);
    renderSearch(d);
  }

  function renderStats(d) {
    var t = d.totals;
    var el2 = document.getElementById("stats");
    el2.innerHTML = "";
    var items = [
      [t.pos.toLocaleString(), "Purchase orders"],
      [money(t.spend), "Total spend"],
      [t.suppliers.toLocaleString(), "Suppliers"],
      [(t.first_po || "—").slice(0, 4) + "–" + (t.last_po || "—").slice(0, 4), "Date range"],
    ];
    items.forEach(function (it) {
      var s = el("div", "stat");
      s.appendChild(el("div", "n", esc(it[0])));
      s.appendChild(el("div", "l", esc(it[1])));
      el2.appendChild(s);
    });
  }

  function renderCategoryChart(d) {
    var wrap = document.getElementById("category-chart");
    wrap.innerHTML = "";
    var rows = d.by_category.slice(0, 10);
    var top = Math.max.apply(null, rows.map(function (r) { return r.s; }));
    rows.forEach(function (r) {
      var row = el("div", "row");
      row.appendChild(el("div", "label", esc(r.cat)));
      var track = el("div", "track");
      var fill = el("div", "fill");
      fill.style.width = Math.max(2, (r.s / top) * 100) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("div", "val", money(r.s)));
      wrap.appendChild(row);
    });
  }

  function renderYearChart(d) {
    var wrap = document.getElementById("year-chart");
    wrap.innerHTML = "";
    var rows = d.by_year;
    if (!rows.length) { wrap.innerHTML = "<p>No dated purchase history in range.</p>"; return; }
    var top = Math.max.apply(null, rows.map(function (r) { return r.s; }));
    var svgW = 560, svgH = 160, padB = 26, padT = 8;
    var slot = svgW / rows.length;
    var barW = Math.max(6, Math.min(40, slot * 0.6));
    var parts = ['<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" width="100%" height="' + svgH +
                 '" style="max-width:560px;display:block;font:11px Inter,sans-serif">'];
    rows.forEach(function (r, i) {
      var h = top ? (r.s / top) * (svgH - padT - padB) : 0;
      var x = i * slot + (slot - barW) / 2;
      var y = svgH - padB - h;
      parts.push('<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) +
        '" height="' + Math.max(h, 1).toFixed(1) + '" rx="2" fill="#C9962B" opacity="0.88">' +
        "<title>" + esc(r.y) + ": " + fullMoney(r.s) + "</title></rect>");
      parts.push('<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (svgH - padB + 14) +
        '" text-anchor="middle" fill="#6B7280">' + esc(r.y) + "</text>");
    });
    parts.push("</svg>");
    wrap.innerHTML = parts.join("");
  }

  function renderSuppliers(d) {
    var tb = document.querySelector("#supplier-table tbody");
    tb.innerHTML = "";
    d.suppliers.slice(0, 12).forEach(function (r) {
      var tr = el("tr", null,
        "<td>" + esc(r.v) + "</td>" +
        '<td class="num">' + r.n.toLocaleString() + "</td>" +
        '<td class="num">' + fullMoney(r.s) + "</td>");
      tb.appendChild(tr);
    });
  }

  function renderWorkforce(d) {
    var wrap = document.getElementById("workforce-list");
    var panel = document.getElementById("workforce-panel");
    if (!d.workforce_signals || !d.workforce_signals.length) {
      panel.style.display = "none";
      return;
    }
    panel.style.display = "";
    wrap.innerHTML = "";
    d.workforce_signals.slice(0, 8).forEach(function (w) {
      var row = el("div", "wf-row");
      row.innerHTML =
        '<span class="wf-tech">' + esc(w.technology) + "</span>" +
        '<span class="confidence-tag ' + esc(w.confidence) + '">' + esc(w.confidence) + "</span>" +
        '<div class="wf-evidence">“' + esc((w.evidence || "").slice(0, 150)) + "”</div>" +
        '<div class="wf-source"><a href="' + esc(w.url) + '" target="_blank" rel="noopener">source posting ↗</a></div>';
      wrap.appendChild(row);
    });
  }

  function renderTiers(d) {
    var tb = document.querySelector("#tier-table tbody");
    tb.innerHTML = "";
    d.confirmed_terms.slice(0, 15).forEach(function (r) {
      var badge = '<span class="tier-badge confirmed">Confirmed</span>' +
        (r.harvested ? '<span class="harvested-flag"></span>' : "");
      var tr = el("tr", null,
        "<td>" + badge + "</td>" +
        "<td>" + esc(r.te) + "</td>" +
        "<td>" + esc(r.v || "") + "</td>" +
        '<td style="max-width:340px">' + esc((r.t || "").slice(0, 90)) + "</td>" +
        '<td class="num">' + fullMoney(r.a) + "</td>");
      tb.appendChild(tr);
    });
  }

  function matchesFilter(row) {
    if (state.category !== "all" && row.pc !== state.category) return false;
    if (state.keyword) {
      var kw = state.keyword.toLowerCase();
      var hay = (row.t + " " + row.v + " " + row.pn).toLowerCase();
      if (hay.indexOf(kw) === -1) return false;
    }
    return true;
  }

  function renderSearch(d) {
    var sel = document.getElementById("category-filter");
    if (sel.options.length <= 1) {
      var cats = {};
      d.by_category.forEach(function (c) { cats[c.cat] = true; });
      Object.keys(cats).sort().forEach(function (c) {
        var o = el("option", null, esc(c));
        o.value = c;
        sel.appendChild(o);
      });
    }
    var rows = d.purchase_orders.filter(matchesFilter).slice(0, 150);
    var tb = document.querySelector("#search-table tbody");
    tb.innerHTML = "";
    rows.forEach(function (r) {
      var tr = el("tr", null,
        "<td>" + esc(r.pn) + "</td>" +
        "<td>" + esc(r.v || "") + "</td>" +
        '<td style="max-width:300px">' + esc((r.t || "").slice(0, 80)) + "</td>" +
        "<td>" + esc(r.pc) + "</td>" +
        "<td>" + esc(r.d || "") + "</td>" +
        '<td class="num">' + fullMoney(r.a) + "</td>");
      tb.appendChild(tr);
    });
    var total = d.purchase_orders.filter(matchesFilter).length;
    document.getElementById("search-count").textContent =
      "Showing " + rows.length.toLocaleString() + " of " + total.toLocaleString() +
      " matching purchase orders (top 2,000 by value are indexed in this demo).";
  }

  function init() {
    document.querySelectorAll(".dept-switch button").forEach(function (b) {
      b.addEventListener("click", function () { switchDept(b.dataset.key); });
    });
    document.getElementById("keyword").addEventListener("input", function (e) {
      state.keyword = e.target.value;
      renderSearch(state.data);
    });
    document.getElementById("category-filter").addEventListener("change", function (e) {
      state.category = e.target.value;
      renderSearch(state.data);
    });
    switchDept("dmv");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
