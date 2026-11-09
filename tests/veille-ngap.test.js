import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { archivesALire, archivesDepuis, dateEnClair, fichiersTar, lireArchive, normaliser, ticketPour, veiller } from '../.github/scripts/veille-ngap.mjs';
import { dossierTemp } from './_util.js';

/** Archive tar minimale : un en-tête de 512 octets par fichier, contenu complété à 512 octets. */
function construireTar(fichiers) {
  const blocs = [];
  for (const fichier of fichiers) {
    const contenu = Buffer.from(fichier.contenu, 'utf8');
    const entete = Buffer.alloc(512);
    entete.write(fichier.nom, 0, 100, 'utf8');
    entete.write(`${contenu.length.toString(8).padStart(11, '0')}\0`, 124, 'latin1');
    entete.write(fichier.type ?? '0', 156, 'latin1');
    if (fichier.prefixe !== undefined) {
      entete.write('ustar', 257, 'latin1');
      entete.write('00', 263, 'latin1');
      entete.write(fichier.prefixe, 345, 155, 'utf8');
    }
    blocs.push(entete, contenu, Buffer.alloc((512 - (contenu.length % 512)) % 512));
  }
  blocs.push(Buffer.alloc(1024));
  return Buffer.concat(blocs);
}

/** Le tampon rendu par petits morceaux, comme un flux réseau : les en-têtes et les contenus sont coupés n'importe où. */
async function* enFlux(tampon, pas = 700) {
  for (let position = 0; position < tampon.length; position += pas) yield tampon.subarray(position, position + pas);
}

async function tous(iterable) {
  const elements = [];
  for await (const element of iterable) elements.push(element);
  return elements;
}

const TITRE = "Décision du 8 septembre 2026 de l'Union nationale des caisses d'assurance maladie relative à la liste des actes et prestations pris en charge par l'Assurance maladie";
const VIGUEUR = 'La présente décision entre en vigueur le 6 novembre 2026, à l\'exception du III de l\'article 1<sup>er</sup> qui entre en vigueur le 1<sup>er</sup> janvier 2027.';

function article(numero, texte, corps, { titre = TITRE, publication = '2026-10-22', signature = '2026-09-08', nor = 'SFHU2627886S', nom } = {}) {
  return {
    nom: nom ?? `20261022-010121/jorf/global/article/JORF/ARTI/00/00/55/JORFARTI${numero}.xml`,
    contenu: `<?xml version="1.0" encoding="UTF-8"?><ARTICLE><META><META_COMMUN><ID>JORFARTI${numero}</ID></META_COMMUN></META>`
      + `<CONTEXTE><TEXTE cid="${texte}" date_publi="${publication}" date_signature="${signature}" nature="DECISION" nor="${nor}" num="" num_parution_jo="0247">`
      + `<TITRE_TXT c_titre_court="Décision" debut="2999-01-01" fin="2999-01-01" id_txt="${texte}">${titre}</TITRE_TXT></TEXTE></CONTEXTE>`
      + `<BLOC_TEXTUEL><CONTENU><p>${corps}</p></CONTENU></BLOC_TEXTUEL><LIENS/></ARTICLE>`,
  };
}

const NABM = { titre: "Décision du 1er octobre 2026 de l\u2019Union nationale des caisses d\u2019assurance maladie relative à la liste des actes et prestations pris en charge par l\u2019assurance maladie", publication: '2026-10-27', signature: '2026-10-01', nor: 'SFHU2628365S' };
const AVIS = { titre: "Avis relatif à la décision de l'Union nationale des caisses d'assurance maladie portant fixation du taux de participation de l'assuré" };
const SANS_DATE = { titre: "Décision de l'Union nationale des caisses d'assurance maladie relative à la liste des actes et prestations pris en charge par l'assurance maladie", nor: '' };
const ANCIENNE = { publication: '2026-09-01', signature: '2026-08-01', nor: 'SFHU0000001S' };

