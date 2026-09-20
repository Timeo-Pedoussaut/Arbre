# Arbre généalogique

Site statique (HTML/CSS/JS, rien à installer) hébergeable gratuitement sur GitHub Pages.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | la page et son apparence |
| `script.js` | affichage de l'arbre, fiches, recherche, vue par branche, export PDF |
| `tree-layout.js` | calcul de la disposition de l'arbre |
| `editor.js` | formulaire d'ajout / modification, publication des changements |
| `data.js` | **les données** : personnes et familles |
| `photos/` | les photos (`photos/nom-1.jpg`…) |
| `tools/` | scripts pour reconstruire `data.js` depuis un export GEDCOM |

## Mettre en ligne

1. Dépose tout le contenu de ce dossier à la racine du dépôt GitHub (*Add file → Upload files*).
2. *Settings → Pages → Branch : main / (root) → Save*.
3. Le site apparaît en une minute à `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`.

## Ce que fait le site

- **Vue par branche** : le menu « Vue » en haut affiche seulement la descendance d'une personne (ou le bouton *Voir sa branche* dans sa fiche). L'adresse contient `#branche=…`, on peut la partager.
- **Zoom** : boutons − / +, *Tout voir*, Ctrl + molette ; glisser pour se déplacer.
- **Photos** : la 1re photo d'une personne apparaît sur sa carte et en grand dans sa fiche ; les autres sont dans la galerie de la fiche. Une photo introuvable est remplacée par l'initiale.
- **Export PDF** : bouton *Exporter en PDF* → choisir A4 ou A3 → « Enregistrer au format PDF ». L'arbre affiché (tout ou une branche) est mis à l'échelle de la page. Pour un arbre entier, préférer une branche : sur une seule page le texte devient minuscule.
- **Ajouter / modifier sans toucher au code** : *Ajouter une personne* (enfant, conjoint(e) ou parent de quelqu'un, ou sans lien), *Modifier la fiche* dans chaque fiche. Une fiche « Inconnu(e) » se complète avec *Modifier la fiche*.

### Publier les modifications faites avec le formulaire

GitHub Pages ne peut pas écrire dans le dépôt : les modifications restent **dans ton navigateur** (bandeau jaune) tant qu'elles ne sont pas publiées.

1. *Publier mes modifications* → télécharge `data.js` (ou le `.zip` s'il y a de nouvelles photos).
2. Sur GitHub : *Add file → Upload files*, dépose `data.js` (et le dossier `photos` dézippé), *Commit changes*.
3. Une fois le site à jour, *Effacer le brouillon* (ou recharge : le brouillon identique à `data.js` disparaît seul).

## Reconstruire l'arbre depuis MyHeritage (GEDCOM)

MyHeritage → *Arbre → Exporter en GEDCOM*, puis, dans ce dossier :

```
python3 tools/gedcom_vers_data.py MON_ARBRE.ged
python3 tools/telecharger_photos.py
```

- `data.js` est régénéré (**écrase les modifications faites à la main** : à faire avant de modifier, ou refaire l'export).
- `tools/rapport_verification.txt` liste les incohérences repérées (année dans un champ lieu, parent plus jeune que son enfant…).
- **Les liens de photos MyHeritage expirent au bout d'environ une semaine.** Sans Python : ouvre `tools/photos_a_telecharger.html`, clic droit → « Enregistrer l'image sous… » dans `photos/` avec le nom indiqué.
- Le 1er fichier de chaque personne est son portrait recadré ; pour changer la photo principale, échange l'ordre dans le champ `photos` de `data.js`.

## Vie privée

Le dépôt GitHub étant public, `data.js` l'est aussi. Par défaut (`hideLiving: true` dans `data.js`), pour les personnes **vivantes** (sans date de décès et nées il y a moins de 105 ans) seule l'**année de naissance** est publiée ; le formulaire applique la même règle. Les adresses e-mail du GEDCOM ne sont jamais copiées. Pour tout publier : `python3 tools/gedcom_vers_data.py MON_ARBRE.ged --garder-details-vivants` et `hideLiving: false`. Pour un arbre privé, utiliser un dépôt privé (GitHub Pages privé : offre payante).

## Format de `data.js`

```js
PEOPLE   = { "louis_bacquet": { given, surname, marriedName, sex: "H"|"F"|"", birth, birthPlace,
                                dead: true, death, deathPlace, deathCause, job, anecdote, note,
                                photo, photos: [...] }, ... }
FAMILIES = [ { id, husb, wife, children: ["id", ...], married: true, marriage: { date, place } }, ... ]
```

Une famille peut n'avoir qu'un seul parent. Une personne peut appartenir à plusieurs familles (remariages). Les dates sont du texte libre (`"12 mars 1900"`, `"1900"`, `"vers 1840"`).
