# Contribuer

Merci de l'intérêt porté au projet.

## Par où commencer

Les tickets marqués `good first issue` sont faits pour une première
contribution, et beaucoup ne demandent pas de savoir coder : vérifier une
source depuis un poste d'établissement, documenter une colonne, trouver une
source structurée. La page <https://irreductix.fr/contribuer> les présente avec
le profil attendu pour chacun. Pas de compte GitHub : <contact@irreductix.fr>.

Les contributions les plus utiles :

- **Un écart constaté** entre un fichier produit et la source, ou avec l'ancien
  flux FINESS : ouvrez un ticket avec le numéro FINESS concerné et les deux
  valeurs. Pas besoin de joindre de fichier.
- **Un nouveau référentiel** : ouvrez d'abord un ticket pour discuter de la
  source, de sa licence et du format cible. Voir la liste des candidats dans
  [docs/SOURCES.md](docs/SOURCES.md).
- **Une correction de documentation** : une colonne mal décrite, un terme
  FINESS mal expliqué, c'est un ticket ou une correction directe.

## Principes

- **Aucune donnée dans le dépôt.** Le code télécharge les sources officielles
  à l'exécution. Les seules exceptions sont les échantillons publiés par les
  producteurs eux-mêmes sous une licence qui le permet, utilisés comme fixtures
  de test.
- **Pas de réinterprétation.** Une colonne recopie un champ source ou applique
  une règle publiée par le producteur. Tout écart est documenté dans `docs/`.
- **Aucune dépendance.** Node.js 22 fournit tout ce qu'il faut : `fetch`,
  `node:zlib`, `node:stream`, `node:test`. Réfléchissez à deux fois avant d'en
  ajouter une.
- **Tout en flux.** Les sources font des centaines de Mo : lecture et écriture
  passent par des flux, jamais par un tableau en mémoire.

## Développement

```bash
git clone https://github.com/Irreductix/referentiels-sante.git
cd referentiels-sante
npm test
node src/cli.js finess --structures tests/fixtures/finess-structures-exemple.json --sans-libelles --sortie /tmp/essai
```

Conventions :

- modules ES, code et commentaires en français, vocabulaire des sources (PMEJ,
  EGE, GHS) plutôt que des traductions ;
- noms de colonnes en `minuscules_soulignees`, dates en ISO 8601, nombres avec
  un point décimal, CSV en UTF-8 avec BOM et séparateur `;` ;
- un test par comportement ajouté ou corrigé ; la suite doit rester verte ;
- pas de tiret cadratin dans le code ni la documentation.

## Licence des contributions

En contribuant, vous acceptez que votre contribution soit publiée sous la
licence MIT du projet.
