# CIM-10, médicaments, NABM, LPP, UCD

## CIM-10 FR à usage PMSI (ATIH)

Source : fichiers ClaML publiés chaque année par l'ATIH avec l'édition de la
CIM-10 FR (2024 et 2025 disponibles au moment de la publication ; l'édition
2026 n'est encore diffusée qu'en PDF). La classification appartient à l'OMS et
à l'ATIH : l'outil convertit le fichier téléchargé et ne redistribue rien.

```bash
referentiels-sante cim10 --edition 2025
referentiels-sante cim10 --source cim10fr2026syst_claml.zip   # un fichier récupéré à la main
```

`cim10-codes.csv` et `cim10-codes.json`, une ligne par classe :

| Colonne | Origine ClaML | Remarque |
|---|---|---|
| code | Class@code | chapitre en chiffres romains (IX), bloc en intervalle (I20-I25), catégorie (I21, I21.0) |
| niveau | Class@kind | chapitre, bloc, categorie |
| libelle | Rubric kind=preferred | |
| parent | SuperClass@code | |
| chapitre, bloc, profondeur | calculés par remontée des parents | |
| usage | Class@usage | dagger (†) ou aster (*) pour le double codage |
| variantes | Label@variants | FM pour les extensions françaises, OMS pour la classification d'origine |
| inclusions, exclusions, notes, definitions | Rubric kind=inclusion, exclusion, note, definition | plusieurs rubriques séparées par ` \| ` ; les renvois (I23.-) sont conservés en texte |
| nb_sous_classes, sous_classes | SubClass@code | |

## Base de données publique des médicaments (ANSM, HAS, UNCAM)

Source : <https://base-donnees-publique.medicaments.gouv.fr/telechargement>,
Licence Ouverte. Fichiers tabulés sans en-tête, dans des encodages variables
selon le fichier (détectés automatiquement), dates à la française.

```bash
referentiels-sante bdpm                         # tous les fichiers
referentiels-sante bdpm specialites presentations
```

| Clé | Fichier source | Contenu | Fichier produit |
|---|---|---|---|
| specialites | CIS_bdpm.txt | médicaments (code CIS), forme, voies, statut et date d'AMM, titulaires | bdpm-specialites.csv |
| presentations | CIS_CIP_bdpm.txt | présentations (CIP7, CIP13), commercialisation, taux de remboursement, prix | bdpm-presentations.csv |
| compositions | CIS_COMPO_bdpm.txt | substances et dosages | bdpm-compositions.csv |
| avisSmr, avisAsmr | CIS_HAS_SMR, CIS_HAS_ASMR | avis de la commission de la transparence | bdpm-avis-smr.csv, bdpm-avis-asmr.csv |
| liensAvisCt | HAS_LiensPageCT_bdpm.txt | liens vers les avis | bdpm-liens-avis-ct.csv |
| generiques | CIS_GENER_bdpm.txt | groupes génériques (0 princeps, 1 générique, 2 complémentarité posologique, 4 substituable) | bdpm-generiques.csv |
| conditionsPrescription | CIS_CPD_bdpm.txt | conditions de prescription et de délivrance | bdpm-conditions-prescription.csv |
| informationsImportantes | CIS_InfoImportantes.txt | informations de sécurité | bdpm-informations-importantes.csv |
| disponibilite | CIS_CIP_Dispo_Spec.txt | ruptures, tensions, arrêts, remises à disposition | bdpm-disponibilite.csv |

Les noms de colonnes suivent le document officiel de description des
fichiers. Les prix sont convertis en nombres, les dates en ISO 8601.

## NABM, LPP, UCD (Assurance Maladie)

Source : pages de téléchargement de codage.ext.cnamts.fr, tables DBF en page
de code DOS. Le numéro de version change à chaque publication ; l'outil lit la
page pour trouver les fichiers courants.

```bash
referentiels-sante nabm    # nomenclature des actes de biologie médicale : fiche, historique, incompatibilités
referentiels-sante lpp     # liste des produits et prestations : fiche, historique, compatibilités, incompatibilités
referentiels-sante ucd     # unités communes de dispensation : table totale, historique des prix, taux, coûts supplémentaires
```

Chaque table DBF devient un CSV UTF-8 portant son nom en minuscules, avec les
colonnes du fichier d'origine. Aucune synthèse n'est appliquée : ces tables
sont déjà à plat.

Un fichier `<source>-colonnes.md` est écrit à côté des CSV : il décrit chaque
colonne et dit d'où vient la description. Pour les UCD, la notice officielle
(« lisez_moi.pdf ») décrit tous les champs ; pour la NABM et la LPP, la CNAM ne
publie pas de dictionnaire, les descriptions sont déduites du nom des colonnes
et des valeurs observées, et signalées comme telles. Trois colonnes de
l'historique LPP (`pecp01` à `pecp03`) restent non documentées.

Si la page de téléchargement est injoignable ou méconnaissable, l'outil se
rabat sur la dernière version connue au moment de la publication et le dit
dans son journal. La commande `verifier` signale quand cette version de repli
est dépassée.

## N'importe quel DBF

```bash
referentiels-sante dbf LPP_fiche_tot901.dbf
referentiels-sante dbf archive.zip --encodage latin1
```

Convertit une ou plusieurs tables DBF locales (ou toutes celles d'une archive)
en CSV, avec les mêmes conversions de types (nombres, dates, booléens). Utile
pour un fichier récupéré à la main derrière un formulaire, ou pour une version
ancienne.

## Vérifier que les sources répondent

```bash
referentiels-sante verifier            # toutes les sources
referentiels-sante verifier ccam cnam  # une partie
```

Pour chaque source, la commande lit la page de téléchargement, résout les
fichiers attendus et envoie une requête d'en-tête sur chacun, sans rien
télécharger de lourd. Elle vérifie aussi que les adresses de repli embarquées
(CCAM, NABM, LPP, UCD, GHS) correspondent encore à ce que publient les pages.
Le code de sortie vaut 1 dès qu'un contrôle échoue ; un workflow hebdomadaire
l'exécute et ouvre un ticket en cas d'échec.

Chaque ligne porte l'un de trois états. `OK` et `ECHEC` parlent d'eux-mêmes.
`AVERT` signale ce qui mérite un œil sans être une panne : un fichier qui répond
403, parce que certains sites refusent les serveurs d'intégration continue tout
en servant les mêmes fichiers à un poste en France (la CCAM d'ameli) ; ou une
page servie sous un code d'erreur mais complète, que l'outil lit quand même.
Lancée depuis un poste de l'établissement, la commande voit ce que la CI ne
peut pas voir : c'est le bon endroit pour vérifier la CCAM.

## Ce qui manque encore

- **NGAP** (actes cliniques et lettres clés) : l'Assurance Maladie ne la
  publie qu'en PDF. Sans source structurée officielle, l'outil ne fabrique pas
  de table. Une contribution qui identifierait une source machine fiable est
  bienvenue.
- **CIM-10 FR 2026** en ClaML, dès que l'ATIH la publie.
- Les fichiers texte à longueur fixe « TOT » de la LPP et des UCD (mêmes
  données que les DBF, autre format) ne sont pas lus.