function archiveDuJour() {
  return construireTar([
    { nom: '20261022-010121/jorf/', contenu: '', type: '5' },
    { nom: '20261022-010121/jorf/global/texte/version/JORFTEXT000000000001.xml', contenu: `<TEXTE_VERSION><TITREFULL>${TITRE}</TITREFULL></TEXTE_VERSION>` },
    article('01', 'JORFTEXT000000000001', 'Les dispositions générales de la nomenclature générale des actes professionnels (NGAP) sont modifiées comme suit : le forfait qui entre en vigueur est rappelé. '.repeat(8)),
    article('02', 'JORFTEXT000000000001', VIGUEUR),
    article('03', 'JORFTEXT000000000002', "La nomenclature des actes de biologie médicale prévue à l'article L. 162-1-7 est ainsi modifiée.", NABM),
    article('04', 'JORFTEXT000000000002', 'La présente décision entrera en vigueur 14 jours après sa publication.', NABM),
    article('05', 'JORFTEXT000000000003', 'Ce taux vaut pour les actes de la NGAP.', AVIS),
    article('06', 'JORFTEXT000000000004', 'Le livre III est ainsi modifié.', SANS_DATE),
    article('07', 'JORFTEXT000000000005', 'La NGAP est ainsi modifiée.', ANCIENNE),
  ]);
}

test('le lecteur tar suit un flux coupé en morceaux et ne lit que les fichiers retenus', async () => {
  const long = `${'dossier/'.repeat(20)}article/JORFARTI99.xml`;
  const tar = construireTar([
    { nom: 'dossier/', contenu: '', type: '5' },
    { nom: 'a.xml', contenu: 'premier' },
    { nom: 'b.xml', contenu: 'y'.repeat(1300), type: '\0' },
    { nom: 'vide.xml', contenu: '' },
    { nom: 'c.xml', contenu: 'avec préfixe', prefixe: 'un/chemin' },
    { nom: '././@LongLink', contenu: `${long}\0`, type: 'L' },
    { nom: 'tronque', contenu: 'nom long GNU' },
    { nom: 'PaxHeader/entete', contenu: `${String(long.length + 9).padStart(3, '0')} path=${long}\n`, type: 'x' },
    { nom: 'tronque', contenu: 'nom long pax' },
    { nom: 'ecarte.bin', contenu: 'z'.repeat(5000) },
    { nom: 'dernier.xml', contenu: 'dernier' },
  ]);
  for (const pas of [7, 512, 700, tar.length]) {
    const fichiers = await tous(fichiersTar(enFlux(tar, pas), (nom) => !nom.endsWith('.bin')));
    assert.deepEqual(fichiers.map((f) => f.nom), ['a.xml', 'b.xml', 'vide.xml', 'un/chemin/c.xml', long, long, 'dernier.xml'], `morceaux de ${pas} octets`);
    assert.deepEqual(fichiers.map((f) => f.octets.toString('utf8')), ['premier', 'y'.repeat(1300), '', 'avec préfixe', 'nom long GNU', 'nom long pax', 'dernier']);
  }
  assert.deepEqual(await tous(fichiersTar(enFlux(Buffer.alloc(1024)))), []);
  await assert.rejects(tous(fichiersTar(enFlux(tar.subarray(0, 512 + 512 + 512 + 300)))), /archive tar tronquée/);
});

test('les intitulés se comparent sans accents, majuscules ni apostrophes typographiques', () => {
  assert.equal(normaliser('Nomenclature  GÉNÉRALE\n d\u2019actes'), "nomenclature generale d'actes");
  assert.equal(dateEnClair('2026-10-22'), '22 octobre 2026');
  assert.equal(dateEnClair('20270101'), '1er janvier 2027');
  assert.equal(dateEnClair(''), '');
});

