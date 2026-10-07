# Sources et licences

Ce dépôt ne contient aucune donnée de référence : il contient du code qui
télécharge les sources officielles et les convertit. Les fichiers que vous
produisez restent soumis à la licence de leur source. Ce document les recense.

## Sources traitées

### FINESS+ (ANS)

| | |
|---|---|
| Producteur | Agence du Numérique en Santé (ANS), pour le compte de la DREES et du ministère chargé de la santé |
| Jeux de données | [FINESS - Structures](https://www.data.gouv.fr/datasets/finess-structures-1) et [FINESS - Activités](https://www.data.gouv.fr/datasets/finess-activites-1) |
| Licence | Licence Ouverte / Open Licence 2.0 (Etalab) : réutilisation libre, y compris commerciale, avec mention de la source et de la date |
| Fréquence | quotidienne ; instantanés mensuel et annuel |
| Format | JSON compressé gzip, schéma JSON publié |
| Spécification | [github.com/ansforge/finess](https://github.com/ansforge/finess) (licence MIT) |

Les fixtures de test `tests/fixtures/finess-*-exemple.json` sont les échantillons
publiés par l'ANS dans ce dépôt de spécification (licence MIT), le second
tronqué à quelques entités.

L'ancienne extraction FINESS (jeux `etalab_cs1100502` et `etalab_cs1100507`,
Licence Ouverte 2.0) n'est plus mise à jour depuis le 4 mai 2026. Son format
sert de modèle au fichier `etablissements-format-historique.csv`.

### Nomenclatures des objets de santé, NOS (ANS)

| | |
|---|---|
| Producteur | Agence du Numérique en Santé |
| Adresse | <https://mos.esante.gouv.fr/NOS/> (tables `.tabs`, XML SVS, FHIR) |
| Guide | [Terminologies de santé](https://ansforge.github.io/IG-terminologie-de-sante/) (dépôt sous licence MIT) |
| Licence | conditions d'utilisation de l'ANS, publiées avec chaque terminologie ; consultez-les avant toute redistribution |

L'outil télécharge les tables au moment de l'exécution et ne les redistribue
pas. La fixture `tests/fixtures/nos-TRE_R66-exemple.tabs` est un extrait de
quatorze lignes de la table des catégories d'établissement, à titre de test.

Tables utilisées pour FINESS+ :

| Table | Usage |
|---|---|
| TRE_R66-CategorieEtablissement | libellé de la catégorie d'établissement |
| TRE_R63, TRE_R64, TRE_R65 (agrégats de catégorie) et ASS_X10 | agrégats de catégorie sur trois niveaux, domaine sanitaire ou social |
| TRE_R72-FinessStatutJuridique, TRE_R68, TRE_R69 et ASS_X11 | statut juridique et ses agrégats |
| TRE_R73-ESPIC | statut ESPIC et participation au service public hospitalier |
| TRE_R74-ModeFixationTarifaire | mode de fixation tarifaire |
| TRE_G09-DepartementOM | libellé du département |
| TRE_r374, TRE_R274, TRE_r405, TRE_r406, TRE_r404, TRE_r403 | flux activités : natures, activités de soins, modalités, formes, modes de fonctionnement, publics |
| JDV_j240, TRE_r401, TRE_r402 | flux activités : activités sanitaires diverses, sociales, d'enseignement |
| TRE_r381 à TRE_r385 | flux activités : les cinq composantes des activités AMM (activité, modalité, mention, pratique, déclaration) |
| TRE_r392, TRE_R272 | flux activités : types d'activité et équipements matériels lourds |

### Tarifs GHS, GHT et suppléments (ATIH)

| | |
|---|---|
| Producteur | Agence technique de l'information sur l'hospitalisation (ATIH) |
| Adresse | pages de campagne, une par année : <https://www.atih.sante.fr/campagnes-de-financement/campagne-de-financement-des-etablissements-mco-et-had-2026> (archive `ghs_web_*.zip`). L'outil lit l'adresse de l'archive sur la page ; l'adresse connue ne sert que si la page ne répond plus |
| Origine juridique | annexes des arrêtés annuels fixant les tarifs des prestations d'hospitalisation, publiés au Journal officiel |
| Licence | le site de l'ATIH porte une mention « tous droits réservés » ; les tarifs eux-mêmes sont le contenu d'un acte réglementaire. L'outil télécharge l'archive à la source et ne la redistribue pas |

### CCAM (Assurance Maladie)

| | |
|---|---|
| Producteur | Caisse nationale de l'Assurance Maladie ; la CCAM est fixée par décisions de l'UNCAM publiées au Journal officiel |
| Adresse | <https://www.ameli.fr/accueil-de-la-ccam/telechargement/fichiers-informatiques-nouvelle-structure/index.php> (archives DBF en trois parties, guide d'utilisation) |
| Format | dBase III, page de code DOS (CP850), tables historisées |
| Licence | pas de licence explicite sur les fichiers ; la nomenclature elle-même est le contenu d'actes réglementaires. L'outil télécharge et convertit, ne redistribue pas. Une version communautaire existe sur data.gouv.fr (jeu « CCAM Ameli », Licence Ouverte 2.0) |

### CIM-10 FR à usage PMSI (ATIH)

| | |
|---|---|
| Producteur | ATIH, d'après la CIM-10 de l'OMS, avec les extensions françaises |
| Adresse | pages annuelles « CIM-10 FR à usage PMSI » de l'ATIH, fichier ClaML (XML) et PDF |
| Licence | droits de l'OMS et de l'ATIH (mention « Copyright WHO, ATIH » dans le fichier) ; usage PMSI. Convertisseur seul, aucune redistribution |

### Base de données publique des médicaments (ANSM, HAS, UNCAM)

| | |
|---|---|
| Adresse | <https://base-donnees-publique.medicaments.gouv.fr/telechargement> |
| Format | texte tabulé sans en-tête ; encodage variable selon le fichier (ISO-8859-1 ou UTF-8), dates JJ/MM/AAAA |
| Licence | Licence Ouverte (fichier `licence_bdpm.pdf` sur le site) : réutilisation libre avec mention de la source et de la date |

### NABM, LPP, UCD (Assurance Maladie)

| | |
|---|---|
| Adresse | <http://www.codage.ext.cnamts.fr/> : pages de téléchargement de la table nationale de biologie (nabm), de la LPP (tips) et des UCD (bdm_it) |
| Format | tables dBase en page de code DOS, plus des fichiers texte à longueur fixe non lus par l'outil |
| Licence | pas de licence explicite ; contenu d'actes réglementaires. Convertisseur seul |

## Sources envisagées ou écartées

| Source | État | Point d'attention |
|---|---|---|
| NGAP (Assurance Maladie) | écartée faute de source structurée | publiée uniquement en PDF ; l'outil ne fabrique pas de table à partir d'un PDF |
| RPPS, annuaire santé en libre accès (ANS) | à faire | Licence Ouverte 2.0 ; fichiers de plusieurs centaines de Mo, données à caractère personnel de professionnels : réutilisation encadrée |
| Tables NOEMIE et B2 (Assurance Maladie) | exclue | cahiers des charges sous droits de la CNAM |

## Mention de source

Chaque exécution écrit un fichier `*-resume.json` contenant la source, la
date de génération du flux et la date de conversion. Reprenez ces mentions
lorsque vous rediffusez des fichiers produits.
