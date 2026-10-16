import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { convertirCommunes, exporterCommunes, lireCsvInsee, COLONNES } from '../src/communes/index.js';
import { dossierTemp } from './_util.js';

const COMMUNES = [
  '"TYPECOM","COM","REG","DEP","CTCD","ARR","TNCC","NCC","NCCENR","LIBELLE","CAN","COMPARENT"',
  '"COM","01001","84","01","01D","012","5","ABERGEMENT CLEMENCIAT","Abergement-Clémenciat","L\'Abergement-Clémenciat","0108",""',
  '"COM","57463","44","57","57D","574","0","METZ","Metz","Metz","5799",""',
  '"ARM","75101","11","75","75C","751","0","PARIS 1ER ARRONDISSEMENT","Paris 1er Arrondissement","Paris 1er Arrondissement","7599","75056"',
  '"COMD","14712","28","14","14D","142","0","VIRE","Vire","Vire","1499","14762"',
].join('\n') + '\n';
const OUTREMER = [
  '"COM_COMER","TNCC","NCC","NCCENR","LIBELLE","NATURE_ZONAGE","COMER","LIBELLE_COMER"',
  '"97502","0","SAINT PIERRE","Saint-Pierre","Saint-Pierre","COM","975","Saint-Pierre-et-Miquelon"',
].join('\n') + '\n';

test("lireCsvInsee lit les champs entre guillemets, apostrophes comprises", () => {
  const l = lireCsvInsee(COMMUNES);
  assert.equal(l.length, 4);
  assert.equal(l[0].LIBELLE, "L'Abergement-Clémenciat");
  assert.equal(l[2].COMPARENT, '75056');
});

test('convertirCommunes assemble métropole, outre-mer et collectivités dans un seul tableau', () => {
  const c = convertirCommunes(COMMUNES, OUTREMER);
  assert.equal(c.length, 5);
  assert.deepEqual(Object.keys(c[0]), COLONNES);
  assert.equal(c[1].code_commune, '57463');
  assert.equal(c[1].departement, '57');
  assert.equal(c[3].commune_parente, '14762');
  assert.equal(c[4].departement, '975');
  assert.equal(c[4].territoire, 'Saint-Pierre-et-Miquelon');
});

test('exporterCommunes écrit communes.csv et le résumé depuis le cache, sans réseau', async () => {
  const cache = dossierTemp();
  mkdirSync(join(cache, 'communes'), { recursive: true });
  writeFileSync(join(cache, 'communes', 'v_commune_2026.csv'), COMMUNES);
  writeFileSync(join(cache, 'communes', 'v_commune_comer_2026.csv'), OUTREMER);
  const sortie = dossierTemp();
  const urls = { communes: 'https://exemple.invalid/v_commune_2026.csv', outremer: 'https://exemple.invalid/v_commune_comer_2026.csv' };
  const r = await exporterCommunes({ annee: 2026, sortie, cache, urls });
  assert.deepEqual([r.communes, r.arrondissements, r.deleguees, r.outremer, r.lignes], [2, 1, 1, 1, 5]);
  assert.equal(r.licence, 'Licence Ouverte 2.0');
  const csv = readFileSync(join(sortie, 'communes.csv'), 'utf8').replace(/^﻿/, '');
  const lignes = csv.split(/\r?\n/).filter(Boolean);
  assert.equal(lignes[0], COLONNES.join(';'));
  assert.equal(lignes.length, 6);
  assert.ok(lignes[2].startsWith('57463;COM;Metz;METZ;0;57;44;574;5799;;'));
});
