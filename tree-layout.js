/*
  Calcul de la mise en page de l'arbre (aucun accès au DOM : ce fichier ne fait que des calculs).

  Principe : on part d'une personne, on affiche sa ou ses unions sur une même rangée
  (conjoint 1 · la personne · conjoint 2), puis les enfants de chaque union en dessous,
  chacun avec sa propre rangée d'union, et ainsi de suite.
  Chaque famille n'est déroulée qu'une seule fois : si elle apparaît une 2e fois dans la
  vue, on affiche à la place un petit lien « Voir sa descendance ».
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TreeLayout = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULTS = {
    cardW: 208,      // largeur d'une carte
    cardH: 84,       // hauteur d'une carte
    linkW: 24,       // espace entre deux conjoints
    hGap: 22,        // espace horizontal entre deux frères et sœurs
    groupGap: 44,    // espace entre les enfants de deux unions différentes
    vGap: 68,        // espace vertical entre deux générations
    busStep: 9,      // décalage des traits quand une personne a deux unions avec enfants
    rootGap: 90,     // espace entre deux arbres empilés
    margin: 36,
  };

  function yearOf(s) {
    const m = /(\d{4})/.exec(s || "");
    return m ? +m[1] : null;
  }

  // ------------------------------------------------------------------ index
  function buildIndex(state) {
    const people = state.people || {};
    const families = state.families || [];
    const famsOf = {};   // personne -> familles où elle est conjointe
    const parentFam = {}; // personne -> famille dont elle est enfant
    families.forEach((f) => {
      [f.husb, f.wife].forEach((pid) => {
        if (pid && people[pid]) (famsOf[pid] = famsOf[pid] || []).push(f);
      });
      (f.children || []).forEach((c) => {
        if (people[c] && !parentFam[c]) parentFam[c] = f;
      });
    });
    return { people, families, famsOf, parentFam, order: Object.keys(people) };
  }

  function birthYear(idx, pid) {
    const p = idx.people[pid];
    return p ? yearOf(p.birth) : null;
  }

  function famKey(idx, f) {
    const ys = [];
    const my = f.marriage ? yearOf(f.marriage.date) : null;
    if (my) ys.push(my);
    (f.children || []).forEach((c) => { const y = birthYear(idx, c); if (y) ys.push(y); });
    return ys.length ? Math.min.apply(null, ys) : Infinity;
  }

  function stableSort(list, keyFn) {
    return list
      .map((v, i) => ({ v, i, k: keyFn(v) }))
      .sort((a, b) => (a.k !== b.k ? (a.k < b.k ? -1 : 1) : a.i - b.i))
      .map((x) => x.v);
  }

  function sortedFams(idx, pid) {
    return stableSort(idx.famsOf[pid] || [], (f) => famKey(idx, f));
  }

  function sortedKids(idx, fam) {
    const kids = (fam.children || []).filter((c) => idx.people[c]);
    return stableSort(kids, (c) => { const y = birthYear(idx, c); return y == null ? Infinity : y; });
  }

  function hasKids(idx, pid) {
    return (idx.famsOf[pid] || []).some((f) => (f.children || []).some((c) => idx.people[c]));
  }

  function countDesc(idx, pid, seen) {
    seen = seen || new Set();
    if (seen.has(pid)) return 0;
    seen.add(pid);
    let n = 0;
    (idx.famsOf[pid] || []).forEach((f) => (f.children || []).forEach((c) => {
      if (idx.people[c] && !seen.has(c)) n += 1 + countDesc(idx, c, seen);
    }));
    return n;
  }

  // ------------------------------------------------------------------ une « unité » = une personne + ses unions + sa descendance
  function layoutUnit(idx, pid, ctx, o, trail) {
    trail = new Set(trail); trail.add(pid);

    const infos = sortedFams(idx, pid).map((f) => ({
      fam: f,
      spouse: (f.husb === pid ? f.wife : f.husb) || null,
      link: null,        // indice de la carte de gauche du lien conjugal (le lien va de link à link+1)
      anchorCard: null,  // à défaut de lien : carte sous laquelle partent les enfants
      stub: false,
      kids: [],
    }));
    infos.forEach((inf) => { if (inf.spouse && !idx.people[inf.spouse]) inf.spouse = null; });

    // --- la rangée de cartes
    const cards = [];
    let focusIdx = 0;
    if (infos.length <= 1) {
      const inf = infos[0];
      if (inf && inf.spouse) {
        if (inf.fam.husb === pid) { cards.push(pid, inf.spouse); focusIdx = 0; }
        else { cards.push(inf.spouse, pid); focusIdx = 1; }
        inf.link = 0;
      } else cards.push(pid);
    } else {
      if (infos[0].spouse) { cards.push(infos[0].spouse); infos[0].link = 0; }
      focusIdx = cards.length;
      cards.push(pid);
      for (let k = 1; k < infos.length; k++) {
        const sp = infos[k].spouse;
        if (!sp) continue;
        cards.push(sp);
        if (k === 1) infos[k].link = focusIdx;
        else infos[k].anchorCard = cards.length - 1;
      }
    }
    infos.forEach((inf) => { if (inf.link === null && inf.anchorCard === null) inf.anchorCard = focusIdx; });
    cards.forEach((id) => ctx.cardShown.add(id));
    infos.forEach((inf) => ctx.famShown.add(inf.fam.id));

    // --- les enfants
    let cursor = 0;
    const kidsAll = [];
    infos.forEach((inf) => {
      const kids = sortedKids(idx, inf.fam);
      if (!kids.length) return;
      if (ctx.expanded.has(inf.fam.id)) { inf.stub = true; return; }
      ctx.expanded.add(inf.fam.id);
      kids.filter((k) => !trail.has(k)).forEach((k, i) => {
        const unit = layoutUnit(idx, k, ctx, o, trail);
        if (kidsAll.length) cursor += i === 0 ? o.groupGap : o.hGap;
        const kd = { unit, dx: cursor, pid: k };
        cursor += unit.width;
        kidsAll.push(kd);
        inf.kids.push(kd);
      });
    });
    const kidsW = cursor;

    // --- la rangée est centrée au-dessus de ses enfants
    const rowW = cards.length * o.cardW + (cards.length - 1) * o.linkW;
    let rowX = 0, minX = 0, maxX = rowW;
    if (kidsAll.length) {
      const a = kidsAll[0].dx + kidsAll[0].unit.focusX;
      const b = kidsAll[kidsAll.length - 1].dx + kidsAll[kidsAll.length - 1].unit.focusX;
      rowX = (a + b) / 2 - rowW / 2;
      minX = Math.min(0, rowX);
      maxX = Math.max(kidsW, rowX + rowW);
    }
    const shift = -minX;
    kidsAll.forEach((kd) => { kd.dx += shift; });
    rowX += shift;

    return {
      pid, cards, focusIdx, infos, rowW, rowX,
      width: maxX - minX,
      focusX: rowX + focusIdx * (o.cardW + o.linkW) + o.cardW / 2,
    };
  }

  function place(u, x, y, o, out) {
    const step = o.cardW + o.linkW;
    u.cards.forEach((id, i) => {
      out.cards.push({ id, x: x + u.rowX + i * step, y, w: o.cardW, h: o.cardH, focus: i === u.focusIdx });
    });
    out.maxY = Math.max(out.maxY, y + o.cardH);

    const midY = y + o.cardH / 2;
    const childTop = y + o.cardH + o.vGap;
    const nbWithKids = u.infos.filter((i) => i.kids.length).length;
    let rank = 0;

    u.infos.forEach((inf) => {
      let ax, ay;
      if (inf.link !== null) {
        const left = x + u.rowX + inf.link * step + o.cardW;
        ax = left + o.linkW / 2; ay = midY;
        out.links.push({ x1: left, x2: left + o.linkW, y: midY, married: !!inf.fam.married });
      } else {
        ax = x + u.rowX + inf.anchorCard * step + o.cardW / 2; ay = y + o.cardH;
      }

      const hasKids = inf.kids.length > 0;
      const year = inf.fam.marriage ? yearOf(inf.fam.marriage.date) : null;
      if (year) {
        out.labels.push({ x: hasKids ? ax + 7 : ax, y: y + o.cardH + 16, text: "m. " + year, anchor: hasKids ? "start" : "middle" });
      }
      if (inf.stub) {
        const target = sortedKids({ people: out.people }, inf.fam)[0];
        out.stubs.push({ x: ax, y: y + o.cardH + 24, fid: inf.fam.id, target });
      }
      if (hasKids) {
        const busY = y + o.cardH + o.vGap * 0.5 + (nbWithKids > 1 ? rank * o.busStep : 0);
        rank++;
        const xs = inf.kids.map((k) => x + k.dx + k.unit.focusX);
        const minx = Math.min(ax, Math.min.apply(null, xs)), maxx = Math.max(ax, Math.max.apply(null, xs));
        let d = "M" + ax + " " + ay + "V" + busY + "M" + minx + " " + busY + "H" + maxx;
        xs.forEach((cx) => { d += "M" + cx + " " + busY + "V" + childTop; });
        out.edges.push(d);
        inf.kids.forEach((k) => place(k.unit, x + k.dx, childTop, o, out));
      }
    });
  }

  function newCtx() {
    return { expanded: new Set(), cardShown: new Set(), famShown: new Set() };
  }

  function arrange(idx, units, o) {
    const out = { cards: [], links: [], edges: [], labels: [], stubs: [], maxY: 0, people: idx.people };
    const maxW = units.reduce((m, u) => Math.max(m, u.width), 0);
    let y = o.margin;
    units.forEach((u, i) => {
      if (i > 0) y = out.maxY + o.rootGap;
      place(u, o.margin + (maxW - u.width) / 2, y, o, out);
    });
    out.width = maxW + 2 * o.margin;
    out.height = out.maxY + o.margin;
    delete out.people;
    return out;
  }

  // ------------------------------------------------------------------ API
  function layoutAll(idx, opts) {
    const o = Object.assign({}, DEFAULTS, opts);
    const ctx = newCtx();
    const units = [];
    const add = (pid) => units.push(layoutUnit(idx, pid, ctx, o, new Set()));

    // 1. les ancêtres les plus lointains (sans parents connus, avec descendance), du plus gros arbre au plus petit
    const roots = idx.order
      .filter((id) => !idx.parentFam[id] && hasKids(idx, id))
      .map((id, i) => ({ id, i, n: countDesc(idx, id) }))
      .sort((a, b) => b.n - a.n || a.i - b.i);
    roots.forEach((r) => { if (!ctx.cardShown.has(r.id)) add(r.id); });

    // 2. tout ce qui n'a pas encore été affiché (personnes isolées, unions sans enfants…)
    for (let guard = 0; guard < 1000; guard++) {
      const fam = idx.families.find((f) => !ctx.famShown.has(f.id) && (idx.people[f.husb] || idx.people[f.wife]));
      if (fam) { add(idx.people[fam.husb] ? fam.husb : fam.wife); continue; }
      const orphan = idx.order.find((id) => !ctx.cardShown.has(id));
      if (orphan) { add(orphan); continue; }
      break;
    }
    return arrange(idx, units, o);
  }

  function layoutBranch(idx, pid, opts) {
    const o = Object.assign({}, DEFAULTS, opts);
    const ctx = newCtx();
    return arrange(idx, [layoutUnit(idx, pid, ctx, o, new Set())], o);
  }

  return { DEFAULTS, yearOf, buildIndex, layoutAll, layoutBranch, hasKids, countDesc, sortedFams, sortedKids };
});
