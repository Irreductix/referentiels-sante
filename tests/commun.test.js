import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { champCsv, lireCsv, EcrivainCsv } from '../src/commun/csv.js';
import { dateIso, dateHeureIso, nombreFr, texte } from '../src/commun/dates.js';
import { lireZip } from '../src/commun/zip.js';
import { lireElements, lireCollection } from '../src/commun/json-flux.js';
import { recupererPage, recupererTexte } from '../src/commun/telecharger.js';
import { construireZip, dossierTemp } from './_util.js';

test('champCsv protège séparateur, guillemets et retours à la ligne', () => {
  assert.equal(champCsv('simple', ';'), 'simple');
  assert.equal(champCsv('a;b', ';'), '"a;b"');
  assert.equal(champCsv('dit "bonjour"', ';'), '"dit ""bonjour"""');
  assert.equal(champCsv('ligne\nsuite', ';'), '"ligne\nsuite"');
  assert.equal(champCsv(null, ';'), '');
  assert.equal(champCsv(12.5, ';'), '12.5');
});

test('EcrivainCsv écrit BOM, en-tête et lignes ; lireCsv relit le tout', async () => {
  const chemin = join(dossierTemp(), 'test.csv');
  const w = new EcrivainCsv(chemin, ['code', 'libelle']);
  await w.ecrire({ code: '01', libelle: 'Ain' });
  await w.ecrire(['2A', 'Corse-du-Sud ; sud']);
  const n = await w.fermer();
  assert.equal(n, 2);
  const texteCsv = readFileSync(chemin, 'utf8');
  assert.ok(texteCsv.startsWith('﻿code;libelle\n'));
  const lignes = lireCsv(texteCsv);
  assert.deepEqual(lignes, [{ code: '01', libelle: 'Ain' }, { code: '2A', libelle: 'Corse-du-Sud ; sud' }]);
});

test('lireCsv gère CRLF, guillemets doublés et lignes vides', () => {
  const lignes = lireCsv('A;B\r\n"x;y";"il a dit ""non"""\r\n\r\n1;2\r\n');
  assert.deepEqual(lignes, [{ A: 'x;y', B: 'il a dit "non"' }, { A: '1', B: '2' }]);
});

test('dates et nombres sont normalisés', () => {
  assert.equal(dateIso('01/03/2025'), '2025-03-01');
  assert.equal(dateIso('2025-10-21 19:19:05'), '2025-10-21');
  assert.equal(dateIso('20260505120000'), '2026-05-05');
  assert.equal(dateIso('19790101'), '1979-01-01');
  assert.equal(dateIso(''), null);
  assert.equal(dateIso('n/a'), null);
  assert.equal(dateHeureIso('2025-10-21 19:19:05'), '2025-10-21T19:19:05');
  assert.equal(dateHeureIso('2025-10-21'), '2025-10-21');
  assert.equal(nombreFr('1800,57'), 1800.57);
  assert.equal(nombreFr('1 234,5'), 1234.5);
  assert.equal(nombreFr(''), null);
  assert.equal(texte('  '), null);
  assert.equal(texte(' a '), 'a');
});

test('lireZip lit des entrées stockées et compressées', () => {
  const zip = construireZip([
    { nom: 'a.txt', contenu: 'bonjour' },
    { nom: 'dossier/b.csv', contenu: 'x;y\n1;2\n', deflate: true },
  ]);
  const entrees = lireZip(zip);
  assert.deepEqual([...entrees.keys()], ['a.txt', 'dossier/b.csv']);
  assert.equal(entrees.get('a.txt').toString(), 'bonjour');
  assert.equal(entrees.get('dossier/b.csv').toString(), 'x;y\n1;2\n');
});

const DOCUMENT = {
  schemaVersion: 'v1.0.0',
  generatedAt: '2026-09-11T02:06:24Z',
  gco: [{ id: '1', membres: [] }, { id: '2', membres: [{ x: '{"}' }] }],
  gcc: [],
  pmej: [
    { id: 'a', nom: 'Accolade } fermante ] et crochet', liste: [{ profond: [{ encore: true }] }] },
    { id: 'b', nom: 'Guillemet \\" échappé', valeur: null, nombre: 12.5 },
  ],
};

test('lireElements découpe un document JSON en flux, en clair et en gzip', async () => {
  const dossier = dossierTemp();
  const clair = join(dossier, 'doc.json');
  const gz = join(dossier, 'doc.json.gz');
  const texteJson = JSON.stringify(DOCUMENT, null, 2);
  writeFileSync(clair, texteJson);
  writeFileSync(gz, gzipSync(texteJson));

  for (const chemin of [clair, gz]) {
    const meta = {};
    const collections = {};
    for await (const e of lireElements(chemin)) {
      if (e.type === 'meta') meta[e.cle] = e.valeur;
      else (collections[e.collection] ??= []).push(e.objet);
    }
    assert.deepEqual(meta, { schemaVersion: 'v1.0.0', generatedAt: '2026-09-11T02:06:24Z' });
    assert.deepEqual(collections.gco, DOCUMENT.gco);
    assert.deepEqual(collections.pmej, DOCUMENT.pmej);
    assert.equal(collections.gcc, undefined);
  }
});

test('lireElements fonctionne quand un élément est coupé entre deux morceaux du flux', async () => {
  const dossier = dossierTemp();
  const gros = { schemaVersion: 'v1', pmej: Array.from({ length: 300 }, (_, i) => ({ id: String(i), texte: 'x'.repeat(2000) + i })) };
  const chemin = join(dossier, 'gros.json.gz');
  writeFileSync(chemin, gzipSync(JSON.stringify(gros)));
  const objets = [];
  for await (const o of lireCollection(chemin, 'pmej')) objets.push(o);
  assert.equal(objets.length, 300);
  assert.deepEqual(objets[299], gros.pmej[299]);
});

test('recupererPage rend le contenu quel que soit le code ; recupererTexte garde le code dans l’erreur', async () => {
  const vrai = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(`<p>${url}</p>`, { status: url.endsWith('/casse') ? 500 : 200 });
  try {
    const casse = await recupererPage('https://exemple.test/casse');
    assert.equal(casse.statut, 500);
    assert.equal(casse.ok, false);
    assert.equal(casse.texte, '<p>https://exemple.test/casse</p>', 'la page est lue malgré le code');

    const bonne = await recupererPage('https://exemple.test/bonne');
    assert.equal(bonne.ok, true);

    await assert.rejects(() => recupererTexte('https://exemple.test/casse'), (e) => e.statut === 500 && /500/.test(e.message));
    assert.equal(await recupererTexte('https://exemple.test/bonne'), '<p>https://exemple.test/bonne</p>');
  } finally {
    globalThis.fetch = vrai;
  }
});
