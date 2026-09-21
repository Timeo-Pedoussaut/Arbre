/*
  DONNÉES DE L'ARBRE : généré depuis un export GEDCOM par tools/gedcom_vers_data.py
  ==========================================================================
  Tu peux modifier ce fichier à la main, mais le plus simple est d'utiliser le bouton
  « Ajouter une personne » / « Modifier la fiche » du site, puis « Publier mes modifications »
  qui télécharge un data.js à jour à déposer dans le dépôt GitHub.

  PEOPLE    : une entrée par personne (identifiant unique = la clé).
     given, surname, marriedName, sex ("H"/"F"/""), birth, birthPlace, dead (true si décédé(e)),
     death, deathPlace, deathCause, job, anecdote, note, photo, photos (liste de chemins)
  FAMILIES  : une entrée par couple (ou par parent seul) avec ses enfants.
     id, husb, wife, children [ids], married (true si mariés), marriage {date, place}
*/

const SITE_CONFIG = {"title": "L'arbre des Clavaud de Luçon", "hideLiving": true};

const PEOPLE = {
  "pierre_pedoussaut": {"given": "Pierre", "surname": "Pedoussaut", "sex": "H", "birth": "21 décembre 1970", "birthPlace": "Rouen"},
  "marie_france_hannier": {"given": "Marie-France", "surname": "Hannier", "sex": "F", "birth": "18 juin 1969", "birthPlace": "Petit-Quevilly"},
  "timeo2_pedoussaut": {"given": "Timéo", "surname": "Pedoussaut", "sex": "H", "birth": "12 novembre 2004", "birthPlace": "Rouen"},
  "georgette_bacquet": {"given": "Georgette", "surname": "Bacquet", "marriedName": "Pedoussaut", "sex": "F", "birth": "24 août 1940"},
  "louis_bacquet": {"given": "Louis", "surname": "Bacquet", "sex": "H", "birth": "30 juin 1900", "dead": true, "death": "1992"},
  "jeanne_marie_charlotte_clavaud_de_lucon": {"given": "Jeanne Marie Charlotte", "surname": "Clavaud de Luçon", "sex": "F", "birth": "31 mars 1905", "dead": true, "death": "13 octobre 1993", "deathPlace": "Canteleu"},
  "marie_charlotte_levasseur": {"given": "Marie Charlotte", "surname": "Levasseur", "marriedName": "Clavaud de Luçon", "sex": "F", "birth": "21 avril 1884", "birthPlace": "Bois-Guillaume", "dead": true, "death": "1970", "photo": "photos/marie_charlotte_levasseur-1.jpg", "photos": ["photos/marie_charlotte_levasseur-1.jpg", "photos/marie_charlotte_levasseur-2.jpg"]},
  "andre_clavaud_de_lucon": {"given": "André", "surname": "Clavaud de Luçon", "sex": "H", "birth": "vers 15 mars 1840", "birthPlace": "Talnoe, Russie", "dead": true, "death": "1913", "deathPlace": "Elbeuf", "deathCause": "Maladie", "job": "Soldat à la 1re compagnie de pionniers de discipline", "anecdote": "En 1848 il a eu un acte de notoriété qu'il a dû faire quand il est rentré en France à 18ans", "photo": "photos/andre_clavaud_de_lucon-1.jpg", "photos": ["photos/andre_clavaud_de_lucon-1.jpg", "photos/andre_clavaud_de_lucon-2.jpg"]},
  "zelie_dacher": {"given": "Zelie", "surname": "Dacher", "sex": "F", "dead": true, "deathPlace": "1970"},
  "inconnu_500011": {"given": "", "surname": "", "sex": "H"},
  "mailyne_pedoussaut": {"given": "Mailyne", "surname": "Pedoussaut", "sex": "F", "birth": "2 janvier 2001", "birthPlace": "Rouen"},
  "roger_pedoussaut": {"given": "Roger", "surname": "Pedoussaut", "sex": "H"},
  "jean_louis_pedoussaut": {"given": "Jean-Louis", "surname": "Pedoussaut", "sex": "H", "birth": "14 août 1960"},
  "marie_lea_thomas": {"given": "Marie Léa", "surname": "Thomas", "sex": "F", "dead": true, "death": "28 juin 1890", "deathPlace": "Elbeuf"},
  "louis_emile_tibere_clavaud_de_lucon": {"given": "Louis Emile Tibère", "surname": "Clavaud de Luçon", "sex": "H", "birth": "8 mai 1877", "birthPlace": "Elbeuf", "dead": true, "death": "5 septembre 1916", "deathPlace": "Meuse", "deathCause": "Au combat", "photo": "photos/louis_emile_tibere_clavaud_de_lucon-1.jpg", "photos": ["photos/louis_emile_tibere_clavaud_de_lucon-1.jpg", "photos/louis_emile_tibere_clavaud_de_lucon-2.jpg"]},
  "george_amedee_clavaud_de_lucon": {"given": "George Amédée", "surname": "Clavaud de Luçon", "sex": "H", "birth": "16 septembre 1873", "birthPlace": "Elbeuf", "dead": true, "death": "30 novembre 1914", "deathPlace": "Fay, Somme", "deathCause": "Au combat", "job": "Peintre décorateur, Soldat (205ème régiment d'infanterie, soldat de deuxième classe)", "photo": "photos/george_amedee_clavaud_de_lucon-1.jpg", "photos": ["photos/george_amedee_clavaud_de_lucon-1.jpg", "photos/george_amedee_clavaud_de_lucon-2.jpg"]},
  "charles_serge_andre_clavaud_de_lucon": {"given": "Charles Serge André", "surname": "Clavaud de Luçon", "sex": "H", "birth": "1er juillet 1899", "birthPlace": "Elbeuf", "dead": true, "death": "4 juillet 1959", "deathPlace": "Paris (18e)", "job": "Peintre dessinateur", "photo": "photos/charles_serge_andre_clavaud_de_lucon-1.jpg", "photos": ["photos/charles_serge_andre_clavaud_de_lucon-1.jpg", "photos/charles_serge_andre_clavaud_de_lucon-2.jpg", "photos/charles_serge_andre_clavaud_de_lucon-3.jpg", "photos/charles_serge_andre_clavaud_de_lucon-4.jpg"]},
  "yves_maurice_clavaud_de_lucon": {"given": "Yves Maurice", "surname": "Clavaud de Luçon", "sex": "H", "birth": "28 avril 1903", "dead": true, "death": "25 octobre 1978", "deathPlace": "2/4rue du Parc Chevirons", "job": "Electricien et Teinturier", "photo": "photos/yves_maurice_clavaud_de_lucon-1.jpg", "photos": ["photos/yves_maurice_clavaud_de_lucon-1.jpg", "photos/yves_maurice_clavaud_de_lucon-2.jpg"]},
  "odette_louise_andree_clavaud_de_lucon": {"given": "Odette Louise Andrée", "surname": "Clavaud de Luçon", "sex": "F", "birth": "12 septembre 1907", "dead": true, "death": "1993", "deathPlace": "Rouen"},
  "georgette_suzanne_marie_clavaud_de_lucon": {"given": "Georgette Suzanne Marie", "surname": "Clavaud de Luçon", "sex": "F", "birth": "15 octobre 1909", "dead": true},
  "valentin_bidault": {"given": "Valentin", "surname": "Bidault", "sex": "H", "dead": true},
  "marie_josephine_clavaud_de_lucon": {"given": "Marie Joséphine", "surname": "Clavaud de Luçon", "sex": "F", "birth": "15 octobre 1911", "dead": true},
  "henri_clavaud_de_lucon": {"given": "Henri", "surname": "Clavaud de Luçon", "sex": "H"},
  "inconnu_500025": {"given": "", "surname": "", "sex": "F"},
  "nicole_clavaud_de_lucon": {"given": "Nicole", "surname": "Clavaud de Luçon", "sex": "F"},
  "inconnu_500027": {"given": "", "surname": "", "sex": "F"},
  "benedicte": {"given": "Benedicte", "surname": "", "sex": "F"},
  "inconnu_500029": {"given": "", "surname": "", "sex": "H"},
  "inconnu_500030": {"given": "", "surname": "", "sex": ""},
  "emmanuel_basille": {"given": "Emmanuel", "surname": "Basille", "sex": "H"},
  "fanny": {"given": "Fanny", "surname": "", "marriedName": "Basille", "sex": "F"},
  "charles_clavaud_de_lucon": {"given": "Charles", "surname": "Clavaud de Luçon", "sex": "H", "dead": true},
  "morice_bacquet": {"given": "Maurice Yves", "surname": "Bacquet", "sex": "H", "birth": "29 septembre 1937", "dead": true, "death": "12 juin 2018", "deathPlace": "Canteleu"},
  "andre_bacquet": {"given": "André", "surname": "Bacquet", "sex": "H", "dead": true},
  "jean_bacquet": {"given": "Jean", "surname": "Bacquet", "sex": "H", "dead": true},
  "louisette_bacquet": {"given": "Louisette", "surname": "Bacquet", "sex": "F", "dead": true},
  "serge_george_andre_clavaud_de_lucon": {"given": "Serge George André", "surname": "Clavaud de Luçon", "sex": "H", "birth": "1926", "dead": true, "death": "1994", "deathPlace": "Toulouse"},
  "inconnu_500039": {"given": "", "surname": "", "sex": "F"},
  "marie_julie_josephine_lethiec": {"given": "Marie Julie Joséphine", "surname": "Léthiec", "marriedName": "Clavaud de Luçon", "sex": "F", "dead": true},
  "hugues_jean_jacques_lucien_clavaud": {"given": "Hugues Jean-Jacques Lucien", "surname": "Clavaud", "sex": "H", "birth": "1932", "birthPlace": "Paris", "dead": true, "death": "1999", "deathPlace": "Paris"},
  "marie_josephine_lea_clavaud": {"given": "Marie Joséphine Léa", "surname": "Clavaud", "sex": "F", "birth": "1872", "job": "Institutrice"},
  "andre_auguste_gaston_deleurme": {"given": "André Auguste Gaston", "surname": "Deleurme", "sex": "H", "dead": true},
  "camille_jules_deleurme": {"given": "Camille Jules", "surname": "Deleurme", "sex": "H", "birth": "28 mars 1866", "birthPlace": "Brest", "dead": true, "job": "Ancien Soldat", "anecdote": "Libéré au deuxième régiment étranger domicilié à Oissel et de droit à Sidi Bel Ables en Algérie"},
  "jeanne_lea_marie_deleurme": {"given": "Jeanne Léa marie", "surname": "Deleurme", "sex": "F", "dead": true},
  "guy_clavaud_de_lucon": {"given": "Guy", "surname": "Clavaud de Luçon", "sex": "H", "birth": "2 novembre 1926", "birthPlace": "Caudebec-lès-Elbeuf", "dead": true, "job": "Boulanger", "photo": "photos/guy_clavaud_de_lucon-1.jpg", "photos": ["photos/guy_clavaud_de_lucon-1.jpg", "photos/guy_clavaud_de_lucon-2.jpg", "photos/guy_clavaud_de_lucon-3.jpg", "photos/guy_clavaud_de_lucon-4.jpg", "photos/guy_clavaud_de_lucon-5.jpg", "photos/guy_clavaud_de_lucon-6.jpg", "photos/guy_clavaud_de_lucon-7.jpg"]},
  "elisabeth_renee_cave": {"given": "Elisabeth Renée", "surname": "Cave", "sex": "F"}
};

