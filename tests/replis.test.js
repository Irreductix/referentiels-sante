import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPLIS, lireReplis } from '../src/replis.js';
import { ARCHIVES } from '../src/ghs/index.js';
import { ARCHIVES_CONNUES } from '../src/ccam/index.js';
import { VERSIONS_CONNUES } from '../src/cnam/index.js';
import { controleRepli } from '../src/verifier/index.js';
import { actualiserReplis, formaterReplis } from '../src/verifier/replis.js';

const zip = { statut: 200, ok: true, type: 'application/zip' };

test('les modules lisent leurs replis dans src/replis.json', () => {
  assert.equal(VERSIONS_CONNUES, REPLIS.cnam);
  assert.equal(ARCHIVES_CONNUES, REPLIS.ccam);
  assert.equal(ARCHIVES, REPLIS.ghs);
  assert.ok(ARCHIVES_CONNUES.archives.length >= 1);
  for (const url of Object.values(ARCHIVES)) assert.match(url, /ghs_web_\d{8}/);
});

test('repli en retard : avertissement s’il se télécharge encore, échec sinon', () => {
  const aJour = controleRepli('lpp', 'version de repli à jour', '905', '905');
  assert.equal(aJour.ok, true);
  assert.equal(aJour.avertissement, false);

  const enRetard = controleRepli('lpp', 'version de repli à jour', '905', '904', [zip]);
  assert.equal(enRetard.ok, true);
  assert.equal(enRetard.avertissement, true);
  assert.match(enRetard.detail, /page : 905, repli : 904, encore téléchargeable/);

  assert.equal(controleRepli('ccam', 'version de repli à jour', '08500', '08400', [{ statut: 403, ok: false }]).avertissement, true);

  const casse = controleRepli('ucd', 'version de repli à jour', '00806', '00805', [zip, { statut: 404, ok: false }]);
  assert.equal(casse.ok, false);
  assert.match(casse.detail, /repli injoignable \(404\)/);
  assert.equal(controleRepli('ucd', 'x', '1', '2', [{ statut: 200, ok: true, type: 'text/html' }]).ok, false);
});

function lecteurs({ lpp = '905', ucd = '00806', ghs2027 = null, ccam = null } = {}) {
  const cnam = { nabm: '105', lpp, ucd };
  return {
    cnam: async (nom) => (nom === 'nabm' ? { ...REPLIS.cnam.nabm, repli: true }
      : { version: cnam[nom], fichiers: [{ nom: `${nom}${cnam[nom]}.dbf`, url: `http://exemple.fr/${nom}${cnam[nom]}.dbf` }], repli: false }),
    ccam: async () => (ccam ? { version: ccam, archives: [`https://exemple.fr/CCAM${ccam}_PART1.zip`], repli: false } : { ...REPLIS.ccam, repli: true }),
    ghs: async (annee) => (REPLIS.ghs[annee] ? { url: REPLIS.ghs[annee], repli: false }
      : ghs2027 && annee === 2027 ? { url: ghs2027, repli: false } : { url: undefined, repli: true }),
    sonder: async (url) => (url.includes('casse') ? { statut: 404, ok: false } : zip),
  };
}

test('replis : rien à faire quand les pages publient les versions connues', async () => {
  const bilan = await actualiserReplis({ lecteurs: lecteurs() });
  assert.deepEqual(bilan.changements, []);
  assert.deepEqual(bilan.ecartees, []);
  assert.equal(formaterReplis(bilan), 'Versions de repli à jour.');
});

test('replis : nouvelles versions retenues et écrites, campagne GHS suivante ajoutée', async () => {
  const fichier = join(mkdtempSync(join(tmpdir(), 'replis-')), 'replis.json');
  const bilan = await actualiserReplis({
    ecrire: true, fichier,
    lecteurs: lecteurs({ lpp: '906', ccam: '08500', ghs2027: 'https://exemple.fr/2027%20-%20ghs_web_20270301.zip' }),
  });
  assert.deepEqual(bilan.changements.map((c) => `${c.source} ${c.avant} ${c.apres}`),
    ['lpp 905 906', 'ccam 08400 08500', 'ghs 2027 aucune 2027 - ghs_web_20270301.zip']);
  assert.equal(bilan.ecrit, true);
  const ecrit = lireReplis(fichier);
  assert.equal(ecrit.cnam.lpp.version, '906');
  assert.equal(ecrit.cnam.lpp.fichiers[0].url, 'http://exemple.fr/lpp906.dbf');
  assert.equal(ecrit.cnam.ucd.version, REPLIS.cnam.ucd.version);
  assert.equal(ecrit.ccam.version, '08500');
  assert.equal(ecrit.ghs['2027'], 'https://exemple.fr/2027%20-%20ghs_web_20270301.zip');
  assert.ok(readFileSync(fichier, 'utf8').endsWith('}\n'));
  assert.equal(REPLIS.cnam.lpp.version, '905', 'le repli chargé en mémoire n’est pas modifié');
  assert.match(formaterReplis(bilan), /lpp : 905 remplacée par 906\n.*\n.*\nsrc\/replis\.json mis à jour\./);
});

test('replis : une version dont un fichier ne répond pas est écartée, une archive d’une autre année ignorée', async () => {
  const fichier = join(mkdtempSync(join(tmpdir(), 'replis-')), 'replis.json');
  const l = lecteurs({ ghs2027: 'https://exemple.fr/2026%20-%20ghs_web_20260101.zip' });
  l.cnam = async (nom) => ({ version: '999', fichiers: [{ nom: 'casse.dbf', url: 'http://exemple.fr/casse.dbf' }], repli: false });
  const bilan = await actualiserReplis({ ecrire: true, fichier, lecteurs: l });
  assert.deepEqual(bilan.changements, []);
  assert.equal(bilan.ecrit, false);
  assert.equal(bilan.ecartees.length, 3);
  assert.match(bilan.ecartees[0].motif, /casse\.dbf ne répond pas \(404\)/);
  assert.match(formaterReplis(bilan), /Écartées :\n  nabm 999 : casse\.dbf ne répond pas/);
});

test('replis : une page qui lève une erreur n’arrête pas les autres sources', async () => {
  const l = lecteurs({ lpp: '906' });
  l.ccam = async () => { throw new Error('ameli injoignable'); };
  const bilan = await actualiserReplis({ lecteurs: l });
  assert.deepEqual(bilan.changements.map((c) => c.source), ['lpp']);
  assert.deepEqual(bilan.ecartees, [{ source: 'ccam', motif: 'ameli injoignable' }]);
  assert.equal(bilan.ecrit, false);
});
