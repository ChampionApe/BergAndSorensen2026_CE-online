/* The online appendix's figures. One entry per figure: from its JSON under data/ and the
 * reader's choices (`params`), it returns Plotly traces and a layout, or HTML, and always a
 * table, so that no value is readable only by hovering or only by colour, and the rows of a
 * CSV download. Nothing is computed beyond what the JSON carries: a figure selects, formats
 * and draws.
 *
 * Conventions (the dataviz method): colour follows the entity, in fixed slot order, never its
 * rank, so an economy or a long-run state keeps its colour under every choice; text is ink,
 * never a series colour; one y-axis per figure; a compared path is dashed and shares the axes
 * of the path it is compared with, and two compared grids share their colours and formats.
 * A caption may say what a figure shows; what it means is the page's.
 *
 * A key line `  "id": { // figure` is how the figure ids are found. Keep that form.
 */
(function () {
  "use strict";

  // -- utilities -----------------------------------------------------------------------------
  var U = {};
  U.css = function (name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };
  U.esc = function (s) {
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  // A number as the tables print it: fixed decimals, a true minus sign, no negative zero.
  U.num = function (x, d) {
    if (x === null || x === undefined || x === "" || (typeof x === "number" && !isFinite(x))) return "–";
    var s = Number(x).toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace(/^-/, "−");
  };
  // A parameter with the digits it has, at most four decimals: 0.01, 1.5, 0.0374.
  U.par = function (x) { return String(+Number(x).toFixed(4)); };
  U.byId = function (list) {
    var out = {};
    (list || []).forEach(function (x) { out[x.id] = x; });
    return out;
  };
  U.merge = function (a, b) {
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    Object.keys(b).forEach(function (k) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") out[k] = U.merge(a[k], b[k]);
      else out[k] = b[k];
    });
    return out;
  };
  U.axisTitle = function (text) { return { text: text, font: { size: 12, color: U.css("--ink-2") } }; };
  U.layout = function (extra) {
    var ink = U.css("--ink"), muted = U.css("--muted"), grid = U.css("--grid"), axis = U.css("--axis");
    return U.merge({
      font: { family: U.css("--font") || "system-ui, sans-serif", size: 12.5, color: ink },
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 62, r: 20, t: 8, b: 46 },
      hoverlabel: { font: { family: U.css("--font"), size: 12, color: ink }, bgcolor: U.css("--surface"), bordercolor: axis },
      legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { size: 12, color: U.css("--ink-2") } },
      xaxis: { gridcolor: grid, linecolor: axis, zeroline: false, tickfont: { color: muted }, automargin: true,
               showspikes: true, spikemode: "across", spikesnap: "cursor", spikecolor: axis, spikethickness: 1, spikedash: "solid" },
      yaxis: { gridcolor: grid, linecolor: axis, zeroline: false, tickfont: { color: muted }, automargin: true },
    }, extra || {});
  };
  U.pairLabel = function (p) {
    return "Pair " + p.id + " (ρ = " + U.par(p.rho) + ", η = " + U.par(p.eta) + ")";
  };
  // A select's options: the value, its label, an optional group, disabled where no result exists.
  U.option = function (value, label, disabled, group) {
    return { value: value, label: label, disabled: !!disabled, group: group || "" };
  };
  window.OXU = U;

  // Colour follows the entity, in the fixed order of the palette's slots.
  var ECON_SLOT = { planner: "--series-1", observed: "--series-2", laissezfaire: "--series-3", partial: "--series-4" };
  var STATE_SLOT = { A: "--series-1", B: "--series-2", C: "--series-3" };

  function has(list, key) { return (list || []).indexOf(key) >= 0; }

  // -- the century fit -----------------------------------------------------------------------
  // The paper's century figure draws these series on a logarithmic axis, the others on a level one.
  var LOG_SERIES = { Y: 1, K: 1, R: 1, N: 1, W: 1, Wnet: 1, P: 1 };
  function centuryParams(d, q) {
    var pairs = d.pairs.map(function (p) { return p.id; }), econs = d.economies.map(function (e) { return e.id; });
    var p = { pair: q.pair || "B", econ: q.econ || "observed", series: q.series || "Y", vs: q.vs || "",
              scale: q.scale === "level" || q.scale === "log" ? q.scale : "paper" };
    if (!has(d.available, p.pair + "/" + p.econ)) {
      var same = econs.filter(function (e) { return has(d.available, p.pair + "/" + e); });
      var any = d.available[0] ? d.available[0].split("/") : [pairs[0], econs[0]];
      if (same.length) p.econ = same[0]; else { p.pair = any[0]; p.econ = any[1]; }
    }
    if (!U.byId(d.series)[p.series]) p.series = d.series[0].id;
    var vsPath = comparedPath(d, p);
    if (!vsPath || !has(d.available, vsPath.pair + "/" + vsPath.econ)) p.vs = "";
    return p;
  }
  function comparedPath(d, p) {
    if (!p.vs) return null;
    if (U.byId(d.pairs)[p.vs] && p.vs !== p.pair) return { pair: p.vs, econ: p.econ };
    if (U.byId(d.economies)[p.vs] && p.vs !== p.econ) return { pair: p.pair, econ: p.vs };
    return null;
  }
  function pathLabel(d, pair, econ) {
    return U.byId(d.economies)[econ].label + ", pair " + pair;
  }
  function pathValues(d, pair, econ, sid) {
    var e = (d.model[pair] || {})[econ];
    return e ? e[sid] || null : null;
  }

  var F = {

  "century": { // figure
    data: "century",
    name: "The century fit",
    title: function (ctx) {
      var s = U.byId(ctx.data.series)[ctx.p.series];
      return s.label + (s.symbol ? " (" + s.symbol + ")" : "") + ": " + pathLabel(ctx.data, ctx.p.pair, ctx.p.econ) + ", against the data";
    },
    shows: "The model's path, year by year from 1900, against the data, for one series, one preference pair and one economy at a time; another pair or economy can be drawn beside it.",
    params: centuryParams,
    controls: function (ctx) {
      var d = ctx.data, p = ctx.p;
      var vs = [U.option("", "Nothing")];
      d.pairs.forEach(function (x) {
        if (x.id !== p.pair) vs.push(U.option(x.id, U.pairLabel(x) + ", " + U.byId(d.economies)[p.econ].label.toLowerCase(),
          !has(d.available, x.id + "/" + p.econ), "Another preference pair"));
      });
      d.economies.forEach(function (e) {
        if (e.id !== p.econ) vs.push(U.option(e.id, e.label + ", pair " + p.pair, !has(d.available, p.pair + "/" + e.id), "Another economy"));
      });
      return [
        { key: "series", label: "Series", options: d.series.map(function (s) { return U.option(s.id, s.label + (s.symbol ? " (" + s.symbol + ")" : "")); }) },
        { key: "pair", label: "Preference pair", options: d.pairs.map(function (x) {
          return U.option(x.id, U.pairLabel(x), !has(d.available, x.id + "/" + p.econ)); }) },
        { key: "econ", label: "Economy", options: d.economies.map(function (e) {
          var lab = e.id === "partial" ? e.label + " (controlled share " + U.par(U.byId(d.pairs)[p.pair].phiW) + ")" : e.label;
          return U.option(e.id, lab, !has(d.available, p.pair + "/" + e.id)); }) },
        { key: "vs", label: "Compare with", options: vs },
        { key: "scale", label: "Vertical axis", options: [U.option("paper", "As the paper draws it"),
          U.option("level", "Level"), U.option("log", "Logarithmic")] },
      ];
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, s = U.byId(d.series)[p.series], dec = s.decimals, yrs = d.years;
      var log = p.scale === "log" || (p.scale === "paper" && !!LOG_SERIES[s.id]);
      var cmp = comparedPath(d, p);
      var runs = [{ label: pathLabel(d, p.pair, p.econ), short: U.byId(d.economies)[p.econ].label + ", " + p.pair,
                    values: pathValues(d, p.pair, p.econ, s.id), color: U.css(ECON_SLOT[p.econ]), dash: "solid" }];
      if (cmp) runs.push({ label: pathLabel(d, cmp.pair, cmp.econ), short: U.byId(d.economies)[cmp.econ].label + ", " + cmp.pair,
                           values: pathValues(d, cmp.pair, cmp.econ, s.id), color: U.css(ECON_SLOT[cmp.econ]), dash: "dash" });
      var data = d.data[s.id] || null;
      var nData = data ? data.filter(function (v) { return v !== null; }).length : 0;
      var traces = [], ends = [];
      var hover = "%{y:." + dec + "f}";
      if (nData) {
        var ink = U.css("--ink-2");
        traces.push(nData >= 2
          ? { type: "scatter", mode: "lines", name: "Data", x: yrs, y: data, connectgaps: false,
              line: { color: ink, width: 2 }, hovertemplate: hover }
          : { type: "scatter", mode: "markers", name: "Data", x: yrs, y: data,
              marker: { color: ink, size: 10, line: { width: 2, color: U.css("--surface") } }, hovertemplate: hover });
      }
      runs.slice().reverse().forEach(function (r) {
        if (!r.values) return;
        traces.push({ type: "scatter", mode: "lines", name: r.label, x: yrs, y: r.values,
                      line: { color: r.color, width: 2, dash: r.dash }, hovertemplate: hover });
      });
      // Direct labels at the right end when the ends lie apart; otherwise the legend alone.
      var last = function (arr) { for (var i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return { x: yrs[i], y: arr[i] }; return null; };
      runs.forEach(function (r) { if (r.values) { var e = last(r.values); if (e) ends.push({ x: e.x, y: e.y, text: r.short }); } });
      if (nData >= 2) { var e0 = last(data); ends.push({ x: e0.x, y: e0.y, text: "Data" }); }
      // On a logarithmic axis Plotly places an annotation at the logarithm of its value.
      if (log) ends = ends.filter(function (e) { return e.y > 0; }).map(function (e) { return { x: e.x, y: Math.log10(e.y), text: e.text }; });
      var top = 0, bottom = Infinity;
      traces.forEach(function (t) { t.y.forEach(function (v) { if (v !== null && v > 0) { top = Math.max(top, v); bottom = Math.min(bottom, v); } }); });
      var spread = log ? (top > 0 && bottom < Infinity ? Math.log10(top) - Math.log10(bottom) : 1) : top;
      var apart = ends.every(function (a, i) {
        return ends.every(function (b, j) { return i === j || Math.abs(a.y - b.y) > 0.07 * (spread || 1); });
      });
      var notes = [];
      if (runs.some(function (r) { return !r.values; })) notes.push("A path without a line here is zero throughout for this series.");
      if (s.id === "Wnet") notes.push("Its data is the data's waste flow, as for W.");
      if (s.id === "vw") notes.push("The data point is the 2015 treated share, the one the handling level is fitted to; the figure of the phases draws the data's series.");
      if (log) notes.push("Logarithmic axis: a year in which a path is zero is not drawn.");
      // The table: every tenth year and the years of the paper's tables; the download, every year.
      var rows = [], csv = [];
      yrs.forEach(function (y, i) {
        var row = [y, data ? data[i] : null].concat(runs.map(function (r) { return r.values ? r.values[i] : null; }));
        csv.push(row);
        if (y % 10 === 0 || has(d.table_years, y)) rows.push([String(y)].concat(row.slice(1).map(function (v) { return U.num(v, dec); })));
      });
      var cols = ["Year", "Data"].concat(runs.map(function (r) { return r.label; }));
      return {
        traces: traces,
        layout: U.layout({
          height: 430, hovermode: "x unified",
          margin: { r: apart && ends.length ? 120 : 20 },
          xaxis: { title: U.axisTitle("Year"), range: [yrs[0] - 1, yrs[yrs.length - 1] + 1], dtick: 20, hoverformat: "d" },
          yaxis: log ? { title: U.axisTitle(s.label + ", " + s.unit + ", logarithmic axis"), type: "log" }
                     : { title: U.axisTitle(s.label + ", " + s.unit), rangemode: "tozero" },
          annotations: apart ? ends.map(function (e) {
            return { x: e.x, y: e.y, text: U.esc(e.text), showarrow: false, xanchor: "left", xshift: 8,
                     font: { size: 11.5, color: U.css("--ink-2") } };
          }) : [],
        }),
        table: { columns: cols, rows: rows },
        csv: { name: "century_" + s.id + "_" + p.pair + "_" + p.econ + (cmp ? "_vs_" + p.vs : "") + ".csv",
               columns: ["year", "data"].concat(runs.map(function (r) { return r.label; })), rows: csv },
        note: notes.join(" "),
      };
    },
  },

  "taxonomy": { // figure
    data: "taxonomy",
    name: "The long-run taxonomy and the floor grid",
    title: function (ctx) {
      return "The long-run state, cell by cell: " + U.byId(ctx.data.economies)[ctx.p.econ].label + ", pair " + ctx.p.pair;
    },
    shows: "For each yield ceiling (rows) and material floor (columns), the long-run state the taxonomy assigns, with the retained endowment; select a cell for its numbers.",
    params: function (d, q) {
      var p = { pair: q.pair || "B", econ: q.econ || "planner", cell: q.cell || "", vs: q.vs || "" };
      if (!has(d.available, p.pair + "/" + p.econ)) {
        var same = d.economies.filter(function (e) { return has(d.available, p.pair + "/" + e.id); });
        var any = d.available[0] ? d.available[0].split("/") : ["B", "planner"];
        if (same.length) p.econ = same[0].id; else { p.pair = any[0]; p.econ = any[1]; }
      }
      var g = gridOf(d, p.pair, p.econ);
      if (!g || !g.cells.some(function (c) { return cellKey(c) === p.cell; })) p.cell = g && g.cells.length ? cellKey(g.cells[0]) : "";
      var c = comparedPath(d, p);
      if (!c || !has(d.available, c.pair + "/" + c.econ)) p.vs = "";
      return p;
    },
    controls: function (ctx) {
      var d = ctx.data, p = ctx.p, econ = U.byId(d.economies);
      var vs = [U.option("", "Nothing")];
      d.pairs.forEach(function (x) {
        if (x.id !== p.pair) vs.push(U.option(x.id, U.pairLabel(x) + ", " + econ[p.econ].label.toLowerCase(),
          !has(d.available, x.id + "/" + p.econ), "Another preference pair"));
      });
      d.economies.forEach(function (e) {
        if (e.id !== p.econ) vs.push(U.option(e.id, e.label + ", pair " + p.pair, !has(d.available, p.pair + "/" + e.id), "Another economy"));
      });
      return [
        { key: "pair", label: "Preference pair", options: d.pairs.map(function (x) {
          return U.option(x.id, U.pairLabel(x), !has(d.available, x.id + "/" + p.econ)); }) },
        { key: "econ", label: "Economy", options: d.economies.map(function (e) {
          return U.option(e.id, e.label, !has(d.available, p.pair + "/" + e.id)); }) },
        { key: "vs", label: "Compare with", options: vs },
      ];
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, econ = U.byId(d.economies);
      var g = gridOf(d, p.pair, p.econ), cmp = comparedPath(d, p);
      var cg = cmp ? gridOf(d, cmp.pair, cmp.econ) : null;
      var states = U.byId(d.states);
      var legend = '<div class="ox-legend" aria-hidden="true">' + d.states.map(function (s) {
        return '<span><i class="ox-swatch" style="--c: var(' + STATE_SLOT[s.id] + ')"></i>' + s.id + ", " + U.esc(s.label) + "</span>";
      }).join("") + '<span><i class="ox-swatch is-failed"></i>failed: the solve did not converge</span>' +
        '<span><b class="ox-badge">n.r.</b> not rankable</span></div>';
      var axes = '<p class="ox-note" style="margin:0 0 0.4rem">Columns: the material floor R̄, Gt a year. Rows: the yield ceiling ā.</p>';
      var html = legend + axes + '<div class="ox-grids">' + gridHTML(d, g, p.cell, cg ? "This grid" : "", econ[p.econ].label + ", pair " + p.pair) +
        (cg ? gridHTML(d, cg, p.cell, "Compared with", econ[cmp.econ].label + ", pair " + cmp.pair) : "") + "</div>";
      var sel = g.cells.filter(function (c) { return cellKey(c) === p.cell; })[0];
      html += detailHTML(sel, states, cg ? econ[p.econ].label + ", pair " + p.pair : "");
      if (cg) {
        var other = cg.cells.filter(function (c) { return cellKey(c) === p.cell; })[0];
        html += detailHTML(other, states, econ[cmp.econ].label + ", pair " + cmp.pair);
      }
      var cols = ["Ceiling ā", "Floor R̄, Gt a year", "Available state", "Retained endowment 𝓜∞, Gt",
                  "Residence time 𝒯, years", "Survival ratio 𝓜∞/(R̄𝒯)", "Gate fee below zero from", "Horizon reached, periods"];
      var rows = [], csv = [];
      [[g, econ[p.econ].label + ", pair " + p.pair]].concat(cg ? [[cg, econ[cmp.econ].label + ", pair " + cmp.pair]] : []).forEach(function (x) {
        x[0].cells.forEach(function (c) {
          var r = [U.par(c.abar), floorLabel(c.Rbar),
                   c.state === "failed" ? "failed" : c.state + (c.nr ? " n.r." : ""),
                   U.num(c.Minf, 2), U.num(c.residence, 1), survival(c),
                   feeFrom(c.gatefee), String(c.T_reached)];
          rows.push(cg ? [x[1]].concat(r) : r);
          csv.push([x[1], c.abar, c.Rbar, c.state, c.nr, c.Minf, c.residence, c.survival, c.gatefee ? c.gatefee.year : null, c.T_reached]);
        });
      });
      return {
        html: html,
        table: { columns: cg ? ["Grid"].concat(cols) : cols, rows: rows },
        csv: { name: "taxonomy_" + p.pair + "_" + p.econ + (cmp ? "_vs_" + p.vs : "") + ".csv",
               columns: ["grid", "abar", "Rbar", "state", "not_rankable", "Minf_Gt", "residence_years", "survival_ratio",
                         "gatefee_negative_from_year", "horizon_reached_periods"], rows: csv },
        note: "",
      };
    },
  },

  "surface": { // figure
    data: "surface",
    name: "The survival surface",
    title: function (ctx) {
      return ctx.p.view === "states" ? "The long-run state by floor and ceiling, pair B, up to the largest floor that solves"
                                     : "The survival ratio across floors under the soft ceiling, pair B";
    },
    shows: "The survival ratio by material floor under the soft ceiling, up to the largest floor that solves, or the long-run state of every floor and ceiling.",
    params: function (d, q) {
      return { view: q.view === "states" ? "states" : "ratio", axis: q.axis === "level" ? "level" : "log" };
    },
    controls: function (ctx) {
      var out = [{ key: "view", label: "Show", options: [U.option("ratio", "The survival ratio by floor"), U.option("states", "The state by floor and ceiling")] }];
      if (ctx.p.view === "ratio") out.push({ key: "axis", label: "Vertical axis", options: [U.option("log", "Logarithmic"), U.option("level", "Level")] });
      return out;
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, by = {};
      d.cells.forEach(function (c) { by[c.abar + "|" + c.Rbar] = c; });
      var edge = U.byId(d.edge.map(function (e) { return { id: String(e.abar), e: e }; }));
      var e1 = (edge["1"] || {}).e, solved = e1 && e1.solved;
      var stateText = function (c) { return c ? (c.state === "failed" ? "failed" : c.state + (c.nr ? " n.r." : "")) : "–"; };
      var rows = [], csv = [];
      d.floors.forEach(function (r) {
        var cs = d.ceilings.map(function (a) { return by[a + "|" + r]; });
        rows.push([floorLabel(r)].concat(cs.map(stateText), [survival(cs[0] || {})]));
        cs.forEach(function (c, i) { if (c) csv.push([d.ceilings[i], r, c.state, c.nr, c.survival, c.Minf]); });
      });
      d.edge.forEach(function (e) {
        if (e.solved) csv.push([e.abar, e.solved.Rbar, e.solved.state, null, e.solved.survival, null]);
      });
      if (solved) rows.push(["edge, " + U.num(solved.Rbar, 2)].concat(d.ceilings.map(function (a) {
        var x = (edge[String(a)] || {}).e; return x && x.solved ? x.solved.state : "–"; }), [U.num(solved.survival, 1)]));
      var table = { columns: ["Floor R̄, Gt a year"].concat(d.ceilings.map(ceilingLabel), ["Survival ratio 𝓜∞/(R̄𝒯), ā = 1"]), rows: rows };
      var csvOut = { name: "surface_B.csv", columns: ["abar", "Rbar", "state", "not_rankable", "survival_ratio", "Minf_Gt"], rows: csv };
      var edgeNote = d.edge.filter(function (e) { return e.solved && e.failed !== null; }).map(function (e) {
        return ceilingLabel(e.abar) + ": solves at " + U.num(e.solved.Rbar, 2) + " Gt a year, not at " + U.num(e.failed, 2);
      }).join("; ");
      if (p.view === "states") {
        var xs = d.floors.map(function (r) { return floorLabel(r); }).concat(solved ? ["edge, " + U.num(solved.Rbar, 2)] : []);
        var traces = [];
        d.states.forEach(function (s) {
          var x = [], y = [], text = [];
          d.ceilings.forEach(function (a) {
            d.floors.forEach(function (r) { var c = by[a + "|" + r]; if (c && c.state === s.id) { x.push(floorLabel(r)); y.push(ceilingLabel(a)); text.push(stateText(c)); } });
            var ex = (edge[String(a)] || {}).e;
            if (ex && ex.solved && ex.solved.state === s.id && solved) { x.push("edge, " + U.num(solved.Rbar, 2)); y.push(ceilingLabel(a)); text.push(ex.solved.state); }
          });
          if (x.length) traces.push({ type: "scatter", mode: "markers+text", name: s.id + ", " + s.label, x: x, y: y, text: text,
            textfont: { color: U.css("--ink"), size: 11 }, marker: { symbol: "square", size: 34, color: U.css(STATE_SLOT[s.id]), opacity: 0.35 },
            hovertemplate: "%{y}, R̄ = %{x}: %{text}<extra></extra>" });
        });
        return { traces: traces, table: table, csv: csvOut,
          layout: U.layout({ height: 300, margin: { l: 120 },
            xaxis: { title: U.axisTitle("Material floor R̄, Gt a year"), type: "category", categoryarray: xs, categoryorder: "array", showgrid: false },
            yaxis: { type: "category", categoryarray: d.ceilings.map(ceilingLabel).reverse(), categoryorder: "array", showgrid: false } }),
          note: "n.r.: not rankable. The last column is the largest floor that solves (" + edgeNote + ")." };
      }
      var pts = d.floors.filter(function (r) { var c = by["1|" + r]; return r > 0 && c && typeof c.survival === "number"; });
      var tr = [{ type: "scatter", mode: "lines+markers", name: "ā = 1, state C", x: pts, y: pts.map(function (r) { return by["1|" + r].survival; }),
                  customdata: pts.map(floorLabel),
                  line: { color: U.css(STATE_SLOT.C), width: 2 }, marker: { size: 7, color: U.css(STATE_SLOT.C) },
                  hovertemplate: "R̄ = %{customdata} Gt a year: %{y:.1f}<extra></extra>" }];
      if (solved) tr.push({ type: "scatter", mode: "markers", name: "The largest floor that solves", x: [solved.Rbar], y: [solved.survival],
                            marker: { size: 11, symbol: "diamond-open", color: U.css("--ink"), line: { width: 2 } },
                            hovertemplate: "R̄ = %{x} Gt a year: %{y:.1f}<extra></extra>" });
      return { traces: tr, table: table, csv: csvOut,
        layout: U.layout({ height: 400,
          xaxis: { title: U.axisTitle("Material floor R̄, Gt a year"), rangemode: "tozero" },
          yaxis: p.axis === "log" ? { title: U.axisTitle("Survival ratio 𝓜∞/(R̄𝒯), logarithmic axis"), type: "log" }
                                  : { title: U.axisTitle("Survival ratio 𝓜∞/(R̄𝒯)"), rangemode: "tozero" } }),
        note: "The ratio is infinite without a floor and is reported under the soft ceiling only. Largest floor that solves: " + edgeNote + "." };
    },
  },

  "leakage": { // figure
    data: "leakage",
    name: "Leakage against welfare",
    title: function (ctx) {
      return "The emissions recycling avoids against its consumption-equivalent gain: pair " + ctx.p.pair +
        (ctx.p.floor === "all" ? "" : ", R̄ = " + U.num(Number(ctx.p.floor), 1) + " Gt a year");
    },
    shows: "For each cell of floor, ceiling and tail rate, the share of the no-recycling economy's cumulative emissions that recycling avoids, against the consumption-equivalent gain from recycling.",
    params: function (d, q) {
      var p = { pair: q.pair || "B", floor: q.floor || "all", axis: q.axis === "log" ? "log" : "level" };
      if (!has(d.available, p.pair)) p.pair = d.available[0];
      var floors = leakFloors(d, p.pair).map(String);
      if (p.floor !== "all" && floors.indexOf(p.floor) < 0) p.floor = "all";
      return p;
    },
    controls: function (ctx) {
      var d = ctx.data;
      return [
        { key: "pair", label: "Preference pair", options: d.pairs.map(function (x) { return U.option(x.id, U.pairLabel(x), !has(d.available, x.id)); }) },
        { key: "floor", label: "Material floor", options: [U.option("all", "Both floors")].concat(leakFloors(d, ctx.p.pair).map(function (r) {
          return U.option(String(r), r === 0 ? "R̄ = 0, no floor" : "R̄ = " + U.num(r, 1) + " Gt a year"); })) },
        { key: "axis", label: "Vertical axis", options: [U.option("level", "Level"), U.option("log", "Logarithmic")] },
      ];
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, g = d.grids.filter(function (x) { return x.pair === p.pair; })[0];
      var cells = g.cells.filter(function (c) { return p.floor === "all" || String(c.Rbar) === p.floor; });
      var drawn = cells.filter(function (c) { return c.comparison !== "nr" && c.state !== "failed" && c.ce !== null; });
      var ceFmt = function (v) { return g.ce_format === "fixed4" ? U.num(v, 4) : U.sci(v, 3); };
      var hover = function (c) {
        return "R̄ = " + U.num(c.Rbar, 1) + ", ā = " + U.par(c.abar) + ", ξ = " + U.num(c.xi, 2) + ", state " + c.state +
          "<br>avoided " + U.num(c.share, 1) + " % of the emissions; gain " + ceFmt(c.ce) + " % of consumption" + (c.comparison === "dec" ? " (dec.)" : "");
      };
      var traces = [];
      d.states.forEach(function (s) {
        leakFloors(d, p.pair).forEach(function (r) {
          var pts = drawn.filter(function (c) { return c.state === s.id && c.Rbar === r; });
          if (!pts.length) return;
          traces.push({ type: "scatter", mode: "markers", name: "State " + s.id + ", " + (r === 0 ? "no floor" : "R̄ = " + U.num(r, 1)),
            x: pts.map(function (c) { return c.share; }), y: pts.map(function (c) { return c.ce; }),
            text: pts.map(hover), hovertemplate: "%{text}<extra></extra>",
            marker: { size: 10, symbol: r === 0 ? "circle" : "diamond", color: U.css(STATE_SLOT[s.id]), line: { width: 1, color: U.css("--surface") } } });
        });
      });
      var dec = drawn.filter(function (c) { return c.comparison === "dec"; });
      if (dec.length) traces.push({ type: "scatter", mode: "markers", name: "Decided for the survivor (dec.)", hoverinfo: "skip",
        x: dec.map(function (c) { return c.share; }), y: dec.map(function (c) { return c.ce; }),
        marker: { size: 20, symbol: "circle-open", color: U.css("--ink"), line: { width: 1.5 } } });
      var nr = cells.length - drawn.length;
      var notes = [];
      if (dec.length) notes.push("Ringed: a comparison decided for the path that survives (dec.); the gain drawn is the within-horizon one.");
      if (nr) notes.push(nr + " of " + cells.length + " cells not drawn: their comparison is not rankable (n.r.); the table lists them.");
      var cols = ["Floor R̄, Gt a year", "Ceiling ā", "Tail rate ξ", "Available state", "CE gain, % of consumption", "Comparison",
                  "ΣΞ, Gt", "ΣΞ without recycling, Gt", "Ξ avoided, Gt", "Share avoided, %", "𝓜∞, Gt", "Survival ratio 𝓜∞/(R̄𝒯)"];
      var rows = cells.map(function (c) {
        return [U.num(c.Rbar, 1), U.par(c.abar), U.num(c.xi, 2), c.state, c.comparison === "nr" ? "n.r." : ceFmt(c.ce),
                c.comparison === "dec" ? "dec." : c.comparison === "nr" ? "n.r." : "", U.num(c.cumXi, 1), U.num(c.cumXi0, 1),
                U.num(c.avoided, 1), U.num(c.share, 1), U.num(c.Minf, 1), survival(c)];
      });
      return {
        traces: traces, table: { columns: cols, rows: rows }, note: notes.join(" "),
        csv: { name: "leakage_" + p.pair + (p.floor === "all" ? "" : "_Rbar" + p.floor) + ".csv",
               columns: ["Rbar", "abar", "xi", "state", "ce_gain_percent", "comparison", "sum_Xi_Gt", "sum_Xi_without_recycling_Gt",
                         "Xi_avoided_Gt", "share_avoided_percent", "Minf_Gt", "survival_ratio"],
               rows: cells.map(function (c) { return [c.Rbar, c.abar, c.xi, c.state, c.ce, c.comparison, c.cumXi, c.cumXi0, c.avoided, c.share, c.Minf, c.survival]; }) },
        layout: U.layout({ height: 430, hovermode: "closest",
          xaxis: { title: U.axisTitle("Cumulative emissions avoided, % of the no-recycling economy's"), rangemode: "tozero" },
          yaxis: p.axis === "log" ? { title: U.axisTitle("CE gain from recycling, % of consumption, logarithmic axis"), type: "log" }
                                  : { title: U.axisTitle("CE gain from recycling, % of consumption"), rangemode: "tozero" } }),
      };
    },
  },

  "corners": { // figure
    data: "corners",
    name: "The sixteen corners",
    title: function (ctx) {
      return CORNER_MEASURES[ctx.p.measure].label + " at the sixteen corners: pair " + ctx.p.pair + ", " + floorName(Number(ctx.p.floor));
    },
    shows: "Each corner of the policy space, the waste stock owned or open access and each instrument at its Pigouvian level or off, with its consumption-equivalent cost against the planner corner, its retained endowment, its cumulative leakage and its survival ratio.",
    params: function (d, q) {
      var p = { pair: q.pair || "B", floor: q.floor || String(d.floors[0]), measure: CORNER_MEASURES[q.measure] ? q.measure : "ce",
                order: q.order === "ranked" ? "ranked" : "table", vs: q.vs || "" };
      if (!has(d.available, p.pair)) p.pair = d.available[0];
      if (!cornerGrid(d, p.pair, Number(p.floor))) p.floor = String(d.floors[0]);
      if (p.measure === "survival" && Number(p.floor) === 0) p.measure = "ce";
      var c = cornerCompared(d, p);
      if (!c || !cornerGrid(d, c.pair, c.floor)) p.vs = "";
      return p;
    },
    controls: function (ctx) {
      var d = ctx.data, p = ctx.p;
      var vs = [U.option("", "Nothing")];
      d.floors.forEach(function (r) { if (String(r) !== p.floor) vs.push(U.option("floor", floorName(r) + ", pair " + p.pair, !cornerGrid(d, p.pair, r), "The other floor")); });
      d.pairs.forEach(function (x) { if (x.id !== p.pair) vs.push(U.option(x.id, U.pairLabel(x), !cornerGrid(d, x.id, Number(p.floor)), "Another preference pair")); });
      return [
        { key: "measure", label: "Measure", options: Object.keys(CORNER_MEASURES).map(function (m) {
          return U.option(m, CORNER_MEASURES[m].label, m === "survival" && Number(p.floor) === 0); }) },
        { key: "pair", label: "Preference pair", options: d.pairs.map(function (x) { return U.option(x.id, U.pairLabel(x), !has(d.available, x.id)); }) },
        { key: "floor", label: "Material floor", options: d.floors.map(function (r) { return U.option(String(r), floorName(r)); }) },
        { key: "order", label: "Order", options: [U.option("table", "As the table lists them"), U.option("ranked", "Ranked, smallest first")] },
        { key: "vs", label: "Compare with", options: vs },
      ];
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, m = CORNER_MEASURES[p.measure], floor = Number(p.floor);
      var g = cornerGrid(d, p.pair, floor), c = cornerCompared(d, p), cg = c ? cornerGrid(d, c.pair, c.floor) : null;
      var val = function (x) { var v = x[p.measure]; return typeof v === "number" ? v : null; };
      var order = g.corners.map(function (x) { return x.label; });
      if (p.order === "ranked") order = g.corners.slice().sort(function (a, b) { return (val(a) === null) - (val(b) === null) || val(a) - val(b); })
        .map(function (x) { return x.label; });
      var pick = function (grid) { var by = {}; grid.corners.forEach(function (x) { by[x.label] = x; }); return order.map(function (l) { return by[l]; }); };
      var setName = function (pair, r) { return "Pair " + pair + ", " + floorName(r); };
      var runs = [{ g: g, name: setName(p.pair, floor), opacity: 1 }];
      if (cg) runs.push({ g: cg, name: setName(c.pair, c.floor) + " (faded)", opacity: 0.4 });
      var traces = runs.map(function (r) {
        var xs = pick(r.g);
        return { type: "bar", orientation: "h", name: r.name, y: order, x: xs.map(function (x) { return x ? val(x) : null; }),
                 marker: { color: U.css("--series-1"), opacity: r.opacity },
                 text: xs.map(function (x) { return x ? m.fmt(x[p.measure]) : "–"; }), hovertemplate: "%{y}: %{text}<extra>" + U.esc(r.name) + "</extra>" };
      });
      var cols = (cg ? ["Set"] : []).concat(["Corner", "Available state", "CE cost, % of consumption", "𝓜∞, Gt",
                  "Σ(1−aϖ)H, Gt", "Survival ratio 𝓜∞/(R̄𝒯)", "Gate fee negative from"]);
      var rows = [], csv = [];
      runs.forEach(function (r) {
        pick(r.g).forEach(function (x) {
          if (!x) return;
          var row = [x.label, x.state, CORNER_MEASURES.ce.fmt(x.ce), U.num(x.Minf, 1), U.num(x.leak, 1),
                     x.survival === "inf" ? "∞" : U.num(x.survival, 2), feeFrom(x.gatefee)];
          rows.push(cg ? [r.name.replace(" (faded)", "")].concat(row) : row);
          csv.push([r.name.replace(" (faded)", ""), x.dials.join(""), x.dials[0], x.dials[1], x.dials[2], x.dials[3], x.state, x.ce, x.Minf, x.leak, x.survival,
                    x.gatefee ? x.gatefee.year : null]);
        });
      });
      return {
        traces: traces, table: { columns: cols, rows: rows },
        note: "A corner is four digits: the first is 1 where the waste stock has an owner and 0 where it is open access; the other three are the instruments, the material-content price, the emission tax and the discovery tax, 1 at the Pigouvian level and 0 off." +
              (p.measure === "ce" ? " The planner corner (1,1,1,1) costs zero by construction." : ""),
        csv: { name: "corners_" + p.pair + "_Rbar" + p.floor + (cg ? "_vs_" + p.vs : "") + ".csv",
               columns: ["set", "corner", "phiW", "phiz", "phiP", "phiX", "state", "ce_cost_percent", "Minf_Gt", "cumulative_leakage_Gt",
                         "survival_ratio", "gatefee_negative_from_year"], rows: csv },
        layout: U.layout({ height: 80 + 26 * order.length * (cg ? 1.5 : 1), barmode: "group", bargap: 0.25, hovermode: "closest",
          margin: { l: 90 }, yaxis: { autorange: "reversed", type: "category", tickfont: { family: "ui-monospace, Consolas, monospace", size: 12 } },
          xaxis: { title: U.axisTitle(m.axis), rangemode: "tozero" } }),
      };
    },
  },

  "gatefee": { // figure
    data: "gatefee",
    name: "The gate-fee band",
    title: function (ctx) {
      return { band: "The planner's gate fee across the range of the tail rate ξ, pair B",
               settings: "The gate fee at the planner corner, at the owned stockpile and under the partial property right, pair B",
               pairs: "The planner's gate fee under the three preference pairs" }[ctx.p.view];
    },
    shows: "The gate fee year by year: the planner corner's at the calibrated tail rate and at both ends of its range, beside the owned stockpile's and the partial property right's, or the planner corner's under each preference pair.",
    params: function (d, q) {
      return { view: { band: 1, settings: 1, pairs: 1 }[q.view] ? q.view : "band",
               years: q.years === "2300" ? "2300" : "2100", range: q.range === "all" ? "all" : "sign" };
    },
    controls: function () {
      return [
        { key: "view", label: "Paths", options: [U.option("band", "The planner across the tail rate"),
          U.option("settings", "Planner corner, owned stockpile, partial property right"), U.option("pairs", "The planner under each preference pair")] },
        { key: "years", label: "Years", options: [U.option("2100", "1900 to 2100"), U.option("2300", "1900 to 2300")] },
        { key: "range", label: "Vertical axis", options: [U.option("sign", "Around the change of sign"), U.option("all", "The whole path")] },
      ];
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, P = U.byId(d.paths), tails = U.byId(d.tails), pairs = U.byId(d.pairs);
      var spec = {
        band: [["B/planner/low", "dash", "--series-1"], ["B/planner/point", "solid", "--series-1"], ["B/planner/high", "dot", "--series-1"]],
        settings: [["B/planner/point", "solid", "--series-1"], ["B/rights/point", "solid", "--series-2"], ["B/partial/point", "solid", "--series-4"]],
        pairs: [["B/planner/point", "solid", "--series-1"], ["A/planner/point", "dash", "--series-1"], ["C/planner/point", "dot", "--series-1"]],
      }[p.view].filter(function (s) { return P[s[0]]; });
      var name = function (x) {
        if (p.view === "band") return "ξ = " + U.par(tails[x.tail].xi) + (x.tail === "point" ? ", calibrated" : x.tail === "low" ? ", low end" : ", high end");
        if (p.view === "pairs") return U.pairLabel(pairs[x.pair]);
        return x.label;
      };
      var end = Number(p.years), n = d.years.indexOf(end) + 1 || d.years.length;
      var yrs = d.years.slice(0, n), traces = [], marks = [], top = 0;
      spec.forEach(function (s) {
        var x = P[s[0]], v = x.values.slice(0, n);
        v.forEach(function (y) { if (y !== null && y > top) top = y; });
        traces.push({ type: "scatter", mode: "lines", name: name(x), x: yrs, y: v, line: { color: U.css(s[2]), width: 2, dash: s[1] },
                      hovertemplate: "%{x}: %{y:.3g} $/t<extra>" + U.esc(name(x)) + "</extra>" });
        if (x.sign_change && x.sign_change.period > 0 && x.sign_change.year <= end) marks.push({ x: x.sign_change.year, c: U.css(s[2]) });
      });
      if (marks.length) traces.push({ type: "scatter", mode: "markers+text", name: "Fee turns negative", x: marks.map(function (m) { return m.x; }),
        y: marks.map(function () { return 0; }), text: marks.map(function (m) { return String(m.x); }), textposition: "top center",
        textfont: { size: 11, color: U.css("--ink-2") }, marker: { size: 8, color: U.css("--ink"), symbol: "circle" }, hovertemplate: "Negative from %{x}<extra></extra>" });
      var shapes = [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0, line: { color: U.css("--axis"), width: 1 } }];
      if (p.view === "band" && d.band) shapes.unshift({ type: "rect", xref: "x", yref: "paper", x0: d.band.from, x1: d.band.to, y0: 0, y1: 1,
        fillcolor: U.css("--wash"), line: { width: 0 }, layer: "below" });
      var m = top > 0 ? top : 1;
      var drawn = spec.map(function (s) { return P[s[0]]; });
      var pick = [1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2015, 2020, 2025, 2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100, 2150, 2200, 2250];
      var rows = [["Largest, and its year"].concat(drawn.map(function (x) { return x.peak ? U.g3(x.peak.value) + " in " + x.peak.year : "never positive"; })),
                  ["Negative from"].concat(drawn.map(function (x) { return x.sign_change ? x.sign_change.text : "–"; })),
                  ["At the horizon, " + d.years[d.years.length - 1]].concat(drawn.map(function (x) { return U.num(x.tauT, 0); })),
                  ["Horizon reached, periods"].concat(drawn.map(function (x) { return String(x.T_reached); }))];
      pick.forEach(function (y) { var i = d.years.indexOf(y); if (i >= 0) rows.push([String(y)].concat(drawn.map(function (x) { return U.g3(x.values[i]); }))); });
      return {
        traces: traces, table: { columns: ["Gate fee, $/t"].concat(drawn.map(name)), rows: rows },
        note: (p.view === "band" && d.band ? "Shaded: the years between the earliest and the latest change of sign, " + d.band.from + " to " + d.band.to + ". Each path at the calibrated level of the handling charges. " : "") +
              (p.view === "settings" ? "The partial property right is the economy of that name on the century fit's page: observed policy, with part of the waste stock owned. " : "") +
              (p.range === "sign" ? "The vertical axis is cut to show the change of sign; the table lists a selection of years, the download every year." : ""),
        csv: { name: "gatefee_" + p.view + ".csv", columns: ["year"].concat(drawn.map(name)),
               rows: d.years.map(function (y, i) { return [y].concat(drawn.map(function (x) { return x.values[i]; })); }) },
        layout: U.layout({ height: 430, hovermode: "x unified", shapes: shapes,
          xaxis: { title: U.axisTitle("Year"), range: [1899, end + 1], hoverformat: "d" },
          yaxis: p.range === "sign" ? { title: U.axisTitle("Gate fee τᵂ, dollars per tonne"), range: [-1.6 * m, 1.35 * m], zeroline: false }
                                    : { title: U.axisTitle("Gate fee τᵂ, dollars per tonne") } }),
      };
    },
  },

  "phases": { // figure
    data: "phases",
    name: "The phases",
    title: function (ctx) {
      return ctx.p.measure === "tauW" ? "The gate fee and its change of sign, pair B" : "The treated share and the dates treatment begins, pair B";
    },
    shows: "The treated share at the planner corner and at the two unregulated corners, laissez-faire and the owned stockpile, with the year each begins to treat, against the data's; or the gate fee with the year it turns negative.",
    params: function (d, q) {
      return { measure: q.measure === "tauW" ? "tauW" : "vw", years: q.years === "2300" ? "2300" : "2100", range: q.range === "all" ? "all" : "sign" };
    },
    controls: function (ctx) {
      var out = [{ key: "measure", label: "Measure", options: [U.option("vw", "Treated share ϖ"), U.option("tauW", "Gate fee τᵂ")] },
                 { key: "years", label: "Years", options: [U.option("2100", "1900 to 2100"), U.option("2300", "1900 to 2300")] }];
      if (ctx.p.measure === "tauW") out.push({ key: "range", label: "Vertical axis", options: [U.option("sign", "Around the change of sign"), U.option("all", "The whole path")] });
      return out;
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, fee = p.measure === "tauW";
      var slot = { planner: "--series-1", rights: "--series-2", laissezfaire: "--series-3" };
      var end = Number(p.years), n = d.years.indexOf(end) + 1 || d.years.length, yrs = d.years.slice(0, n);
      var sets = d.settings.filter(function (s) { return !fee || s.id !== "laissezfaire"; });
      var traces = [], shapes = [], ann = [], top = 0;
      sets.forEach(function (s) {
        var v = s[p.measure].slice(0, n);
        v.forEach(function (y) { if (y !== null && y > top) top = y; });
        // The owned stockpile is dashed: where it runs on laissez-faire's path both stay visible.
        traces.push({ type: "scatter", mode: "lines", name: s.label, x: yrs, y: v,
                      line: { color: U.css(slot[s.id]), width: s.id === "laissezfaire" ? 3 : 2, dash: s.id === "rights" ? "dash" : "solid" },
                      hovertemplate: "%{x}: %{y:" + (fee ? ".3g" : ".4f") + "}<extra>" + U.esc(s.label) + "</extra>" });
      });
      if (!fee && d.data) traces.push({ type: "scatter", mode: "lines", name: "Data", x: d.data.years, y: d.data.values,
        line: { color: U.css("--ink-2"), width: 1.5, dash: "dot" }, hovertemplate: "%{x}: %{y:.3f}<extra>Data</extra>" });
      var dates = {};
      sets.forEach(function (s) {
        var e = fee ? s.fee_negative : s.entry;
        if (e && e.period > 0 && e.year <= end) (dates[e.year] = dates[e.year] || []).push(s);
      });
      Object.keys(dates).forEach(function (y) {
        shapes.push({ type: "line", x0: +y, x1: +y, yref: "paper", y0: 0, y1: 1, line: { color: U.css("--axis"), width: 1, dash: "dot" } });
        ann.push({ x: +y, yref: "paper", y: 1, yanchor: "bottom", showarrow: false, text: y, font: { size: 11, color: U.css("--ink-2") } });
      });
      if (fee) shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0, line: { color: U.css("--axis"), width: 1 } });
      var m = top > 0 ? top : 1;
      var dateText = function (e) { return e ? e.period + " (" + e.year + ")" : "–"; };
      var rows = [["Available state"].concat(d.settings.map(function (s) { return s.state; })),
                  ["Enters treatment"].concat(d.settings.map(function (s) { return dateText(s.entry); })),
                  ["Gate fee negative from"].concat(d.settings.map(function (s) { return s.id === "laissezfaire" ? "no gate fee" : feeFrom(s.fee_negative); }))];
      var pick = [1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2015, 2020, 2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100, 2150, 2200, 2250, 2300];
      pick.forEach(function (y) {
        var i = d.years.indexOf(y); if (i < 0) return;
        rows.push([String(y)].concat(d.settings.map(function (s) {
          if (fee && s.id === "laissezfaire") return "–";
          return fee ? U.g3(s.tauW[i]) : U.num(s.vw[i], 4); })));
      });
      var cols = [fee ? "Gate fee, $/t" : "Treated share ϖ"].concat(d.settings.map(function (s) { return s.label; }));
      if (!fee && d.data) {
        cols.push("Data");
        rows.forEach(function (r) { var i = d.data.years.indexOf(Number(r[0])); r.push(/^\d{4}$/.test(r[0]) && i >= 0 ? U.num(d.data.values[i], 3) : ""); });
      }
      return {
        traces: traces, table: { columns: cols, rows: rows },
        note: (fee ? "Laissez-faire has no gate fee: with no property right over the waste stock the fee is zero. " +
                     (p.range === "sign" ? "The vertical axis is cut to show the change of sign; the table lists a selection of years, the download every year." : "")
                   : "Dotted lines: the years treatment begins. The data's treated share is recovery of the non-biomass categories over that recovery plus the disposal outflow."),
        csv: { name: "phases_" + p.measure + ".csv", columns: ["year"].concat(d.settings.map(function (s) { return s.label; }), !fee && d.data ? ["data"] : []),
               rows: d.years.map(function (y, i) {
                 var r = [y].concat(d.settings.map(function (s) { return s[p.measure][i]; }));
                 if (!fee && d.data) { var j = d.data.years.indexOf(y); r.push(j >= 0 ? d.data.values[j] : null); }
                 return r; }) },
        layout: U.layout({ height: 430, hovermode: "x unified", shapes: shapes, annotations: ann, margin: { t: 26 },
          xaxis: { title: U.axisTitle("Year"), range: [1899, end + 1], hoverformat: "d" },
          yaxis: fee ? (p.range === "sign" ? { title: U.axisTitle("Gate fee τᵂ, dollars per tonne"), range: [-1.6 * m, 1.35 * m], zeroline: false }
                                           : { title: U.axisTitle("Gate fee τᵂ, dollars per tonne") })
                     : { title: U.axisTitle("Treated share ϖ, share of the handled flow"), range: [0, 1.02] } }),
      };
    },
  },

  "series": { // figure
    data: "century",
    name: "The series behind the century fit",
    tableOpen: true,
    title: function (ctx) {
      var p = ctx.p;
      if (p.path === "all") return "Every series behind the century fit, every path, every year";
      if (p.path === "data") return "The data behind the century fit, every year";
      var k = p.path.split("/");
      return pathLabel(ctx.data, k[0], k[1]) + ": every series, every year";
    },
    shows: "The data and the model's paths behind the century fit, year by year, as a table and a download.",
    params: function (d, q) {
      var path = q.path || "data";
      if (path !== "data" && path !== "all" && !has(d.available, path)) path = "data";
      return { path: path };
    },
    controls: function (ctx) {
      var d = ctx.data, opts = [U.option("data", "The data")];
      d.pairs.forEach(function (x) {
        d.economies.forEach(function (e) {
          opts.push(U.option(x.id + "/" + e.id, e.label + ", pair " + x.id, !has(d.available, x.id + "/" + e.id), U.pairLabel(x)));
        });
      });
      opts.push(U.option("all", "Everything, one row per path, series and year", false, "All at once"));
      return [{ key: "path", label: "Series of", options: opts }];
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, yrs = d.years;
      var series = d.series.filter(function (s) { return p.path !== "data" || (s.id !== "Wnet" && d.data[s.id]); });
      var key = '<dl class="ox-detail">' + series.map(function (s) {
        return "<dt>" + U.esc(s.label + (s.symbol ? " " + s.symbol : "")) + "</dt><dd>" + U.esc(s.unit) + "</dd>"; }).join("") + "</dl>";
      if (p.path === "all") {
        var long = [], listed = [["Data", "the data", series.filter(function (s) { return d.data[s.id]; }).length]];
        series.forEach(function (s) { if (d.data[s.id]) yrs.forEach(function (y, i) { if (d.data[s.id][i] !== null) long.push(["data", "", "", s.id, s.unit, y, d.data[s.id][i]]); }); });
        d.available.forEach(function (k) {
          var pe = k.split("/"), m = d.model[pe[0]][pe[1]];
          listed.push([pathLabel(d, pe[0], pe[1]), "the model", Object.keys(m).length]);
          d.series.forEach(function (s) { if (m[s.id]) yrs.forEach(function (y, i) { if (m[s.id][i] !== null) long.push(["model", pe[0], pe[1], s.id, s.unit, y, m[s.id][i]]); }); });
        });
        return { html: key, note: "The download holds " + long.length + " rows, one per path, series and year.",
                 table: { columns: ["Path", "From", "Series"], rows: listed.map(function (r) { return [r[0], r[1], String(r[2])]; }) },
                 csv: { name: "century_series_all.csv", columns: ["source", "pair", "economy", "series", "unit", "year", "value"], rows: long } };
      }
      var vals = function (s) {
        if (p.path === "data") return d.data[s.id];
        var k = p.path.split("/"); return (d.model[k[0]][k[1]] || {})[s.id] || null;
      };
      var cols = ["Year"].concat(series.map(function (s) { return s.label + (s.symbol ? " " + s.symbol : ""); }));
      var rows = [], csv = [];
      yrs.forEach(function (y, i) {
        var r = series.map(function (s) { var v = vals(s); return v ? v[i] : null; });
        if (r.every(function (v) { return v === null; })) return;
        csv.push([y].concat(r));
        rows.push([String(y)].concat(r.map(function (v, j) { return U.num(v, series[j].decimals); })));
      });
      var empty = series.filter(function (s) { return !vals(s); }).map(function (s) { return s.label; });
      return { html: key, table: { columns: cols, rows: rows },
               note: (p.path === "data" ? "The data's treated share is given for 2015 alone, the share the handling level is fitted to; the figure of the phases draws its series. " : "") +
                     (empty.length ? "Zero throughout on this path: " + empty.join(", ") + "." : ""),
               csv: { name: "century_series_" + p.path.replace("/", "_") + ".csv",
                      columns: ["year"].concat(series.map(function (s) { return s.id + " (" + s.unit + ")"; })), rows: csv } };
    },
  },

  "cn": { // figure
    data: "cn",
    name: "The extraction-cost index",
    title: function () { return "The level of extraction costs, year by year over the sample"; },
    shows: "The level of extraction costs, one value a year over the sample, and the value at which the model holds it from the end of the sample on.",
    params: function () { return {}; },
    controls: function () { return []; },
    draw: function (ctx) {
      var d = ctx.data, last = d.years[d.years.length - 1], ext = [last, last + 25];
      var unit = "trillion dollars per Gt^(1+χ_N), χ_N = " + U.par(d.chi_N);
      var axis = "c<sub>N</sub>, trillion dollars per Gt raised to 1 + χ<sub>N</sub>, χ<sub>N</sub> = " + U.par(d.chi_N);
      return {
        traces: [{ type: "scatter", mode: "lines", name: "c<sub>N</sub>, one value a year", x: d.years, y: d.values, line: { color: U.css("--series-1"), width: 2 },
                   hovertemplate: "%{x}: %{y:.4g}<extra></extra>" },
                 { type: "scatter", mode: "lines", name: "Held at its " + last + " value", x: ext, y: [d.held.value, d.held.value],
                   line: { color: U.css("--series-1"), width: 2, dash: "dash" }, hovertemplate: "from %{x}: %{y:.4g}<extra></extra>" }],
        table: { columns: ["Year", "c_N, " + unit], rows: d.years.map(function (y, i) { return [String(y), U.g4(d.values[i])]; }) },
        note: "From " + last + " on the model holds the level at " + U.g4(d.held.value) + ". Mean over 2006 to 2015: " + U.g4(d.printed.mean_2006_2015) + ".",
        csv: { name: "cN_table.csv", columns: ["year", "cN (" + unit + ")"], rows: d.years.map(function (y, i) { return [y, d.values[i]]; }) },
        layout: U.layout({ height: 400, hovermode: "x unified",
          xaxis: { title: U.axisTitle("Year"), range: [1898, last + 27], hoverformat: "d" },
          yaxis: { title: U.axisTitle(axis), rangemode: "tozero" } }),
      };
    },
  },

  "pairs": { // figure
    data: "experiments",
    name: "The preference pairs",
    title: function () { return "The consumption equivalent of each experiment under the three preference pairs, welfare to 2300"; },
    shows: "Each change of policy from 2025 on each preference pair's own observed economy, with welfare summed to 2300; the table adds each pair's calibration.",
    params: function (d, q) { return { rows: EXP_ROWS[q.rows] ? q.rows : "all" }; },
    controls: function () { return [rowsControl()]; },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, year = d.horizons[0].year, ids = EXP_ROWS[p.rows];
      var pairs = d.pairs.filter(function (x) { return expRun(d, x.id, year); });
      var labels = ids.map(function (e) { return expLabel(d, e); });
      var traces = pairs.map(function (x) {
        var by = byRow(expRun(d, x.id, year)), xs = ids.map(function (e) { return by[e] ? by[e].ce : null; });
        return { type: "bar", orientation: "h", name: U.pairLabel(x), y: labels, x: xs, marker: { color: U.css(PAIR_SLOT[x.id]) },
                 text: xs.map(U.g3), textposition: "none", hovertemplate: "%{y}: %{text} %<extra>" + U.esc("Pair " + x.id) + "</extra>" };
      });
      var cols = ["", "Pair B", "Pair A", "Pair C"].filter(function (c, j) { return j === 0 || pairs.some(function (x) { return "Pair " + x.id === c; }); });
      var rows = ids.map(function (e) {
        return [expLabel(d, e)].concat(pairs.map(function (x) { var r = byRow(expRun(d, x.id, year))[e]; return r ? U.g3(r.ce) : "–"; }));
      });
      [["Time preference ρ", function (x) { return U.par(x.rho); }],
       ["Elasticity of marginal utility η", function (x) { return U.par(x.eta); }],
       ["Level of the handling charges, fitted on the observed economy", function (x) { return U.num(x.level, 4); }],
       ["Collapse ranking condition", function (x) { return x.ranking || "–"; }],
       ["Weight per period at the circular growth rate", function (x) { return U.num(x.weight, 4); }]].forEach(function (r) {
        rows.push([r[0]].concat(pairs.map(r[1])));
      });
      var csv = ids.map(function (e) {
        return [e, U.byId(d.experiments)[e].label].concat(pairs.map(function (x) { var r = byRow(expRun(d, x.id, year))[e]; return r ? r.ce : null; }));
      });
      return {
        traces: traces, table: { columns: cols, rows: rows },
        csv: { name: "pairs_consumption_equivalents_2300.csv", columns: ["experiment", "label"].concat(pairs.map(function (x) { return "pair_" + x.id + "_percent"; })), rows: csv },
        note: "Consumption equivalents in percent of consumption from 2025 on, each against its own pair's observed economy continued. The table's last rows give each pair's calibration.",
        layout: U.layout({ height: 110 + 54 * ids.length, barmode: "group", bargap: 0.3, bargroupgap: 0.08, hovermode: "closest",
          margin: { l: 20 }, shapes: [zeroLine("x")],
          xaxis: { title: U.axisTitle("Consumption equivalent, % of consumption from 2025") },
          yaxis: { autorange: "reversed", type: "category" } }),
      };
    },
  },

  "horizon": { // figure
    data: "experiments",
    name: "The horizon",
    title: function () { return "The consumption equivalent of each experiment with welfare summed to 2100, 2200 and 2300, pair B"; },
    shows: "Each change of policy from 2025 on the observed economy of pair B, its consumption equivalent read with welfare summed to three horizons.",
    params: function (d, q) { return { rows: EXP_ROWS[q.rows] ? q.rows : "all" }; },
    controls: function () { return [rowsControl()]; },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, ids = EXP_ROWS[p.rows];
      var labels = ids.map(function (e) { return expLabel(d, e); });
      var hs = d.horizons.filter(function (h) { return expRun(d, "B", h.year); });
      var shade = { 2300: 1, 2200: 0.66, 2100: 0.4 };
      var traces = hs.map(function (h) {
        var by = byRow(expRun(d, "B", h.year)), xs = ids.map(function (e) { return by[e] ? by[e].ce : null; });
        return { type: "bar", orientation: "h", name: "Welfare to " + h.year, y: labels, x: xs,
                 marker: { color: tint(U.css("--series-1"), shade[h.year] || 1), line: { color: U.css("--series-1"), width: 1 } }, text: xs.map(U.g3), textposition: "none",
                 hovertemplate: "%{y}: %{text} %<extra>to " + h.year + "</extra>" };
      });
      var rows = ids.map(function (e) {
        return [expLabel(d, e)].concat(hs.map(function (h) { var r = byRow(expRun(d, "B", h.year))[e]; return r ? U.g3(r.ce) : "–"; }));
      });
      return {
        traces: traces,
        table: { columns: ["Experiment, pair B"].concat(hs.map(function (h) { return "Welfare to " + h.year + ", %"; })), rows: rows },
        csv: { name: "horizon_consumption_equivalents_B.csv", columns: ["experiment", "label"].concat(hs.map(function (h) { return "to_" + h.year + "_percent"; })),
               rows: ids.map(function (e) { return [e, U.byId(d.experiments)[e].label].concat(hs.map(function (h) { var r = byRow(expRun(d, "B", h.year))[e]; return r ? r.ce : null; })); }) },
        note: "Consumption equivalents in percent of consumption from 2025 on, against the observed economy continued and solved to the same horizon. Within each experiment the bars run from welfare to 2300, at the top, to welfare to 2100.",
        layout: U.layout({ height: 110 + 54 * ids.length, barmode: "group", bargap: 0.3, bargroupgap: 0.08, hovermode: "closest",
          margin: { l: 20 }, shapes: [zeroLine("x")],
          xaxis: { title: U.axisTitle("Consumption equivalent, % of consumption from 2025") },
          yaxis: { autorange: "reversed", type: "category" } }),
      };
    },
  },

  "fit": { // figure
    data: "experiments",
    name: "The fit across horizons",
    title: function (ctx) {
      return ctx.p.view === "window" ? "The largest relative change in the planner's century when the horizon is halved, by preference pair"
                                     : "The observed economy's 2015 treated share, solved to three horizons, by preference pair";
    },
    shows: "The 2015 treated share of each pair's observed economy solved to 2100, 2200 and 2300, against the share the level of the handling charges is fitted to; and how far the planner's output and consumption over 1900 to 2000 move when the horizon is halved.",
    params: function (d, q) { return { view: q.view === "window" ? "window" : "share" }; },
    controls: function () {
      return [{ key: "view", label: "Show", options: [U.option("share", "The 2015 treated share at three horizons"),
        U.option("window", "The century when the horizon is halved")] }];
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, pairs = d.pairs.filter(function (x) { return x.vw2015; });
      var hy = d.horizons.map(function (h) { return String(h.year); }).reverse();
      var cols = ["Pair", "Level of the handling charges", "Fitted on the path solved to"].concat(hy.map(function (y) { return "2015 treated share, solved to " + y; }),
        ["Output 1900 to 2000, largest relative change", "Consumption 1900 to 2000, largest relative change"]);
      var rows = pairs.map(function (x) {
        return ["Pair " + x.id, U.num(x.level, 4), String(x.fitted_at)].concat(hy.map(function (y) { return U.num(x.vw2015[y], 4); }),
          [U.gN(x.window.dY, 2), U.gN(x.window.dC, 2)]);
      });
      var csv = { name: "fit_across_horizons.csv", columns: ["pair", "level", "fitted_to"].concat(hy.map(function (y) { return "treated_share_2015_to_" + y; }),
                    ["output_1900_2000_relative_change", "consumption_1900_2000_relative_change", "horizon_halved_from", "horizon_halved_to"]),
                  rows: pairs.map(function (x) { return [x.id, x.level, x.fitted_at].concat(hy.map(function (y) { return x.vw2015[y]; }),
                    [x.window.dY, x.window.dC, x.window.from, x.window.to]); }) };
      var table = { columns: cols, rows: rows };
      if (p.view === "window") {
        var from = pairs.length ? pairs[0].window.from : "", to = pairs.length ? pairs[0].window.to : "";
        return {
          traces: pairs.map(function (x) {
            return { type: "bar", name: U.pairLabel(x), x: ["Output", "Consumption"], y: [x.window.dY, x.window.dC], marker: { color: U.css(PAIR_SLOT[x.id]) },
                     text: [U.gN(x.window.dY, 2), U.gN(x.window.dC, 2)], textposition: "outside", cliponaxis: false, textfont: { color: U.css("--ink-2"), size: 11.5 },
                     hovertemplate: "%{x}: %{text}<extra>Pair " + x.id + "</extra>" };
          }),
          table: table, csv: csv,
          note: "The largest relative difference over 1900 to 2000 between the planner corner solved to " + from + " and to " + to + ", each pair at its own calibration.",
          layout: U.layout({ height: 400, barmode: "group", bargap: 0.35, hovermode: "closest",
            xaxis: { type: "category" }, yaxis: { title: U.axisTitle("Largest relative change, logarithmic axis"), type: "log" } }),
        };
      }
      var traces = pairs.map(function (x) {
        return { type: "scatter", mode: "lines+markers", name: U.pairLabel(x), x: hy, y: hy.map(function (y) { return x.vw2015[y]; }),
                 line: { color: U.css(PAIR_SLOT[x.id]), width: 2 }, marker: { size: 9, color: U.css(PAIR_SLOT[x.id]), line: { width: 2, color: U.css("--surface") } },
                 hovertemplate: "solved to %{x}: %{y:.4f}<extra>Pair " + x.id + "</extra>" };
      });
      var shapes = [], ann = [];
      if (typeof d.target === "number") {
        shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, y0: d.target, y1: d.target, line: { color: U.css("--ink-2"), width: 1.5, dash: "dash" } });
        ann.push({ xref: "paper", x: 1, y: d.target, xanchor: "right", yanchor: "bottom", showarrow: false,
                   text: "fitted to " + U.num(d.target, 4), font: { size: 11.5, color: U.css("--ink-2") } });
      }
      return {
        traces: traces, table: table, csv: csv,
        note: "Each pair's level is fitted on its observed economy solved to " + (pairs.length ? pairs[0].fitted_at : "") + ", to the 2015 treated share of the data" +
              (typeof d.target === "number" ? ", " + U.num(d.target, 4) : "") + "; the other horizons solve the same economy again.",
        layout: U.layout({ height: 400, hovermode: "closest", shapes: shapes, annotations: ann,
          xaxis: { title: U.axisTitle("The economy solved to"), type: "category" },
          yaxis: { title: U.axisTitle("2015 treated share ϖ, share of the handled flow") } }),
      };
    },
  },

  "experiments": { // figure
    data: "experiments",
    name: "The observed-policy experiments",
    title: function (ctx) {
      var p = ctx.p, m = expMeasure(ctx.data, p.measure);
      return (p.measure === "ce" ? "The consumption equivalent of each experiment, welfare to " + p.horizon
                                 : m.label + " in " + p.year + ", each experiment") + ", pair " + p.pair;
    },
    shows: "Each change of policy from 2025 on the observed economy, with its consumption equivalent, or its treated share, material input, extraction, secondary input, pollution stock or gate fee in a later year beside the observed economy continued.",
    params: function (d, q) {
      var pairs = expPairs(d);
      var p = { pair: q.pair || "B", measure: q.measure || "ce", horizon: q.horizon || String(d.horizons[0].year), year: q.year || "" };
      if (pairs.indexOf(p.pair) < 0) p.pair = pairs[0];
      if (!expMeasure(d, p.measure)) p.measure = "ce";
      if (!expRun(d, p.pair, Number(p.horizon))) p.horizon = String(d.horizons[0].year);
      var years = p.measure === "fee" ? d.fee_years : d.read_years;
      if (years.indexOf(Number(p.year)) < 0) p.year = String(years[1]);
      return p;
    },
    controls: function (ctx) {
      var d = ctx.data, p = ctx.p;
      var out = [
        { key: "measure", label: "Measure", options: [U.option("ce", "Consumption equivalent")].concat(d.readings.map(function (r) {
          return U.option(r.id, r.label + " " + r.symbol); }), [U.option("fee", "Gate fee τᵂ")]) },
        { key: "pair", label: "Preference pair", options: d.pairs.map(function (x) {
          return U.option(x.id, U.pairLabel(x), !expRun(d, x.id, d.horizons[0].year)); }) }];
      if (p.measure === "ce") out.push({ key: "horizon", label: "Welfare to", options: d.horizons.map(function (h) {
        return U.option(String(h.year), String(h.year), !expRun(d, p.pair, h.year)); }) });
      else out.push({ key: "year", label: "Year", options: (p.measure === "fee" ? d.fee_years : d.read_years).map(function (y) {
        return U.option(String(y), String(y)); }) });
      return out;
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, m = expMeasure(d, p.measure), ce = p.measure === "ce", fee = p.measure === "fee";
      var full = expRun(d, p.pair, d.horizons[0].year), run = ce ? expRun(d, p.pair, Number(p.horizon)) : full, by = byRow(run);
      var years = fee ? d.fee_years : d.read_years, yi = years.indexOf(Number(p.year));
      var shown = full.rows.filter(function (r) { return !ce || r.id !== "ref"; });
      var val = function (r) {
        if (ce) return by[r.id] ? by[r.id].ce : null;
        if (fee) return r.fee ? r.fee.values[yi] : null;
        return r.readings[p.measure][yi];
      };
      var xs = shown.map(val);
      var trace = { type: "bar", orientation: "h", name: m.label, y: shown.map(function (r) { return expLabel(d, r.id); }), x: xs,
                    marker: { color: shown.map(function (r) { return r.id === "ref" ? U.css("--muted") : U.css("--series-1"); }) },
                    text: xs.map(function (v) { return v === null || v === undefined ? "" : m.fmt(v); }), textposition: "outside", cliponaxis: false,
                    textfont: { color: U.css("--ink-2"), size: 11.5 }, hovertemplate: "%{y}: %{text}<extra></extra>" };
      var hs = d.horizons.filter(function (h) { return expRun(d, p.pair, h.year); });
      var cols = ["Experiment"].concat(hs.map(function (h) { return "Consumption equivalent, welfare to " + h.year + ", %"; }),
        ["Long-run state", "𝓜∞ at " + d.horizons[0].year + ", Gt", "Gate fee negative from"],
        ce ? [] : years.map(function (y) { return m.label + ", " + y; }));
      var rows = full.rows.map(function (r) {
        return [expLabel(d, r.id)].concat(hs.map(function (h) { var x = byRow(expRun(d, p.pair, h.year))[r.id]; return x && x.ce !== null ? U.g3(x.ce) : "–"; }),
          [r.state || "–", U.num(r.Minf, 0), r.fee && r.fee.first_negative ? String(r.fee.first_negative) : "–"],
          ce ? [] : years.map(function (y, i) { var v = fee ? (r.fee ? r.fee.values[i] : null) : r.readings[p.measure][i]; return v === null || v === undefined ? "–" : m.fmt(v); }));
      });
      var csvCols = ["experiment", "label", "from"].concat(hs.map(function (h) { return "consumption_equivalent_to_" + h.year + "_percent"; }),
        ["case", "state", "Minf_Gt", "gatefee_negative_from"], d.fee_years.map(function (y) { return "gatefee_" + y + "_dollars_per_t"; }));
      d.readings.forEach(function (rd) { d.read_years.forEach(function (y) { csvCols.push(rd.id + "_" + y); }); });
      var csvRows = full.rows.map(function (r) {
        var out = [r.id, U.byId(d.experiments)[r.id].label, U.byId(d.experiments)[r.id].from].concat(
          hs.map(function (h) { var x = byRow(expRun(d, p.pair, h.year))[r.id]; return x ? x.ce : null; }),
          [r.case, r.state, r.Minf, r.fee ? r.fee.first_negative : null], d.fee_years.map(function (y, i) { return r.fee ? r.fee.values[i] : null; }));
        d.readings.forEach(function (rd) { out = out.concat(r.readings[rd.id]); });
        return out;
      });
      var vals = xs.filter(function (v) { return typeof v === "number"; });
      var lo = Math.min.apply(null, [0].concat(vals)), hi = Math.max.apply(null, [0].concat(vals)), span = hi - lo || 1;
      var range = [lo < 0 ? lo - 0.3 * span : lo, hi > 0 ? hi + 0.2 * span : hi];
      var notes = [];
      if (ce) notes.push("The reference has no consumption equivalent: each experiment is measured against it.");
      else notes.push("Read on the path solved to " + d.horizons[0].year + ".");
      if (fee) notes.push("An experiment without an owner of the waste stock has no gate fee and no bar.");
      return {
        traces: [trace], table: { columns: cols, rows: rows }, note: notes.join(" "),
        csv: { name: "experiments_" + p.pair + ".csv", columns: csvCols, rows: csvRows },
        layout: U.layout({ height: 90 + 44 * shown.length, hovermode: "closest", showlegend: false, margin: { l: 20, r: 60 }, shapes: ce || fee ? [zeroLine("x")] : [],
          xaxis: { title: U.axisTitle(m.axis), range: range },
          yaxis: { autorange: "reversed", type: "category" } }),
      };
    },
  },

  "instruments": { // figure
    data: "instruments",
    name: "The observed instruments against their Pigouvian values",
    title: function (ctx) { return INSTR[ctx.p.inst].title + ", observed and Pigouvian, pair B"; },
    shows: "Each instrument the observed economy faces, year by year from 1900, beside its Pigouvian value on the planner's path: the emission tax, the discovery tax, and the landfill tax beside the gate fee.",
    params: function (d, q) {
      var p = { inst: INSTR[q.inst] ? q.inst : "tauP", years: q.years === "2050" ? "2050" : "2100", axis: q.axis === "log" ? "log" : "level" };
      if (p.inst !== "tauP") p.axis = "level";
      return p;
    },
    controls: function (ctx) {
      var out = [{ key: "inst", label: "Instrument", options: Object.keys(INSTR).map(function (k) { return U.option(k, INSTR[k].title); }) },
                 { key: "years", label: "Years", options: [U.option("2100", "1900 to 2100"), U.option("2050", "1900 to 2050")] }];
      if (ctx.p.inst === "tauP") out.push({ key: "axis", label: "Vertical axis", options: [U.option("level", "Level"), U.option("log", "Logarithmic")] });
      return out;
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, spec = INSTR[p.inst], x = U.byId(d.instruments)[p.inst];
      var n = d.years.indexOf(Number(p.years)) + 1 || d.years.length, yrs = d.years.slice(0, n);
      var runs = [{ name: spec.pigou, v: x.pigou, color: "--series-1", dash: "solid" }, { name: spec.observed, v: x.observed, color: "--series-2", dash: "solid" }];
      if (p.inst === "tauL") runs.push({ name: "Landfill tax, lower bound", v: d.landfill.lower_bound, color: "--series-2", dash: "dot" });
      var traces = runs.map(function (r) {
        return { type: "scatter", mode: "lines", name: r.name, x: yrs, y: r.v.slice(0, n), connectgaps: false,
                 line: { color: U.css(r.color), width: 2, dash: r.dash }, hovertemplate: "%{x}: %{y:.3g} $/t<extra>" + U.esc(r.name) + "</extra>" };
      });
      var rc = [];
      if (p.inst === "tauL") d.landfill.rate_check.forEach(function (v, i) { if (v !== null && i < n) rc.push({ x: d.years[i], y: v }); });
      if (rc.length) traces.push({ type: "scatter", mode: "markers", name: "Landfill tax, rate check", x: rc.map(function (r) { return r.x; }), y: rc.map(function (r) { return r.y; }),
        marker: { size: 10, symbol: "diamond", color: U.css("--series-2"), line: { width: 2, color: U.css("--surface") } }, hovertemplate: "%{x}: %{y:.3g} $/t<extra>rate check</extra>" });
      var held = x.held_from, shapes = [], ann = [];
      if (held <= yrs[yrs.length - 1]) {
        shapes.push({ type: "line", x0: held - 0.5, x1: held - 0.5, yref: "paper", y0: 0, y1: 1, line: { color: U.css("--axis"), width: 1, dash: "dot" } });
      }
      if (p.axis === "level") shapes.push(zeroLine("y"));
      var cols = ["Year", spec.observed + ", $/t", spec.pigou + ", $/t"].concat(p.inst === "tauL" ? ["Landfill tax, lower bound, $/t", "Landfill tax, rate check, $/t"] : []);
      var rows = [], csv = [];
      d.years.forEach(function (y, i) {
        var r = [y, x.observed[i], x.pigou[i]].concat(p.inst === "tauL" ? [d.landfill.lower_bound[i], d.landfill.rate_check[i]] : []);
        csv.push(r);
        if (i < n && (y % 10 === 0 || d.table_years.indexOf(y) >= 0)) rows.push([String(y)].concat(r.slice(1).map(U.g3)));
      });
      return {
        traces: traces, table: { columns: cols, rows: rows },
        csv: { name: "instruments_" + p.inst + ".csv", columns: ["year", "observed", "pigouvian"].concat(p.inst === "tauL" ? ["lower_bound", "rate_check"] : []), rows: csv },
        note: spec.note + " The observed path is held at its last observed value from " + held + " on, from the dotted line; the Pigouvian value is the planner corner's, solved to 2300." +
              (p.axis === "log" ? " Logarithmic axis: a year in which a path is zero or negative is not drawn." : ""),
        layout: U.layout({ height: 430, hovermode: "x unified", shapes: shapes, annotations: ann,
          xaxis: { title: U.axisTitle("Year"), range: [1899, Number(p.years) + 1], hoverformat: "d" },
          yaxis: p.axis === "log" ? { title: U.axisTitle(spec.axis + ", logarithmic axis"), type: "log" } : { title: U.axisTitle(spec.axis) } }),
      };
    },
  },

  "sensitivity": { // figure
    data: "sensitivity",
    name: "The larger damage coefficient and the low discovery ceiling",
    title: function (ctx) {
      if (ctx.p.view === "ceiling") return "The planner corner with the discovery ceiling at the low end of its range, pair B";
      return SENS_Q[ctx.p.q].label + " at the calibrated damage coefficient and at the larger one, by preference pair";
    },
    shows: "The planner corner and its comparisons at the calibrated damage coefficient and at a larger one, under each preference pair; or the planner corner of pair B with the discovery ceiling at the low end of its range.",
    params: function (d, q) {
      var p = { view: q.view === "ceiling" ? "ceiling" : "damages", q: SENS_Q[q.q] ? q.q : "Minf", axis: q.axis === "log" ? "log" : "level" };
      if (!d.ceiling) p.view = "damages";
      if (!d.damages.length && d.ceiling) p.view = "ceiling";
      if (SENS_Q[p.q].signed) p.axis = "level";
      return p;
    },
    controls: function (ctx) {
      var d = ctx.data, p = ctx.p;
      var out = [{ key: "view", label: "Show", options: [U.option("damages", "The larger damage coefficient", !d.damages.length),
        U.option("ceiling", "The low discovery ceiling", !d.ceiling)] }];
      if (p.view === "damages") {
        out.push({ key: "q", label: "Quantity", options: Object.keys(SENS_Q).map(function (k) { return U.option(k, SENS_Q[k].label); }) });
        if (!SENS_Q[p.q].signed) out.push({ key: "axis", label: "Vertical axis", options: [U.option("level", "Level"), U.option("log", "Logarithmic")] });
      }
      return out;
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p;
      var colLabel = { calibrated: "Calibrated", damages: "Damage coefficient × " + U.par(d.factor) };
      var tab = sensTable(d, colLabel);
      if (p.view === "ceiling") {
        var c = d.ceiling, crow = ceilingRows(c);
        var html = '<table class="ox-table"><thead><tr><th></th><th class="num">The calibrated ceiling</th><th class="num">The low end of its range</th></tr></thead><tbody>' +
          crow.map(function (r) { return "<tr><td>" + U.esc(r[0]) + '</td><td class="num">' + U.esc(r[1]) + '</td><td class="num">' + U.esc(r[2]) + "</td></tr>"; }).join("") + "</tbody></table>";
        return { html: html, table: { columns: ["Pair B, the planner corner", "The calibrated ceiling", "The low end of its range"], rows: crow },
                 csv: { name: "sensitivity_discovery_ceiling_B.csv", columns: ["quantity", "calibrated_ceiling", "low_end"],
                        rows: [["Xmax_Gt", c.point.Xmax, c.low.Xmax], ["state", c.point.state, c.low.state], ["Minf_Gt", c.point.Minf, c.low.Minf],
                               ["gatefee_negative_from_year", c.point.gatefee ? c.point.gatefee.year : null, c.low.gatefee ? c.low.gatefee.year : null],
                               ["cumulative_N_over_its_bound", c.point.cumN, c.low.cumN], ["cumulative_leakage_over_the_material_budget", c.point.leak, c.low.leak],
                               ["horizon_reached_periods", c.point.T_reached, c.low.T_reached]] },
                 note: "The handling charges are those of the calibration, not fitted again at the low ceiling." };
      }
      var q = SENS_Q[p.q], grids = d.damages, xs = grids.map(function (g) { return "Pair " + g.pair; });
      var traces = ["calibrated", "damages"].map(function (cid, i) {
        var ys = grids.map(function (g) { var v = g[cid][p.q]; return typeof v === "number" ? v : null; });
        return { type: "bar", name: colLabel[cid], x: xs, y: ys, marker: { color: U.css(i ? "--series-2" : "--series-1") },
                 text: ys.map(q.fmt), textposition: "outside", cliponaxis: false, textfont: { color: U.css("--ink-2"), size: 11.5 },
                 hovertemplate: "%{x}: %{text}<extra>" + U.esc(colLabel[cid]) + "</extra>" };
      });
      return {
        traces: traces, table: tab.table, csv: tab.csv,
        note: "Each comparison is made within its column, against that column's own planner corner or its own economy without recycling.",
        layout: U.layout({ height: 420, barmode: "group", bargap: 0.35, hovermode: "closest", shapes: q.signed ? [zeroLine("y")] : [],
          xaxis: { type: "category" },
          yaxis: p.axis === "log" ? { title: U.axisTitle(q.axis + ", logarithmic axis"), type: "log" } : { title: U.axisTitle(q.axis) } }),
      };
    },
  },

  "variants": { // figure
    data: "sensitivity",
    name: "The observed economy and its variants",
    title: function (ctx) {
      var s = U.byId(ctx.data.variants.series)[ctx.p.series];
      return s.label + " " + s.symbol + (ctx.p.show === "diff" ? ": each variant's difference from the observed economy, pair B" : ": the observed economy and its variants, pair B");
    },
    shows: "The observed economy of pair B beside three variants: the fuel-excise wedge from 2010 under its two constructions, not refitted, and a sequence of unannounced changes in place of foresight of the measured paths.",
    params: function (d, q) {
      var v = d.variants, p = { series: q.series || "R", show: q.show === "level" ? "level" : "diff" };
      if (!v || !U.byId(v.series)[p.series]) p.series = v ? v.series[0].id : "";
      return p;
    },
    controls: function (ctx) {
      var v = ctx.data.variants;
      return [{ key: "series", label: "Series", options: v.series.map(function (s) {
                 var ys = variantYears(v, s.id); return U.option(s.id, s.label + " " + s.symbol + ", " + ys.join(", ")); }) },
              { key: "show", label: "Show", options: [U.option("diff", "Difference from the observed economy"), U.option("level", "Levels")] }];
    },
    draw: function (ctx) {
      var d = ctx.data, p = ctx.p, v = d.variants, s = U.byId(v.series)[p.series];
      var rows = v.rows.filter(function (r) { return r.series === p.series; }), xs = rows.map(function (r) { return String(r.year); });
      var dec = function (r) { return r.year === 2025 && r.series !== "vw" ? 1 : s.decimals; };
      var cols = v.columns.map(function (c, i) { return { c: c, i: i }; }).filter(function (x) { return p.show === "level" || x.c.id !== "observed"; });
      var traces = cols.map(function (x) {
        var ys = rows.map(function (r) { var a = r.values[x.i], b = r.values[0]; return p.show === "level" ? a : (a === null || b === null ? null : a - b); });
        return { type: "bar", name: x.c.label, x: xs, y: ys, marker: { color: U.css(VARIANT_SLOT[x.c.id]) },
                 text: ys.map(function (y, j) { return y === null ? "" : U.num(y, dec(rows[j])); }), textposition: "none",
                 hovertemplate: "%{x}: %{text}<extra>" + U.esc(x.c.label) + "</extra>" };
      });
      var tab = variantsTable(v);
      return {
        traces: traces, table: tab.table, csv: tab.csv,
        note: (p.show === "diff" ? "Each bar is the variant's value less the observed economy's, in " + s.unit + "; the table gives the levels. " : "") +
              "The wedge's two columns are not fitted again to the 2015 treated share.",
        layout: U.layout({ height: 420, barmode: "group", bargap: 0.3, hovermode: "closest", shapes: p.show === "diff" ? [zeroLine("y")] : [],
          xaxis: { title: U.axisTitle("Year"), type: "category" },
          yaxis: { title: U.axisTitle((p.show === "diff" ? "Difference from the observed economy in " + s.label.toLowerCase() : s.label) + " " + s.symbol + ", " + s.unit),
                   rangemode: p.show === "diff" ? "normal" : "tozero" } }),
      };
    },
  },

  };

  // -- the experiment figures' shared pieces --------------------------------------------------
  // A number at three or four significant digits, as the tables' %.3g prints it, with no exponent
  // above a ten-thousandth: 0.126, −2.14, −1570.
  var SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  U.sci = function (x, d) {
    if (x === null || x === undefined || typeof x !== "number" || !isFinite(x)) return "–";
    if (x === 0) return "0";
    var e = Math.floor(Math.log10(Math.abs(x))), m = Number((x / Math.pow(10, e)).toPrecision(d));
    if (Math.abs(m) >= 10) { m /= 10; e += 1; }
    return (String(Number(m.toPrecision(d))) + "×10" + String(e).split("").map(function (c) { return SUP[c]; }).join("")).replace(/^-/, "−");
  };
  U.gN = function (x, d) {
    if (x === null || x === undefined || typeof x !== "number" || !isFinite(x)) return "–";
    var v = Number(x.toPrecision(d));
    return (v === 0 || Math.abs(v) >= 1e-4 ? String(v) : U.sci(v, d)).replace(/^-/, "−");
  };
  U.g3 = function (x) { return U.gN(x, 3); };
  U.g4 = function (x) { return U.gN(x, 4); };
  var CORNER_MEASURES = {
    ce: { label: "The consumption-equivalent cost", axis: "Consumption-equivalent cost against the planner corner, % of consumption", fmt: function (v) { return U.sci(v, 3); } },
    Minf: { label: "The retained endowment", axis: "Retained endowment 𝓜∞, Gt", fmt: function (v) { return U.num(v, 1); } },
    leak: { label: "The cumulative leakage", axis: "Cumulative leakage Σ(1−aϖ)H, Gt", fmt: function (v) { return U.num(v, 1); } },
    survival: { label: "The survival ratio", axis: "Survival ratio 𝓜∞/(R̄𝒯)", fmt: function (v) { return v === "inf" ? "∞" : U.num(v, 2); } },
  };
  function floorName(r) { return r === 0 ? "no floor" : "R̄ = " + floorLabel(r) + " Gt a year"; }
  function cornerGrid(d, pair, floor) {
    return d.grids.filter(function (g) { return g.pair === pair && Math.abs(g.Rbar - floor) < 1e-9; })[0] || null;
  }
  function cornerCompared(d, p) {
    if (!p.vs) return null;
    if (p.vs === "floor") {
      var other = d.floors.filter(function (r) { return String(r) !== p.floor; })[0];
      return other === undefined ? null : { pair: p.pair, floor: other };
    }
    return U.byId(d.pairs)[p.vs] && p.vs !== p.pair ? { pair: p.vs, floor: Number(p.floor) } : null;
  }
  function leakFloors(d, pair) {
    var g = d.grids.filter(function (x) { return x.pair === pair; })[0], seen = {};
    return g ? g.cells.map(function (c) { return c.Rbar; }).filter(function (r) { return seen[r] ? false : (seen[r] = true); }).sort(function (a, b) { return a - b; }) : [];
  }

  function cellKey(c) { return String(c.abar) + "|" + String(c.Rbar); }
  function gridOf(d, pair, econ) {
    return d.grids.filter(function (g) { return g.pair === pair && g.economy === econ; })[0] || null;
  }
  function survival(c) {
    if (c.survival === "inf") return "∞";
    return U.num(c.survival, 2);
  }
  // A material floor as the paper prints it, to one decimal at most: 0, 2, 9.5, 23.8. The data keep
  // the floor's own digits, and the downloads print them.
  function floorLabel(r) { return String(+Number(r).toFixed(1)); }
  function ceilingLabel(a) { return a >= 1 ? "ā = 1, soft" : "ā = " + U.par(a) + ", hard"; }

  function gridHTML(d, g, selected, tag, title) {
    var floors = d.floors, ceilings = d.ceilings;
    var by = {};
    g.cells.forEach(function (c) { by[cellKey(c)] = c; });
    var out = '<div><p class="ox-grid-title">' + (tag ? '<span class="ox-tag">' + U.esc(tag) + "</span>" : "") + U.esc(title) + "</p>";
    out += '<div class="ox-grid" role="group" aria-label="' + U.esc(title) + '" style="--ncol:' + floors.length + '">';
    out += '<div class="ox-head"></div>' + floors.map(function (r) { return '<div class="ox-head">R̄ = ' + floorLabel(r) + "</div>"; }).join("");
    ceilings.forEach(function (a) {
      out += '<div class="ox-rowhead">' + ceilingLabel(a) + "</div>";
      floors.forEach(function (r) {
        var c = by[String(a) + "|" + String(r)];
        if (!c) { out += "<div></div>"; return; }
        var key = cellKey(c), on = key === selected, failed = c.state === "failed";
        var name = failed ? "failed" : (U.byId(d.states)[c.state] || {}).label || c.state;
        var label = ceilingLabel(a) + ", R̄ = " + floorLabel(r) + ": " + (failed ? "failed" : "state " + c.state + ", " + name +
          (c.nr ? ", not rankable" : "") + ", retained endowment " + U.num(c.Minf, 2) + " Gt");
        out += '<button type="button" id="cell-' + U.esc(tagId(tag) + key) + '" class="ox-cell' + (failed ? " is-failed" : "") + '"' +
          (failed ? "" : ' style="--c: var(' + STATE_SLOT[c.state] + ')"') + ' data-set="cell=' + U.esc(key) + '" aria-pressed="' + on +
          '" aria-label="' + U.esc(label) + '">' +
          '<span class="ox-cell-state">' + (failed ? "–" : c.state) + (c.nr ? '<b class="ox-badge">n.r.</b>' : "") + "</span>" +
          '<span class="ox-cell-name">' + U.esc(name) + "</span>" +
          '<span class="ox-cell-num">' + (failed ? "horizon " + c.T_reached + " of " + c.T_requested : "𝓜∞ " + U.num(c.Minf, 2)) + "</span></button>";
      });
    });
    return out + "</div></div>";
  }
  function tagId(tag) { return tag === "Compared with" ? "c-" : ""; }

  function detailHTML(c, states, head) {
    if (!c) return "";
    var rows = [["Cell", ceilingLabel(c.abar) + " ceiling; floor R̄ = " + floorLabel(c.Rbar) + " Gt a year"]];
    if (c.state === "failed") {
      rows.push(["Available state", "failed: the solve did not converge; its residual is " + (c.resid === null ? "–" : String(c.resid)) +
        " at a horizon of " + c.T_reached + " of " + c.T_requested + " periods"]);
    } else {
      rows.push(["Available state", c.state + ", " + ((states[c.state] || {}).label || "") + (c.nr ? " (n.r., not rankable)" : "")]);
      rows.push(["Retained endowment 𝓜∞", U.num(c.Minf, 2) + " Gt"]);
      rows.push(["Mean residence time 𝒯", U.num(c.residence, 1) + " years"]);
      rows.push(["Survival ratio 𝓜∞/(R̄𝒯)", survival(c)]);
      rows.push(["Gate fee below zero from", !c.gatefee ? "–" : c.gatefee.period === 0 ? "negative throughout"
        : "period " + c.gatefee.period + ", " + c.gatefee.year]);
      rows.push(["Horizon reached", c.T_reached + " of " + c.T_requested + " periods"]);
    }
    return '<dl class="ox-detail">' + (head ? '<div class="ox-detail-head">' + U.esc(head) + "</div>" : "") +
      rows.map(function (r) { return "<dt>" + U.esc(r[0]) + "</dt><dd>" + U.esc(r[1]) + "</dd>"; }).join("") + "</dl>";
  }

  // -- the experiments from 2025, the pairs and the sensitivities -------------------------------
  // A preference pair keeps its colour wherever pairs are compared; a column of the observed
  // baseline's sensitivities keeps its colour whether or not the reference is drawn.
  var PAIR_SLOT = { B: "--series-1", A: "--series-2", C: "--series-3" };
  var VARIANT_SLOT = { observed: "--series-1", revenue: "--series-2", rate: "--series-3", sequence: "--series-4" };
  var EXP_ROWS = { all: ["a", "b", "c", "d", "e", "f"], planner: ["a", "f"], single: ["b", "c", "d", "e"] };
  function rowsControl() {
    return { key: "rows", label: "Experiments", options: [U.option("all", "All six"),
      U.option("planner", "(a) and (f), the planner corner"), U.option("single", "(b) to (e), one change each")] };
  }
  function expRun(d, pair, year) {
    return d.runs.filter(function (r) { return r.pair === pair && r.year === Number(year); })[0] || null;
  }
  function expPairs(d) {
    return d.pairs.map(function (x) { return x.id; }).filter(function (k) { return expRun(d, k, d.horizons[0].year); });
  }
  function byRow(run) {
    var out = {};
    (run ? run.rows : []).forEach(function (r) { out[r.id] = r; });
    return out;
  }
  function expLabel(d, id) {
    var e = U.byId(d.experiments)[id];
    return id === "ref" ? e.label : "(" + id + ") " + e.label;
  }
  function expMeasure(d, id) {
    if (id === "ce") return { label: "Consumption equivalent", axis: "Consumption equivalent, % of consumption from 2025", fmt: function (v) { return U.g3(v); } };
    if (id === "fee") return { label: "Gate fee τᵂ", axis: "Gate fee τᵂ, dollars per tonne", fmt: function (v) { return U.g3(v); } };
    var r = U.byId(d.readings)[id];
    return r ? { label: r.label + " " + r.symbol, axis: r.label + " " + r.symbol + ", " + r.unit, fmt: function (v) { return U.num(v, r.decimals); } } : null;
  }
  // A colour of the palette at a lighter weight, as a fill the legend shows too (marker opacity it does not).
  function tint(hex, a) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
    return m ? "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16) + "," + a + ")" : hex;
  }
  function zeroLine(axis) {
    return axis === "x" ? { type: "line", yref: "paper", x0: 0, x1: 0, y0: 0, y1: 1, line: { color: U.css("--axis"), width: 1 } }
                        : { type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0, line: { color: U.css("--axis"), width: 1 } };
  }
  var SENS_Q = {
    Minf: { label: "The retained endowment 𝓜∞", axis: "Retained endowment 𝓜∞, Gt", fmt: function (v) { return U.num(v, 0); } },
    cumXi: { label: "The cumulative flow reaching the environment ΣΞ", axis: "Cumulative flow reaching the environment ΣΞ, Gt", fmt: function (v) { return U.num(v, 0); } },
    tauWT: { label: "The gate fee τᵂ at the horizon", axis: "Gate fee τᵂ at the horizon, dollars per tonne", fmt: function (v) { return U.num(v, 0); }, signed: true },
    survival: { label: "The survival ratio at R̄ = 23.8", axis: "Survival ratio 𝓜∞/(R̄𝒯) at R̄ = 23.8 Gt a year", fmt: function (v) { return U.num(v, 1); } },
    ce_recycling: { label: "The gain of recycling", axis: "Gain of recycling against a yield ceiling of 0.01, % of consumption", fmt: function (v) { return U.g3(v); } },
    ce_lf: { label: "The cost of laissez-faire (0,0,0,0)", axis: "Cost of laissez-faire (0,0,0,0), % of consumption", fmt: function (v) { return U.g3(v); } },
    ce_notax: { label: "The cost of the missing emission tax (1,1,0,1)", axis: "Cost of the missing emission tax (1,1,0,1), % of consumption", fmt: function (v) { return U.g3(v); } },
    cumXi_lf: { label: "ΣΞ under laissez-faire", axis: "Cumulative flow reaching the environment ΣΞ under laissez-faire, Gt", fmt: function (v) { return U.num(v, 0); } },
  };
  var INSTR = {
    tauP: { title: "The emission tax", observed: "Emission tax, observed", pigou: "Emission tax, Pigouvian", axis: "Emission tax, dollars per tonne of Ξ",
            note: "The Pigouvian emission tax is the planner's shadow price of pollution, pᴾ." },
    tauX: { title: "The discovery tax", observed: "Discovery tax, observed", pigou: "Discovery tax, Pigouvian", axis: "Discovery tax, dollars per tonne of D",
            note: "The Pigouvian discovery tax is minus the planner's shadow price of discovery; a negative observed discovery tax is a subsidy to exploration." },
    tauL: { title: "The landfill tax and the gate fee", observed: "Landfill tax, observed path", pigou: "Gate fee, Pigouvian", axis: "Landfill tax and gate fee, dollars per tonne of W",
            note: "The Pigouvian gate fee is the planner's pᵂ. The observed economy has no owner of the waste stock, and so no gate fee; it faces the landfill tax on W, whose path is the upper reading, drawn beside its lower bound and the rate check of 2021." },
  };
  // The first date of a negative gate fee as the tables print it: a fee negative from the base
  // year is "negative throughout", any other date "103 (2003)".
  function feeFrom(g) { return !g ? "–" : g.period === 0 ? "negative throughout" : g.period + " (" + g.year + ")"; }
  function sensTable(d, colLabel) {
    var spec = [["Damage coefficient κ, per Gt", "kappa", function (v) { return U.sci(v, 3); }],
                ["Long-run state", "state", function (v) { return v || "–"; }],
                ["Retained endowment 𝓜∞, Gt", "Minf", SENS_Q.Minf.fmt],
                ["Cumulative flow reaching the environment ΣΞ, Gt", "cumXi", SENS_Q.cumXi.fmt],
                ["Gate fee negative from", "gatefee", feeFrom],
                ["Gate fee τᵂ at the horizon, $/t", "tauWT", SENS_Q.tauWT.fmt],
                ["Survival ratio 𝓜∞/(R̄𝒯) at R̄ = 23.8 Gt a year", "survival", SENS_Q.survival.fmt],
                ["Gain of recycling against a yield ceiling of 0.01, %", "ce_recycling", SENS_Q.ce_recycling.fmt],
                ["Cost of laissez-faire (0,0,0,0), %", "ce_lf", SENS_Q.ce_lf.fmt],
                ["Cost of the missing emission tax (1,1,0,1), %", "ce_notax", SENS_Q.ce_notax.fmt],
                ["ΣΞ under laissez-faire, Gt", "cumXi_lf", SENS_Q.cumXi_lf.fmt],
                ["Horizon of the laissez-faire comparison, periods", "T_lf", function (v) { return String(v); }]];
    var cols = [""], csv = [];
    d.damages.forEach(function (g) { ["calibrated", "damages"].forEach(function (c) { cols.push("Pair " + g.pair + ", " + colLabel[c].toLowerCase()); }); });
    var rows = spec.map(function (s) {
      var row = [s[0]];
      d.damages.forEach(function (g) {
        ["calibrated", "damages"].forEach(function (c) {
          var v = g[c][s[1]];
          row.push(s[2](v));
          csv.push([g.pair, c, s[1], s[1] === "gatefee" ? (v ? v.year : null) : v]);
        });
      });
      return row;
    });
    return { table: { columns: cols, rows: rows },
             csv: { name: "sensitivity_damages.csv", columns: ["pair", "column", "quantity", "value"], rows: csv } };
  }
  function ceilingRows(c) {
    return [["Discovery ceiling X̄max, Gt", U.num(c.point.Xmax, 0), U.num(c.low.Xmax, 0)],
            ["Long-run state", c.point.state, c.low.state],
            ["Retained endowment 𝓜∞, Gt", U.num(c.point.Minf, 0), U.num(c.low.Minf, 0)],
            ["Gate fee negative from", feeFrom(c.point.gatefee), feeFrom(c.low.gatefee)],
            ["Cumulative extraction over the virgin budget N̄", U.num(c.point.cumN, 3), U.num(c.low.cumN, 3)],
            ["Cumulative leakage over the material budget 𝓑", U.num(c.point.leak, 3), U.num(c.low.leak, 3)],
            ["Horizon reached, periods", String(c.point.T_reached), String(c.low.T_reached)]];
  }
  function variantYears(v, sid) {
    return v.rows.filter(function (r) { return r.series === sid; }).map(function (r) { return r.year; });
  }
  function variantsTable(v) {
    var S = U.byId(v.series);
    var rows = v.rows.map(function (r) {
      var s = S[r.series], dec = r.year === 2025 && r.series !== "vw" ? 1 : s.decimals;
      return [s.label + " " + s.symbol + ", " + r.year + ", " + s.unit].concat(r.values.map(function (x) { return U.num(x, dec); }));
    });
    rows.push(["Retained endowment 𝓜∞ at 2300, Gt, and the long-run state"].concat(v.Minf.map(function (m, i) { return U.num(m, 0) + ", " + (v.state[i] || "–"); })));
    rows.push(["Consumption equivalent of the planner corner from 2025, welfare to 2300, %"].concat(v.ce_a.map(U.g3)));
    rows.push(["Consumption equivalent of the sequence against foresight, from 1900, %"].concat(v.ce_expost.map(function (x) { return x === null ? "–" : U.g3(x); })));
    var csv = v.rows.map(function (r) { return [r.series, r.year].concat(r.values); });
    csv.push(["Minf_Gt", 2300].concat(v.Minf));
    csv.push(["consumption_equivalent_planner_corner_from_2025_percent", 2025].concat(v.ce_a));
    csv.push(["consumption_equivalent_sequence_against_foresight_percent", 1900].concat(v.ce_expost));
    return { table: { columns: ["Pair B"].concat(v.columns.map(function (c) { return c.label; })), rows: rows },
             csv: { name: "observed_variants_B.csv", columns: ["series", "year"].concat(v.columns.map(function (c) { return c.id; })), rows: csv } };
  }

  window.FIGURES = F;
})();
