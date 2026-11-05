import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { archivesDepuis, dateEnClair, decisionsDeLArchive, fichiersTar, normaliser, ticketPour, veiller } from '../.github/scripts/veille-ngap.mjs';
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
    blocs.push(entete, contenu, Buffer.alloc((512 - (contenu.length % 512)) % 512));
  }
  blocs.push(Buffer.alloc(1024));
  return Buffer.concat(blocs);
}

function version(id, titre, { nor = 'SFHU0000000S', publication = '2026-10-22', date = '2026-09-08' } = {}) {
  return {
    nom: `20261022/jorf/global/texte/version/${id}.xml`,
    contenu: `<?xml version="1.0" encoding="UTF-8"?><TEXTE_VERSION><META><META_COMMUN><ID>${id}</ID><NATURE>DECISION</NATURE></META_COMMUN>`
      + `<META_SPEC><META_TEXTE_CHRONICLE><CID>${id}</CID><NOR>${nor}</NOR><DATE_PUBLI>${publication}</DATE_PUBLI><DATE_TEXTE>${date}</DATE_TEXTE></META_TEXTE_CHRONICLE>`
      + `<META_TEXTE_VERSION><TITRE>Décision</TITRE><TITREFULL>${titre}</TITREFULL></META_TEXTE_VERSION></META_SPEC></META></TEXTE_VERSION>`,
  };
}

function article(numero, texte, corps) {
  return {
    nom: `20261022/jorf/global/article/JORFARTI${numero}.xml`,
    contenu: `<?xml version="1.0" encoding="UTF-8"?><ARTICLE><META><META_COMMUN><ID>JORFARTI${numero}</ID></META_COMMUN></META>`
      + `<CONTEXTE><TEXTE cid="${texte}" date_publi="2026-10-22" nature="DECISION"><TITRE_TXT>Décision</TITRE_TXT></TEXTE></CONTEXTE>`
      + `<BLOC_TEXTUEL><CONTENU><p>${corps}</p></CONTENU></BLOC_TEXTUEL><LIENS/></ARTICLE>`,
  };
}

const TITRE = "Décision du 8 septembre 2026 de l'Union nationale des caisses d'assurance maladie relative à la liste des actes et prestations pris en charge par l'Assurance maladie";
const VIGUEUR = 'La présente décision entre en vigueur le 6 novembre 2026, à l\'exception du III de l\'article 1<sup>er</sup> qui entre en vigueur le 1<sup>er</sup> janvier 2027.';

function archiveDuJour() {
  return construireTar([
    { nom: 'PaxHeader/entete', contenu: '30 path=un/nom/tres/long.xml\n', type: 'x' },
    { nom: '20261022/jorf/', contenu: '', type: '5' },
    // L'article précède son texte : l'ordre des fichiers de l'archive ne doit pas compter.
    article('01', 'JORFTEXT000000000001', 'Les dispositions générales de la nomenclature générale des actes professionnels (NGAP) sont modifiées comme suit : le forfait qui entre en vigueur est rappelé. '.repeat(8)),
    version('JORFTEXT000000000001', TITRE, { nor: 'SFHU2627886S' }),
    article('02', 'JORFTEXT000000000001', VIGUEUR),
    version('JORFTEXT000000000002', "Décision du 1er octobre 2026 de l\u2019Union nationale des caisses d\u2019assurance maladie relative à la liste des actes et prestations pris en charge par l\u2019assurance maladie", { publication: '2026-10-27' }),
    article('03', 'JORFTEXT000000000002', "La nomenclature des actes de biologie médicale prévue à l'article L. 162-1-7 est ainsi modifiée."),
    article('04', 'JORFTEXT000000000002', 'La présente décision entrera en vigueur 14 jours après sa publication.'),
    version('JORFTEXT000000000003', "Avis relatif à la décision de l'Union nationale des caisses d'assurance maladie portant fixation du taux de participation de l'assuré"),
    article('05', 'JORFTEXT000000000003', 'Ce taux vaut pour les actes de la NGAP.'),
    version('JORFTEXT000000000004', "Décision de l'Union nationale des caisses d'assurance maladie relative à la liste des actes et prestations pris en charge par l'assurance maladie"),
    article('06', 'JORFTEXT000000000004', 'Le livre III est ainsi modifié.'),
  ]);
}

