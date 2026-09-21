/*
  Affichage de l'arbre : rendu, zoom, mini-carte, fiche détaillée, recherche avancée,
  vues (tout / descendance / ascendance), thème sombre, export PDF.
  Les données viennent de data.js ; les modifications faites via le formulaire (editor.js)
  sont gardées dans le navigateur (« brouillon ») jusqu'à ce qu'on les publie.
*/
(function () {
  "use strict";

  const CFG = Object.assign({ title: "L'arbre généalogique", hideLiving: true },
    typeof SITE_CONFIG !== "undefined" ? SITE_CONFIG : {});
  const DRAFT_KEY = "arbre-genealogique:brouillon:v1";
  const PREF_KEY = "arbre-genealogique:prefs:v1";
  const THEME_KEY = "arbre-genealogique:theme";
  const SVGNS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  document.title = CFG.title;
  $("site-title").textContent = CFG.title;

  // ==========================================================
  // 1. État + brouillon local + préférences
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
  let dirty = false, stale = false;

  (function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || !d.state || !d.state.people) return;
      if (signature(d.state) === baseSig) { localStorage.removeItem(DRAFT_KEY); return; }
      state = d.state; dirty = true; stale = d.sig !== baseSig;
    } catch (e) { /* stockage indisponible */ }
  })();

  const prefs = (function () {
    try { return Object.assign({ dense: false, minimap: true }, JSON.parse(localStorage.getItem(PREF_KEY) || "{}")); }
    catch (e) { return { dense: false, minimap: true }; }
  })();
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* rien */ } }

  function saveDraft() {
    try {
      if (signature(state) === baseSig) { localStorage.removeItem(DRAFT_KEY); dirty = false; stale = false; return true; }
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ sig: baseSig, state, savedAt: Date.now() }));
      dirty = true; stale = false;
      return true;
    } catch (e) { return false; }
  }

  function setState(next) {
    const before = state;
    state = next;
    if (!saveDraft()) {
      state = before;
      alert("Impossible d'enregistrer la modification dans ce navigateur (espace saturé ou stockage bloqué). Essayez avec une photo plus légère.");
      return false;
    }
    fillPersonSelect();
    render();
    updateBanner();
    return true;
  }

  function resetDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* rien */ }
    state = clone(BASE); dirty = false; stale = false;
    fillPersonSelect(); render(); updateBanner(); closePanel();
  }

  function updateBanner() {
    $("draft-banner").hidden = !dirty;
    if (!dirty) return;
    $("draft-text").textContent = stale
      ? "Ces modifications ont été faites sur une ancienne version de data.js. Elles ne sont visibles que dans ce navigateur : publiez-les ou effacez-les."
      : "Modifications non publiées : elles ne sont visibles que dans ce navigateur.";
  }

  // ==========================================================
  // 2. Formatage : noms, dates précises, badges
  // ==========================================================
  const yearOf = TreeLayout.yearOf;
  const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  // "vers 12 mars 1900" -> { q: "vers", d: 12, m: 3, y: 1900 } ; null si le texte n'est pas une date reconnue
  function parseDate(text) {
    const t = (text || "").trim().toLowerCase();
    if (!t) return null;
    const m = new RegExp("^(vers|avant|après|apres)?\\s*(?:(\\d{1,2})(?:er)?\\s+)?(?:(" + MONTHS.join("|") + ")\\s+)?(\\d{3,4})$").exec(t);
    if (!m) return null;
    const d = m[2] ? +m[2] : 0, mo = m[3] ? MONTHS.indexOf(m[3]) + 1 : 0;
    if (d && !mo) return null;
    return { q: m[1] === "apres" ? "après" : m[1] || "", d, m: mo, y: +m[4] };
  }

  function formatDate(p) {
    if (!p || !p.y) return "";
    const parts = [];
    if (p.d) parts.push(p.d === 1 ? "1er" : String(p.d));
    if (p.m) parts.push(MONTHS[p.m - 1]);
    parts.push(String(p.y));
    return (p.q ? p.q + " " : "") + parts.join(" ");
  }

  // date compacte pour les cartes : 12/03/1900, 03/1900, 1900, ~1900 (vers)
  function shortDate(text) {
    const p = parseDate(text);
    if (!p) return (text || "").trim();
    const pre = p.q === "vers" ? "~" : p.q === "avant" ? "<" : p.q === "après" ? ">" : "";
    const two = (n) => (n < 10 ? "0" : "") + n;
    if (p.d && p.m) return pre + two(p.d) + "/" + two(p.m) + "/" + p.y;
    if (p.m) return pre + two(p.m) + "/" + p.y;
    return pre + p.y;
  }

  function isUnknown(p) { return !p.given && !p.surname; }
  function displayName(p) {
    if (!p) return "?";
    const n = ((p.given || "") + " " + (p.surname || "")).trim();
    if (n) return n;
    return p.sex === "H" ? "Inconnu" : p.sex === "F" ? "Inconnue" : "Inconnu(e)";
  }
  function isDead(p) { return !!(p.dead || p.death); }
  function isLiving(p) {
    const y = yearOf(p.birth);
    return !isDead(p) && y != null && new Date().getFullYear() - y < 105;
  }
  // années seules (recherche, listes)
  function cardDates(p) {
    const by = yearOf(p.birth), dy = yearOf(p.death);
    if (isDead(p)) return by || dy ? (by || "?") + " – " + (dy || "†") : "†";
    return by ? String(by) : "";
  }
  // dates précises (cartes détaillées)
  function preciseDates(p) {
    const b = shortDate(p.birth), d = shortDate(p.death);
    if (isDead(p)) return b || d ? (b || "?") + " – " + (d || "†") : "†";
    return b ? "° " + b : "";
  }
  function initial(p) { return ((p.given || p.surname || "?").trim().charAt(0) || "?").toUpperCase(); }
  const shortPlace = (s) => (s || "").split(",")[0].trim();
  const shortJob = (s) => (s || "").split(",")[0].replace(/\s*\(.*?\)/g, "").trim();

  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
    job: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>',
    dead: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M6.5 9h11"/></svg>',
    alive: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function badge(cls, icon, text, title) {
    const b = el("span", "badge " + cls);
    b.innerHTML = ICONS[icon];           // icônes constantes définies ci-dessus
    if (text) b.appendChild(el("span", null, text));
    if (title) b.title = title;
    return b;
  }

  function photoImg(src, p, onClick) {
    const img = el("img");
    img.src = src; img.alt = ""; img.loading = "lazy";
    img.addEventListener("error", () => { img.replaceWith(document.createTextNode(initial(p))); });
    if (onClick) img.addEventListener("click", onClick);
    return img;
  }

  // ==========================================================
  // 3. Thème clair / sombre
  // ==========================================================
  let layout = null;
  function currentTheme() { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }
  function applyTheme(t, save) {
    document.documentElement.dataset.theme = t;
    if (save) { try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* rien */ } }
    const b = $("btn-theme");
    b.innerHTML = t === "dark" ? ICONS.sun : ICONS.moon;
    b.setAttribute("aria-label", t === "dark" ? "Passer en mode clair" : "Passer en mode sombre");
    if (layout) drawMinimap();
  }
  $("btn-theme").addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark", true));

  // ==========================================================
  // 4. Rendu de l'arbre
  // ==========================================================
  const viewport = $("viewport"), stage = $("stage"), canvas = $("canvas"), linesEl = $("lines"), cardsEl = $("cards");
  let idx = null;
  let view = { mode: "all", pid: null };
  let zoom = 1;
  const ZMIN = 0.08, ZMAX = 1.6;

  const DIMS = {
    full: { cardW: 232, cardH: 104, vGap: 72 },
    dense: { cardW: 204, cardH: 76, vGap: 54 },
  };

  function marriageLabel(f) {
    const d = f.marriage && f.marriage.date;
    return d ? "m. " + shortDate(d) : "";
  }

  function makeCard(c) {
    const p = state.people[c.id];
    const unknown = isUnknown(p);
    const dense = prefs.dense;
    const hasPhoto = !!(p.photo && !unknown);
    const d = el("div", "person" + (p.sex ? " sex-" + p.sex : "") + (unknown ? " is-unknown" : "") + (dense ? " compact" : "") + (hasPhoto ? "" : " no-avatar"));
    d.dataset.id = c.id;
    d.style.cssText = "left:" + c.x + "px;top:" + c.y + "px;width:" + c.w + "px;height:" + c.h + "px";
    d.tabIndex = 0;
    d.setAttribute("role", "button");
    const dates = dense ? cardDates(p) : preciseDates(p);
    d.setAttribute("aria-label", displayName(p) + (dates ? ", " + dates : ""));

    if (hasPhoto) {
      const av = el("span", "avatar");
      av.appendChild(photoImg(p.photo, p));
      d.appendChild(av);
    }
    const t = el("span", "p-text");
    t.appendChild(el("span", "p-given", unknown ? displayName(p) : (p.given || p.surname)));
    if (!unknown && p.given && p.surname) t.appendChild(el("span", "p-surname", p.surname));
    if (dates) t.appendChild(el("span", "p-dates", dates));
    d.appendChild(t);

    if (!dense && !unknown) {
      const bar = el("span", "p-badges");
      if (isDead(p)) bar.appendChild(badge("b-status b-dead", "dead", "", p.sex === "F" ? "Décédée" : "Décédé"));
      else if (isLiving(p)) bar.appendChild(badge("b-status b-alive", "alive", "", p.sex === "F" ? "Vivante" : "Vivant"));
      if (p.birthPlace) bar.appendChild(badge("b-place", "pin", shortPlace(p.birthPlace), "Naissance : " + p.birthPlace));
      if (p.job) bar.appendChild(badge("b-job", "job", shortJob(p.job), "Métier : " + p.job));
      d.appendChild(bar);
    }
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
      linesEl.appendChild(svg("line", { class: "link", x1: l.x1, x2: l.x2, y1: l.y, y2: l.y }));
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
    $("person-count").textContent =
      Object.keys(state.people).filter((id) => !isUnknown(state.people[id])).length + " personnes recensées";
  }

  function render() {
    idx = TreeLayout.buildIndex(state);
    if (view.mode !== "all" && !idx.people[view.pid]) view = { mode: "all", pid: null };
    layout = TreeLayout.layoutView(idx, view, Object.assign({ marriageText: marriageLabel }, prefs.dense ? DIMS.dense : DIMS.full));
    draw();
    applyZoom();
    drawMinimap();
    applyHighlight();
  }

  // ==========================================================
  // 5. Zoom, déplacement, mini-carte
  // ==========================================================
  function applyZoom() {
    canvas.style.transform = "scale(" + zoom + ")";
    stage.style.width = layout.width * zoom + "px";
    stage.style.height = layout.height * zoom + "px";
    $("zoom-level").textContent = Math.round(zoom * 100) + " %";
    updateMinimapView();
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

  function initialView() {
    const fit = fitZoom();
    zoom = Math.max(ZMIN, fit >= 0.5 ? Math.min(fit, 1) : 0.6);
    applyZoom();
    viewport.scrollTop = 0;
    const minY = Math.min.apply(null, layout.cards.map((c) => c.y));
    const top = layout.cards.filter((c) => c.y === minY);
    const cx = top.reduce((s, c) => s + c.x + c.w / 2, 0) / top.length;
    viewport.scrollLeft = Math.max(0, cx * zoom + stage.offsetLeft - viewport.clientWidth / 2);
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

  (function panning() {
    let sx, sy, sl, st, active = false;
    viewport.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest(".person")) return;
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

  // --- mini-carte
  const mm = $("minimap"), mmCanvas = $("mm-canvas"), mmView = $("mm-view");
  let mmScale = 1, mmRaf = 0;
  let highlighted = null;   // Set des personnes correspondant à la recherche (ou null)

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawMinimap() {
    if (!layout) return;
    const small = window.innerWidth < 640;
    mmScale = Math.min((small ? 130 : 220) / layout.width, (small ? 90 : 150) / layout.height);
    const w = Math.max(24, Math.round(layout.width * mmScale)), h = Math.max(14, Math.round(layout.height * mmScale));
    const dpr = window.devicePixelRatio || 1;
    mmCanvas.width = w * dpr; mmCanvas.height = h * dpr;
    mmCanvas.style.width = w + "px"; mmCanvas.style.height = h + "px";
    const ctx = mmCanvas.getContext("2d");
    ctx.setTransform(dpr * mmScale, 0, 0, dpr * mmScale, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);
    ctx.strokeStyle = cssVar("--line"); ctx.lineWidth = 1.5 / mmScale;
    layout.edges.forEach((d) => ctx.stroke(new Path2D(d)));
    const hl = highlighted;
    layout.cards.forEach((c) => {
      const p = state.people[c.id];
      ctx.globalAlpha = hl && !hl.has(c.id) ? 0.25 : 1;
      ctx.fillStyle = hl && hl.has(c.id) ? cssVar("--accent") : p.sex === "H" ? cssVar("--brass") : p.sex === "F" ? cssVar("--wine") : cssVar("--ink-soft");
      ctx.fillRect(c.x, c.y, c.w, c.h);
    });
    ctx.globalAlpha = 1;
    updateMinimapView();
  }

  function updateMinimapView() {
    if (!layout) return;
    const overflow = layout.width * zoom > viewport.clientWidth + 2 || layout.height * zoom > viewport.clientHeight + 2;
    mm.hidden = !(prefs.minimap && overflow);
    if (mm.hidden) return;
    const vx = Math.max(0, (viewport.scrollLeft - stage.offsetLeft) / zoom), vy = Math.max(0, viewport.scrollTop / zoom);
    const vw = Math.min(layout.width, viewport.clientWidth / zoom), vh = Math.min(layout.height, viewport.clientHeight / zoom);
    mmView.style.left = 5 + vx * mmScale + "px"; mmView.style.top = 5 + vy * mmScale + "px";
    mmView.style.width = Math.max(6, Math.min(vw * mmScale, mmCanvas.clientWidth - vx * mmScale)) + "px";
    mmView.style.height = Math.max(6, Math.min(vh * mmScale, mmCanvas.clientHeight - vy * mmScale)) + "px";
  }
  const scheduleMinimap = () => { if (!mmRaf) mmRaf = requestAnimationFrame(() => { mmRaf = 0; updateMinimapView(); }); };
  viewport.addEventListener("scroll", scheduleMinimap, { passive: true });
  window.addEventListener("resize", () => { if (layout) drawMinimap(); });

  (function minimapPointer() {
    let down = false;
    const go = (e) => {
      const r = mmCanvas.getBoundingClientRect();
      const wx = (e.clientX - r.left) / mmScale, wy = (e.clientY - r.top) / mmScale;
      viewport.scrollLeft = wx * zoom + stage.offsetLeft - viewport.clientWidth / 2;
      viewport.scrollTop = wy * zoom - viewport.clientHeight / 2;
    };
    mm.addEventListener("pointerdown", (e) => { down = true; mm.setPointerCapture(e.pointerId); go(e); e.preventDefault(); });
    mm.addEventListener("pointermove", (e) => { if (down) go(e); });
    const up = () => { down = false; };
    mm.addEventListener("pointerup", up); mm.addEventListener("pointercancel", up);
  })();

  $("btn-minimap").addEventListener("click", () => {
    prefs.minimap = !prefs.minimap; savePrefs();
    $("btn-minimap").setAttribute("aria-pressed", String(prefs.minimap));
    updateMinimapView();
  });

  // --- densité des cartes
  function syncDensityBtn() {
    $("btn-density").textContent = prefs.dense ? "Cartes détaillées" : "Cartes compactes";
    $("btn-density").setAttribute("aria-pressed", String(prefs.dense));
  }
  $("btn-density").addEventListener("click", () => {
    prefs.dense = !prefs.dense; savePrefs(); syncDensityBtn();
    render(); initialView();
  });

  function cardEls(id) { return Array.from(cardsEl.querySelectorAll('.person[data-id="' + id + '"]')); }

  function scrollToCard(id) {
    const target = cardEls(id)[0];
    if (!target) return;
    const cx = (parseFloat(target.style.left) + parseFloat(target.style.width) / 2) * zoom + stage.offsetLeft;
    const cy = (parseFloat(target.style.top) + parseFloat(target.style.height) / 2) * zoom;
    viewport.scrollTo({ left: cx - viewport.clientWidth / 2, top: cy - viewport.clientHeight / 2, behavior: "smooth" });
    document.querySelectorAll(".person.highlight").forEach((n) => n.classList.remove("highlight"));
    void target.offsetWidth;
    target.classList.add("highlight");
  }

  // ==========================================================
  // 6. Fiche détaillée
  // ==========================================================
  const panel = $("panel"), panelOverlay = $("panel-overlay"), panelContent = $("panel-content");

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

  function openLightbox(src) { $("lightbox-img").src = src; $("lightbox").showModal(); }

  function marriageText(f) {
    const m = f.marriage || {};
    if (!f.married && !m.date && !m.place) return "";
    if (!m.date && !m.place) return "Mariés";
    const parts = [];
    if (m.date) parts.push(/^\d{1,2}(er)? /.test(m.date) ? "le " + m.date : /^\d{4}$/.test(m.date) ? "en " + m.date : m.date);
    if (m.place) parts.push("à " + m.place);
    return "Mariage " + parts.join(" ");
  }

  function openPanel(id) {
    const p = state.people[id];
    if (!p) return;
    panelContent.textContent = "";

    const photo = el("div", "panel-photo");
    if (p.photo && !isUnknown(p)) photo.appendChild(photoImg(p.photo, p, () => openLightbox(p.photo)));
    else photo.textContent = isUnknown(p) ? "?" : initial(p);
    panelContent.appendChild(photo);

    panelContent.appendChild(el("h2", null, displayName(p)));
    const dates = cardDates(p);
    panelContent.appendChild(el("p", "panel-sub",
      (p.marriedName ? "Nom d'usage : " + p.marriedName + (dates ? " · " : "") : "") + (dates || (p.marriedName ? "" : "Dates inconnues"))));

    const actions = el("div", "panel-actions");
    const act = (label, fn) => { const b = el("button", "btn", label); b.type = "button"; b.addEventListener("click", fn); actions.appendChild(b); };
    const pf = idx.parentFam[id];
    if (TreeLayout.hasKids(idx, id)) act("Sa descendance", () => { closePanel(); setView({ mode: "desc", pid: id }); });
    if (pf) act("Ses ancêtres", () => { closePanel(); setView({ mode: "anc", pid: id }); });
    act("Modifier la fiche", () => window.Editor && Editor.openForm({ mode: "edit", id }));
    act("+ Enfant", () => window.Editor && Editor.openForm({ mode: "add", relation: { type: "child", target: id } }));
    act("+ Conjoint(e)", () => window.Editor && Editor.openForm({ mode: "add", relation: { type: "spouse", target: id } }));
    if (!pf || !pf.husb || !pf.wife) act("+ Parent", () => window.Editor && Editor.openForm({ mode: "add", relation: { type: "parent", target: id } }));
    panelContent.appendChild(actions);

    const bMain = p.birth || (p.birthPlace ? "à " + p.birthPlace : "");
    const bSub = p.birth && p.birthPlace ? "à " + p.birthPlace : "";
    panelContent.appendChild(field("Naissance", bMain, bSub));
    if (isDead(p) || p.deathPlace) {
      const subs = [p.deathPlace && "à " + p.deathPlace, p.deathCause && "Cause : " + p.deathCause].filter(Boolean).join(" · ");
      panelContent.appendChild(field("Décès", p.death || "Date inconnue", subs));
    }
    panelContent.appendChild(field("Métier", p.job));
    panelContent.appendChild(field("Anecdote", p.anecdote));
    if (p.note) panelContent.appendChild(field("Note", p.note));

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
  }

  function closePanel() {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    panelOverlay.classList.remove("open");
  }

  $("panel-close").addEventListener("click", closePanel);
  panelOverlay.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("open") && !document.querySelector("dialog[open]")) closePanel(); });
  $("lightbox-close").addEventListener("click", () => $("lightbox").close());
  $("lightbox").addEventListener("click", (e) => { if (e.target === $("lightbox")) $("lightbox").close(); });

  function showPerson(id) {
    if (!cardEls(id).length) setView({ mode: "all", pid: null });
    openPanel(id);
    scrollToCard(id);
  }

  // ==========================================================
  // 7. Vues : tout l'arbre / descendance / ascendance / les deux
  // ==========================================================
  const MODE_LABEL = { desc: "Descendance de ", anc: "Ascendance de ", hour: "Ascendance et descendance de " };

  function fillPersonSelect() {
    const sel = $("view-person");
    const mode = $("view-mode").value;
    const ix = TreeLayout.buildIndex(state);
    const keep = view.pid || sel.value;
    sel.textContent = "";
    const list = ix.order
      .filter((id) => !isUnknown(state.people[id]))
      .filter((id) => mode === "desc" ? TreeLayout.hasKids(ix, id) : mode === "anc" ? !!ix.parentFam[id] : true)
      .map((id, i) => ({ id, i, y: yearOf(state.people[id].birth) }))
      .sort((a, b) => (a.y == null) - (b.y == null) || (a.y || 0) - (b.y || 0) || a.i - b.i);
    list.forEach(({ id }) => {
      const p = state.people[id], d = cardDates(p);
      sel.appendChild(new Option(displayName(p) + (d ? " (" + d + ")" : ""), id));
    });
    if (Array.from(sel.options).some((o) => o.value === keep)) sel.value = keep;
  }

  function syncViewControls() {
    $("view-mode").value = view.mode;
    $("view-person-wrap").hidden = view.mode === "all";
    if (view.mode !== "all") { fillPersonSelect(); $("view-person").value = view.pid; }
  }

  function setView(v, opts) {
    view = v.mode === "all" ? { mode: "all", pid: null } : { mode: v.mode, pid: v.pid };
    syncViewControls();
    render();
    initialView();
    if (!opts || !opts.keepHash) {
      try { history.replaceState(null, "", view.mode === "all" ? location.pathname + location.search : "#vue=" + view.mode + ":" + view.pid); } catch (e) { /* file:// */ }
    }
  }

  $("view-mode").addEventListener("change", (e) => {
    const mode = e.target.value;
    if (mode === "all") { setView({ mode: "all" }); return; }
    $("view-person-wrap").hidden = false;
    fillPersonSelect();
    const sel = $("view-person");
    if (!sel.value && sel.options.length) sel.value = sel.options[0].value;
    setView({ mode, pid: sel.value });
  });
  $("view-person").addEventListener("change", (e) => setView({ mode: $("view-mode").value, pid: e.target.value }));

  // ==========================================================
  // 8. Recherche avancée + filtres
  // ==========================================================
  const searchInput = $("search"), drop = $("search-drop"), results = $("search-results"), filtersEl = $("filters");
  const FIELDS = { name: "f-name", job: "f-job", place: "f-place", bfrom: "f-bfrom", bto: "f-bto", dfrom: "f-dfrom", dto: "f-dto", status: "f-status", sex: "f-sex" };

  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tokens = (s) => norm(s).split(/[\s,;]+/).filter(Boolean);

  function readFilters() {
    const f = { q: searchInput.value };
    Object.keys(FIELDS).forEach((k) => { f[k] = $(FIELDS[k]).value.trim(); });
    return f;
  }
  function hasCriteria(f) { return Object.keys(f).some((k) => f[k].trim() !== ""); }

  function haystack(id) {
    const p = state.people[id];
    const places = [p.birthPlace, p.deathPlace];
    (idx.famsOf[id] || []).forEach((f) => { if (f.marriage && f.marriage.place) places.push(f.marriage.place); });
    return {
      name: norm([p.given, p.surname, p.marriedName].join(" ")),
      job: norm(p.job), places: norm(places.filter(Boolean).join(" | ")),
      dates: norm((p.birth || "") + " " + (p.death || "")),
      notes: norm([p.anecdote, p.note, p.deathCause].join(" ")),
      by: yearOf(p.birth), dy: yearOf(p.death),
    };
  }

  function matchPerson(id, f) {
    const p = state.people[id];
    if (isUnknown(p)) return null;
    const h = haystack(id), why = [];
    if (f.sex && p.sex !== f.sex) return null;
    if (f.status === "dead" && !isDead(p)) return null;
    if (f.status === "alive" && !isLiving(p)) return null;
    const inRange = (y, a, b) => (a === "" && b === "") || (y != null && (a === "" || y >= +a) && (b === "" || y <= +b));
    if (!inRange(h.by, f.bfrom, f.bto) || !inRange(h.dy, f.dfrom, f.dto)) return null;
    if (f.bfrom !== "" || f.bto !== "") why.push("Naissance " + h.by);
    if (f.dfrom !== "" || f.dto !== "") why.push("Décès " + h.dy);
    if (f.name && !tokens(f.name).every((t) => h.name.includes(t))) return null;
    if (f.job) { if (!tokens(f.job).every((t) => h.job.includes(t))) return null; why.push("Métier : " + shortJob(p.job)); }
    if (f.place) { if (!tokens(f.place).every((t) => h.places.includes(t))) return null; why.push("Lieu"); }
    for (const t of tokens(f.q)) {
      if (h.name.includes(t)) continue;
      if (h.job.includes(t)) why.push("Métier : " + shortJob(p.job));
      else if (h.places.includes(t)) why.push("Lieu");
      else if (/^\d{4}$/.test(t) && (h.by === +t || h.dy === +t)) why.push((h.by === +t ? "Naissance " : "Décès ") + t);
      else if (h.dates.includes(t)) why.push("Date");
      else if (h.notes.includes(t)) why.push("Notes");
      else return null;
    }
    return { id, why: why.filter((w, i) => why.indexOf(w) === i) };
  }

  function applyHighlight() {
    cardsEl.querySelectorAll(".person").forEach((c) => {
      c.classList.toggle("dim", !!highlighted && !highlighted.has(c.dataset.id));
      c.classList.toggle("match", !!highlighted && highlighted.has(c.dataset.id));
    });
    const chip = $("search-chip");
    chip.hidden = !highlighted;
    if (highlighted) {
      const n = highlighted.size;
      $("search-chip-text").textContent = n + " personne" + (n > 1 ? "s" : "") + " correspond" + (n > 1 ? "ent" : "") + " à la recherche (surlignée" + (n > 1 ? "s" : "") + " dans l'arbre).";
    }
  }

  function runSearch() {
    const f = readFilters();
    const filtersOpen = !filtersEl.hidden;
    results.textContent = "";
    if (!hasCriteria(f)) {
      highlighted = null;
      drop.classList.toggle("open", filtersOpen);
    } else {
      const found = Object.keys(state.people).map((id) => matchPerson(id, f)).filter(Boolean)
        .sort((a, b) => displayName(state.people[a.id]).localeCompare(displayName(state.people[b.id]), "fr"));
      highlighted = new Set(found.map((r) => r.id));
      results.appendChild(el("div", found.length ? "search-count" : "search-empty",
        found.length ? found.length + " résultat" + (found.length > 1 ? "s" : "") + (found.length > 12 ? " (12 premiers affichés)" : "") : "Aucune personne ne correspond."));
      found.slice(0, 12).forEach(({ id, why }) => {
        const p = state.people[id];
        const item = el("button", "search-result-item", displayName(p));
        item.type = "button";
        const d = cardDates(p);
        if (d) item.appendChild(el("small", null, d));
        if (why.length) { const w = el("span", "why"); why.forEach((t) => w.appendChild(el("em", null, t))); item.appendChild(w); }
        item.addEventListener("click", () => { showPerson(id); drop.classList.remove("open"); });
        results.appendChild(item);
      });
      drop.classList.add("open");
    }
    applyHighlight();
    drawMinimap();
  }

  function clearSearch() {
    searchInput.value = "";
    Object.keys(FIELDS).forEach((k) => { $(FIELDS[k]).value = ""; });
    runSearch();
  }

  searchInput.addEventListener("input", runSearch);
  Object.keys(FIELDS).forEach((k) => { $(FIELDS[k]).addEventListener("input", runSearch); $(FIELDS[k]).addEventListener("change", runSearch); });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = results.querySelector(".search-result-item"); if (first) first.click(); }
    if (e.key === "Escape") { drop.classList.remove("open"); searchInput.blur(); }
  });
  $("btn-filters").addEventListener("click", () => {
    filtersEl.hidden = !filtersEl.hidden;
    $("btn-filters").setAttribute("aria-expanded", String(!filtersEl.hidden));
    runSearch();
    if (!filtersEl.hidden) drop.classList.add("open");
  });
  $("f-reset").addEventListener("click", clearSearch);
  $("search-clear").addEventListener("click", clearSearch);
  document.addEventListener("click", (e) => { if (!e.target.closest(".search-wrap")) drop.classList.remove("open"); });
  searchInput.addEventListener("focus", () => { if (hasCriteria(readFilters()) || !filtersEl.hidden) drop.classList.add("open"); });

  // ==========================================================
  // 9. Export PDF (impression du navigateur, mise à l'échelle de la page)
  // ==========================================================
  const PAPER = { A4: [210, 297], A3: [297, 420] };
  const MM = 96 / 25.4;
  let printPrepared = false, themeBeforePrint = null;

  function printGeometry(paper, orient, withTitle) {
    const [w, h] = PAPER[paper] || PAPER.A4;
    const landscape = orient === "auto" ? layout.width >= layout.height : orient === "landscape";
    const pw = landscape ? h : w, ph = landscape ? w : h;
    const scale = Math.min((pw - 20) * MM / layout.width, (ph - 20 - (withTitle ? 12 : 0)) * MM / layout.height, 1);
    return { landscape, scale, size: paper + " " + (landscape ? "landscape" : "portrait") };
  }

  function viewLabel() {
    return view.mode === "all" ? "Tout l'arbre" : MODE_LABEL[view.mode] + displayName(state.people[view.pid]);
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
    if (themeBeforePrint === null) themeBeforePrint = currentTheme();
    document.documentElement.dataset.theme = "light";   // un PDF s'imprime toujours en clair
    printPrepared = true;
  }

  function cleanupPrint() {
    printPrepared = false;
    const st = $("page-style"); if (st) st.remove();
    const root = document.documentElement.style;
    ["--print-scale", "--print-w", "--print-h"].forEach((k) => root.removeProperty(k));
    if (themeBeforePrint !== null) { document.documentElement.dataset.theme = themeBeforePrint; themeBeforePrint = null; }
  }

  window.addEventListener("beforeprint", () => { if (!printPrepared) preparePrint("A4", "auto", true); });
  window.addEventListener("afterprint", cleanupPrint);

  function updatePrintDialog() {
    const g = printGeometry($("print-paper").value, $("print-orient").value, $("print-title-on").checked);
    const w = $("print-warn");
    w.hidden = g.scale >= 0.42;
    w.textContent = "À cette taille le texte sera très petit (" + Math.round(g.scale * 100) + " %). " +
      ($("print-paper").value === "A3" ? "Choisissez plutôt une vue plus petite (descendance ou ascendance d'une personne)." : "Choisissez A3 ou une vue plus petite.");
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
  // 10. Bandeau brouillon + démarrage
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
    showPerson, setView, openPanel, closePanel,
    displayName, cardDates, isUnknown, isDead, yearOf, parseDate, formatDate, shortDate, MONTHS,
  };

  (function start() {
    applyTheme(currentTheme(), false);
    syncDensityBtn();
    $("btn-minimap").setAttribute("aria-pressed", String(prefs.minimap));
    const h = location.hash;
    let m = /#vue=(desc|anc|hour):([^&]+)/.exec(h);
    if (m && state.people[decodeURIComponent(m[2])]) view = { mode: m[1], pid: decodeURIComponent(m[2]) };
    else if ((m = /#branche=([^&]+)/.exec(h)) && state.people[decodeURIComponent(m[1])]) view = { mode: "desc", pid: decodeURIComponent(m[1]) };
    fillPersonSelect();
    syncViewControls();
    render();
    initialView();
    updateBanner();
  })();
})();
