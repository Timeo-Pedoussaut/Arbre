/*
  Affichage de l'arbre : rendu, zoom, fiche détaillée, recherche, vue par branche, export PDF.
  Les données viennent de data.js ; les modifications faites via le formulaire (editor.js)
  sont gardées dans le navigateur (« brouillon ») jusqu'à ce qu'on les publie.
*/
(function () {
  "use strict";

  const CFG = Object.assign({ title: "L'arbre généalogique", hideLiving: true },
    typeof SITE_CONFIG !== "undefined" ? SITE_CONFIG : {});
  const DRAFT_KEY = "arbre-genealogique:brouillon:v1";
  const SVGNS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  document.title = CFG.title;
  $("site-title").textContent = CFG.title;

  // ==========================================================
  // 1. État + brouillon local
  // ==========================================================
  const BASE = { people: clone(PEOPLE), families: clone(FAMILIES) };

  function signature(obj) {
    const s = JSON.stringify(obj);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h + ":" + s.length;
  }
  const baseSig = signature(BASE);

  let state = clone(BASE);
  let dirty = false;   // des modifications locales existent
  let stale = false;   // ... faites sur une ancienne version de data.js

  (function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || !d.state || !d.state.people) return;
      if (signature(d.state) === baseSig) { localStorage.removeItem(DRAFT_KEY); return; } // déjà publié
      state = d.state;
      dirty = true;
      stale = d.sig !== baseSig;
    } catch (e) { /* stockage indisponible : on travaille sans brouillon */ }
  })();

  function saveDraft() {
    try {
      if (signature(state) === baseSig) { localStorage.removeItem(DRAFT_KEY); dirty = false; stale = false; return true; }
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ sig: baseSig, state, savedAt: Date.now() }));
      dirty = true; stale = false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function setState(next) {
    const before = state;
    state = next;
    if (!saveDraft()) {
      state = before;
      alert("Impossible d'enregistrer la modification dans ce navigateur (espace saturé ou stockage bloqué). Essayez avec une photo plus légère.");
      return false;
    }
    fillViewSelect();
    render();
    updateBanner();
    return true;
  }

  function resetDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* rien */ }
    state = clone(BASE); dirty = false; stale = false;
    fillViewSelect(); render(); updateBanner(); closePanel();
  }

  function updateBanner() {
    $("draft-banner").hidden = !dirty;
    if (!dirty) return;
    $("draft-text").textContent = stale
      ? "Ces modifications ont été faites sur une ancienne version de data.js. Elles ne sont visibles que dans ce navigateur : publiez-les ou effacez-les."
      : "Modifications non publiées : elles ne sont visibles que dans ce navigateur.";
  }

  // ==========================================================
  // 2. Outils d'affichage
  // ==========================================================
  const yearOf = TreeLayout.yearOf;

  function isUnknown(p) { return !p.given && !p.surname; }
  function displayName(p) {
    if (!p) return "?";
    const n = ((p.given || "") + " " + (p.surname || "")).trim();
    if (n) return n;
    return p.sex === "H" ? "Inconnu" : p.sex === "F" ? "Inconnue" : "Inconnu(e)";
  }
  function isDead(p) { return !!(p.dead || p.death); }
  function cardDates(p) {
    const by = yearOf(p.birth), dy = yearOf(p.death);
    if (isDead(p)) return by || dy ? (by || "?") + " – " + (dy || "†") : "†";
    return by ? String(by) : "";
  }
  function initial(p) { return ((p.given || p.surname || "?").trim().charAt(0) || "?").toUpperCase(); }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function photoImg(src, p, onClick) {
    const img = el("img");
    img.src = src; img.alt = ""; img.loading = "lazy";
    img.addEventListener("error", () => { img.replaceWith(document.createTextNode(initial(p))); });
    if (onClick) img.addEventListener("click", onClick);
    return img;
  }

  // ==========================================================
  // 3. Rendu de l'arbre
  // ==========================================================
  const viewport = $("viewport"), stage = $("stage"), canvas = $("canvas"), linesEl = $("lines"), cardsEl = $("cards");
  let idx = null, layout = null;
  let view = { mode: "all", pid: null };
  let zoom = 1;
  const ZMIN = 0.12, ZMAX = 1.6;

  function makeCard(c) {
    const p = state.people[c.id];
    const unknown = isUnknown(p);
    const d = el("div", "person" + (p.sex ? " sex-" + p.sex : "") + (unknown ? " is-unknown" : ""));
    d.dataset.id = c.id;
    if (c.focus) d.dataset.focus = "1";
    d.style.cssText = "left:" + c.x + "px;top:" + c.y + "px;width:" + c.w + "px;height:" + c.h + "px";
    d.tabIndex = 0;
    d.setAttribute("role", "button");
    const dates = cardDates(p);
    d.setAttribute("aria-label", displayName(p) + (dates ? ", " + dates : ""));

    if (p.photo && !unknown) {
      const av = el("span", "avatar");
      av.appendChild(photoImg(p.photo, p));
      d.appendChild(av);
    }
    const t = el("span", "p-text");
    t.appendChild(el("span", "p-given", unknown ? displayName(p) : (p.given || p.surname)));
    if (!unknown && p.given && p.surname) t.appendChild(el("span", "p-surname", p.surname));
    if (dates) t.appendChild(el("span", "p-dates", dates));
    d.appendChild(t);
    d.title = displayName(p);

    d.addEventListener("click", () => openPanel(c.id));
    d.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPanel(c.id); }
    });
    return d;
  }

  function svg(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
    return e;
  }

  function draw() {
    cardsEl.textContent = "";
    linesEl.textContent = "";
    const W = layout.width, H = layout.height;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    linesEl.setAttribute("width", W); linesEl.setAttribute("height", H);
    linesEl.setAttribute("viewBox", "0 0 " + W + " " + H);

    layout.edges.forEach((d) => linesEl.appendChild(svg("path", { d })));
    layout.links.forEach((l) => {
      linesEl.appendChild(svg("line", { class: "link", x1: l.x1, x2: l.x2, y1: l.y, y2: l.y, "stroke-width": 1.6, stroke: "currentColor" }));
      if (l.married) {
        const cx = (l.x1 + l.x2) / 2;
        linesEl.appendChild(svg("circle", { class: "ring", cx: cx - 2.8, cy: l.y, r: 4.6 }));
        linesEl.appendChild(svg("circle", { class: "ring", cx: cx + 2.8, cy: l.y, r: 4.6 }));
      }
    });
    layout.labels.forEach((t) => {
      const e = svg("text", { x: t.x, y: t.y, "text-anchor": t.anchor });
      e.textContent = t.text;
      linesEl.appendChild(e);
    });
    layout.cards.forEach((c) => cardsEl.appendChild(makeCard(c)));
    layout.stubs.forEach((s) => {
      const b = el("button", "stub", "Voir sa descendance");
      b.type = "button";
      b.style.left = s.x + "px"; b.style.top = s.y + "px";
      b.title = "Cette union est détaillée ailleurs dans la vue";
      b.addEventListener("click", () => { if (s.target) scrollToCard(s.target); });
      cardsEl.appendChild(b);
    });
    $("person-count").textContent =
      Object.keys(state.people).filter((id) => !isUnknown(state.people[id])).length + " personnes recensées";
  }

  function render() {
    idx = TreeLayout.buildIndex(state);
    if (view.mode === "branch" && !idx.people[view.pid]) view = { mode: "all", pid: null };
    layout = view.mode === "branch" ? TreeLayout.layoutBranch(idx, view.pid) : TreeLayout.layoutAll(idx);
    draw();
    applyZoom();
  }

  // ==========================================================
  // 4. Zoom et déplacement
  // ==========================================================
  function applyZoom() {
    canvas.style.transform = "scale(" + zoom + ")";
    stage.style.width = layout.width * zoom + "px";
    stage.style.height = layout.height * zoom + "px";
    $("zoom-level").textContent = Math.round(zoom * 100) + " %";
  }

  function setZoom(z, cx, cy) {
    z = Math.max(ZMIN, Math.min(ZMAX, z));
    if (cx == null) { cx = viewport.clientWidth / 2; cy = viewport.clientHeight / 2; }
    const wx = viewport.scrollLeft + cx - stage.offsetLeft, wy = viewport.scrollTop + cy;
    const k = z / zoom;
    zoom = z;
    applyZoom();
    viewport.scrollLeft = wx * k - cx + stage.offsetLeft;
    viewport.scrollTop = wy * k - cy;
  }

  function fitZoom() {
    return Math.min((viewport.clientWidth - 24) / layout.width, (viewport.clientHeight - 24) / layout.height);
  }

  function topCenterX() {
    const minY = Math.min.apply(null, layout.cards.map((c) => c.y));
    const top = layout.cards.filter((c) => c.y === minY);
    return top.reduce((s, c) => s + c.x + c.w / 2, 0) / top.length;
  }

  function initialView() {
    const fit = fitZoom();
    zoom = Math.max(ZMIN, fit >= 0.55 ? Math.min(fit, 1) : 0.62);
    applyZoom();
    viewport.scrollTop = 0;
    viewport.scrollLeft = Math.max(0, topCenterX() * zoom + stage.offsetLeft - viewport.clientWidth / 2);
  }

  $("zoom-in").addEventListener("click", () => setZoom(zoom * 1.2));
  $("zoom-out").addEventListener("click", () => setZoom(zoom / 1.2));
  $("zoom-fit").addEventListener("click", () => { setZoom(Math.max(ZMIN, Math.min(1, fitZoom()))); viewport.scrollLeft = 0; viewport.scrollTop = 0; });

  viewport.addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // glisser pour se déplacer (souris) ; au doigt, le défilement natif s'en charge
  (function panning() {
    let sx, sy, sl, st, active = false;
    viewport.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest(".person, .stub")) return;
      active = true; sx = e.clientX; sy = e.clientY; sl = viewport.scrollLeft; st = viewport.scrollTop;
      viewport.classList.add("panning");
      viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener("pointermove", (e) => {
      if (!active) return;
      viewport.scrollLeft = sl - (e.clientX - sx);
      viewport.scrollTop = st - (e.clientY - sy);
    });
    const stop = () => { active = false; viewport.classList.remove("panning"); };
    viewport.addEventListener("pointerup", stop);
    viewport.addEventListener("pointercancel", stop);
  })();

  function cardEls(id) { return Array.from(cardsEl.querySelectorAll('.person[data-id="' + id + '"]')); }

  function scrollToCard(id) {
    const els = cardEls(id);
    const target = els.find((e) => e.dataset.focus) || els[0];
    if (!target) return;
    const cx = (parseFloat(target.style.left) + parseFloat(target.style.width) / 2) * zoom + stage.offsetLeft;
    const cy = (parseFloat(target.style.top) + parseFloat(target.style.height) / 2) * zoom;
    viewport.scrollTo({ left: cx - viewport.clientWidth / 2, top: cy - viewport.clientHeight / 2, behavior: "smooth" });
    document.querySelectorAll(".person.highlight").forEach((n) => n.classList.remove("highlight"));
    void target.offsetWidth;
    target.classList.add("highlight");
  }

  // ==========================================================
  // 5. Fiche détaillée
  // ==========================================================
  const panel = $("panel"), panelOverlay = $("panel-overlay"), panelContent = $("panel-content");
  let currentId = null;

  function field(label, value, sub) {
    const div = el("div", "panel-field");
    div.appendChild(el("div", "f-label", label));
    const v = el("div", "f-value" + (value ? "" : " empty"), value || "À compléter");
    if (value && sub) v.appendChild(el("span", "f-sub", sub));
    div.appendChild(v);
    return div;
  }

  function chip(id) {
    const b = el("button", "rel-chip", displayName(state.people[id]));
    b.type = "button";
    b.addEventListener("click", () => showPerson(id));
    return b;
  }

  function chipsBlock(label, ids, empty) {
    const div = el("div", "panel-field");
    div.appendChild(el("div", "f-label", label));
    const v = el("div", "f-value" + (ids.length ? " panel-relatives" : " empty"));
    if (ids.length) ids.forEach((i) => v.appendChild(chip(i)));
    else v.textContent = empty;
    div.appendChild(v);
    return div;
  }

  function openLightbox(src) {
    $("lightbox-img").src = src;
    $("lightbox").showModal();
  }

  function marriageText(f) {
    const m = f.marriage || {};
    if (!f.married && !m.date && !m.place) return "";
    if (!m.date && !m.place) return "Mariés";
    const parts = [];
    if (m.date) parts.push(/^\d{1,2}(er)? /.test(m.date) ? "le " + m.date : /^\d{4}$/.test(m.date) ? "en " + m.date : m.date);
    if (m.place) parts.push("à " + m.place);
    return "Mariage" + (parts.length ? " " + parts.join(" ") : "");
  }

  function openPanel(id) {
    const p = state.people[id];
    if (!p) return;
    currentId = id;
    panelContent.textContent = "";

    const photo = el("div", "panel-photo");
    if (p.photo && !isUnknown(p)) photo.appendChild(photoImg(p.photo, p, () => openLightbox(p.photo)));
    else photo.textContent = isUnknown(p) ? "?" : initial(p);
    panelContent.appendChild(photo);

    panelContent.appendChild(el("h2", null, displayName(p)));
    const dates = cardDates(p);
    panelContent.appendChild(el("p", "panel-sub",
      (p.marriedName ? "Nom d'usage : " + p.marriedName + (dates ? " · " : "") : "") + (dates || (p.marriedName ? "" : "Dates inconnues"))));

    // actions
    const actions = el("div", "panel-actions");
    const act = (label, fn) => { const b = el("button", "btn", label); b.type = "button"; b.addEventListener("click", fn); actions.appendChild(b); };
    if (TreeLayout.hasKids(idx, id)) act("Voir sa branche", () => { closePanel(); showBranch(id); });
    act("Modifier la fiche", () => window.Editor && Editor.openForm({ mode: "edit", id }));
    act("+ Enfant", () => window.Editor && Editor.openForm({ mode: "add", relation: { type: "child", target: id } }));
    act("+ Conjoint(e)", () => window.Editor && Editor.openForm({ mode: "add", relation: { type: "spouse", target: id } }));
    const pf = idx.parentFam[id];
    if (!pf || !pf.husb || !pf.wife) act("+ Parent", () => window.Editor && Editor.openForm({ mode: "add", relation: { type: "parent", target: id } }));
    panelContent.appendChild(actions);

    const bMain = p.birth || (p.birthPlace ? "à " + p.birthPlace : "");
    const bSub = p.birth && p.birthPlace ? "à " + p.birthPlace : "";
    panelContent.appendChild(field("Naissance", bMain, bSub));

    if (isDead(p) || p.deathPlace) {
      const main = p.death || "Date inconnue";
      const subs = [p.deathPlace && "à " + p.deathPlace, p.deathCause && "Cause : " + p.deathCause].filter(Boolean).join(" · ");
      panelContent.appendChild(field("Décès", main, subs));
    }
    panelContent.appendChild(field("Métier", p.job));
    panelContent.appendChild(field("Anecdote", p.anecdote));
    if (p.note) panelContent.appendChild(field("Note", p.note));

    // famille
    const par = pf ? [pf.husb, pf.wife].filter((x) => x && state.people[x]) : [];
    panelContent.appendChild(chipsBlock("Parents", par, "Inconnus"));
    const sib = pf ? (pf.children || []).filter((c) => c !== id && state.people[c]) : [];
    if (sib.length) panelContent.appendChild(chipsBlock("Frères et sœurs", sib, ""));

    const unions = TreeLayout.sortedFams(idx, id);
    const ub = el("div", "panel-field");
    ub.appendChild(el("div", "f-label", unions.length > 1 ? "Unions et enfants" : "Union et enfants"));
    if (!unions.length) ub.appendChild(el("div", "f-value empty", "Aucune union connue"));
    unions.forEach((f) => {
      const line = el("div", "union-line");
      const sp = f.husb === id ? f.wife : f.husb;
      const spouseWrap = el("div", "f-value panel-relatives");
      if (sp && state.people[sp]) spouseWrap.appendChild(chip(sp));
      else spouseWrap.appendChild(el("span", "f-sub", "Conjoint(e) non renseigné(e)"));
      line.appendChild(spouseWrap);
      const mt = marriageText(f);
      if (mt) line.appendChild(el("span", "f-sub", mt));
      const kids = TreeLayout.sortedKids(idx, f);
      if (kids.length) {
        const row = el("div", "kids-row");
        row.appendChild(el("span", "f-sub", kids.length > 1 ? "Enfants :" : "Enfant :"));
        kids.forEach((k) => row.appendChild(chip(k)));
        line.appendChild(row);
      }
      ub.appendChild(line);
    });
    panelContent.appendChild(ub);

    // photos supplémentaires
    const extra = (p.photos || []).filter((x) => x !== p.photo);
    if (extra.length) {
      const g = el("div", "panel-field");
      g.appendChild(el("div", "f-label", "Photos et documents"));
      const grid = el("div", "gallery");
      extra.forEach((src) => {
        const t = el("button", "thumb"); t.type = "button";
        t.appendChild(photoImg(src, p));
        t.addEventListener("click", () => openLightbox(src));
        grid.appendChild(t);
      });
      g.appendChild(grid);
      panelContent.appendChild(g);
    }

    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    panelOverlay.classList.add("open");
    panel.scrollTop = 0;
    document.querySelectorAll(".person.highlight").forEach((n) => n.classList.remove("highlight"));
  }

  function closePanel() {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    panelOverlay.classList.remove("open");
    currentId = null;
  }

  $("panel-close").addEventListener("click", closePanel);
  panelOverlay.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("open") && !document.querySelector("dialog[open]")) closePanel(); });
  $("lightbox-close").addEventListener("click", () => $("lightbox").close());
  $("lightbox").addEventListener("click", (e) => { if (e.target === $("lightbox")) $("lightbox").close(); });

  function showPerson(id) {
    if (!cardEls(id).length) setView("all");
    openPanel(id);
    scrollToCard(id);
  }

  // ==========================================================
  // 6. Vue par branche
  // ==========================================================
  function fillViewSelect() {
    const sel = $("view-select");
    const ix = TreeLayout.buildIndex(state);
    const wanted = view.mode === "branch" ? view.pid : "all";
    sel.textContent = "";
    sel.appendChild(new Option("Tout l'arbre", "all"));
    const og = document.createElement("optgroup");
    og.label = "Branche de…";
    const list = ix.order
      .filter((id) => !isUnknown(state.people[id]) && TreeLayout.hasKids(ix, id))
      .map((id, i) => ({ id, i, y: yearOf(state.people[id].birth) }))
      .sort((a, b) => (a.y == null) - (b.y == null) || (a.y || 0) - (b.y || 0) || a.i - b.i);
    list.forEach(({ id }) => {
      const p = state.people[id], d = cardDates(p);
      og.appendChild(new Option(displayName(p) + (d ? " (" + d + ")" : ""), id));
    });
    sel.appendChild(og);
    sel.value = Array.from(sel.options).some((o) => o.value === wanted) ? wanted : "all";
  }

  function setView(v, opts) {
    view = v === "all" ? { mode: "all", pid: null } : { mode: "branch", pid: v };
    $("view-select").value = v === "all" ? "all" : v;
    render();
    initialView();
    if (!opts || !opts.keepHash) {
      try { history.replaceState(null, "", v === "all" ? location.pathname + location.search : "#branche=" + v); } catch (e) { /* file:// */ }
    }
  }
  function showBranch(id) { setView(id); }

  $("view-select").addEventListener("change", (e) => setView(e.target.value));

  // ==========================================================
  // 7. Recherche
  // ==========================================================
  const searchInput = $("search"), searchResults = $("search-results");
  function normalize(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

  function runSearch() {
    const q = normalize(searchInput.value.trim());
    searchResults.textContent = "";
    if (!q) { searchResults.classList.remove("open"); return; }
    const matches = Object.keys(state.people)
      .filter((id) => !isUnknown(state.people[id]))
      .filter((id) => {
        const p = state.people[id];
        return normalize(displayName(p) + " " + (p.marriedName || "")).includes(q);
      })
      .slice(0, 12);
    if (!matches.length) { searchResults.classList.remove("open"); return; }
    matches.forEach((id) => {
      const p = state.people[id];
      const item = el("button", "search-result-item", displayName(p));
      item.type = "button";
      const d = cardDates(p);
      if (d) item.appendChild(el("small", null, d));
      item.addEventListener("click", () => { showPerson(id); searchResults.classList.remove("open"); searchInput.value = ""; });
      searchResults.appendChild(item);
    });
    searchResults.classList.add("open");
  }
  searchInput.addEventListener("input", runSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = searchResults.querySelector(".search-result-item"); if (first) first.click(); }
    if (e.key === "Escape") { searchResults.classList.remove("open"); searchInput.blur(); }
  });
  document.addEventListener("click", (e) => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) searchResults.classList.remove("open");
  });

  // ==========================================================
  // 8. Export PDF (impression du navigateur, mise à l'échelle de la page)
  // ==========================================================
  const PAPER = { A4: [210, 297], A3: [297, 420] };
  const MM = 96 / 25.4;
  let printPrepared = false;

  function printGeometry(paper, orient, withTitle) {
    const [w, h] = PAPER[paper] || PAPER.A4;
    const landscape = orient === "auto" ? layout.width >= layout.height : orient === "landscape";
    const pw = landscape ? h : w, ph = landscape ? w : h;
    const availW = (pw - 20) * MM;
    const availH = (ph - 20 - (withTitle ? 12 : 0)) * MM;
    const scale = Math.min(availW / layout.width, availH / layout.height, 1);
    return { landscape, scale, size: paper + " " + (landscape ? "landscape" : "portrait") };
  }

  function viewLabel() {
    return view.mode === "branch" ? "Branche de " + displayName(state.people[view.pid]) : "Tout l'arbre";
  }

  function preparePrint(paper, orient, withTitle) {
    const g = printGeometry(paper, orient, withTitle);
    const root = document.documentElement.style;
    root.setProperty("--print-scale", g.scale);
    root.setProperty("--print-w", layout.width * g.scale + "px");
    root.setProperty("--print-h", layout.height * g.scale + "px");
    let st = $("page-style");
    if (!st) { st = document.createElement("style"); st.id = "page-style"; document.head.appendChild(st); }
    st.textContent = "@page{size:" + g.size + ";margin:10mm}";
    $("print-title").textContent = CFG.title + " · " + viewLabel();
    $("print-sub").textContent = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    $("print-header").classList.toggle("off", !withTitle);
    printPrepared = true;
  }

  function cleanupPrint() {
    printPrepared = false;
    const st = $("page-style"); if (st) st.remove();
    const root = document.documentElement.style;
    ["--print-scale", "--print-w", "--print-h"].forEach((k) => root.removeProperty(k));
  }

  window.addEventListener("beforeprint", () => { if (!printPrepared) preparePrint("A4", "auto", true); });
  window.addEventListener("afterprint", cleanupPrint);

  function updatePrintDialog() {
    const g = printGeometry($("print-paper").value, $("print-orient").value, $("print-title-on").checked);
    const w = $("print-warn");
    w.hidden = g.scale >= 0.42;
    w.textContent = "À cette taille le texte sera très petit (" + Math.round(g.scale * 100) + " %). " +
      ($("print-paper").value === "A3" ? "Choisissez plutôt une branche plus petite." : "Choisissez A3 ou une branche plus petite.");
  }

  $("btn-print").addEventListener("click", () => {
    $("print-what").textContent = "Vue exportée : " + viewLabel() + ".";
    updatePrintDialog();
    $("dlg-print").showModal();
  });
  ["print-paper", "print-orient", "print-title-on"].forEach((id) => $(id).addEventListener("change", updatePrintDialog));
  $("print-cancel").addEventListener("click", () => $("dlg-print").close());
  $("print-form").addEventListener("submit", () => {
    preparePrint($("print-paper").value, $("print-orient").value, $("print-title-on").checked);
    setTimeout(() => window.print(), 60);
  });

  // ==========================================================
  // 9. Bandeau brouillon + démarrage
  // ==========================================================
  $("btn-publish").addEventListener("click", () => window.Editor && Editor.openExport());
  $("btn-discard").addEventListener("click", () => {
    if (confirm("Effacer les modifications faites dans ce navigateur et revenir à la version de data.js ?\n\nÀ faire seulement si data.js est déjà publié à jour, ou si vous ne voulez pas les garder.")) resetDraft();
  });
  $("btn-add").addEventListener("click", () => window.Editor && Editor.openForm({ mode: "add" }));

  window.App = {
    config: CFG,
    getState: () => clone(state),
    getIndex: () => idx,
    setState, resetDraft, refresh: render,
    hasDraft: () => dirty,
    showPerson, showBranch, openPanel, closePanel,
    displayName, cardDates, isUnknown, isDead, yearOf,
  };

  fillViewSelect();
  (function start() {
    const m = /#branche=([^&]+)/.exec(location.hash);
    if (m && state.people[decodeURIComponent(m[1])]) view = { mode: "branch", pid: decodeURIComponent(m[1]) };
    fillViewSelect();
    render();
    initialView();
    updateBanner();
    window.addEventListener("resize", () => { /* le défilement natif suffit */ });
  })();
})();
