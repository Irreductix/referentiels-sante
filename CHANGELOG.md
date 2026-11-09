# Journal des versions

## 0.9.0 (novembre 2026)

- FINESS : la latitude et la longitude sont calculées depuis `coordonnee_x` et `coordonnee_y` quand le flux ne les donne pas. Depuis le fichier mensuel de novembre 2026, un quart des établissements actifs (environ 26 000, dont de grands sites hospitaliers) portaient x et y sans latitude ni longitude. Le calcul suit la projection du territoire (Lambert 93 en métropole, UTM outre-mer) et retombe au centimètre près sur les positions du flux là où les deux existent. Nouvelle colonne `latitude_longitude_origine` en fin de ligne des établissements et des entités juridiques : `source`, `calcul` ou vide. `structures-resume.json` compte les positions calculées et les établissements restés sans position ; la mention de source le dit aussi.
- Surveillance du lundi : la veille de la NGAP lit les archives du Journal officiel en flux et se rabat sur l'archive complète quand la DILA a retiré les archives quotidiennes de la période, ce qui s'est produit le 8 novembre 2026. Une archive coupée fait échouer la veille au lieu de passer pour vide.

## 0.8.1 (novembre 2026)

- Commande `ngap` : la date de version du document est lue dans ses pieds de page et reportée dans `ngap-resume.json` ; l'option `--communique` y ajoute la date à laquelle l'Assurance Maladie a communiqué le document.
- Les tables de la NGAP sont publiées : release `ngap-AAAAMMJJ` (archive des tables et document source) et adresse fixe `donnees-du-mois/ngap.zip`, avec une mention de source dans `MENTION-SOURCE.txt`. Ce sont des informations publiques communiquées au titre du droit d'accès, réutilisées avec leur source et leur date (articles L. 321-1 et L. 322-1 du code des relations entre le public et l'administration). README, site et documentation mis à jour.
- Surveillance du lundi : veille de la NGAP au Journal officiel. Une décision de l'UNCAM dont les articles citent la NGAP ouvre un ticket, avec le lien du texte et ce qu'il dit de son entrée en vigueur : c'est le moment de redemander le document Word à l'Assurance Maladie. Les décisions qui ne touchent que la CCAM ou la biologie n'ouvrent rien.

## 0.8.0 (novembre 2026)

- Commande `ngap` : conversion du document Word de la NGAP que l'Assurance Maladie communique sur demande (elle ne publie en ligne qu'un PDF). `ngap-actes.csv` recopie les tableaux d'actes ligne à ligne (désignation, coefficient, lettre clé, accord préalable, regroupements et notes) avec la partie, le titre, le chapitre et l'article où ils se trouvent ; `ngap-plan.csv` donne le plan, articles abrogés et mentions de modification compris. Le document doit être au format `.docx` ; il n'est ni téléchargé ni rediffusé.

## Site (novembre 2026, sans nouvelle version du convertisseur)

- Page « Extraire » sur le site (`site/extraire/`) : composer une liste d'établissements FINESS en activité par département, commune ou code postal, domaine, catégorie, secteur (public, privé non lucratif, privé lucratif), groupement hospitalier de territoire, entité support, et activités de soins exercées (médecine, chirurgie, obstétrique, urgences, soins critiques, psychiatrie, soins médicaux et de réadaptation, soins de longue durée, cancer, dialyse, hospitalisation à domicile). Présentation par établissement ou par entité juridique ; export en Excel véritable (numéros en texte, zéros conservés, en-tête figé et filtrable), en CSV ou en GeoJSON. Tout se calcule dans le navigateur ; logique dans `site/extraire/extraire.js`, testée avec Node. Demandé sur data.gouv.fr (filtrer les établissements, distinguer public et privé, ne garder que les principaux hôpitaux).
- La publication mensuelle produit `index-extraction.csv.gz` (les établissements en activité avec adresse, coordonnées, secteur, GHT et activités de soins exercées, lues dans le flux des activités : autorisations AMM et AMF actives et mises en œuvre) et l'archive `extraire-finess-hors-ligne.zip` ; le site embarque cet index.

## 0.7.0 (octobre 2026)

- FINESS : `etablissements.csv` et `entites-juridiques.csv` reçoivent une colonne `secteur` (`public`, `privé non lucratif`, `privé lucratif`, `étranger`), lue dans les agrégats officiels du statut juridique de l'entité, et trois colonnes `ght_id`, `ght_nom`, `ght_role` (groupement hospitalier de territoire de l'entité, `S` support ou `M` membre). Les établissements reçoivent aussi les agrégats du statut juridique de leur entité (`ej_statut_juridique_agregat_niv1`, `niv2` et libellés). Les colonnes sont ajoutées en fin de ligne, les existantes ne bougent pas. Demandé sur data.gouv.fr le 20 octobre 2026 (distinguer public et privé).
- Pages Médicaments et Nomenclatures : les en-têtes « CIP13 », « CIP7 » et « UCD13 » sont reconnus dans une liste collée.

## 0.6.1 (octobre 2026)