const FAMILIES = [
  {"id": "F500001", "husb": "pierre_pedoussaut", "wife": "marie_france_hannier", "children": ["mailyne_pedoussaut", "timeo2_pedoussaut"]},
  {"id": "F500002", "husb": "inconnu_500011", "wife": "georgette_bacquet", "children": ["pierre_pedoussaut"]},
  {"id": "F500003", "husb": "louis_bacquet", "wife": "jeanne_marie_charlotte_clavaud_de_lucon", "children": ["georgette_bacquet", "morice_bacquet", "andre_bacquet", "jean_bacquet", "louisette_bacquet"], "married": true, "marriage": {"date": "8 octobre 1925"}},
  {"id": "F500004", "husb": "andre_clavaud_de_lucon", "wife": "marie_charlotte_levasseur", "children": ["charles_serge_andre_clavaud_de_lucon", "yves_maurice_clavaud_de_lucon", "jeanne_marie_charlotte_clavaud_de_lucon", "odette_louise_andree_clavaud_de_lucon", "georgette_suzanne_marie_clavaud_de_lucon", "marie_josephine_clavaud_de_lucon", "charles_clavaud_de_lucon"], "married": true, "marriage": {"date": "13 janvier 1912", "place": "Elbeuf"}},
  {"id": "F500005", "wife": "zelie_dacher", "children": ["louis_bacquet"]},
  {"id": "F500006", "husb": "roger_pedoussaut", "wife": "georgette_bacquet", "children": ["jean_louis_pedoussaut"], "married": true},
  {"id": "F500007", "husb": "andre_clavaud_de_lucon", "wife": "marie_lea_thomas", "children": ["george_amedee_clavaud_de_lucon", "louis_emile_tibere_clavaud_de_lucon", "marie_josephine_lea_clavaud"]},
  {"id": "F500008", "husb": "valentin_bidault", "wife": "georgette_suzanne_marie_clavaud_de_lucon", "children": [], "married": true},
  {"id": "F500009", "husb": "louis_emile_tibere_clavaud_de_lucon", "wife": "inconnu_500025", "children": ["henri_clavaud_de_lucon"]},
  {"id": "F500010", "husb": "henri_clavaud_de_lucon", "wife": "inconnu_500027", "children": ["nicole_clavaud_de_lucon"]},
  {"id": "F500011", "husb": "inconnu_500029", "wife": "nicole_clavaud_de_lucon", "children": ["benedicte"]},
  {"id": "F500012", "husb": "inconnu_500030", "wife": "benedicte", "children": ["emmanuel_basille"], "married": true},
  {"id": "F500013", "husb": "emmanuel_basille", "wife": "fanny", "children": [], "married": true},
  {"id": "F500014", "husb": "charles_serge_andre_clavaud_de_lucon", "wife": "inconnu_500039", "children": ["serge_george_andre_clavaud_de_lucon"]},
  {"id": "F500015", "husb": "charles_serge_andre_clavaud_de_lucon", "wife": "marie_julie_josephine_lethiec", "children": ["hugues_jean_jacques_lucien_clavaud"], "married": true},
  {"id": "F500016", "husb": "camille_jules_deleurme", "wife": "marie_josephine_lea_clavaud", "children": ["andre_auguste_gaston_deleurme", "jeanne_lea_marie_deleurme"]},
  {"id": "F500017", "husb": "yves_maurice_clavaud_de_lucon", "wife": "elisabeth_renee_cave", "children": ["guy_clavaud_de_lucon"]}
];