# Journal des versions

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
