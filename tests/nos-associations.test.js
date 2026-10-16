import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { exporterTables, nomColonneAssociation, TABLES } from '../src/nos/index.js';
import { dossierTemp } from './_util.js';

test('nomColonneAssociation garde le nom de la table reliée', () => {
  assert.equal(nomColonneAssociation('<1.2.250.1.213.1.6.1.5> TRE_R63-AgregatCategorieEtablissementNiv1'), 'TRE_R63-AgregatCategorieEtablissementNiv1');
  assert.equal(nomColonneAssociation('1.2.250.1.213.1.6.1.59> TRE_R62-Domaine'), 'TRE_R62-Domaine');
  assert.equal(nomColonneAssociation('Code'), 'Code');
});

test('la commande nos exporte une association avec ses vraies colonnes', async () => {
  const cache = dossierTemp();
  mkdirSync(join(cache, 'nos'), { recursive: true });
  copyFileSync(new URL('./fixtures/nos-ASS_X10-exemple.tabs', import.meta.url), join(cache, 'nos', 'ASS_X10-AgregatCategorieEtablissement.tabs'));
  const sortie = dossierTemp();
  const [r] = await exporterTables(['ASS_X10-AgregatCategorieEtablissement'], { sortie, cache });
  assert.equal(r.concepts, 3);
  assert.equal(r.dateMaj, '2026-02-23');
  const csv = readFileSync(join(sortie, 'ASS_X10-AgregatCategorieEtablissement.csv'), 'utf8').replace(/^﻿/, '');
  const [entete, premiere] = csv.split(/\r?\n/);
  assert.equal(entete, 'TRE_R63-AgregatCategorieEtablissementNiv1;TRE_R64-AgregatCategorieEtablissementNiv2;TRE_R65-AgregatCategorieEtablissement;TRE_R66-CategorieEtablissement;TRE_R62-Domaine');
  assert.equal(premiere, '4000;4400;4401;001;SOC');
  const json = JSON.parse(readFileSync(join(sortie, 'ASS_X10-AgregatCategorieEtablissement.json'), 'utf8'));
  assert.equal(json.lignes[2]['TRE_R66-CategorieEtablissement'], '003');
  assert.equal(json.oid, '1.2.250.1.213.1.6.1.113');
});

test('la liste par défaut de nos couvre les tables des fichiers FINESS structures', () => {
  for (const nom of ['TRE_R65-AgregatCategorieEtablissement', 'ASS_X10-AgregatCategorieEtablissement', 'ASS_X11-FinessAgregatStatutJuridique', 'TRE_G09-DepartementOM']) {
    assert.ok(Object.values(TABLES).includes(nom), nom);
  }
});