test("la veille retient les décisions de l'UNCAM sur la liste des actes, avec les nomenclatures citées", async () => {
  const decisions = [...(await lireArchive(enFlux(archiveDuJour()), { depuis: '20261010' })).values()];
  assert.deepEqual(decisions.map((d) => d.id), ['JORFTEXT000000000001', 'JORFTEXT000000000002', 'JORFTEXT000000000004'], "l'avis sur le taux de participation et la décision d'avant la période sont écartés");
  const [ngap, nabm, inconnue] = decisions;
  assert.deepEqual(ngap.nomenclatures, ['NGAP']);
  assert.equal(ngap.nor, 'SFHU2627886S');
  assert.equal(ngap.publication, '2026-10-22');
  assert.equal(ngap.date, '2026-09-08');
  assert.equal(ngap.titre, TITRE);
  assert.deepEqual(ngap.vigueur, ["La présente décision entre en vigueur le 6 novembre 2026, à l'exception du III de l'article 1er qui entre en vigueur le 1er janvier 2027."], "seul l'article court d'entrée en vigueur est cité");
  assert.deepEqual(nabm.nomenclatures, ['NABM']);
  assert.equal(nabm.publication, '2026-10-27');
  assert.deepEqual(nabm.vigueur, ['La présente décision entrera en vigueur 14 jours après sa publication.']);
  assert.deepEqual(inconnue.nomenclatures, []);

  const sansDate = await lireArchive(enFlux(archiveDuJour()));
  assert.equal(sansDate.has('JORFTEXT000000000005'), true, 'sans date de départ, toutes les décisions sont rendues');
  const cumul = await lireArchive(enFlux(archiveDuJour()), { depuis: '20261010', decisions: new Map([['JORFTEXT000000000001', { ...ngap, nomenclatures: ['CCAM'], vigueur: [] }]]) });
  assert.deepEqual(cumul.get('JORFTEXT000000000001').nomenclatures, ['CCAM', 'NGAP'], 'une décision déjà vue dans une autre archive est complétée, pas doublée');
  assert.equal((await lireArchive(enFlux(construireTar([{ nom: 'jorf/global/article/a.xml', contenu: '<ARTICLE/>' }])))).size, 0);
});