- Page « Nomenclatures » sur le site (`site/nomenclatures/`) : CCAM, NABM, LPP et UCD à partir des fichiers convertis sur le poste (l'Assurance Maladie ne permet pas de les rediffuser, rien ne quitte le navigateur). Recherche d'un code par son numéro ou son libellé ; contrôle d'une liste de codes à la date de référence ou à la date de chaque ligne : code inconnu, fermé ou radié, activité CCAM inexistante, acte non remboursable, entente préalable, tarif de base CCAM (par activité si `ccam-phases` est chargé), cotation NABM, tarif et prix limite LPP, listes d'inscription, prix et état des UCD (clé des codes à 13 chiffres vérifiée). Rapport CSV. Logique dans `site/nomenclatures/nomenclatures.js`, testée avec Node ; archive hors ligne `nomenclatures-hors-ligne.zip` produite au déploiement du site.
- Commande `nabm` : le code de l'acte est écrit sur quatre chiffres (`0552`), comme dans la nomenclature ; la source le stocke en numérique.

## 0.6.0 (octobre 2026)

- Page « Médicaments » sur le site (`site/medicaments/`) : recherche d'une spécialité par nom, laboratoire, groupe générique, CIS ou CIP, et contrôle d'une liste de codes CIP13, CIP7 ou CIS collée ou déposée (présentations arrêtées ou abrogées, tensions et ruptures d'approvisionnement, spécialités non commercialisées, prix, remboursement, agrément aux collectivités, clé de contrôle des CIP13 et présentation retrouvée par le CIP7 inclus), avec rapport CSV. Tout se calcule dans le navigateur ; logique dans `site/medicaments/medicaments.js`, testée avec Node.
- La publication mensuelle produit `index-medicaments.csv.gz` (une ligne par présentation, avec sa spécialité, son groupe générique et sa disponibilité), `index-medicaments.json` et l'archive hors ligne `controle-medicaments-hors-ligne.zip`, puis redéploie le site avec l'index.

## 0.5.1 (octobre 2026)

- Replis mis à jour : LPP 906 et UCD 00807. Les tests des replis reçoivent leur propre jeu de versions et ne dépendent plus de `src/replis.json`.

## 0.5.0 (octobre 2026)

- Page « Tarifs GHS » sur le site (`site/tarifs/`) : comparaison de deux campagnes GHS par GHS (tarifs, écarts, bornes, EXH, GHS nouveaux ou supprimés), filtres par secteur, CMD et évolution, export CSV ; et calcul de l'effet des nouveaux tarifs sur des volumes de séjours collés (par GHS ou par GHM), avec export. La page lit les fichiers `ghs.csv` convertis sur le poste : les archives de l'ATIH ne sont pas rediffusées, et les volumes ne quittent pas le navigateur. Logique dans `site/tarifs/tarifs.js`, testée avec Node.
- Commande `communes` : le code officiel géographique de l'INSEE (Licence Ouverte 2.0), communes, arrondissements municipaux, communes déléguées et associées, et communes des collectivités d'outre-mer, dans un seul `communes.csv` ; millésime trouvé sur data.gouv.fr, adresses de repli dans le code. La vérification hebdomadaire le contrôle.

## 0.4.0 (octobre 2026)

- Page « Contrôle FINESS » sur le site (`site/controle/`) : recherche instantanée d'un établissement, et contrôle d'une liste collée depuis Excel ou déposée en CSV (numéros FINESS avec clé de contrôle et numéro voisin probable, SIRET comparés et expliqués, codes postaux et CEDEX, établissements fermés, établissements actifs absents de la liste), avec rapport CSV. Tout se calcule dans le navigateur, sans aucune requête une fois l'index chargé ; la logique est dans `site/controle/controle.js`, testée avec Node.
- Version hors ligne : l'archive `controle-finess-hors-ligne.zip`, refaite chaque mois dans la release à adresse fixe, contient la page et l'index ; la page ouverte depuis un fichier charge l'index depuis le disque.
- La publication mensuelle produit `index-finess.json` (instantané, dates, comptage) et redéploie le site avec l'index du mois.

## 0.3.5 (octobre 2026)

Corrections
- Base des médicaments : les prix de 1 000 € et plus, écrits « 1,466,29 » par la source, sortaient vides (ticket #9). La dernière virgule est maintenant la décimale, les autres séparent les milliers.
- Commande `nos` : les associations (`ASS_X10`, `ASS_X11`) étaient exportées vides ; elles sortent maintenant avec leurs vraies colonnes, nommées d'après les tables reliées. La liste par défaut correspond aux tables des fichiers FINESS structures.
- `entites-juridiques.csv` : les colonnes `categorie` et `categorie_libelle`, toujours vides au niveau de l'entité juridique, sont retirées.

Publication mensuelle
- Elle s'arrête plutôt que de publier faux : table NOS indisponible, nombre d'établissements ou d'entités anormalement bas, et pour la base des médicaments, valeurs lues dans la source mais perdues à la conversion (au-delà d'une sur deux cents dans une colonne). C'est ce contrôle qui aurait vu les prix perdus.
- `MENTION-SOURCE.txt` donne la date de mise à jour de chaque table NOS utilisée.
- Un index allégé des établissements (`index-finess.csv.gz`, douze colonnes, environ 6 Mo) est publié à côté de l'archive, pour une recherche ou un contrôle dans le navigateur.
- Avec les secrets `DATAGOUV_API_KEY` et `HEALTHCHECKS_URL`, les fiches data.gouv.fr sont mises à jour après chaque publication, et un signal de vie est envoyé.

Documentation
- `docs/SOURCES.md` : l'ancienne extraction FINESS était sous Licence Ouverte 1.0 ; les NOS sont indiquées sous Licence Ouverte 2.0 d'après la fiche de l'ANS, question posée à l'ANS le 13 octobre 2026.
- `docs/VERIFICATIONS.md` : registre des vérifications faites sur les fichiers publiés.
- README : logo, liens vers les fiches data.gouv.fr et le collectif.

## 0.3.4 et avant

Voir les notes des releases sur GitHub.
