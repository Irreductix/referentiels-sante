import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { lireCsv } from '../src/commun/csv.js';
import { lireNgap, exporterNgap, niveauDe, natureTableau, COLONNES_ACTES } from '../src/ngap/index.js';
import { construireZip, dossierTemp } from './_util.js';

// Document .docx minimal, écrit pour le test : mêmes formes que le document de l'Assurance Maladie, avec quelques lignes de la nomenclature.
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const echapper = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const p = (texte, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${echapper(texte)}</w:t></w:r></w:p>`;
const cellule = (c) => `<w:tc>${(Array.isArray(c) ? c : [c]).map((t) => (t.startsWith('<w:p>') ? t : p(t))).join('') || '<w:p/>'}</w:tc>`;
const tableau = (lignes) => `<w:tbl>${lignes.map((l) => `<w:tr>${l.map(cellule).join('')}</w:tr>`).join('')}</w:tbl>`;
const ENTETE = ['Désignation de l\'acte', 'Coefficient', 'Lettre clé'];

const CORPS = [
  tableau([['Deuxième partie'], ['Titre I']]),
  tableau([['PREMIÈRE PARTIE']]),
  p('Article 14 - Actes effectués la nuit ou le dimanche', 'Article'),
  p('(Modifié par les décisions UNCAM du 11/03/05 et du 29/10/24)', 'Date'),
  p('Lorsque, en cas d\'urgence, les actes sont effectués la nuit, ils donnent lieu à une majoration.'),
  p('Article 14.3 - Majoration pour soins d\'urgence : abrogé par la décision UNCAM du 18/07/05', 'Abrog'),
  tableau([['DEUXIÈME PARTIE']]),
  p('NOMENCLATURE DES ACTES MÉDICAUX N\'UTILISANT PAS LES RADIATIONS IONISANTES', 'Article'),
  p('TITRE I - ACTES DE TRAITEMENT DES LÉSIONS TRAUMATIQUES', 'Article'),
  p('CHAPITRE III. - PLAIES RÉCENTES OU ANCIENNES', 'Article'),
  p('(Modifié par Décision UNCAM du 23/08/07 et du 15/10/13)', 'Date'),
  tableau([ENTETE,
    ['Nettoyage ou pansement d\'une brûlure :', '', ''],
    ['- surface au-dessous de 10 cm²', '9', 'K'],
    ['- surface inférieure à 10% de la surface du corps', '16', 'K'],
    ['Ces chiffres sont à majorer de 50% s\'il s\'agit de la face.', '', ''],
    ['Ponction d\'abcès', '3', 'K'],
  ]),
  p('TITRE XVI. - SOINS INFIRMIERS', 'Article'),
  p('PARTIE I \u2013 SOINS INFIRMIERS', 'Article'),
  p('CHAPITRE I - SOINS DE PRATIQUE COURANTE', 'Article'),
  p('Article 1er - Prélèvements et injections'),
  tableau([[...ENTETE, 'AP'],
    ['Séance de perfusion', '15', 'AMI ou SFI', 'AP'],
    [['Rééducation d\'une déficience visuelle', 'pour les patients de moins de 16 ans'], ['19,2', '13,2'], ['AMY', 'AMY'], ''],
    [`<w:p><w:del><w:r><w:delText>Ancien intitulé </w:delText></w:r></w:del><w:r><w:t>Bilan</w:t></w:r><w:r><w:tab/><w:t>initial</w:t></w:r></w:p>`, '10,5', 'AMK', ''],
  ]),
  tableau([['Périmétrie', '11,5', 'AMY', ''], ['Courbe d\'adaptation', '9', 'AMY', '']]),
  p('CINQUIÈME PARTIE', 'Article'),
  p('NOMENCLATURE DES ACTES D\'ANATOMIE ET DE CYTOLOGIE PATHOLOGIQUES', 'Article'),
  tableau([['0004', 'Diagnostic histopathologique', '', '100'], ['0005', 'Diagnostic histopathologique de deux prélèvements', '', '130']]),
  tableau([['Stations thermales', 'Orientations thérapeutiques'], ['AIX-LES-BAINS (73)', 'Rhumatologie']]),
].join('');
const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${CORPS}<w:sectPr/></w:body></w:document>`;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Article"><w:name w:val="article"/></w:style><w:style w:type="paragraph" w:styleId="Date"><w:name w:val="Date"/></w:style><w:style w:type="paragraph" w:styleId="Abrog"><w:name w:val="Abrogé"/></w:style></w:styles>`;
const PIED = `<w:ftr ${W}><w:p><w:r><w:t xml:space="preserve">Version en vigueur du </w:t></w:r><w:r><w:t>28/05/2026</w:t></w:r><w:r><w:t>29</w:t></w:r></w:p></w:ftr>`;
const docx = () => construireZip([{ nom: 'word/styles.xml', contenu: STYLES, deflate: true }, { nom: 'word/footer1.xml', contenu: PIED }, { nom: 'word/document.xml', contenu: DOCUMENT, deflate: true }]);

test('niveauDe et natureTableau reconnaissent le plan et les tableaux d\'actes', () => {
  assert.equal(niveauDe('DEUXIÈME PARTIE', 'Normal'), 'partie');
  assert.equal(niveauDe('Deuxième partie', 'Normal'), null, 'la table des matières n\'ouvre pas une partie');
  assert.equal(niveauDe('TITRE XVI. - SOINS INFIRMIERS', 'article'), 'titre');
  assert.equal(niveauDe('PARTIE I \u2013 SOINS INFIRMIERS', 'article'), 'sous_titre');
  assert.equal(niveauDe('CHAPITRE III. - PLAIES', 'Normal'), 'chapitre');
  assert.equal(niveauDe('Section II. - ARTÈRES ET VEINES', 'article'), 'section');
  assert.equal(niveauDe('Article 1er - Prélèvements', 'Normal'), 'article');
  assert.equal(niveauDe('(Modifié par décision UNCAM du 15/10/13)', 'Date'), 'modification');
  assert.equal(niveauDe('F- Rééducation après amputation', 'article'), 'rubrique');
  assert.equal(niveauDe('Les actes sont cotés ainsi.', 'Normal'), null);
  assert.deepEqual(natureTableau([[['Désignation de l\'acte'], ['Coefficient'], ['Lettre clé'], ['AP']]]), { nature: 'actes', entete: true, ap: true });
  assert.deepEqual(natureTableau([[['Périmétrie'], ['11,5'], ['AMY'], []]]), { nature: 'actes', entete: false, ap: true });
  assert.deepEqual(natureTableau([[['0004'], ['Diagnostic'], [], ['100']]]), { nature: 'acp', entete: false });
  assert.equal(natureTableau([[['Stations thermales'], ['Orientations']]]), null);
});

test('lireNgap recopie les tableaux d\'actes avec leur place dans la nomenclature', () => {
  const { actes, plan, comptes, versionDocument } = lireNgap(docx());
  assert.equal(versionDocument, '2026-05-28', 'la date de version est lue dans le pied de page');
  assert.deepEqual(comptes, { paragraphes: 14, tableaux: 8, tableauxActes: 4, tableauxNonConvertis: 2, actes: 10, regroupements: 1, notes: 1 });
  const [groupe, a, b, note, ponction] = actes;
  assert.equal(groupe.type, 'regroupement');
  assert.equal(a.type, 'acte');
  assert.equal(a.partie, 'DEUXIÈME PARTIE : NOMENCLATURE DES ACTES MÉDICAUX N\'UTILISANT PAS LES RADIATIONS IONISANTES');
  assert.equal(a.titre, 'TITRE I - ACTES DE TRAITEMENT DES LÉSIONS TRAUMATIQUES');
  assert.equal(a.chapitre, 'CHAPITRE III. - PLAIES RÉCENTES OU ANCIENNES');
  assert.equal(a.modifie_par, '(Modifié par Décision UNCAM du 23/08/07 et du 15/10/13)');
  assert.equal(a.regroupement, 'Nettoyage ou pansement d\'une brûlure :');
  assert.deepEqual([a.designation, a.coefficient, a.coefficient_nombre, a.lettre_cle, a.lettres], ['- surface au-dessous de 10 cm²', '9', '9', 'K', 'K']);
  assert.equal(b.coefficient_nombre, '16');
  assert.equal(note.type, 'note');
  assert.equal(ponction.regroupement, null, 'un acte sans tiret sort du regroupement');
  const perfusion = actes[5];
  assert.deepEqual([perfusion.titre, perfusion.sous_titre, perfusion.chapitre, perfusion.article], ['TITRE XVI. - SOINS INFIRMIERS', 'PARTIE I \u2013 SOINS INFIRMIERS', 'CHAPITRE I - SOINS DE PRATIQUE COURANTE', 'Article 1er - Prélèvements et injections']);
  assert.equal(perfusion.modifie_par, null, 'la mention de modification ne déborde pas sur l\'article suivant');
  assert.deepEqual([perfusion.lettre_cle, perfusion.lettres, perfusion.accord_prealable], ['AMI ou SFI', 'AMI SFI', 'oui']);
  const double = actes[6];
  assert.deepEqual([double.designation, double.coefficient, double.coefficient_nombre, double.lettre_cle, double.lettres], ['Rééducation d\'une déficience visuelle / pour les patients de moins de 16 ans', '19,2 / 13,2', null, 'AMY / AMY', 'AMY']);
  assert.deepEqual([actes[7].designation, actes[7].coefficient_nombre], ['Bilan initial', '10.5'], 'le texte supprimé en suivi de modifications est ignoré');
  assert.deepEqual([actes[8].designation, actes[8].coefficient, actes[8].tableau], ['Périmétrie', '11,5', 3], 'un tableau sans en-tête mais coté est un tableau d\'actes');
  const acp = actes[10];
  assert.deepEqual([acp.code, acp.designation, acp.coefficient_nombre, acp.partie, acp.titre], ['0004', 'Diagnostic histopathologique', '100', 'CINQUIÈME PARTIE : NOMENCLATURE DES ACTES D\'ANATOMIE ET DE CYTOLOGIE PATHOLOGIQUES', null]);
  assert.deepEqual(plan.map((x) => x.niveau), ['partie', 'article', 'article', 'partie', 'titre', 'chapitre', 'titre', 'sous_titre', 'chapitre', 'article', 'partie']);
  assert.equal(plan[1].modifie_par, '(Modifié par les décisions UNCAM du 11/03/05 et du 29/10/24)');
  assert.equal(plan[2].abroge, 'oui');
  assert.equal(plan[5].abroge, '');
});

test('exporterNgap écrit les fichiers et refuse ce qui n\'est pas le document attendu', async () => {
  const dossier = dossierTemp();
  const fichier = join(dossier, 'NGAP.docx');
  writeFileSync(fichier, docx());
  const sortie = join(dossier, 'sortie');
  const resume = await exporterNgap(fichier, { sortie, communique: '2026-11-05' });
  assert.deepEqual([resume.versionDocument, resume.communique], ['2026-05-28', '2026-11-05']);
  assert.equal(resume.actes, 10);
  assert.equal(resume.source, 'NGAP.docx');
  const actes = lireCsv(readFileSync(join(sortie, 'ngap-actes.csv'), 'utf8'));
  assert.equal(actes.length, 12);
  assert.deepEqual(Object.keys(actes[0]), COLONNES_ACTES);
  assert.equal(actes[5].accord_prealable, 'oui');
  assert.equal(lireCsv(readFileSync(join(sortie, 'ngap-plan.csv'), 'utf8')).length, 11);
  assert.ok(existsSync(join(sortie, 'ngap-resume.json')));
  await assert.rejects(exporterNgap(join(dossier, 'NGAP.doc'), { sortie }), /\.doc .*n'est pas lu.*\.docx/);
  writeFileSync(join(dossier, 'autre.docx'), 'pas un zip');
  await assert.rejects(exporterNgap(join(dossier, 'autre.docx'), { sortie }), /n'est pas un document \.docx lisible/);
  writeFileSync(join(dossier, 'lettre.docx'), construireZip([{ nom: 'word/document.xml', contenu: `<w:document ${W}><w:body>${p('Bonjour')}</w:body></w:document>` }]));
  await assert.rejects(exporterNgap(join(dossier, 'lettre.docx'), { sortie }), /aucun tableau d'actes reconnu/);
});