test('un ticket est demandé pour la NGAP ou pour une décision non reconnue, pas pour la CCAM ou la NABM', async () => {
  const [ngap, nabm, inconnue] = [...(await lireArchive(enFlux(archiveDuJour()), { depuis: '20261010' })).values()];
  const ticket = ticketPour(ngap, { publiee: 'ngap-20260528' });
  assert.equal(ticket.titre, "NGAP : décision de l'UNCAM au Journal officiel du 22 octobre 2026, version à redemander");
  assert.match(ticket.corps, /https:\/\/www\.legifrance\.gouv\.fr\/jorf\/id\/JORFTEXT000000000001\n/);
  assert.match(ticket.corps, /celle du 28 mai 2026 \(release `ngap-20260528`\)/);
  assert.match(ticket.corps, /> La présente décision entre en vigueur le 6 novembre 2026/);
  assert.match(ticket.corps, /ameli\.fr/);
  assert.equal(ticketPour(nabm), null);
  assert.equal(ticketPour({ ...nabm, nomenclatures: ['CCAM', 'NGAP'] }).titre.endsWith('version à redemander'), true);
  const aVerifier = ticketPour(inconnue);
  assert.match(aVerifier.titre, /à vérifier$/);
  assert.match(aVerifier.corps, /Aucune version de la NGAP publiée ici/);
  assert.match(aVerifier.corps, /Lire dans la décision sa date d'entrée en vigueur/);
  for (const texte of [ticket.titre, ticket.corps, aVerifier.corps]) assert.doesNotMatch(texte, /[\u2013\u2014]/);
});

test("la page d'index donne les archives de la période, et l'archive complète quand elle a remplacé les quotidiennes", () => {
  const page = '<a href="JORF_20261022-012453.tar.gz">JORF_20261022-012453.tar.gz</a> <a href="JORF_20261020-214554.tar.gz">x</a> <a href="JORF_20261005-010101.tar.gz">x</a> Freemium_jorf_global_20250713-140000.tar.gz';
  assert.deepEqual(archivesDepuis(page, '20261020'), ['JORF_20261020-214554.tar.gz', 'JORF_20261022-012453.tar.gz']);
  assert.deepEqual(archivesDepuis('', '20261020'), []);
  assert.deepEqual(archivesALire(page, '20261020'), ['JORF_20261020-214554.tar.gz', 'JORF_20261022-012453.tar.gz'], "l'archive complète d'avant la période ne se lit pas");
  // Le 8 novembre 2026, la DILA a refait son archive complète et n'a laissé que l'archive quotidienne du soir.
  const apres = 'Freemium_jorf_global_20261108-140000.tar.gz 1.6G JORF_20261108-210452.tar.gz 1.6M';
  assert.deepEqual(archivesALire(apres, '20261024'), ['Freemium_jorf_global_20261108-140000.tar.gz', 'JORF_20261108-210452.tar.gz']);
  assert.deepEqual(archivesALire(`${apres} JORF_20261101-010101.tar.gz Freemium_jorf_global_20250713-140000.tar.gz`, '20261024'), ['Freemium_jorf_global_20261108-140000.tar.gz', 'JORF_20261108-210452.tar.gz']);
  assert.deepEqual(archivesALire(apres, '20261109'), []);
});

test('une décision présente dans deux archives du même jour ne compte qu\'une fois', async () => {
  const dossier = dossierTemp();
  writeFileSync(join(dossier, 'JORF_20261022-002650.tar.gz'), gzipSync(archiveDuJour()));
  writeFileSync(join(dossier, 'JORF_20261022-211214.tar.gz'), gzipSync(archiveDuJour()));
  writeFileSync(join(dossier, 'JORF_20261001-010101.tar.gz'), 'hors période, jamais ouvert');
  const messages = [];
  const decisions = await veiller({ depuis: '20261010', dossier, journal: (message) => messages.push(message) });
  assert.deepEqual(decisions.map((d) => d.id), ['JORFTEXT000000000001', 'JORFTEXT000000000004', 'JORFTEXT000000000002'], 'triées par date de publication');
  assert.equal(decisions[0].vigueur.length, 1);
  assert.match(messages[0], /archives lues : 2, pour la période depuis le 20261010/);
  await assert.rejects(veiller({ depuis: '20270101', dossier }), /aucune archive du Journal officiel depuis le 20270101/);
});

test("quand les archives quotidiennes ont été retirées, la période se lit dans l'archive complète", async () => {
  const dossier = dossierTemp();
  writeFileSync(join(dossier, 'Freemium_jorf_global_20261025-140000.tar.gz'), gzipSync(archiveDuJour()));
  writeFileSync(join(dossier, 'JORF_20261018-010101.tar.gz'), "antérieure à l'archive complète, jamais ouverte");
  writeFileSync(join(dossier, 'JORF_20261027-002650.tar.gz'), gzipSync(construireTar([article('08', 'JORFTEXT000000000002', 'La nomenclature des actes de biologie médicale est modifiée.', NABM)])));
  const messages = [];
  const decisions = await veiller({ depuis: '20261010', dossier, journal: (message) => messages.push(message) });
  assert.deepEqual(decisions.map((d) => d.id), ['JORFTEXT000000000001', 'JORFTEXT000000000004', 'JORFTEXT000000000002'], "la décision d'avant la période, présente dans l'archive complète, est écartée");
  assert.match(messages[0], /archives lues : 2, dont l'archive complète du 20261025/);
  writeFileSync(join(dossier, 'JORF_20261028-002650.tar.gz'), gzipSync(archiveDuJour()).subarray(0, 900));
  await assert.rejects(veiller({ depuis: '20261010', dossier }), "une archive tronquée fait échouer la veille au lieu de passer pour vide");
});
