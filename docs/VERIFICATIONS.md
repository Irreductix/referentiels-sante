# Vérifications des fichiers publiés

Ce registre consigne les contrôles faits sur les fichiers que l'outil publie, avec la source officielle consultée et le résultat. Il ne remplace pas la source : en cas de doute, c'est elle qui fait foi. Pour proposer une vérification, ouvrez un ticket avec l'étiquette `verification` : référentiel, instantané, lignes vérifiées, source utilisée, résultat.

## FINESS+, instantané mensuel 202609 (archive d'octobre 2026)

Fidélité à la source brute, toute la France. Le 13 octobre 2026, `etablissements.csv` et `entites-juridiques.csv` ont été relus contre le fichier JSON de l'ANS par deux méthodes indépendantes du code de l'outil. Pour les 174 840 établissements : numéro, entité juridique, SIRET, nom court, nom long, complément, catégorie, état, date de fermeture, code postal, code APE de l'entité, tous identiques à la source (après le retrait des espaces de fin que la source ajoute à environ 8 000 noms courts). Pour les 98 259 entités juridiques : dénomination, SIREN, code APE, état et nombre d'établissements identiques ; mêmes établissements par entité, dans le même ordre. Aucun doublon, aucune ligne de largeur inattendue.

Particularités de la source relevées à cette occasion : un numéro d'établissement à clé de contrôle invalide (310790960, inactif) ; 934 SIRET à clé invalide ; 5 322 SIRET d'établissement hors du SIREN de leur entité juridique ; 23 039 établissements qui partagent leur SIRET avec un autre établissement de la même entité ; 42 023 entités juridiques inactives. L'outil reprend ces valeurs telles quelles.

Confrontation à une liste de gestion. Le 14 octobre 2026, une liste interne de 94 lignes (établissements de 8 entités juridiques, avec FINESS, SIRET, code postal et APE) a été rapprochée du fichier publié : 83 établissements retrouvés, 71 SIRET identiques, 78 codes postaux identiques. Les écarts venaient de la liste (deux numéros à clé invalide, un SIRET à 13 chiffres, des SIRET échangés entre lignes, des SIRET périmés confirmés dans l'annuaire des entreprises) ou de la source (SIRET manquant, code CEDEX), jamais de la conversion.

Clé de contrôle des numéros FINESS : formule de Luhn sur les neuf caractères, la Corse comptant 2A comme 21 et 2B comme 22 (vérifié sur les 1 367 numéros corses publiés).

## Base de données publique des médicaments, octobre 2026

Le 13 octobre 2026, `bdpm-presentations.csv` publié ne contenait aucun prix au-dessus de 999,20 €, alors que la source en compte 492 écrits avec une virgule de milliers (« 1,466,29 »). Défaut de conversion, corrigé en 0.3.5 et republié le 16 octobre 2026 : 13 627 prix renseignés, 497 au-dessus de 1 000 €, le CIP 2784980 à 1 466,29 € comme sur sa fiche officielle. La publication contrôle désormais que les valeurs lues dans la source sont bien converties.
