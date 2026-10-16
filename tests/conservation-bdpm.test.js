import { test } from 'node:test';
import assert from 'node:assert/strict';

import { controlerConservation, convertirTexte, FICHIERS, SEUIL_PERTE } from '../src/bdpm/index.js';

const ligne = (prix) => ['60025054', '2784980', 'plaquette(s) thermoformée(s)', 'Présentation active', 'Déclaration de commercialisation',
  '24/06/2014', '3400927849800', 'oui', '30%', prix, '1,469,05', '2,76', ''].join('\t');

test('les prix à virgule de milliers sont lus et conservés', () => {
  const contenu = [ligne('1,466,29'), ligne('999,20')].join('\n');
  const lignes = convertirTexte(contenu, FICHIERS.presentations);
  assert.equal(lignes[0].prix_medicament, 1466.29);
  assert.equal(lignes[0].prix_public, 1469.05);
  assert.equal(lignes[1].prix_medicament, 999.2);
  assert.deepEqual(controlerConservation(contenu, FICHIERS.presentations, lignes), []);
});

test('controlerConservation signale les valeurs lues mais non converties', () => {
  const contenu = [ligne('1,466,29'), ligne('999,20'), ligne('abc')].join('\n');
  const lignes = convertirTexte(contenu, FICHIERS.presentations);
  assert.deepEqual(controlerConservation(contenu, FICHIERS.presentations, lignes), [{ colonne: 'prix_medicament', source: 3, converti: 2 }]);
  assert.ok(SEUIL_PERTE > 0 && SEUIL_PERTE < 0.01, 'une perte sur deux cents suffit à refuser le fichier');
});
