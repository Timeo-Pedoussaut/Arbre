# Arbre généalogique

Site statique (HTML/CSS/JS, rien à installer) hébergeable gratuitement sur GitHub Pages.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | la page et son apparence |
| `script.js` | affichage, fiches, recherche et filtres, vues, mini-carte, thème, export PDF |
| `tree-layout.js` | calcul de la disposition (un seul arbre, ancêtres des conjoints compris) |
| `editor.js` | formulaire d'ajout / modification, publication des changements |
| `data.js` | **les données** : personnes et familles |
| `photos/` | les photos (`photos/nom-1.jpg`…) |
| `tools/` | scripts pour reconstruire `data.js` depuis un export GEDCOM |

## Mettre en ligne

1. Dépose tout le contenu de ce dossier à la racine du dépôt GitHub (*Add file → Upload files*).
2. *Settings → Pages → Branch : main / (root) → Save*.
3. Le site apparaît en une minute à `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`.

## Ce que fait le site

- **Un seul arbre** : les ancêtres d'un conjoint (par exemple Zélie Dacher, mère de Louis Bacquet) sont placés **au-dessus** de lui, à la même hauteur que les parents de son conjoint. Quand tu ajouteras la famille de ta mère, ses parents et grands-parents s'insèrent tout seuls au-dessus de Marie-France Hannier, sans arbre séparé.
- **Vues** (menu en haut à gauche) : *Tout l'arbre*, *Descendance de…*, *Ascendance de…* (les ancêtres d'une personne) ou *Ascendance et descendance*. Les boutons « Sa descendance » / « Ses ancêtres » d'une fiche font pareil. L'adresse contient `#vue=…`, on peut la partager. Pour un gros arbre, c'est la vue *Ascendance de…* qui donne un bel arbre « pedigree » lisible.
- **Cartes** : dates précises (`30/06/1900 – 12/03/1992`, `~` = vers, `<` avant, `>` après), pastilles : ● vivant(e) / † décédé(e), 📍 lieu de naissance, 💼 métier (le survol donne le texte complet). Le bouton *Cartes compactes* réduit les cartes (années seulement) pour gagner de la place.
- **Mini-carte** en bas à droite dès que l'arbre dépasse l'écran : clic ou glisser pour se déplacer, bouton *Mini-carte* pour la masquer.
- **Mode sombre / clair** : bouton lune/soleil ; le choix est mémorisé, et le PDF est toujours imprimé en clair.
- **Recherche** : la barre accepte plusieurs mots (`boulanger elbeuf 1926`) et cherche dans les prénoms, noms de naissance et d'usage (donc les noms de jeune fille), métiers, lieux de naissance / décès / mariage, années et notes. Le bouton **Filtres** ajoute : nom, métier, lieu, années de naissance et de décès (de… à…), vivant(e)/décédé(e), sexe. Les résultats sont **surlignés dans l'arbre** (les autres sont estompés) ; *Effacer la recherche* remet tout.
- **Zoom** : − / +, *Tout voir*, Ctrl + molette ; glisser pour se déplacer.
- **Photos** : sur les cartes détaillées et en grand dans la fiche ; galerie pour les autres images.
- **Export PDF** : bouton *Exporter en PDF* → A4 ou A3 → « Enregistrer au format PDF ». La vue affichée (tout l'arbre ou une vue par personne) est mise à l'échelle de la page ; pour un gros arbre, choisir une vue plus petite.
- **Ajouter / modifier sans toucher au code** : *Ajouter une personne* (enfant, conjoint(e) ou parent de quelqu'un, ou sans lien), *Modifier la fiche* dans chaque fiche. **Les dates se saisissent en jour / mois / année**, avec une précision (exacte, vers, avant, après) ; une date déjà écrite en texte libre reste modifiable telle quelle. Une fiche « Inconnu(e) » se complète avec *Modifier la fiche*.

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

## Vie privée et dates des personnes vivantes

Le dépôt GitHub étant public, `data.js` l'est aussi. Par défaut (`hideLiving: true`), pour les personnes **vivantes** (sans date de décès et nées il y a moins de 105 ans) seule l'**année de naissance** est publiée, et le formulaire applique la même règle.

Pour publier **les dates complètes des vivants** (jour, mois, lieu de naissance) : remplace `data.js` par **`tools/data_avec_dates_vivants.js`** (renomme-le `data.js`). C'est ton choix : dans ce cas les dates de naissance de Georgette, Jean-Louis, Pierre, Marie-France, Mailyne et Timéo seront lisibles par tout le monde. Les adresses e-mail du GEDCOM ne sont jamais copiées.

Pour un arbre entièrement privé : dépôt privé (GitHub Pages privé : offre payante).

## Format de `data.js`

```js
PEOPLE   = { "louis_bacquet": { given, surname, marriedName, sex: "H"|"F"|"", birth, birthPlace,
                                dead: true, death, deathPlace, deathCause, job, anecdote, note,
                                photo, photos: [...] }, ... }
FAMILIES = [ { id, husb, wife, children: ["id", ...], married: true, marriage: { date, place } }, ... ]
```

Une famille peut n'avoir qu'un seul parent. Une personne peut appartenir à plusieurs familles (remariages). Les dates sont du texte au format `"12 mars 1900"`, `"mars 1900"`, `"1900"`, `"vers 1840"` (préfixes `vers`, `avant`, `après`) ; d'autres formulations restent affichables mais ne sont pas triables.
