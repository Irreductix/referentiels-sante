import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COLONNES_INDEX, construireIndex, lireCsv } from '../.github/scripts/index-finess.mjs';

test('lireCsv lit les guillemets doublés, les points-virgules cités et le BOM', () => {
  const lignes = [];
  lireCsv('﻿a;b;c\r\n"x;y";"dit ""oui""";\r\n1;2;3\n', (l) => lignes.push(l));
  assert.deepEqual(lignes, [['a', 'b', 'c'], ['x;y', 'dit "oui"', ''], ['1', '2', '3']]);
});

test("construireIndex garde douze colonnes d'etablissements.csv, dans l'ordre de l'index", () => {
  const entete = ['id_ege', 'finess_ej', 'finess_et', 'nom_long', 'nom_court', 'siret', 'categorie', 'categorie_libelle', 'etat',
    'date_fermeture', 'code_postal', 'commune_acheminement', 'ej_denomination', 'telephone'];
  const ligne = ['9', '570005165', '570000141', 'HOPITAL DE MERCY', 'CHR METZ', '26570280300510', '355', 'Centre hospitalier régional (CHR)', 'A',
    '', '57085', 'METZ CEDEX 03', 'CHR METZ-THIONVILLE', '0387553131'];
  const csv = `﻿${entete.join(';')}\r\n${ligne.join(';')}\r\n`;
  const index = construireIndex(csv);
  const [e, l, vide] = index.split('\n');
  assert.equal(e, COLONNES_INDEX.join(';'));
  assert.equal(l, '570000141;570005165;CHR METZ;HOPITAL DE MERCY;26570280300510;355;Centre hospitalier régional (CHR);A;;57085;METZ CEDEX 03;CHR METZ-THIONVILLE');
  assert.equal(vide, '');
  assert.throws(() => construireIndex('finess_et;nom_court\n1;2\n'), /colonne finess_ej absente/);
});
