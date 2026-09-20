#!/usr/bin/env python3
"""
Convertit un export GEDCOM (MyHeritage, Ancestry, Geneanet…) en data.js pour le site.

Utilisation (depuis le dossier du site) :
    python3 tools/gedcom_vers_data.py MON_ARBRE.ged

Ce que ça produit :
    data.js                            les personnes et les familles du site
    tools/photos_manifest.json         la liste des photos à télécharger
    tools/photos_a_telecharger.html    la même liste, cliquable, pour enregistrer les photos à la main
    tools/rapport_verification.txt     les incohérences repérées dans l'arbre (à relire)

Options :
    --titre "Mon titre"        titre affiché en haut du site
    --garder-details-vivants   conserve jour/mois et lieu de naissance des personnes vivantes
                               (par défaut seule l'année est publiée pour elles)
    --sortie data.js           fichier de sortie

Les adresses e-mail et adresses postales présentes dans le GEDCOM ne sont JAMAIS copiées.
"""
import argparse, html, json, os, re, sys, unicodedata
from datetime import date

MOIS = {"JAN": "janvier", "FEB": "février", "MAR": "mars", "APR": "avril", "MAY": "mai", "JUN": "juin",
        "JUL": "juillet", "AUG": "août", "SEP": "septembre", "OCT": "octobre", "NOV": "novembre", "DEC": "décembre"}
PREFIXES = {"ABT": "vers ", "EST": "vers ", "CAL": "vers ", "BEF": "avant ", "AFT": "après "}
AGE_MAX_VIVANT = 105  # sans date de décès, une personne née il y a moins de 105 ans est considérée vivante


# ---------------------------------------------------------------- lecture GEDCOM
def lire_gedcom(chemin):
    texte = open(chemin, encoding="utf-8-sig").read().replace("\r\n", "\n").replace("\r", "\n")
    racine, pile = [], []
    for brut in texte.split("\n"):
        if not brut.strip():
            continue
        m = re.match(r"^\s*(\d+)\s+(@[^@]+@\s+)?(\S+)(?:\s(.*))?$", brut)
        if not m:
            continue
        niveau, xref, tag, val = int(m.group(1)), (m.group(2) or "").strip(), m.group(3), (m.group(4) or "")
        noeud = {"tag": tag, "val": val, "xref": xref, "enfants": []}
        if tag in ("CONC", "CONT") and pile:
            cible = pile[niveau - 1] if niveau - 1 < len(pile) else pile[-1]
            cible["val"] += ("\n" if tag == "CONT" else "") + val
            continue
        del pile[niveau:]
        (pile[niveau - 1]["enfants"] if niveau > 0 else racine).append(noeud)
        pile.append(noeud)
    return racine


def sous(noeud, tag):
    return [e for e in noeud["enfants"] if e["tag"] == tag]


def valeur(noeud, tag):
    l = sous(noeud, tag)
    return l[0]["val"].strip() if l else ""


# ---------------------------------------------------------------- nettoyage
def date_fr(brut):
    brut = (brut or "").strip()
    if not brut:
        return ""
    m = re.match(r"^(ABT|EST|CAL|BEF|AFT)?\s*(?:(\d{1,2})\s+)?(?:([A-Z]{3})\s+)?(\d{3,4})$", brut.upper())
    if not m:
        return brut
    pref, jour, mois, annee = m.groups()
    parts = []
    if jour:
        parts.append("1er" if int(jour) == 1 else str(int(jour)))
    if mois and mois in MOIS:
        parts.append(MOIS[mois])
    parts.append(annee)
    return PREFIXES.get(pref, "") + " ".join(parts)


def annee(texte):
    m = re.search(r"(\d{4})", texte or "")
    return int(m.group(1)) if m else None