test("le lecteur tar ne rend que les fichiers ordinaires et s'arrête à la fin de l'archive", () => {
  const tar = construireTar([
    { nom: 'entete', contenu: 'x'.repeat(40), type: 'x' },
    { nom: 'dossier/', contenu: '', type: '5' },
    { nom: 'a.xml', contenu: 'premier' },
    { nom: 'b.xml', contenu: 'y'.repeat(1300), type: '\0' },
  ]);
  const contenus = [...fichiersTar(tar)].map((octets) => octets.toString('utf8'));
  assert.deepEqual(contenus, ['premier', 'y'.repeat(1300)]);
  assert.deepEqual([...fichiersTar(Buffer.alloc(1024))], []);
});

test('les intitulés se comparent sans accents, majuscules ni apostrophes typographiques', () => {
  assert.equal(normaliser('Nomenclature  GÉNÉRALE\n d\u2019actes'), "nomenclature generale d'actes");
  assert.equal(dateEnClair('2026-10-22'), '22 octobre 2026');
  assert.equal(dateEnClair('20270101'), '1er janvier 2027');
  assert.equal(dateEnClair(''), '');
});

test("la veille retient les décisions de l'UNCAM sur la liste des actes, avec les nomenclatures citées", () => {
  const decisions = decisionsDeLArchive(archiveDuJour());
  assert.deepEqual(decisions.map((d) => d.id), ['JORFTEXT000000000001', 'JORFTEXT000000000002', 'JORFTEXT000000000004'], "l'avis sur le taux de participation est écarté");
  const [ngap, nabm, inconnue] = decisions;
  assert.deepEqual(ngap.nomenclatures, ['NGAP']);
  assert.equal(ngap.nor, 'SFHU2627886S');
  assert.equal(ngap.publication, '2026-10-22');
  assert.equal(ngap.date, '2026-09-08');
  assert.equal(ngap.titre, TITRE);
  assert.deepEqual(ngap.vigueur, ["La présente décision entre en vigueur le 6 novembre 2026, à l'exception du III de l'article 1er qui entre en vigueur le 1er janvier 2027."], "seul l'article court d'entrée en vigueur est cité");
  assert.deepEqual(nabm.nomenclatures, ['NABM']);
  assert.deepEqual(nabm.vigueur, ['La présente décision entrera en vigueur 14 jours après sa publication.']);
  assert.deepEqual(inconnue.nomenclatures, []);
  assert.deepEqual(decisionsDeLArchive(construireTar([{ nom: 'a.xml', contenu: '<ARTICLE/>' }])), []);
});

test('un ticket est demandé pour la NGAP ou pour une décision non reconnue, pas pour la CCAM ou la NABM', () => {
  const [ngap, nabm, inconnue] = decisionsDeLArchive(archiveDuJour());
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

test("la page d'index donne les archives depuis une date, sans doublon", () => {
  const page = '<a href="JORF_20261022-012453.tar.gz">JORF_20261022-012453.tar.gz</a> <a href="JORF_20261020-214554.tar.gz">x</a> <a href="JORF_20261005-010101.tar.gz">x</a> Freemium_jorf_global_20250713-140000.tar.gz';
  assert.deepEqual(archivesDepuis(page, '20261020'), ['JORF_20261020-214554.tar.gz', 'JORF_20261022-012453.tar.gz']);
  assert.deepEqual(archivesDepuis('', '20261020'), []);
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
  assert.match(messages[0], /archives lues : 2 \(20261022 à 20261022\)/);
  await assert.rejects(veiller({ depuis: '20270101', dossier }), /aucune archive du Journal officiel depuis le 20270101/);
});
