/* Golden State Signal — demo app.
   Vanilla JS, no framework, no build step — matches the rest of the site.

   Everything here is read-only: it filters and renders data already fetched as
   one static JSON file. There is no write path, no API call, nothing to secure.

   The whole page is derived from one array. Change a filter and EVERY figure
   on the page — stats, both charts, supplier table, renewal signals, the
   record itself — is recomputed from the same filtered set, so nothing on
   screen can disagree with anything else on screen. That is the entire point
   of the rewrite: the old version filtered only the bottom table while the
   charts stayed fixed, which meant the page quietly contradicted itself. */
(function () {
  "use strict";

  var DATA = null;       // decoded payload
  var IX = {};           // field name -> row array offset
  var ROWS = [];         // every PO, as arrays
  var HAY = [];          // lazily built lowercase search text, parallel to ROWS
  var TODAY = new Date().toISOString().slice(0, 10);

  var state = {
    depts: {}, cats: {}, kind: "", supplier: "", keyword: "",
    dateFrom: "", dateTo: "", amtMin: "", amtMax: "",
    futureOnly: false, sort: "amount"
  };

  /* ------------------------------------------------------------- helpers */
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
  function num(s) {
    // Tolerate "50,000", "$50000", " 50000 " — people paste all three.
    var n = parseFloat(String(s).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? null : n;
  }
  function $(id) { return document.getElementById(id); }
  function anyTicked(map) { for (var k in map) { if (map[k]) return true; } return false; }

  function hay(i) {
    if (HAY[i] === undefined) {
      var r = ROWS[i];
      HAY[i] = (r[IX.title] + " " + DATA.suppliers[r[IX.supplier]] + " " + r[IX.po])
        .toLowerCase();
    }
    return HAY[i];
  }

  /* -------------------------------------------------------------- filter
     `skip` lets the facet counts ask "what would match if this one dimension
     were ignored?", which is what makes the checkbox counts update sensibly
     as you narrow elsewhere. */
  function passes(i, skip) {
    var r = ROWS[i];

    if (skip !== "dept" && anyTicked(state.depts) &&
        !state.depts[DATA.departments[r[IX.dept]].key]) return false;

    if (skip !== "cat" && anyTicked(state.cats) &&
        !state.cats[DATA.categories[r[IX.category]]]) return false;

    if (state.kind && DATA.kinds[r[IX.kind]] !== state.kind) return false;

    if (state.supplier &&
        DATA.suppliers[r[IX.supplier]].toLowerCase().indexOf(state.supplier) === -1)
      return false;

    if (state.keyword && hay(i).indexOf(state.keyword) === -1) return false;

    var start = r[IX.start];
    if (state.dateFrom && (!start || start < state.dateFrom)) return false;
    if (state.dateTo && (!start || start > state.dateTo)) return false;

    var amt = r[IX.amount];
    if (state.amtMin !== "" && amt < state.amtMin) return false;
    if (state.amtMax !== "" && amt > state.amtMax) return false;

    if (state.futureOnly) {
      var ends = r[IX.ends];
      if (!ends || ends <= TODAY) return false;
    }
    return true;
  }

  function select(skip) {
    var out = [];
    for (var i = 0; i < ROWS.length; i++) if (passes(i, skip)) out.push(i);
    return out;
  }

  function sortRows(idx) {
    var s = state.sort;
    var cmp;
    if (s === "amount") cmp = function (a, b) { return ROWS[b][IX.amount] - ROWS[a][IX.amount]; };
    else if (s === "amount_asc") cmp = function (a, b) { return ROWS[a][IX.amount] - ROWS[b][IX.amount]; };
    else if (s === "newest") cmp = function (a, b) { return (ROWS[b][IX.start] || "").localeCompare(ROWS[a][IX.start] || ""); };
    else if (s === "oldest") cmp = function (a, b) { return (ROWS[a][IX.start] || "￿").localeCompare(ROWS[b][IX.start] || "￿"); };
    else if (s === "ending") cmp = function (a, b) { return (ROWS[a][IX.ends] || "￿").localeCompare(ROWS[b][IX.ends] || "￿"); };
    else cmp = function (a, b) {
      return DATA.suppliers[ROWS[a][IX.supplier]].localeCompare(DATA.suppliers[ROWS[b][IX.supplier]]);
    };
    return idx.slice().sort(cmp);
  }

  /* -------------------------------------------------------------- render */
  function render() {
    var idx = select(null);
    renderFacets();
    renderStats(idx);
    renderCategoryChart(idx);
    renderSuppliers(idx);
    renderYearChart(idx);
    renderTerms(idx);
    renderRecord(idx);
    renderWorkforce();

    $("matchcount").innerHTML = "<b>" + idx.length.toLocaleString() + "</b> of " +
      ROWS.length.toLocaleString() + " purchase orders";
  }

  function renderFacets() {
    // Counts reflect every OTHER active filter, so narrowing by department
    // immediately reshapes the category counts and vice versa.
    var byDept = {}, byCat = {};
    select("dept").forEach(function (i) {
      var k = DATA.departments[ROWS[i][IX.dept]].key;
      byDept[k] = (byDept[k] || 0) + 1;
    });
    select("cat").forEach(function (i) {
      var c = DATA.categories[ROWS[i][IX.category]];
      byCat[c] = (byCat[c] || 0) + 1;
    });
    document.querySelectorAll("#dept-opts .opt").forEach(function (o) {
      var n = byDept[o.dataset.key] || 0;
      o.querySelector(".ct").textContent = n.toLocaleString();
      o.classList.toggle("empty", n === 0);
    });
    document.querySelectorAll("#cat-opts .opt").forEach(function (o) {
      var n = byCat[o.dataset.key] || 0;
      o.querySelector(".ct").textContent = n.toLocaleString();
      o.classList.toggle("empty", n === 0);
    });
  }

  function renderStats(idx) {
    var spend = 0, sup = {}, lo = null, hi = null;
    idx.forEach(function (i) {
      var r = ROWS[i];
      spend += r[IX.amount];
      sup[r[IX.supplier]] = 1;
      var d = r[IX.start];
      if (d) { if (!lo || d < lo) lo = d; if (!hi || d > hi) hi = d; }
    });
    var range = lo ? lo.slice(0, 4) + (hi.slice(0, 4) !== lo.slice(0, 4) ? "–" + hi.slice(0, 4) : "") : "—";
    var items = [
      [idx.length.toLocaleString(), "Purchase orders"],
      [money(spend), "Total spend"],
      [Object.keys(sup).length.toLocaleString(), "Suppliers"],
      [range, "Date range"]
    ];
    $("stats").innerHTML = items.map(function (it) {
      return '<div class="stat"><div class="n">' + esc(it[0]) +
             '</div><div class="l">' + esc(it[1]) + "</div></div>";
    }).join("");
  }

  function renderCategoryChart(idx) {
    var agg = {};
    idx.forEach(function (i) {
      var c = DATA.categories[ROWS[i][IX.category]];
      agg[c] = (agg[c] || 0) + ROWS[i][IX.amount];
    });
    var rows = Object.keys(agg).map(function (c) { return { cat: c, s: agg[c] }; })
      .sort(function (a, b) { return b.s - a.s; }).slice(0, 10);
    var wrap = $("category-chart");
    if (!rows.length) { wrap.innerHTML = '<div class="empty-state">Nothing matches these filters.</div>'; return; }
    var top = rows[0].s || 1;
    wrap.innerHTML = rows.map(function (r) {
      return '<div class="row"><div class="label">' + esc(r.cat) + "</div>" +
        '<div class="track"><div class="fill" style="width:' +
        Math.max(2, (r.s / top) * 100).toFixed(1) + '%"></div></div>' +
        '<div class="val">' + money(r.s) + "</div></div>";
    }).join("");
  }

  function renderSuppliers(idx) {
    var agg = {};
    idx.forEach(function (i) {
      var v = ROWS[i][IX.supplier];
      if (!agg[v]) agg[v] = { n: 0, s: 0 };
      agg[v].n++; agg[v].s += ROWS[i][IX.amount];
    });
    var rows = Object.keys(agg).map(function (v) {
      return { v: DATA.suppliers[v], n: agg[v].n, s: agg[v].s };
    }).sort(function (a, b) { return b.s - a.s; }).slice(0, 12);
    var tb = document.querySelector("#supplier-table tbody");
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="3" class="empty-state">No suppliers match.</td></tr>'; return; }
    tb.innerHTML = rows.map(function (r) {
      return "<tr><td>" + esc(r.v) + '</td><td class="num">' + r.n.toLocaleString() +
             '</td><td class="num">' + fullMoney(r.s) + "</td></tr>";
    }).join("");
  }

  function renderYearChart(idx) {
    var agg = {};
    idx.forEach(function (i) {
      var d = ROWS[i][IX.start];
      if (d) agg[d.slice(0, 4)] = (agg[d.slice(0, 4)] || 0) + ROWS[i][IX.amount];
    });
    var years = Object.keys(agg).sort();
    var wrap = $("year-chart");
    if (!years.length) { wrap.innerHTML = '<div class="empty-state">No dated purchases match these filters.</div>'; return; }
    var top = Math.max.apply(null, years.map(function (y) { return agg[y]; })) || 1;
    var svgW = 720, svgH = 170, padB = 26, padT = 8;
    var slot = svgW / years.length;
    var barW = Math.max(5, Math.min(46, slot * 0.62));
    var parts = ['<svg viewBox="0 0 ' + svgW + " " + svgH + '" width="100%" height="' + svgH +
      '" style="display:block;font:11px Inter,sans-serif" role="img" aria-label="Spend by year">'];
    years.forEach(function (y, i) {
      var h = (agg[y] / top) * (svgH - padT - padB);
      var x = i * slot + (slot - barW) / 2;
      parts.push('<rect x="' + x.toFixed(1) + '" y="' + (svgH - padB - h).toFixed(1) +
        '" width="' + barW.toFixed(1) + '" height="' + Math.max(h, 1).toFixed(1) +
        '" rx="2" fill="#C9962B" opacity="0.88"><title>' + esc(y) + ": " +
        fullMoney(agg[y]) + "</title></rect>");
      parts.push('<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (svgH - padB + 14) +
        '" text-anchor="middle" fill="#6B7280">' + esc(y) + "</text>");
    });
    wrap.innerHTML = parts.join("") + "</svg>";
  }

  function renderTerms(idx) {
    // A dated term means end_date actually sits after start_date on the filing.
    // Anything else is a blank or a same-day artifact, not a term.
    var withTerm = idx.filter(function (i) {
      var r = ROWS[i];
      return r[IX.ends] && r[IX.start] && r[IX.ends] > r[IX.start];
    });
    var running = withTerm.filter(function (i) { return ROWS[i][IX.ends] > TODAY; });
    // Closest to today first, running or recently lapsed — that is the window
    // a seller actually cares about.
    var shown = withTerm.slice().sort(function (a, b) {
      return Math.abs(Date.parse(ROWS[a][IX.ends]) - Date.parse(TODAY)) -
             Math.abs(Date.parse(ROWS[b][IX.ends]) - Date.parse(TODAY));
    }).slice(0, 15);

    var tb = document.querySelector("#tier-table tbody");
    if (!shown.length) {
      tb.innerHTML = '<tr><td colspan="5" class="empty-state">No dated terms in this view.</td></tr>';
      $("tier-count").textContent = "";
      return;
    }
    tb.innerHTML = shown.map(function (i) {
      var r = ROWS[i];
      var live = r[IX.ends] > TODAY;
      return "<tr><td><span class='tier-badge confirmed'>Confirmed</span></td>" +
        "<td" + (live ? "" : " class='stale'") + ">" + esc(r[IX.ends]) +
        (live ? "" : " <span style='font-size:11px'>(lapsed)</span>") + "</td>" +
        "<td>" + esc(DATA.suppliers[r[IX.supplier]]) + "</td>" +
        "<td style='max-width:340px'>" + esc(r[IX.title].slice(0, 90)) + "</td>" +
        "<td class='num'>" + fullMoney(r[IX.amount]) + "</td></tr>";
    }).join("");
    $("tier-count").textContent = withTerm.length.toLocaleString() +
      " dated terms in this view · " + running.length.toLocaleString() + " still running.";
  }

  var RECORD_CAP = 250;
  function renderRecord(idx) {
    var sorted = sortRows(idx).slice(0, RECORD_CAP);
    var tb = document.querySelector("#search-table tbody");
    if (!sorted.length) {
      tb.innerHTML = '<tr><td colspan="7" class="empty-state">Nothing matches these filters. Try clearing one.</td></tr>';
      $("search-count").textContent = "";
      return;
    }
    tb.innerHTML = sorted.map(function (i) {
      var r = ROWS[i];
      return "<tr><td>" + esc(r[IX.po]) + "</td>" +
        "<td>" + esc(DATA.departments[r[IX.dept]].key.toUpperCase()) + "</td>" +
        "<td>" + esc(DATA.suppliers[r[IX.supplier]]) + "</td>" +
        "<td style='max-width:300px'>" + esc(r[IX.title].slice(0, 80)) + "</td>" +
        "<td>" + esc(DATA.categories[r[IX.category]]) + "</td>" +
        "<td>" + esc(r[IX.start]) + "</td>" +
        "<td class='num'>" + fullMoney(r[IX.amount]) + "</td></tr>";
    }).join("");
    $("search-count").textContent = idx.length > RECORD_CAP
      ? "Showing the first " + RECORD_CAP + " of " + idx.length.toLocaleString() +
        " matching purchase orders — narrow the filters to see the rest."
      : "Showing all " + idx.length.toLocaleString() + " matching purchase orders.";
  }

  function renderWorkforce() {
    var wrap = $("workforce-list"), panel = $("workforce-panel");
    var out = [];
    DATA.departments.forEach(function (d, di) {
      if (anyTicked(state.depts) && !state.depts[d.key]) return;
      (DATA.workforce[di] || []).forEach(function (w) { out.push([d, w]); });
    });
    if (!out.length) { panel.style.display = "none"; return; }
    panel.style.display = "";
    wrap.innerHTML = out.slice(0, 10).map(function (p) {
      var d = p[0], w = p[1];
      return '<div class="wf-row"><span class="wf-tech">' + esc(w.technology) + "</span>" +
        '<span class="confidence-tag ' + esc(w.confidence) + '">' + esc(w.confidence) + "</span>" +
        '<div class="wf-evidence">“' + esc((w.evidence || "").slice(0, 150)) + '”</div>' +
        '<div class="wf-source">' + esc(d.name) + ' · <a href="' + esc(w.url) +
        '" target="_blank" rel="noopener">source posting ↗</a></div></div>';
    }).join("");
  }

  /* ---------------------------------------------------------------- wire */
  function buildPicksets() {
    $("dept-opts").innerHTML = DATA.departments.map(function (d) {
      return '<label class="opt" data-key="' + esc(d.key) + '">' +
        '<input type="checkbox" data-dim="dept" value="' + esc(d.key) + '">' +
        '<span class="nm">' + esc(d.name) + '</span><span class="ct"></span></label>';
    }).join("");

    var order = DATA.categories.slice().sort();
    $("cat-opts").innerHTML = order.map(function (c) {
      return '<label class="opt" data-key="' + esc(c) + '">' +
        '<input type="checkbox" data-dim="cat" value="' + esc(c) + '">' +
        '<span class="nm">' + esc(c) + '</span><span class="ct"></span></label>';
    }).join("");

    var sel = $("kind");
    DATA.kinds.filter(Boolean).sort().forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = k; sel.appendChild(o);
    });
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function wire() {
    var soon = debounce(render, 140);

    document.addEventListener("change", function (e) {
      var dim = e.target.dataset && e.target.dataset.dim;
      if (dim) {
        var map = dim === "dept" ? state.depts : state.cats;
        map[e.target.value] = e.target.checked;
        render();
      }
    });

    $("kind").addEventListener("change", function (e) { state.kind = e.target.value; render(); });
    $("sort").addEventListener("change", function (e) { state.sort = e.target.value; render(); });
    $("future-only").addEventListener("change", function (e) {
      state.futureOnly = e.target.checked; render();
    });
    ["date-from", "date-to"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        state.dateFrom = $("date-from").value;
        state.dateTo = $("date-to").value;
        render();
      });
    });
    $("supplier").addEventListener("input", function (e) {
      state.supplier = e.target.value.trim().toLowerCase(); soon();
    });
    $("keyword").addEventListener("input", function (e) {
      state.keyword = e.target.value.trim().toLowerCase(); soon();
    });
    $("amt-min").addEventListener("input", function (e) {
      var n = num(e.target.value); state.amtMin = n === null ? "" : n; soon();
    });
    $("amt-max").addEventListener("input", function (e) {
      var n = num(e.target.value); state.amtMax = n === null ? "" : n; soon();
    });

    document.querySelectorAll("[data-all],[data-none]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var dim = a.dataset.all || a.dataset.none;
        var on = !!a.dataset.all;
        var map = dim === "dept" ? state.depts : state.cats;
        document.querySelectorAll('input[data-dim="' + dim + '"]').forEach(function (cb) {
          cb.checked = on; map[cb.value] = on;
        });
        render();
      });
    });

    $("clear").addEventListener("click", function () {
      $("filters").reset();
      state.depts = {}; state.cats = {}; state.kind = ""; state.supplier = "";
      state.keyword = ""; state.dateFrom = ""; state.dateTo = "";
      state.amtMin = ""; state.amtMax = ""; state.futureOnly = false;
      state.sort = "amount";
      render();
    });
  }

  function init() {
    fetch("data/demo.json")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        DATA = d;
        d.fields.forEach(function (name, i) { IX[name] = i; });
        ROWS = d.rows;
        HAY = new Array(ROWS.length);
        buildPicksets();
        wire();
        render();
      })
      .catch(function (err) {
        $("matchcount").textContent = "Could not load the demo data (" + err.message + ").";
      });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
