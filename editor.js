/*
  Formulaire d'ajout / de modification d'une personne + export du data.js à jour.

  Un site GitHub Pages est statique : il ne peut pas écrire dans le dépôt. Les modifications
  sont donc gardées dans ce navigateur (brouillon) ; le bouton « Publier mes modifications »
  télécharge un data.js à jour (et les nouvelles photos) à déposer dans le dépôt.
*/
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const CFG = App.config;
  const dlg = $("dlg-person"), form = $("person-form");

  let mode = "add", editId = null, pendingPhoto = null;

  // ==========================================================
  // Outils
  // ==========================================================
  function slug(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function uniquePersonId(st, p) {
    const base = slug((p.given || "") + " " + (p.surname || "")) || "personne";
    let id = base, i = 2;
    while (st.people[id]) id = base + "_" + i++;
    return id;
  }

  function nextFamId(st) {
    let max = 0;
    st.families.forEach((f) => { const m = /^F(\d+)$/.exec(f.id); if (m) max = Math.max(max, +m[1]); });
    return "F" + (max + 1);
  }

  function sortedPeople(st) {
    return Object.keys(st.people)
      .filter((id) => !App.isUnknown(st.people[id]))
      .sort((a, b) => App.displayName(st.people[a]).localeCompare(App.displayName(st.people[b]), "fr"));
  }

  function personLabel(p) {
    const d = App.cardDates(p);
    return App.displayName(p) + (d ? " (" + d + ")" : "");
  }

  function isLivingByData(p) {
    const y = App.yearOf(p.birth);
    return !p.dead && !p.death && y != null && new Date().getFullYear() - y < 105;
  }

  function showError(msg) {
    const e = $("pf-error");
    e.textContent = msg || "";
    e.hidden = !msg;
    if (msg) e.scrollIntoView({ block: "nearest" });
  }

  // ==========================================================
  // Photo : redimensionnée dans le navigateur (max. 720 px) avant d'être gardée
  // ==========================================================
  function resizeImage(file, max) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("lecture impossible"));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("image illisible"));
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.85));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function setPreview(src, p) {
    const box = $("pf-photo-preview");
    box.textContent = "";
    if (src) {
      const img = document.createElement("img");
      img.alt = ""; img.src = src;
      img.addEventListener("error", () => { box.textContent = p ? (p.given || "?").charAt(0).toUpperCase() : "?"; });
      box.appendChild(img);
    } else box.textContent = "?";
  }

  $("pf-photo").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      pendingPhoto = await resizeImage(f, 720);
      setPreview(pendingPhoto);
      showError("");
    } catch (err) {
      pendingPhoto = null;
      showError("Cette photo n'a pas pu être lue. Essayez un fichier JPEG ou PNG.");
    }
  });

  // ==========================================================
  // Formulaire : affichage
  // ==========================================================
  function relType() {
    const r = form.querySelector('input[name="rel"]:checked');
    return r ? r.value : "none";
  }

  function fillTargets(st) {
    const sel = $("pf-rel-target");
    const keep = sel.value;
    sel.textContent = "";
    sel.appendChild(new Option("Choisir une personne…", ""));
    sortedPeople(st).forEach((id) => sel.appendChild(new Option(personLabel(st.people[id]), id)));
    if (keep) sel.value = keep;
  }

  function fillFamilies(st) {
    const sel = $("pf-rel-fam");
    sel.textContent = "";
    const tid = $("pf-rel-target").value;
    const ix = TreeLayout.buildIndex(st);
    if (tid && st.people[tid]) {
      TreeLayout.sortedFams(ix, tid).forEach((f) => {
        const sp = f.husb === tid ? f.wife : f.husb;
        const spP = sp && st.people[sp];
        let label = spP && !App.isUnknown(spP) ? "avec " + App.displayName(spP) : "avec un(e) conjoint(e) non renseigné(e)";
        if (f.marriage && f.marriage.date) label += " (" + f.marriage.date + ")";
        sel.appendChild(new Option(label, f.id));
      });
    }
    sel.appendChild(new Option("dans une nouvelle union (conjoint(e) non renseigné(e))", "new"));
  }

  function updateRelUI() {
    const t = relType();
    $("pf-rel-fields").hidden = t === "none";
    $("pf-fam-wrap").hidden = t !== "child";
    $("pf-marr-wrap").hidden = t !== "spouse";
    if (t === "child") fillFamilies(App.getState());
  }

  function updateDeadUI() {
    const dead = $("pf-dead").checked;
    form.querySelectorAll(".dead-only").forEach((n) => { n.hidden = !dead; });
    updateLivingNote();
  }

  function updateLivingNote() {
    const y = App.yearOf($("pf-birth").value);
    const living = CFG.hideLiving && !$("pf-dead").checked && !$("pf-death").value.trim() && y != null && new Date().getFullYear() - y < 105;
    $("pf-living-note").hidden = !living;
  }

  form.querySelectorAll('input[name="rel"]').forEach((r) => r.addEventListener("change", updateRelUI));
  $("pf-rel-target").addEventListener("change", () => { if (relType() === "child") fillFamilies(App.getState()); });
  $("pf-dead").addEventListener("change", updateDeadUI);
  $("pf-death").addEventListener("input", updateLivingNote);
  $("pf-birth").addEventListener("input", updateLivingNote);
  $("pf-marr-date").addEventListener("input", () => { if ($("pf-marr-date").value.trim()) $("pf-married").checked = true; });

  // ==========================================================
  // Formulaire : ouverture
  // ==========================================================
  function openForm(opts) {
    opts = opts || {};
    const st = App.getState();
    mode = opts.mode === "edit" && st.people[opts.id] ? "edit" : "add";
    editId = mode === "edit" ? opts.id : null;
    pendingPhoto = null;
    form.reset();
    showError("");
    $("pf-photo").value = "";

    const p = mode === "edit" ? st.people[editId] : {};
    $("pf-title").textContent = mode === "edit" ? "Modifier la fiche" : "Ajouter une personne";
    $("pf-delete").hidden = mode !== "edit";
    $("pf-relation").hidden = mode === "edit";

    $("pf-given").value = p.given || "";
    $("pf-surname").value = p.surname || "";
    $("pf-married-name").value = p.marriedName || "";
    $("pf-sex").value = p.sex || "";
    $("pf-birth").value = p.birth || "";
    $("pf-birthplace").value = p.birthPlace || "";
    $("pf-dead").checked = !!(p.dead || p.death);
    $("pf-death").value = p.death || "";
    $("pf-deathplace").value = p.deathPlace || "";
    $("pf-deathcause").value = p.deathCause || "";
    $("pf-job").value = p.job || "";
    $("pf-anecdote").value = p.anecdote || "";
    setPreview(p.photo || "", p);

    if (mode === "add") {
      fillTargets(st);
      const rel = opts.relation || { type: "none" };
      form.querySelector('input[name="rel"][value="' + rel.type + '"]').checked = true;
      if (rel.target) $("pf-rel-target").value = rel.target;
      $("pf-marr-date").value = ""; $("pf-marr-place").value = ""; $("pf-married").checked = true;
      updateRelUI();
    }
    updateDeadUI();
    if (!dlg.open) dlg.showModal();
    $("pf-given").focus();
  }

  $("pf-cancel").addEventListener("click", () => dlg.close());

  // ==========================================================
  // Formulaire : enregistrement
  // ==========================================================
  function readFields() {
    const v = (id) => $(id).value.trim();
    const dead = $("pf-dead").checked || !!v("pf-death");
    const f = {
      given: v("pf-given"), surname: v("pf-surname"), marriedName: v("pf-married-name"), sex: $("pf-sex").value,
      birth: v("pf-birth"), birthPlace: v("pf-birthplace"),
      dead: dead || undefined,
      death: dead ? v("pf-death") : "", deathPlace: dead ? v("pf-deathplace") : "", deathCause: dead ? v("pf-deathcause") : "",
      job: v("pf-job"), anecdote: $("pf-anecdote").value.trim(),
    };
    // personne vivante : on ne garde que l'année de naissance
    if (CFG.hideLiving && isLivingByData(f)) {
      f.birth = String(App.yearOf(f.birth));
      f.birthPlace = "";
    }
    return f;
  }

  const MANAGED = ["given", "surname", "marriedName", "sex", "birth", "birthPlace", "dead", "death", "deathPlace", "deathCause", "job", "anecdote"];

  function applyFields(target, f) {
    MANAGED.forEach((k) => {
      const val = f[k];
      if (k === "given" || k === "surname" || k === "sex") target[k] = val || "";
      else if (val) target[k] = val;
      else delete target[k];
    });
    if (pendingPhoto) {
      const old = target.photos || (target.photo ? [target.photo] : []);
      target.photo = pendingPhoto;
      target.photos = [pendingPhoto].concat(old.filter((x) => x !== pendingPhoto));
    }
  }

  function pushUnique(list, v) { if (list.indexOf(v) < 0) list.push(v); }

  function linkNewPerson(st, newId, newP) {
    const type = relType();
    if (type === "none") return null;
    const tid = $("pf-rel-target").value;
    if (!tid || !st.people[tid]) return "Choisissez la personne à laquelle rattacher la nouvelle fiche.";
    const target = st.people[tid];
    const ix = TreeLayout.buildIndex(st);

    if (type === "child") {
      const famId = $("pf-rel-fam").value;
      let fam = st.families.find((f) => f.id === famId);
      if (!fam || famId === "new") {
        fam = { id: nextFamId(st), children: [] };
        if (target.sex === "F") fam.wife = tid; else fam.husb = tid;
        st.families.push(fam);
      }
      pushUnique(fam.children, newId);
      return null;
    }

    if (type === "spouse") {
      const married = $("pf-married").checked || $("pf-marr-date").value.trim() || $("pf-marr-place").value.trim();
      const md = $("pf-marr-date").value.trim(), mp = $("pf-marr-place").value.trim();
      // une union existante où il manque un conjoint est complétée plutôt que dupliquée
      const open = (ix.famsOf[tid] || []).find((f) => !(f.husb && f.wife));
      let fam = open;
      if (fam) {
        if (fam.husb === tid) fam.wife = newId;
        else if (fam.wife === tid) fam.husb = newId;
      } else {
        fam = { id: nextFamId(st), children: [] };
        if (target.sex === "F") { fam.wife = tid; fam.husb = newId; }
        else { fam.husb = tid; fam.wife = newId; }
        st.families.push(fam);
      }
      if (married) fam.married = true;
      if (md || mp) fam.marriage = Object.assign({}, fam.marriage, md ? { date: md } : {}, mp ? { place: mp } : {});
      return null;
    }

    if (type === "parent") {
      const pf = ix.parentFam[tid];
      const slot = newP.sex === "F" ? "wife" : newP.sex === "H" ? "husb" : null;
      if (pf) {
        const use = slot || (!pf.husb ? "husb" : !pf.wife ? "wife" : null);
        if (!use || pf[use]) {
          return use === "wife" ? "Cette personne a déjà une mère renseignée." : use === "husb" ? "Cette personne a déjà un père renseigné." : "Les deux parents de cette personne sont déjà renseignés.";
        }
        pf[use] = newId;
      } else {
        const fam = { id: nextFamId(st), children: [tid] };
        fam[slot === "wife" ? "wife" : "husb"] = newId;
        st.families.push(fam);
      }
      return null;
    }
    return null;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const st = App.getState();
    const f = readFields();
    if (!f.given && !f.surname) { showError("Renseignez au moins un prénom ou un nom."); return; }

    let id;
    if (mode === "edit") {
      id = editId;
      applyFields(st.people[id], f);
    } else {
      const p = {};
      applyFields(p, f);
      id = uniquePersonId(st, p);
      st.people[id] = p;
      const err = linkNewPerson(st, id, p);
      if (err) { showError(err); return; }
    }
    if (App.setState(st)) {
      dlg.close();
      App.showPerson(id);
    }
  });

  // ==========================================================
  // Suppression
  // ==========================================================
  $("pf-delete").addEventListener("click", () => {
    const st = App.getState();
    const p = st.people[editId];
    if (!p) return;
    if (!confirm("Supprimer définitivement " + App.displayName(p) + " de l'arbre ?\n\nSes liens de parenté seront retirés (ses enfants restent dans l'arbre).")) return;
    delete st.people[editId];
    st.families.forEach((f) => {
      if (f.husb === editId || f.wife === editId) { delete f.married; delete f.marriage; }
      if (f.husb === editId) delete f.husb;
      if (f.wife === editId) delete f.wife;
      f.children = (f.children || []).filter((c) => c !== editId);
    });
    st.families = st.families.filter((f) => f.husb || f.wife);
    if (App.setState(st)) { dlg.close(); App.closePanel(); }
  });

  // ==========================================================
  // Export : data.js + photos
  // ==========================================================
  const j = (o) => JSON.stringify(o);

  function dataUrlToBytes(url) {
    const b64 = url.slice(url.indexOf(",") + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function buildExport() {
    const st = App.getState();
    const enc = new TextEncoder();
    const files = [];
    Object.keys(st.people).forEach((id) => {
      const p = st.people[id];
      const used = new Set([p.photo].concat(p.photos || []).filter((x) => x && !x.startsWith("data:")));
      const map = new Map();
      const conv = (src) => {
        if (!src || !src.startsWith("data:")) return src;
        if (!map.has(src)) {
          let n = 1, name;
          do { name = "photos/" + id + "-" + n++ + ".jpg"; } while (used.has(name));
          used.add(name);
          map.set(src, name);
          files.push({ name, data: dataUrlToBytes(src) });
        }
        return map.get(src);
      };
      if (p.photos) p.photos = p.photos.map(conv);
      if (p.photo) p.photo = conv(p.photo);
    });

    const L = [
      "/*",
      "  DONNÉES DE L'ARBRE : voir README.md pour le format.",
      "  Fichier produit par le bouton « Publier mes modifications » du site.",
      "*/",
      "",
      "const SITE_CONFIG = " + j({ title: CFG.title, hideLiving: !!CFG.hideLiving }) + ";",
      "",
      "const PEOPLE = {",
    ];
    const ids = Object.keys(st.people);
    ids.forEach((id, i) => L.push("  " + JSON.stringify(id) + ": " + j(st.people[id]) + (i < ids.length - 1 ? "," : "")));
    L.push("};", "", "const FAMILIES = [");
    st.families.forEach((f, i) => L.push("  " + j(f) + (i < st.families.length - 1 ? "," : "")));
    L.push("];", "");
    return { text: L.join("\n"), photos: files, enc };
  }

  // -- zip minimal (sans compression), suffisant pour data.js + photos
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function makeZip(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    const cSize = central.reduce((s, b) => s + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: "application/zip" });
  }

  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function openExport() {
    const ex = buildExport();
    const n = ex.photos.length;
    $("export-zip").disabled = n === 0;
    $("export-note").textContent = n
      ? n + " nouvelle" + (n > 1 ? "s photos sont" : " photo est") + " incluse" + (n > 1 ? "s" : "") + " dans le zip (dossier photos)."
      : "Aucune nouvelle photo : data.js suffit.";
    $("dlg-export").showModal();
  }

  $("export-js").addEventListener("click", () => {
    const ex = buildExport();
    if (ex.photos.length && !confirm("Des nouvelles photos sont liées à ces modifications. Sans le zip, elles ne s'afficheront pas sur le site. Télécharger data.js seul quand même ?")) return;
    download("data.js", new Blob([ex.text], { type: "text/javascript;charset=utf-8" }));
  });
  $("export-zip").addEventListener("click", () => {
    const ex = buildExport();
    const files = [{ name: "data.js", data: ex.enc.encode(ex.text) }].concat(ex.photos);
    download("arbre-modifications.zip", makeZip(files));
  });
  $("export-close").addEventListener("click", () => $("dlg-export").close());

  window.Editor = { openForm, openExport, _makeZip: makeZip, _buildExport: buildExport };
})();