def texte_propre(html_brut):
    t = re.sub(r"<\s*br\s*/?>", "\n", html_brut or "", flags=re.I)
    t = re.sub(r"</\s*p\s*>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def normaliser_nom(s):
    s = (s or "").strip()
    s = re.sub(r"(?i)clavaud de lu[cç]on", "Clavaud de Luçon", s)
    return s


def slug(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


# ---------------------------------------------------------------- conversion
def convertir(racine, garder_vivants):
    indis = [n for n in racine if n["tag"] == "INDI"]
    fams = [n for n in racine if n["tag"] == "FAM"]
    ids, utilises = {}, set()
    for n in indis:
        nom = next(iter(sous(n, "NAME")), None)
        given = normaliser_nom(valeur(nom, "GIVN")) if nom else ""
        surn = normaliser_nom(valeur(nom, "SURN")) if nom else ""
        base = slug(f"{given} {surn}") or "inconnu_" + re.sub(r"\D", "", n["xref"])
        cand, i = base, 2
        while cand in utilises:
            cand, i = f"{base}_{i}", i + 1
        utilises.add(cand)
        ids[n["xref"]] = cand

    annee_courante = date.today().year
    people, photos, ignores = {}, [], {"email": 0}
    for n in indis:
        nom = next(iter(sous(n, "NAME")), None)
        p = {}
        if nom:
            p["given"] = normaliser_nom(valeur(nom, "GIVN"))
            p["surname"] = normaliser_nom(valeur(nom, "SURN"))
            mar = normaliser_nom(valeur(nom, "_MARNM"))
            if mar:
                p["marriedName"] = mar
        else:
            p["given"], p["surname"] = "", ""
        sexe = valeur(n, "SEX")
        p["sex"] = {"M": "H", "F": "F"}.get(sexe, "")
        naiss = next(iter(sous(n, "BIRT")), None)
        if naiss:
            if valeur(naiss, "DATE"): p["birth"] = date_fr(valeur(naiss, "DATE"))
            if valeur(naiss, "PLAC"): p["birthPlace"] = valeur(naiss, "PLAC")
        deces = next(iter(sous(n, "DEAT")), None)
        if deces is not None:
            p["dead"] = True
            if valeur(deces, "DATE"): p["death"] = date_fr(valeur(deces, "DATE"))
            if valeur(deces, "PLAC"): p["deathPlace"] = valeur(deces, "PLAC")
            if valeur(deces, "CAUS"): p["deathCause"] = valeur(deces, "CAUS")
        metiers, notes = [], []
        for o in sous(n, "OCCU"):
            m = o["val"].strip()
            detail = texte_propre(valeur(o, "NOTE"))
            if detail and len(detail) > 60:      # un détail long est une anecdote, pas une précision de métier
                notes.append(detail)
                detail = ""
            if m:
                metiers.append(f"{m} ({detail})" if detail else m)
        if metiers:
            p["job"] = ", ".join(metiers)
        notes += [texte_propre(x["val"]) for x in sous(n, "NOTE")]
        notes = [x for x in notes if x]
        if notes:
            p["anecdote"] = "\n\n".join(notes)
        for r in sous(n, "RESI"):
            if valeur(r, "EMAIL"):
                ignores["email"] += 1
        pid = ids[n["xref"]]
        # photos : la 1re image MyHeritage est le portrait recadré, les suivantes sont les originaux / autres images
        urls = []
        for o in sous(n, "OBJE"):
            f = valeur(o, "FILE")
            if f.startswith("http"):
                urls.append((f, valeur(o, "TITL")))
        if urls:
            chemins = []
            for k, (u, titre) in enumerate(urls, 1):
                ext = (valeur(next(e for e in sous(n, "OBJE") if valeur(e, "FILE") == u), "FORM") or "jpg").lower()
                ext = "jpg" if ext == "jpeg" else ext
                chemin = f"photos/{pid}-{k}.{ext}"
                chemins.append(chemin)
                photos.append({"person": pid, "file": chemin, "url": u, "title": titre})
            p["photo"] = chemins[0]
            p["photos"] = chemins
        # vivant : on ne publie que l'année de naissance
        y = annee(p.get("birth"))
        vivant = "dead" not in p and y is not None and (annee_courante - y) < AGE_MAX_VIVANT
        if vivant and not garder_vivants:
            if y: p["birth"] = str(y)
            p.pop("birthPlace", None)
        p["_vivant"] = vivant
        people[pid] = p

    familles = []
    for f in fams:
        h = ids.get(valeur(f, "HUSB"))
        w = ids.get(valeur(f, "WIFE"))
        enfants = [ids[c["val"].strip()] for c in sous(f, "CHIL") if c["val"].strip() in ids]
        fam = {"id": f["xref"].strip("@").replace("F", "F", 1)}
        if h: fam["husb"] = h
        if w: fam["wife"] = w
        fam["children"] = enfants
        mar = next(iter(sous(f, "MARR")), None)
        if mar is not None:
            fam["married"] = True
            d, l = date_fr(valeur(mar, "DATE")), valeur(mar, "PLAC")
            if d or l:
                fam["marriage"] = {k: v for k, v in (("date", d), ("place", l)) if v}
        familles.append(fam)
    return people, familles, photos, ignores


# ---------------------------------------------------------------- contrôles
def rapport(people, familles):
    out = []
    nom = lambda i: (f"{people[i]['given']} {people[i]['surname']}".strip() or f"(inconnu·e {i})")
    for pid, p in people.items():
        for champ in ("birthPlace", "deathPlace"):
            v = p.get(champ, "")
            if re.fullmatch(r"\d{4}", v):
                out.append(f"- {nom(pid)} : le champ « {champ} » contient « {v} » : c'est probablement une année saisie dans le mauvais champ.")
            elif re.match(r"^\d+[/\-]?\d*\s*(rue|bd|boulevard|avenue|av\.|chemin|impasse)", v, re.I):
                out.append(f"- {nom(pid)} : le champ « {champ} » ressemble à une adresse (« {v} »).")
        if re.search(r"\d", p.get("given", "") + p.get("surname", "")):
            out.append(f"- {nom(pid)} : le nom contient un chiffre.")
        yb, yd = annee(p.get("birth")), annee(p.get("death"))
        if yb and yd and yd < yb:
            out.append(f"- {nom(pid)} : décédé(e) ({yd}) avant sa naissance ({yb}).")
    for f in familles:
        ym = annee(f.get("marriage", {}).get("date"))
        for parent in (f.get("husb"), f.get("wife")):
            if not parent: continue
            pb, pd = annee(people[parent].get("birth")), annee(people[parent].get("death"))
            if ym and pb and ym < pb + 14:
                out.append(f"- {nom(parent)} : mariage en {ym} alors qu'il/elle est né(e) en {pb}.")
            for c in f["children"]:
                cb = annee(people[c].get("birth"))
                if not cb: continue
                sexe = people[parent].get("sex")
                if pb and cb < pb + 14:
                    out.append(f"- {nom(c)} (né(e) {cb}) aurait {cb - pb} ans de moins que {nom(parent)} (né(e) {pb}) : à vérifier.")
                if pb and sexe == "F" and cb > pb + 50:
                    out.append(f"- {nom(c)} (né(e) {cb}) : sa mère {nom(parent)} aurait {cb - pb} ans à sa naissance.")
                if pd and sexe == "F" and cb > pd:
                    out.append(f"- {nom(c)} (né(e) {cb}) : né(e) après le décès de sa mère {nom(parent)} ({pd}).")
                if pd and sexe == "H" and cb > pd + 1:
                    out.append(f"- {nom(c)} (né(e) {cb}) : né(e) plus d'un an après le décès de son père {nom(parent)} ({pd}).")
                if pb and cb - pb < 16:
                    pass
    for pid, p in people.items():
        if p.get("dead") and not p.get("death") and not p.get("birth") and p.get("given"):
            pass
    return out


# ---------------------------------------------------------------- écriture
def j(o):
    return json.dumps(o, ensure_ascii=False, separators=(", ", ": "))


def ecrire_data(chemin, people, familles, titre, cache_vivants):
    propres = {k: {c: v for c, v in p.items() if c != "_vivant"} for k, p in people.items()}
    lignes = [
        "/*",
        "  DONNÉES DE L'ARBRE : généré depuis un export GEDCOM par tools/gedcom_vers_data.py",
        "  ==========================================================================",
        "  Tu peux modifier ce fichier à la main, mais le plus simple est d'utiliser le bouton",
        "  « Ajouter une personne » / « Modifier la fiche » du site, puis « Publier mes modifications »",
        "  qui télécharge un data.js à jour à déposer dans le dépôt GitHub.",
        "",
        "  PEOPLE    : une entrée par personne (identifiant unique = la clé).",
        "     given, surname, marriedName, sex (\"H\"/\"F\"/\"\"), birth, birthPlace, dead (true si décédé(e)),",
        "     death, deathPlace, deathCause, job, anecdote, note, photo, photos (liste de chemins)",
        "  FAMILIES  : une entrée par couple (ou par parent seul) avec ses enfants.",
        "     id, husb, wife, children [ids], married (true si mariés), marriage {date, place}",
        "*/",
        "",
        "const SITE_CONFIG = " + j({"title": titre, "hideLiving": cache_vivants}) + ";",
        "",
        "const PEOPLE = {",
    ]
    items = list(propres.items())
    for i, (k, p) in enumerate(items):
        lignes.append(f'  {json.dumps(k)}: {j(p)}' + ("," if i < len(items) - 1 else ""))
    lignes += ["};", "", "const FAMILIES = ["]
    for i, f in enumerate(familles):
        lignes.append("  " + j(f) + ("," if i < len(familles) - 1 else ""))
    lignes += ["];", ""]
    open(chemin, "w", encoding="utf-8").write("\n".join(lignes))


def ecrire_photos(dossier, people, photos):
    json.dump(photos, open(os.path.join(dossier, "photos_manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    nom = lambda i: (f"{people[i]['given']} {people[i]['surname']}".strip() or i)
    lignes = ["<!DOCTYPE html><html lang='fr'><meta charset='utf-8'><title>Photos à enregistrer</title>",
              "<style>body{font:15px/1.5 system-ui;max-width:900px;margin:2rem auto;padding:0 1rem}li{margin:.8rem 0;display:flex;gap:1rem;align-items:center}img{width:72px;height:72px;object-fit:cover;border-radius:6px;background:#eee}code{background:#f0eee6;padding:2px 6px;border-radius:4px}</style>",
              "<h1>Photos à enregistrer</h1>",
              "<p>Clic droit sur une image → « Enregistrer l'image sous… », puis enregistre-la dans le dossier <code>photos/</code> du site avec le nom indiqué. ",
              "Ces liens MyHeritage expirent au bout d'une semaine environ : si une image ne s'affiche plus, refais un export GEDCOM et relance le script.</p><ol>"]
    for ph in photos:
        lignes.append(f"<li><a href='{html.escape(ph['url'])}' target='_blank'><img src='{html.escape(ph['url'])}' alt=''></a>"
                      f"<span><strong>{html.escape(nom(ph['person']))}</strong><br>enregistrer sous <code>{html.escape(os.path.basename(ph['file']))}</code></span></li>")
    lignes.append("</ol></html>")
    open(os.path.join(dossier, "photos_a_telecharger.html"), "w", encoding="utf-8").write("\n".join(lignes))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("gedcom")
    ap.add_argument("--titre", default="L'arbre des Clavaud de Luçon")
    ap.add_argument("--sortie", default="data.js")
    ap.add_argument("--garder-details-vivants", action="store_true")
    a = ap.parse_args()

    people, familles, photos, ignores = convertir(lire_gedcom(a.gedcom), a.garder_details_vivants)
    ecrire_data(a.sortie, people, familles, a.titre, not a.garder_details_vivants)
    dossier = os.path.join(os.path.dirname(os.path.abspath(a.sortie)), "tools")
    os.makedirs(dossier, exist_ok=True)
    ecrire_photos(dossier, people, photos)
    lignes = rapport(people, familles)
    open(os.path.join(dossier, "rapport_verification.txt"), "w", encoding="utf-8").write(
        "Points à vérifier dans l'arbre\n==============================\n" + ("\n".join(lignes) if lignes else "Rien à signaler.") + "\n")

    vivants = [p for p in people.values() if p["_vivant"]]
    print(f"{len(people)} personnes, {len(familles)} familles, {len(photos)} photos → {a.sortie}")
    if vivants and not a.garder_details_vivants:
        print(f"{len(vivants)} personne(s) vivante(s) : seule l'année de naissance est publiée (option --garder-details-vivants pour tout garder).")
    if ignores["email"]:
        print(f"{ignores['email']} adresse(s) e-mail présente(s) dans le GEDCOM : ignorée(s), jamais copiée(s).")
    print(f"{len(lignes)} point(s) à vérifier → tools/rapport_verification.txt")


if __name__ == "__main__":
    main()
