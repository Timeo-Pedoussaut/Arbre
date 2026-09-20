#!/usr/bin/env python3
"""
Télécharge les photos listées dans tools/photos_manifest.json vers le dossier photos/.

    python3 tools/telecharger_photos.py

Les liens MyHeritage expirent au bout d'environ une semaine : si le téléchargement échoue,
refais un export GEDCOM, relance tools/gedcom_vers_data.py puis ce script.
Les photos déjà présentes ne sont pas retéléchargées.
"""
import json, os, sys, urllib.request

racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
manifeste = os.path.join(racine, "tools", "photos_manifest.json")
photos = json.load(open(manifeste, encoding="utf-8"))
os.makedirs(os.path.join(racine, "photos"), exist_ok=True)

ok = deja = echecs = 0
for ph in photos:
    dest = os.path.join(racine, ph["file"])
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        deja += 1
        continue
    try:
        req = urllib.request.Request(ph["url"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r, open(dest, "wb") as f:
            f.write(r.read())
        ok += 1
        print("✓", ph["file"])
    except Exception as e:
        echecs += 1
        print("✗", ph["file"], "-", e)

print(f"\n{ok} téléchargée(s), {deja} déjà présente(s), {echecs} échec(s).")
if echecs:
    print("Liens expirés ? Refais un export GEDCOM (voir README).")
    sys.exit(1)
