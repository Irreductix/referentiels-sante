import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { convertirClaml, exporterCim10 } from '../src/cim10/index.js';
import { convertirTexte, exporterBdpm, FICHIERS, lireDatesMiseAJour } from '../src/bdpm/index.js';
import { lireCsv } from '../src/commun/csv.js';
import { dossierTemp } from './_util.js';

const CLAML = `<?xml version="1.0" encoding="UTF-8"?>
<ClaML version="2.0.0">
  <Meta name="copyright" value="Copyright OMS, ATIH (exemple)"/>
  <Identifier authority="ATIH" uid="2025"/>
  <Title date="2025-01-01" name="CIM10" version="CIM-10 FR 2025 (exemple)">Classification Internationale des Maladies</Title>
  <Class code="IX" kind="chapter">
    <SubClass code="I20-I25"/>
    <Rubric kind="preferred"><Label>Maladies de l'appareil circulatoire</Label></Rubric>
  </Class>
  <Class code="I20-I25" kind="block">
    <SuperClass code="IX"/>
    <SubClass code="I21"/>
    <Rubric kind="preferred"><Label>Cardiopathies ischémiques</Label></Rubric>
  </Class>
  <Class code="I21" kind="category">
    <SuperClass code="I20-I25"/>
    <SubClass code="I21.0"/>
    <Rubric kind="preferred"><Label>Infarctus aigu du myocarde</Label></Rubric>
    <Rubric kind="inclusion"><Label>infarctus précisé comme aigu</Label></Rubric>
    <Rubric kind="exclusion"><Label>certaines complications <Reference code="I23">I23.-</Reference></Label></Rubric>
  </Class>
  <Class code="I21.0" kind="category" usage="dagger">
    <SuperClass code="I21"/>
    <Rubric kind="preferred"><Label variants="FM">Infarctus transmural aigu du myocarde, de la paroi antérieure</Label></Rubric>
  </Class>
</ClaML>`;

test('convertirClaml produit les codes avec hiérarchie et rubriques', () => {
  const { meta, codes } = convertirClaml(CLAML);
  assert.equal(meta.edition, '2025');
  assert.equal(meta.version, 'CIM-10 FR 2025 (exemple)');
  assert.equal(codes.length, 4);
  const i210 = codes.find((c) => c.code === 'I21.0');
  assert.equal(i210.niveau, 'categorie');
  assert.equal(i210.libelle, 'Infarctus transmural aigu du myocarde, de la paroi antérieure');
  assert.equal(i210.parent, 'I21');
  assert.equal(i210.bloc, 'I20-I25');
  assert.equal(i210.chapitre, 'IX');
  assert.equal(i210.profondeur, 3);
  assert.equal(i210.usage, 'dagger');
  assert.equal(i210.variantes, 'FM');
  const i21 = codes.find((c) => c.code === 'I21');
  assert.equal(i21.inclusions, 'infarctus précisé comme aigu');
  assert.equal(i21.exclusions, 'certaines complications I23.-');
  assert.equal(i21.nb_sous_classes, 1);
  const chapitre = codes.find((c) => c.code === 'IX');
  assert.equal(chapitre.niveau, 'chapitre');
  assert.equal(chapitre.chapitre, 'IX');
  assert.equal(chapitre.profondeur, 0);
});

test('exporterCim10 écrit CSV, JSON et résumé depuis un fichier local', async () => {
  const dossier = dossierTemp();
  const source = join(dossier, 'exemple.xml');
  writeFileSync(source, CLAML);
  const sortie = join(dossier, 'sortie');
  const resume = await exporterCim10({ source, sortie });
  assert.equal(resume.codes, 4);
  assert.deepEqual(resume.parNiveau, { chapitre: 1, bloc: 1, categorie: 2 });
  assert.ok(existsSync(join(sortie, 'cim10-codes.csv')));
  const lignes = lireCsv(readFileSync(join(sortie, 'cim10-codes.csv'), 'utf8'));
  assert.equal(lignes.find((l) => l.code === 'I21.0').chapitre, 'IX');
  const json = JSON.parse(readFileSync(join(sortie, 'cim10-codes.json'), 'utf8'));
  assert.equal(json.length, 4);
});

