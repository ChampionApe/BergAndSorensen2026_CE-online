/* The figures of the online appendix: routes, one figure at a time with its selectors, the
 * table view and the CSV download, and the embedding in the appendix's pages. Everything is
 * drawn in the browser from writing/online/data/*.json, fetched when first needed; nothing is
 * solved here.
 *
 * Routes (also how a page of the appendix embeds a figure):
 *   #/                                 every figure
 *   #/figure/<id>?<choices>            one figure; its choices are its selectors
 *   ...&embed=1                        inside a page of the appendix: no top bar, and the
 *                                      figure tells the page how tall it is
 *   ...&theme=dark|light               the page's theme; the page also sends it as a message
 */
(function () {
  "use strict";
  var U = window.OXU, F = window.FIGURES;
  var main = document.getElementById("ox-main");
  var DATA = "../../data/";
  var store = {};
  var ui = { table: {}, path: null };

  function getJSON(name) {
    return store[name] || (store[name] = fetch(DATA + name + ".json").then(function (r) {
      if (!r.ok) throw new Error(name + ".json: " + r.status);
      return r.json();
    }));
  }

  // -- routes --------------------------------------------------------------------------------
  function route() {
    var h = (location.hash || "#/").slice(1), q = {}, path = h, k = h.indexOf("?");
    if (k >= 0) {
      path = h.slice(0, k);
      h.slice(k + 1).split("&").forEach(function (kv) {
        if (!kv) return;
        var p = kv.split("=");
        q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || "").replace(/\+/g, " "));
      });
    }
    return { parts: path.split("/").filter(Boolean), q: q };
  }
  function href(parts, q) {
    var s = "#/" + parts.join("/");
    var keys = Object.keys(q || {}).filter(function (k) { return q[k] !== undefined && q[k] !== null && q[k] !== ""; });
    if (keys.length) s += "?" + keys.map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(q[k]); }).join("&");
    return s;
  }
  function go(parts, q) {
    var target = href(parts, q);
    if (location.hash === target) render(); else location.hash = target;
  }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // -- the theme: the page around an embedded figure decides it --------------------------------
  function setTheme(t) {
    if (t !== "dark" && t !== "light") return false;
    if (document.documentElement.getAttribute("data-theme") === t) return false;
    document.documentElement.setAttribute("data-theme", t);
    return true;
  }
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent || !e.data || typeof e.data !== "object") return;
    if (setTheme(e.data.oxTheme)) render();
  });

  // -- one figure ----------------------------------------------------------------------------
  function controlsHTML(specs) {
    var box = el("div", { class: "ox-controls" });
    specs.forEach(function (c) {
      var lab = el("label", { for: "ctl-" + c.key }, U.esc(c.label));
      var sel = el("select", { id: "ctl-" + c.key, "data-key": c.key });
      var groups = {};
      c.options.forEach(function (o) {
        var opt = el("option", { value: o.value }, U.esc(o.label + (o.disabled ? " (no result)" : "")));
        if (o.disabled) opt.disabled = true;
        if (o.group) {
          if (!groups[o.group]) { groups[o.group] = el("optgroup", { label: o.group }); sel.appendChild(groups[o.group]); }
          groups[o.group].appendChild(opt);
        } else sel.appendChild(opt);
      });
      lab.appendChild(sel);
      box.appendChild(lab);
    });
    return box;
  }
  function tableHTML(t) {
    if (!t || !t.columns || !t.columns.length) return '<p class="ox-muted">No table for this figure.</p>';
    var isNum = function (v) { return /^[−\-+]?[\d.]+$|^∞$|^–$/.test(String(v)); };
    return '<table class="ox-table"><thead><tr>' + t.columns.map(function (c, j) {
      return '<th class="' + (j > 0 && t.rows.length && isNum(t.rows[0][j]) ? "num" : "") + '">' + U.esc(c) + "</th>";
    }).join("") + "</tr></thead><tbody>" + t.rows.map(function (r) {
      return "<tr>" + r.map(function (v, j) { return '<td class="' + (j > 0 && isNum(v) ? "num" : "") + '">' + U.esc(v) + "</td>"; }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
  }
  function download(csv) {
    var cell = function (v) {
      if (v === null || v === undefined) return "";
      var s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var text = [csv.columns.map(cell).join(",")].concat(csv.rows.map(function (r) { return r.map(cell).join(","); })).join("\n") + "\n";
    var a = el("a", { href: URL.createObjectURL(new Blob([text], { type: "text/csv" })), download: csv.name });
    document.body.appendChild(a); a.click(); a.remove();
  }

  function figureCard(id, data, q, embed) {
    var fig = F[id], p = fig.params(data, q), ctx = { data: data, p: p };
    var out;
    try { out = fig.draw(ctx); } catch (e) { out = { error: e.message }; }
    var title = fig.title(ctx);
    var card = el("section", { class: "ox-fig", id: "fig-" + id, "aria-label": title });
    var head = el("div", { class: "ox-fig-head" });
    head.appendChild(el("h2", {}, U.esc(title)));
    var tools = el("div", { class: "ox-fig-tools" });
    // A figure whose table is the point (a data page) opens with it shown.
    var shown = ui.table[id] !== undefined ? !!ui.table[id] : !!fig.tableOpen;
    var tableBtn = el("button", { type: "button", "aria-pressed": String(shown) }, shown ? "Hide table" : "Table");
    var csvBtn = el("button", { type: "button" }, "Download CSV");
    tools.appendChild(tableBtn);
    tools.appendChild(csvBtn);
    var own = Object.assign({}, p);
    tools.appendChild(embed
      ? el("a", { href: "index.html" + href(["figure", id], own), target: "_blank", rel: "noopener" }, "Open on its own")
      : el("a", { href: href(["figure", id], own), title: "This figure with these choices, as a link" }, "Link"));
    head.appendChild(tools);
    card.appendChild(head);
    if (!embed) card.appendChild(el("p", { class: "ox-fig-shows" }, U.esc(fig.shows)));
    var specs = fig.controls(ctx);
    var controls = controlsHTML(specs);
    Array.prototype.forEach.call(controls.querySelectorAll("select"), function (s) {
      s.value = p[s.getAttribute("data-key")] || "";
      s.addEventListener("change", function () {
        var change = {}; change[s.getAttribute("data-key")] = s.value;
        go(["figure", id], Object.assign({}, q, p, change));
      });
    });
    if (specs.length) card.appendChild(controls);
    var plot = el("div", { class: "ox-plot" });
    var note = el("p", { class: "ox-note" });
    var table = el("div", { class: "ox-table-wrap" });
    card.appendChild(plot);
    card.appendChild(note);
    card.appendChild(table);
    if (out.error) {
      plot.className = "ox-plot is-empty";
      plot.innerHTML = '<p class="ox-muted">This figure could not be drawn (' + U.esc(out.error) + ").</p>";
      note.setAttribute("hidden", "");
      table.setAttribute("hidden", "");
      return { card: card, draw: function () {} };
    }
    note.textContent = out.note || "";
    if (!out.note) note.setAttribute("hidden", "");
    if (shown) table.innerHTML = tableHTML(out.table); else table.setAttribute("hidden", "");
    tableBtn.addEventListener("click", function () {
      shown = !shown;
      ui.table[id] = shown;
      if (shown) { table.innerHTML = tableHTML(out.table); table.removeAttribute("hidden"); }
      else table.setAttribute("hidden", "");
      tableBtn.setAttribute("aria-pressed", String(shown));
      tableBtn.textContent = shown ? "Hide table" : "Table";
    });
    csvBtn.addEventListener("click", function () { download(out.csv || { name: id + ".csv", columns: out.table.columns, rows: out.table.rows }); });
    // A figure drawn as HTML sets a choice with data-set="key=value" on what the reader clicks.
    card.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-set]") : null;
      if (!t) return;
      var kv = t.getAttribute("data-set").split("="), change = {};
      change[kv[0]] = kv.slice(1).join("=");
      go(["figure", id], Object.assign({}, q, p, change));
    });
    var draw = function () {};
    if (out.html !== undefined) {
      plot.className = "ox-plot is-html";
      plot.innerHTML = out.html;
    } else if (!out.traces || !out.traces.length) {
      plot.className = "ox-plot is-empty";
      plot.innerHTML = '<p class="ox-muted">Nothing to draw for these choices.</p>';
    } else {
      plot.setAttribute("role", "img");
      plot.setAttribute("aria-label", title + ". The values are in the table.");
      if (typeof out.layout.height === "number") plot.style.height = out.layout.height + "px";
      draw = function () {
        window.Plotly.react(plot, out.traces, out.layout, {
          displaylogo: false, responsive: true,
          modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
          toImageButtonOptions: { filename: (out.csv && out.csv.name || id).replace(/\.csv$/, "") },
        });
      };
    }
    return { card: card, draw: draw };
  }

  // -- views ---------------------------------------------------------------------------------
  function viewFigure(id, q) {
    if (!F[id]) { main.innerHTML = "<p>No figure called " + U.esc(id) + '. <a href="#/">Every figure</a>.</p>'; return Promise.resolve(); }
    return getJSON(F[id].data).then(function (data) {
      var focus = document.activeElement && document.activeElement.id;
      var made = figureCard(id, data, q, !!q.embed);
      main.innerHTML = "";
      main.appendChild(made.card);
      made.draw();
      if (focus) {
        var f = document.getElementById(focus);
        if (f) f.focus({ preventScroll: true });
      }
    });
  }
  function viewHome() {
    main.innerHTML = "";
    main.appendChild(el("h1", {}, "Figures"));
    main.appendChild(el("p", { class: "ox-desc" }, "Every figure of the online appendix, drawn from precomputed results. Each has its selectors, a table view and a CSV download."));
    var cards = el("div", { class: "ox-cards" });
    Object.keys(F).forEach(function (id) {
      cards.appendChild(el("article", { class: "ox-card" }, "<h2>" + U.esc(F[id].name || id) + "</h2><p>" + U.esc(F[id].shows) +
        '</p><a href="' + href(["figure", id], {}) + '">Open</a>'));
    });
    main.appendChild(cards);
    return Promise.resolve();
  }

  function render() {
    var r = route(), p = r.parts, path = p.join("/");
    var samePage = path === ui.path;
    ui.path = path;
    document.body.classList.toggle("is-embed", !!r.q.embed);
    // Embedded, the frame is as tall as the figure, so the figure never scrolls inside it.
    document.documentElement.style.overflow = r.q.embed ? "hidden" : "";
    var y = window.scrollY;
    var job = p[0] === "figure" && p[1] ? viewFigure(p[1], r.q) : viewHome();
    Promise.resolve(job).then(function () {
      if (samePage) window.scrollTo(0, y); else window.scrollTo(0, 0);
    }).catch(function (e) {
      main.innerHTML = '<p>This view could not be loaded: ' + U.esc(e.message) + "</p>";
    });
  }

  // Embedded in a page of the appendix: tell the page how tall the figure is. Only a number is sent.
  if (window.parent !== window && window.ResizeObserver) {
    new ResizeObserver(function () {
      if (!document.body.classList.contains("is-embed")) return;
      var h = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.getBoundingClientRect().height)) + 2;
      window.parent.postMessage({ oxHeight: h }, "*");
    }).observe(document.body);
  }
  // The theme in the address is the page's at load; after that, the page's messages decide it.
  setTheme(route().q.theme);
  window.addEventListener("hashchange", render);
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
  render();
})();
