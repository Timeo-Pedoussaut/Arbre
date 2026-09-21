/*
  Mise en page de l'arbre (calculs seulement, aucun accès au DOM).

  Tout l'arbre tient dans UN seul graphe : chaque personne est placée sur la ligne de sa
  génération, les couples restent côte à côte, et les ancêtres d'un conjoint (ex. les parents
  d'un époux qui « vient d'ailleurs ») apparaissent au-dessus de lui, à la même hauteur que
  les parents de son conjoint. Ça permet de raccorder d'autres branches (par exemple celle
  de la mère) sans jamais séparer les arbres.

  Étapes : 1. regrouper les couples en « blocs »  2. donner une génération à chaque bloc
           3. ordonner les blocs sur chaque ligne  4. affiner les positions horizontales
           (chaque parent est centré au-dessus de ses enfants, sans chevauchement).
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TreeLayout = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULTS = {
    cardW: 232, cardH: 104, linkW: 24,
    hGap: 34,       // espace horizontal minimal entre deux blocs d'une même ligne
    vGap: 72,       // espace vertical entre deux générations
    busStep: 9,     // décalage des traits quand un bloc a plusieurs unions avec enfants
    margin: 40,
    iterations: 40,
    marriageText: null, // (famille) => texte à afficher près de l'union, ou ""
  };

  function yearOf(s) {
    const m = /(\d{4})/.exec(s || "");
    return m ? +m[1] : null;
  }

  // ------------------------------------------------------------------ index
  function buildIndex(state) {
    const people = state.people || {};
    const families = state.families || [];
    const famsOf = {}, parentFam = {};
    families.forEach((f) => {
      [f.husb, f.wife].forEach((pid) => {
        if (pid && people[pid]) (famsOf[pid] = famsOf[pid] || []).push(f);
      });
      (f.children || []).forEach((c) => { if (people[c] && !parentFam[c]) parentFam[c] = f; });
    });
    return { people, families, famsOf, parentFam, order: Object.keys(people) };
  }

  function stableSort(list, keyFn) {
    return list.map((v, i) => ({ v, i, k: keyFn(v) }))
      .sort((a, b) => (a.k !== b.k ? (a.k < b.k ? -1 : 1) : a.i - b.i))
      .map((x) => x.v);
  }

  function birthYear(idx, pid) { const p = idx.people[pid]; return p ? yearOf(p.birth) : null; }

  function famKey(idx, f) {
    const ys = [];
    const my = f.marriage ? yearOf(f.marriage.date) : null;
    if (my) ys.push(my);
    (f.children || []).forEach((c) => { const y = birthYear(idx, c); if (y) ys.push(y); });
    return ys.length ? Math.min.apply(null, ys) : Infinity;
  }

  function sortedFams(idx, pid) { return stableSort(idx.famsOf[pid] || [], (f) => famKey(idx, f)); }

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

  // ------------------------------------------------------------------ sous-ensembles (vues)
  function descendantsSet(idx, pid) {
    const set = new Set([pid]), seen = new Set();
    (function down(id) {
      if (seen.has(id)) return;
      seen.add(id);
      (idx.famsOf[id] || []).forEach((f) => {
        [f.husb, f.wife].forEach((s) => { if (s && idx.people[s]) set.add(s); });
        (f.children || []).forEach((c) => { if (idx.people[c]) { set.add(c); down(c); } });
      });
    })(pid);
    return set;
  }

  function ancestorsSet(idx, pid) {
    const set = new Set([pid]);
    (function up(id) {
      const f = idx.parentFam[id];
      if (!f) return;
      [f.husb, f.wife].forEach((p) => { if (p && idx.people[p] && !set.has(p)) { set.add(p); up(p); } });
    })(pid);
    return set;
  }

  // view = { mode: "all" | "desc" | "anc" | "hour", pid }
  function viewSet(idx, view) {
    if (!view || view.mode === "all" || !idx.people[view.pid]) return new Set(idx.order);
    if (view.mode === "desc") return descendantsSet(idx, view.pid);
    if (view.mode === "anc") return ancestorsSet(idx, view.pid);
    const a = ancestorsSet(idx, view.pid);
    descendantsSet(idx, view.pid).forEach((x) => a.add(x));
    return a;
  }

  // ------------------------------------------------------------------ régression isotone (positions sans chevauchement)
  // Cherche les positions x_i les plus proches des cibles t_i, dans l'ordre, séparées d'au moins gap.
  function spread(blocks, targets, gap) {
    const n = blocks.length;
    if (!n) return;
    const S = new Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) { S[i] = acc; acc += blocks[i].w + gap; }
    const stack = [];
    for (let i = 0; i < n; i++) {
      stack.push({ sum: targets[i] - S[i], cnt: 1, from: i });
      while (stack.length > 1) {
        const b = stack[stack.length - 1], a = stack[stack.length - 2];
        if (a.sum / a.cnt <= b.sum / b.cnt) break;
        a.sum += b.sum; a.cnt += b.cnt; stack.pop();
      }
    }
    stack.forEach((s) => {
      const m = s.sum / s.cnt;
      for (let i = s.from; i < s.from + s.cnt; i++) blocks[i].x = m + S[i];
    });
  }

  // ------------------------------------------------------------------ mise en page d'un sous-ensemble
  function layoutGraph(idx, set, opts) {
    const o = Object.assign({}, DEFAULTS, opts);
    const step = o.cardW + o.linkW;
    const has = (id) => id && set.has(id) && idx.people[id];

    // --- familles utiles
    const fams = [];
    const famInfo = {};
    idx.families.forEach((f) => {
      const partners = [f.husb, f.wife].filter(has);
      const kids = (f.children || []).filter(has);
      if (!partners.length) return;
      if (partners.length === 1 && !kids.length) return;
      const fi = { f, partners, kids: sortedKids(idx, { children: kids }) };
      fams.push(fi); famInfo[f.id] = fi;
    });

    // --- blocs = personnes reliées par une union
    const uf = {};
    const find = (a) => { while (uf[a] !== a) { uf[a] = uf[uf[a]]; a = uf[a]; } return a; };
    const members = idx.order.filter(has);
    members.forEach((id) => { uf[id] = id; });
    fams.forEach((fi) => { if (fi.partners.length === 2) uf[find(fi.partners[0])] = find(fi.partners[1]); });
    const groups = new Map();
    members.forEach((id) => { const r = find(id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(id); });
    const blocks = [];
    const blockOf = {};
    groups.forEach((ids) => {
      const b = { i: blocks.length, ids, cards: [], fams: [], gen: 0, x: 0, w: 0 };
      blocks.push(b);
      ids.forEach((id) => { blockOf[id] = b; });
    });
    fams.forEach((fi) => { blockOf[fi.partners[0]].fams.push(fi); });

    // --- ordre des cartes dans un bloc : conjoint 1 · personne · conjoint 2 …
    blocks.forEach((b) => {
      const ids = b.ids;
      if (ids.length === 1) { b.cards = ids.slice(); b.hub = 0; return; }
      const adj = {};
      ids.forEach((id) => { adj[id] = []; });
      b.fams.forEach((fi) => { if (fi.partners.length === 2) { adj[fi.partners[0]].push(fi.partners[1]); adj[fi.partners[1]].push(fi.partners[0]); } });
      if (ids.length === 2) {
        const fi = b.fams.find((x) => x.partners.length === 2);
        b.cards = fi ? [fi.f.husb, fi.f.wife].filter((x) => ids.indexOf(x) >= 0) : ids.slice();
        if (b.cards.length < 2) b.cards = ids.slice();
        b.hub = 0; return;
      }
      let hub = ids[0];
      ids.forEach((id) => { if (adj[id].length > adj[hub].length) hub = id; });
      const star = adj[hub].length >= 2 && ids.every((id) => id === hub || adj[id].length === 1);
      if (star) {
        const sp = [];
        sortedFams(idx, hub).forEach((f) => {
          const other = f.husb === hub ? f.wife : f.husb;
          if (other && adj[hub].indexOf(other) >= 0 && sp.indexOf(other) < 0) sp.push(other);
        });
        b.cards = [sp[0], hub].concat(sp.slice(1));
      } else {
        const start = ids.find((id) => adj[id].length === 1) || ids[0];
        const seen = new Set(), walk = [];
        (function go(id) { if (seen.has(id)) return; seen.add(id); walk.push(id); adj[id].forEach(go); })(start);
        ids.forEach((id) => { if (!seen.has(id)) walk.push(id); });
        b.cards = walk;
      }
      b.hub = b.cards.indexOf(hub);
    });
    blocks.forEach((b) => { b.w = b.cards.length * o.cardW + (b.cards.length - 1) * o.linkW; });

    // --- ancrage des enfants sous l'union
    blocks.forEach((b) => {
      b.kidFams = b.fams.filter((fi) => fi.kids.length).map((fi) => {
        const pos = fi.partners.map((id) => b.cards.indexOf(id));
        if (fi.partners.length === 2 && Math.abs(pos[0] - pos[1]) === 1) {
          fi.ax = Math.min(pos[0], pos[1]) * step + o.cardW + o.linkW / 2; fi.mid = true;
        } else {
          const far = pos.length === 2 ? (Math.abs(pos[0] - b.hub) >= Math.abs(pos[1] - b.hub) ? pos[0] : pos[1]) : pos[0];
          fi.ax = far * step + o.cardW / 2; fi.mid = false;
        }
        return fi;
      }).sort((a, c) => a.ax - c.ax);
    });

    // --- relations parent -> enfant entre blocs
    const links = [];
    blocks.forEach((b) => b.kidFams.forEach((fi) => fi.kids.forEach((k) => {
      const cb = blockOf[k];
      links.push({ fi, pb: b, cb, off: cb.cards.indexOf(k) * step + o.cardW / 2 });
    })));

    // --- générations : au plus tôt, puis les ancêtres sont rapprochés de leurs enfants
    const cap = blocks.length + 5;
    for (let n = 0, ch = true; ch && n < cap; n++) {
      ch = false;
      links.forEach((l) => { if (l.cb !== l.pb && l.cb.gen < l.pb.gen + 1) { l.cb.gen = l.pb.gen + 1; ch = true; } });
    }
    for (let n = 0, ch = true; ch && n < cap; n++) {
      ch = false;
      blocks.forEach((b) => {
        let m = Infinity;
        links.forEach((l) => { if (l.pb === b && l.cb !== b) m = Math.min(m, l.cb.gen - 1); });
        if (m !== Infinity && m > b.gen) { b.gen = m; ch = true; }
      });
    }
    const minGen = blocks.reduce((m, b) => Math.min(m, b.gen), Infinity);
    blocks.forEach((b) => { b.gen -= minGen; });
    const maxGen = blocks.reduce((m, b) => Math.max(m, b.gen), 0);

    // --- ordre sur chaque ligne (parcours en profondeur, enfants d'une même famille côte à côte)
    const lists = [];
    for (let g = 0; g <= maxGen; g++) lists.push([]);
    const visited = new Set();
    const place = (b) => { visited.add(b); lists[b.gen].push(b); };
    const parentFamOf = (id) => {
      const f = idx.parentFam[id];
      return f && famInfo[f.id] && famInfo[f.id].kids.indexOf(id) >= 0 ? famInfo[f.id] : null;
    };
    (function () {
      const process = (b) => {
        const kidBlocks = [];
        b.kidFams.forEach((fi) => fi.kids.forEach((k) => {
          const kb = blockOf[k];
          if (!visited.has(kb)) { place(kb); kidBlocks.push(kb); }
        }));
        b.cards.forEach((id) => {
          const pf = parentFamOf(id);
          if (!pf) return;
          const pb = blockOf[pf.partners[0]];
          if (!visited.has(pb)) { place(pb); process(pb); }
        });
        kidBlocks.forEach(process);
      };
      const size = new Map();
      blocks.forEach((b) => size.set(b, countDesc(idx, b.ids[0])));
      blocks.slice().sort((a, c) => a.gen - c.gen || size.get(c) - size.get(a) || a.i - c.i).forEach((b) => {
        if (!visited.has(b)) { place(b); process(b); }
      });
    })();

    // --- positions horizontales
    lists.forEach((row) => { let x = 0; row.forEach((b) => { b.x = x; x += b.w + o.hGap; }); });
    const incoming = new Map(), outgoing = new Map();
    links.forEach((l) => {
      if (l.cb === l.pb) return;
      (incoming.get(l.cb) || incoming.set(l.cb, []).get(l.cb)).push(l);
      (outgoing.get(l.pb) || outgoing.set(l.pb, []).get(l.pb)).push(l);
    });
    for (let it = 0; it < o.iterations; it++) {
      for (let g = 1; g <= maxGen; g++) {
        const row = lists[g];
        spread(row, row.map((b) => { const inc = incoming.get(b); return inc ? avg(inc.map((l) => l.pb.x + l.fi.ax - l.off)) : b.x; }), o.hGap);
      }
      for (let g = maxGen - 1; g >= 0; g--) {
        const row = lists[g];
        spread(row, row.map((b) => { const out = outgoing.get(b); return out ? avg(out.map((l) => l.cb.x + l.off - l.fi.ax)) : b.x; }), o.hGap);
      }
    }
    const minX = blocks.reduce((m, b) => Math.min(m, b.x), Infinity);
    blocks.forEach((b) => { b.x += o.margin - minX; });

    // --- sortie
    const rowY = (g) => o.margin + g * (o.cardH + o.vGap);
    const out = { cards: [], links: [], edges: [], labels: [], gens: maxGen + 1 };
    let maxX = 0;
    blocks.forEach((b) => {
      const y = rowY(b.gen);
      b.cards.forEach((id, i) => out.cards.push({ id, x: b.x + i * step, y, w: o.cardW, h: o.cardH }));
      maxX = Math.max(maxX, b.x + b.w);
      for (let i = 0; i < b.cards.length - 1; i++) {
        const fi = b.fams.find((x) => x.partners.length === 2 && x.partners.indexOf(b.cards[i]) >= 0 && x.partners.indexOf(b.cards[i + 1]) >= 0);
        if (fi) out.links.push({ x1: b.x + i * step + o.cardW, x2: b.x + (i + 1) * step, y: y + o.cardH / 2, married: !!fi.f.married });
      }
      b.fams.forEach((fi) => {
        if (!fi.ax && fi.ax !== 0) return;
        const has2 = fi.kids.length > 0;
        const ax = b.x + fi.ax;
        const text = o.marriageText ? o.marriageText(fi.f) : "";
        if (text) out.labels.push({ x: has2 ? ax + 7 : ax, y: y + o.cardH + 16, text, anchor: has2 ? "start" : "middle" });
      });
      // les familles sans enfants n'ont pas d'ancrage calculé : on affiche seulement leur libellé
      b.fams.filter((fi) => !fi.kids.length && fi.partners.length === 2 && o.marriageText).forEach((fi) => {
        const pos = fi.partners.map((id) => b.cards.indexOf(id));
        if (Math.abs(pos[0] - pos[1]) !== 1) return;
        const text = o.marriageText(fi.f);
        if (text) out.labels.push({ x: b.x + Math.min(pos[0], pos[1]) * step + o.cardW + o.linkW / 2, y: y + o.cardH + 16, text, anchor: "middle" });
      });
      let rank = 0;
      const nb = b.kidFams.length;
      b.kidFams.forEach((fi) => {
        const ax = b.x + fi.ax, ay = fi.mid ? y + o.cardH / 2 : y + o.cardH;
        const busY = y + o.cardH + o.vGap * 0.5 + (nb > 1 ? rank * o.busStep : 0);
        rank++;
        const tops = fi.kids.map((k) => { const cb = blockOf[k]; return { cx: cb.x + cb.cards.indexOf(k) * step + o.cardW / 2, cy: rowY(cb.gen) }; }).filter((t) => t.cy > y);
        if (!tops.length) return;
        const minx = Math.min(ax, Math.min.apply(null, tops.map((t) => t.cx))), maxx = Math.max(ax, Math.max.apply(null, tops.map((t) => t.cx)));
        let d = "M" + ax + " " + ay + "V" + busY + "M" + minx + " " + busY + "H" + maxx;
        tops.forEach((t) => { d += "M" + t.cx + " " + busY + "V" + t.cy; });
        out.edges.push(d);
      });
    });
    out.width = maxX + o.margin;
    out.height = rowY(maxGen) + o.cardH + o.margin;
    return out;
  }

  function avg(a) { return a.reduce((s, v) => s + v, 0) / a.length; }

  function layoutView(idx, view, opts) { return layoutGraph(idx, viewSet(idx, view), opts); }

  return { DEFAULTS, yearOf, buildIndex, layoutGraph, layoutView, viewSet, descendantsSet, ancestorsSet, hasKids, countDesc, sortedFams, sortedKids };
});