test('convertirTexte lit les fichiers tabulés de la BDPM avec dates et prix normalisés', () => {
  const contenu = '61266250\tA 313 200 000 UI POUR CENT, pommade\tpommade\tcutanée\tAutorisation active\tProcédure nationale\tCommercialisée\t12/03/1998\t\t\t PHARMA DEVELOPPEMENT\tNon\r\n';
  const [s] = convertirTexte(contenu, FICHIERS.specialites);
  assert.equal(s.cis, '61266250');
  assert.equal(s.date_amm, '1998-03-12');
  assert.equal(s.statut_bdm, null);
  assert.equal(s.titulaires, 'PHARMA DEVELOPPEMENT');
  const presentation = '61266250\t3400930\tboîte de 1 tube\tPrésentation active\tDéclaration de commercialisation\t01/02/2020\t3400930000000\toui\t65 %\t2,58\t3,60\t1,02\t\tsupplément\n';
  const [p] = convertirTexte(presentation, FICHIERS.presentations);
  assert.equal(p.cip13, '3400930000000');
  assert.equal(p.prix_medicament, 2.58);
  assert.equal(p.prix_public, 3.6);
  assert.equal(p.date_declaration_commercialisation, '2020-02-01');
  assert.equal(p.colonne_14, 'supplément', 'les colonnes excédentaires sont conservées');
});

test('exporterBdpm refuse un nom de fichier inconnu', async () => {
  await assert.rejects(() => exporterBdpm({ fichiers: ['inexistant'], sortie: dossierTemp() }), /fichier BDPM inconnu/);
});

test('lireDatesMiseAJour lit la date de la base et celle de chaque fichier sur la page de téléchargement', () => {
  const page = `<div class="fr-header__tools"> <p>
      Dernière mise à jour le 29/09/2026 </p> </div>
    <a class="fr-download__link" href="/download/file/CIS_bdpm.txt" role="link" aria-label="Cliquez ici" download='CIS_bdpm.txt'>
      <span class="fr-icon-download-fill" aria-hidden="true"></span> Fichier des spécialités (Date de mise à jour : 29/09/2026, 3101 Ko) </a>
    <a class="fr-download__link" href="/download/file/CIS_CIP_bdpm.txt" role="link" download='CIS_CIP_bdpm.txt'>
      <span></span> Fichier des présentations (Date de mise à jour : 12/10/2026, 4054 Ko) </a>
    <a class="fr-download__link" href="/download/CIS_InfoImportantes.txt" role="link" download='CIS_InfoImportantes_*_bdpm.txt'>
      <span></span> Fichier des Informations importantes (génération en direct) </a>`;
  const dates = lireDatesMiseAJour(page);
  assert.equal(dates.base, '2026-09-29');
  assert.equal(dates.fichiers.specialites, '2026-09-29');
  assert.equal(dates.fichiers.presentations, '2026-10-12', 'chaque fichier garde sa propre date');
  assert.equal(dates.fichiers.informationsImportantes, null, 'fichier généré en direct, sans date');
  assert.equal(dates.fichiers.compositions, null, 'fichier absent de la page');
  assert.deepEqual(lireDatesMiseAJour(''), { base: null, fichiers: Object.fromEntries(Object.keys(FICHIERS).map((c) => [c, null])) });
});

test('exporterBdpm inscrit les dates lues sur la page pour un fichier téléchargé, pas pour un fichier du cache', async () => {
  const contenu = '60000001\t3400930000001\t1\tRupture de stock\t01/10/2026\t02/10/2026\thttps://ansm.sante.fr\n';
  const page = 'Dernière mise à jour le 29/09/2026 <a href="/download/file/CIS_CIP_Dispo_Spec.txt">Fichier des ruptures de stocks (Date de mise à jour : 12/10/2026, 151 Ko)</a>';
  const lirePage = async () => ({ ok: true, statut: 200, texte: page });
  const vrai = globalThis.fetch;
  globalThis.fetch = async () => new Response(contenu, { status: 200 });
  try {
    const sortie = dossierTemp();
    const cache = dossierTemp();
    const resume = await exporterBdpm({ fichiers: ['disponibilite'], sortie, cache, lirePage });
    assert.equal(resume.miseAJour, '2026-09-29');
    assert.equal(resume.fichiers.disponibilite.miseAJour, '2026-10-12');
    assert.equal(resume.fichiers.disponibilite.lignes, 1);
    assert.equal(JSON.parse(readFileSync(join(sortie, 'bdpm-resume.json'), 'utf8')).miseAJour, '2026-09-29');

    // Second passage : le fichier vient du cache, il peut dater d'avant la page lue.
    const duCache = await exporterBdpm({ fichiers: ['disponibilite'], sortie: dossierTemp(), cache, lirePage });
    assert.equal(duCache.miseAJour, null);
    assert.equal(duCache.fichiers.disponibilite.miseAJour, null);

    const sansPage = await exporterBdpm({ fichiers: ['disponibilite'], sortie: dossierTemp(), cache: dossierTemp(), lirePage: async () => { throw new Error('hors ligne'); } });
    assert.equal(sansPage.miseAJour, null);
    assert.equal(sansPage.fichiers.disponibilite.lignes, 1);
  } finally {
    globalThis.fetch = vrai;
  }
});
