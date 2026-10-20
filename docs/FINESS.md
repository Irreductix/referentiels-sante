# FINESS+ : correspondance des colonnes

Ce document trace chaque colonne produite jusqu'au champ du flux JSON FINESS+
dont elle provient, et signale les choix faits. Le schéma de référence est
`flux/out/data.gouv/structure/schema/schema-structures-v1.json` dans le dépôt
[ansforge/finess](https://github.com/ansforge/finess).

## Vocabulaire

| Terme FINESS+ | Sens |
|---|---|
| PMEJ | personne morale, entité juridique : porte le numéro FINESS EJ |
| EGE | entité géographique d'exercice : l'établissement, numéro FINESS ET |
| GCC | groupement conventionnel, sans personnalité morale ; les 135 GCC du flux observé sont les groupements hospitaliers de territoire (types `001` et `002`) |
| GCO | groupement de coopération doté de la personnalité morale (GCS, GIE…), lui-même une PMEJ |
| etatObjet | `A` actif, `I` inactif |

Le flux ne transporte que des codes. Les libellés proviennent des tables NOS
de l'ANS listées dans [SOURCES.md](SOURCES.md). Une table injoignable laisse la
colonne de libellé vide et est consignée dans `structures-resume.json`.

## etablissements.csv

Une ligne par EGE. Le flux imbrique les EGE sous leur PMEJ ; les colonnes
`ej_*` recopient quelques attributs de l'entité juridique pour éviter une
jointure.

| Colonne | Origine | Remarque |
|---|---|---|
| finess_et | ege.informationsGeneralesEGE.numFinessEge | |
| finess_ej | pmej.informationsGeneralesPMEJ.numFinessPm | |
| id_ege, id_pmej | egeId, pmSmsseId | identifiants techniques internes, utilisés par les groupements et les rôles |
| nom_court, nom_long, complement_denomination | nomEgeCourt, nomEgeLong, complementDenominationEg | |
| siret | siret | |
| categorie, categorie_libelle | categorieentiteGeographiqueExercice, TRE_R66 | |
| domaine | ASS_X10 | `SAN` sanitaire, `SOC` social |
| categorie_agregat_niv1..3 et libellés | ASS_X10, TRE_R63, TRE_R64, TRE_R65 | le niveau 3 correspond à `categagretab` de l'ancien flux |
| mode_fixation_tarifaire, libellé | modefixationtarifaire, TRE_R74 | |
| espic, espic_libelle | informationsGeneralesEGE.espic[0], TRE_R73 | le tableau n'a jamais plus d'un élément dans le flux observé ; vide pour la majorité des établissements sociaux |
| type_budget | typeBudget | valeurs multiples jointes par `\|` |
| etat, etat_libelle | etatObjet | |
| date_ouverture, date_premiere_autorisation, date_fermeture | dateOuverture, datePremiereAutorisation, dateFermeture | |
| usage_adresse et colonnes d'adresse | adresse[] | adresse d'usage `03` si présente, sinon la première ; `nb_adresses` donne le nombre total |
| code_commune_insee | adresse.cogCommune | code officiel géographique sur 5 caractères |
| departement, code_commune | déduits du COG | `2A`, `2B`, `971` à `989` traités |
| departement_historique, code_commune_historique | déduits du COG | codage de l'ancien flux : `9A` Guadeloupe, `9B` Martinique, `9C` Guyane, `9D` La Réunion, `9E` Saint-Pierre-et-Miquelon, `9F` Mayotte, `9J` Wallis-et-Futuna, commune sur trois caractères |
| departement_libelle | TRE_G09 | |
| latitude, longitude | coordonneesGeographique.directionLatitude, directionLongitude | WGS 84, en degrés décimaux, sauf dans les fichiers produits depuis un flux antérieur au 6 octobre 2026 (voir la ligne suivante) |
| coordonnee_x, coordonnee_y | coordonneesGeographique.coordonneeX, coordonneeY | Lambert 93, recopiées telles quelles. Avant le 6 octobre 2026, pour la majorité des adresses, `coordonnee_x` et `coordonnee_y` contenaient la longitude et la latitude en degrés, et `latitude` et `longitude` les coordonnées Lambert 93 en mètres : les deux couples étaient permutés. Voir « Anomalies observées dans la source » |
| cle_ban, score_ban | cleInInteropBAN, scoreBAN | rapprochement avec la Base adresse nationale |
| telephone, telecopie, courriel | contact[] | contact de rôle `01` si présent, sinon le premier |
| numero_education_nationale, numero_reference_externe | idem | |
| ege_porteuse_id, ege_porteuse_finess | roleEge[] | renseignés quand l'établissement est « non porteur » (secondaire) d'un autre EGE de la même entité juridique |
| nb_ege_rattachees | roleEge[] | nombre d'EGE dont celui-ci est porteur |
| ej_denomination, ej_statut_juridique, ej_statut_juridique_libelle, ej_code_ape | PMEJ parente | |
| date_derniere_maj | dateDerniereMaj | horodatage ISO 8601 |
| ej_statut_juridique_agregat_niv1, niv2 et libellés | PMEJ parente, ASS_X11, TRE_R68, TRE_R69 | agrégats officiels du statut juridique de l'entité : `1000` organismes et établissements publics (`1100` État et collectivités, `1200` établissements publics), `2100` privé à but non lucratif, `2200` privé à caractère commercial, `3000` droit étranger |
| secteur | déduit des agrégats | `public`, `privé non lucratif`, `privé lucratif` ou `étranger` ; la nature juridique est celle de l'entité, les ESPIC sont des `privé non lucratif` dont la colonne `espic` dit le statut |
| ght_id, ght_nom, ght_role | GCC de type `001` ou `002` dont l'entité est membre | groupement hospitalier de territoire de l'entité juridique : `S` établissement support, `M` membre ; vides hors GHT |

## entites-juridiques.csv

| Colonne | Origine |
|---|---|
| finess_ej, id_pmej | numFinessPm, pmSmsseId |
| denomination, denomination_longue, complement_adresse | denominationPm, denominationLonguePmSmsse, complementAdressePmSmsse |
| siren, code_ape | siren, codeApe |
| statut_juridique et libellé, agrégats niv1 et niv2 | statutJuridique, TRE_R72, ASS_X11, TRE_R68, TRE_R69 |
| type_personne_morale, fonction_publique, type_groupe_gco | champs homonymes ; ces codes internes n'ont pas de table NOS publiée, ils sont restitués bruts |
| etat, date_creation, date_fermeture | etatObjet, dateCreation, dateFermeture |
| colonnes d'adresse et de contact | comme pour les établissements, adresse d'usage `02` (siège) |
| nb_etablissements, nb_etablissements_actifs | calculés sur `ege[]` |
| date_derniere_maj | dateDerniereMaj |
| secteur | déduit des agrégats du statut juridique : `public`, `privé non lucratif`, `privé lucratif`, `étranger` |
| ght_id, ght_nom, ght_role | GCC de type `001` ou `002` dont l'entité est membre : son GHT, et son rôle (`S` support, `M` membre) ; les GHT précèdent les entités dans le flux, ce qui permet de les écrire sur chaque ligne |

Jusqu'à la 0.3.4, ce fichier portait aussi `categorie` et `categorie_libelle` : la catégorie n'existe qu'au niveau de l'établissement dans FINESS+, et ces deux colonnes étaient vides pour les 98 000 entités juridiques. Elles ont été retirées en 0.3.5.

## groupements-conventionnels.csv, groupements-cooperation.csv, groupements-membres.csv

Les groupements référencent leurs membres par identifiants techniques
(`pmSmsseId`, `egeId`). L'outil construit l'index au fil de la lecture et écrit
les groupements en fin de parcours, avec les numéros FINESS et dénominations
résolus. Un membre non résolu (identifiant absent du flux) garde son
identifiant et des colonnes FINESS vides.

`role` reprend `typeRoleEntiteGroupe` : dans les GHT, `S` désigne
l'établissement support et `M` un membre.

### groupements-conventionnels.csv

Un groupement conventionnel (GCC, dont les GHT) par ligne.

| Colonne | Origine | Remarque |
|---|---|---|
| id_gcc | gccId | identifiant technique du groupement |
| nom | nomGcc | |
| type_gcc | typeGcc | code restitué brut |
| identifiant_externe | gccIdentifiantExterne | |
| etat, etat_libelle | etatObjet | libellé : `A` actif, `I` inactif |
| nb_membres_ej, nb_membres_et | calculés sur `pmejDuGcc[]` et `egeDuGcc[]` | |
| date_derniere_maj | dateDerniereMaj | horodatage ISO 8601 |

### groupements-cooperation.csv

Un groupement de coopération doté de la personnalité morale (GCO, dont les
GCS) par ligne.

| Colonne | Origine | Remarque |
|---|---|---|
| finess_ej, denomination | PMEJ porteuse du groupement, retrouvée par `pmSmsseId` | vides si cette PMEJ est absente du flux |
| id_pmej | pmSmsseId | |
| type_gco | typeGco | code restitué brut |
| nb_membres_ej, nb_membres_et | calculés sur `pmejDuGco[]` et `egeDuGco[]` | |

### groupements-membres.csv

Un membre de groupement par ligne, pour les deux sortes de groupements.

| Colonne | Origine | Remarque |
|---|---|---|
| groupement_type | `GCC` ou `GCO` | |
| groupement_id | `id_gcc` du GCC, ou `id_pmej` du GCO | |
| groupement_nom | `nom` du GCC, ou `denomination` du GCO | |
| membre_type | `EJ` ou `ET` | `EJ` pour un membre de `pmejDuGcc[]` ou `pmejDuGco[]`, `ET` pour `egeDuGcc[]` ou `egeDuGco[]` |
| membre_id | pmSmsseId ou egeId du membre | |
| membre_finess, membre_denomination | numéro FINESS et dénomination du membre, retrouvés dans le flux | vides si le membre est absent du flux |
| role | typeRoleEntiteGroupe | voir plus haut |

## Fichiers JSON Lines

`etablissements.jsonl`, `entites-juridiques.jsonl` et `activites.jsonl`
contiennent les mêmes lignes et les mêmes colonnes que le CSV de même nom, un
objet JSON par ligne. Une valeur absente, cellule vide dans le CSV, y vaut
`null` ou n'apparaît pas dans l'objet.

## etablissements-format-historique.csv

Reproduit la section `structureet` de l'ancien jeu Etalab `etalab_cs1100502` :
première ligne `finess;finess-plus;<version du schéma>;<date du flux>`, puis
32 champs séparés par `;`, sans en-tête ni guillemets superflus, en UTF-8.

| Position | Champ historique | Origine FINESS+ | Écart |
|---|---|---|---|
| 1 | structureet | constante | |
| 2, 3 | nofinesset, nofinessej | finess_et, finess_ej | |
| 4, 5, 6 | rs, rslongue, complrs | nom_court, nom_long, complement_denomination | |
| 7 | compldistrib | complement_point_geographique | rapprochement le plus proche, à valider |
| 8 à 11 | numvoie, typvoie, voie, compvoie | adresse | |
| 12 | lieuditbp | lieu_dit | les boîtes postales y figurent bien |
| 13, 14 | commune, departement | code_commune_historique, departement_historique | |
| 15 | libdepartement | TRE_G09 en majuscules, sans accents ni apostrophe, sans le numéro entre parenthèses | « VAL D OISE » |
| 16 | ligneacheminement | code_postal + commune_acheminement en majuscules sans accents | FINESS+ écrit certaines communes en casse mixte (« Bourg-en-Bresse ») |
| 17, 18 | telephone, telecopie | contact principal | |
| 19, 20 | categetab, libcategetab | categorie, TRE_R66 (libellé long) | l'ancien flux utilisait le libellé long des tables NOS, pas le libellé adapté |
| 21, 22 | categagretab, libcategagretab | agrégat niveau 3, TRE_R65 (libellé long) | |
| 23 | siret | siret | |
| 24 | codeape | vide | l'ancien flux portait un code APE propre à l'établissement, que FINESS+ ne fournit pas ; celui de l'entité juridique est dans `etablissements.csv` (colonne `ej_code_ape`) |
| 25, 26 | codemft, libmft | mode_fixation_tarifaire, TRE_R74 (libellé long) | |
| 27, 28 | codesph, libsph | espic, TRE_R73 (libellé long) | mêmes codes que l'ancien flux |
| 29, 30 | dateouv, dateautor | date_ouverture, date_premiere_autorisation | |
| 31 | datemaj | date_derniere_maj (date seule) | |
| 32 | numuai | numero_education_nationale | |

La section `geolocalisation` de l'ancien jeu `etalab_cs1100507` n'est pas
reproduite, à cause de l'incertitude sur l'orientation des coordonnées
projetées signalée plus haut. Les coordonnées WGS 84 sont dans
`etablissements.csv` (permutées avec les coordonnées Lambert dans les fichiers
produits depuis un flux antérieur au 6 octobre 2026).

### Écarts mesurés avec la dernière extraction Etalab

Le fichier produit depuis le flux FINESS+ du 11 septembre 2026 a été comparé,
champ par champ, à la dernière extraction de l'ancien flux (4 mai 2026), sur
les 102 938 établissements présents dans les deux. Les identifiants, codes de
catégorie, d'agrégat, de mode de fixation tarifaire, de statut ESPIC, codes
commune et département, téléphones et dates d'autorisation concordent dans
plus de 99 % des cas. Les écarts restants viennent de la source, pas de la
conversion :

| Champ | Lignes différentes | Explication |
|---|---|---|
| codeape | 45 % | l'ancien flux portait un APE d'établissement ; FINESS+ ne le fournit pas, le champ est laissé vide |
| dateouv | 36 % | FINESS+ a redéfini la date d'ouverture, souvent alignée sur la première autorisation ; l'ancien flux y mettait une date de réouverture ou de mise à jour |
| libmft, libcategetab, libsph | 29 %, 8 %, 1 % | les libellés viennent désormais des tables NOS, dont la rédaction a évolué (« ARS - DG » pour « ARS / DG », « Service autonomie aide et soins » pour « SSIAD ») |
| datemaj | 27 % | mises à jour intervenues depuis mai 2026 |
| voie, typvoie, numvoie | 24 %, 19 %, 2 % | FINESS+ a recodifié une partie des adresses via la Base adresse nationale : type de voie vide, libellé complet en casse mixte (« Rue Alexandre Bérard »), indice de répétition accolé au numéro (« 28b ») |
| rslongue, complrs | 24 %, 0,2 % | FINESS+ renseigne la raison sociale longue là où l'ancien flux la laissait vide |
| rs | 4 % | casse différente sur quelques raisons sociales courtes |
| ligneacheminement | 3 % | « SAINT » écrit en toutes lettres là où l'ancien flux abrégeait « ST » ; codes postaux d'arrondissement mis à jour (« 06300 NICE » pour « 06000 NICE ») |

### Anomalies observées dans la source

Dans le flux FINESS+ du 11 septembre 2026, environ 1 400 libellés de voie
avaient perdu la séquence « TH », remplacée par « E » : « rue de la Catherinette »
devenait « CAEERINETTE », « Monthieux » « MONEIEUX », « Berthelot » « BEREELOT »,
« Thoiry » « EOIRY ». Le phénomène touchait aussi des adresses d'entités
juridiques. L'ANS a déclaré l'anomalie corrigée le 5 octobre 2026
([ticket 28 du dépôt ansforge/finess](https://github.com/ansforge/finess/issues/28),
fermé). Dans le flux du 13 octobre, quelques adresses restent touchées, par
exemple « R PAUL BEREELOT ». L'outil recopie la source sans la corriger.

Dans les mêmes flux, `coordonneeX` et `coordonneeY` portaient selon les adresses
tantôt les coordonnées Lambert, tantôt la longitude et la latitude, les champs
de latitude et de longitude portant alors le Lambert
([ticket 24](https://github.com/ansforge/finess/issues/24), fermé le 5 octobre
2026). Dans le flux du 13 octobre, les deux couples sont à leur place pour tous
les établissements géolocalisés de métropole. Pour un fichier produit avant cette date,
vérifiez la plage de valeurs avant tout usage cartographique.

Les fichiers produits à partir d'un flux antérieur au 6 octobre 2026 contiennent
encore ces deux défauts, y compris l'archive `finess-202610`, construite depuis
l'instantané mensuel du 1er octobre.

## activites.csv

Une ligne par activité autorisée (niveau `autorisee`, portée par l'entité
juridique) et par activité exercée (niveau `exercee`, portée par
l'établissement). Les règles suivent le cas d'usage publié par l'ANS
(`use-cases/finess-activites-json-to-table/mapping.md`).

| Colonne | Origine | Règle |
|---|---|---|
| date_flux | generatedAt | date du fichier source |
| finess_ej, finess_et | pmej.numFiness, ege.numFinessEge | vide pour une autorisation |
| niveau | | `autorisee` ou `exercee` |
| id_activite | caracteristiquesGeneriques.activiteAeId | |
| nature, nature_libelle | nature.codeNature, TRE_r374 | AASA, ASR, EML, ASDR, ASOCR, AMSR, AER, AMF, AMM |
| code_activite | composé | nature et attributs spécifiques joints par `_`, règle ANS |
| activite, activite_libelle | typeActivite* | table selon la nature : TRE_R274 (AMF, AASA, ASR), TRE_r381 (AMM), JDV_j240 (ASDR), TRE_r401 (ASOCR, AMSR), TRE_r402 (AER) |
| modalite, forme et libellés | typeActivite* | TRE_r405 et TRE_r406 (AMF, AASA, ASR), TRE_r382 (modalité AMM) |
| mention, pratique, declaration et libellés | typeActiviteAMM | TRE_r383, TRE_r384, TRE_r385 |
| mode_fonctionnement, public et libellés | ASDR, ASOCR, AMSR, AER | TRE_r404, TRE_r403 |
| type_eml, type_eml_libelle | typeActiviteEML.typeEmlId | l'identifiant (1, 2, 4…) renvoie via TRE_r392 à un code `EML/05602` dont le libellé vient de TRE_R272 |
| nb_appareils | typeActiviteAMM.appareil[] | somme de `nombreAppareilAMM` |
| etat | caracteristiquesGeneriques.etatObjet | |
| statut, statut_libelle | calculé | `3` inactive ; `1` active et mise en œuvre si le plus récent des événements `12` ou `15` est un `12` ; `2` sinon |
| type_activite_smsse, type_activite_smsse_libelle | caracteristiquesGeneriques.typeActiviteSMSSE, TRE_r392 | identifiant du type d'activité ; son « libellé » est le code composé officiel, par exemple `AMM/QA014/MO030/ME000/PTS00/DE000` |
| identifiant_autorisation, num_autorisation_arhgos | idem | `identifiant_autorisation` relie l'activité exercée à l'`activiteAeId` de son autorisation |
| date_debut, date_fin, date_fin_effective, date_caducite | idem | |
| capacite_autorisee | capacite[] de l'autorisation, `statutCapacite = 01` | seules les capacités totales (sans mode de financement, habilitation, type de logement ni genre) sont sommées ; `0` si aucune autorisation liée |
| capacite_installee | capacite[] de l'activité exercée, `statutCapacite = 09` | même règle ; vide pour une autorisation |
