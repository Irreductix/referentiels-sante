import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { lireCsv } from '../src/commun/csv.js';
import { decomposerCommune, majusculesSansAccents, libelleDepartement, ligneEntiteJuridique, lignesEtablissements, ligneHistorique, COLONNES_HISTORIQUE } from '../src/finess/aplatir.js';
import { libellesVides } from '../src/finess/libelles.js';
import { convertirStructures } from '../src/finess/convertir.js';
import { telechargerFlux } from '../src/finess/sources.js';
import { FIXTURES, dossierTemp } from './_util.js';

const FLUX = join(FIXTURES, 'finess-structures-exemple.json');
const DOCUMENT = JSON.parse(readFileSync(FLUX, 'utf8'));
const CLINIQUE = DOCUMENT.pmej.find((p) => p.informationsGeneralesPMEJ.numFinessPm === '010000156');

function libellesTest() {
  const L = libellesVides();
  L.categorie.set('365', 'Etablissement de soins chirurgicaux');
  L.categorieLong.set('365', 'Etablissement de Soins Chirurgicaux');
  L.categorieVersAgregat.set('365', { niv1: '1000', niv2: '1100', niv3: '1110', domaine: 'SAN' });
  L.agregatCategorie3.set('1110', 'Etablissements de Soins de Courte Durée');
  L.statutJuridique.set('73', 'Société Anonyme (S.A.)');
  L.mft.set('07', 'ARS établissements Privés Commerciaux');
  L.espic.set('0', 'Non concerné');
  L.departement.set('01', 'Ain');
  return L;
}

test('decomposerCommune suit les conventions INSEE et celles de l’ancien flux', () => {
  assert.deepEqual(decomposerCommune('01053'), { departement: '01', commune: '053', departementHistorique: '01', communeHistorique: '053' });
  assert.deepEqual(decomposerCommune('2A004'), { departement: '2A', commune: '004', departementHistorique: '2A', communeHistorique: '004' });
  assert.deepEqual(decomposerCommune('97101'), { departement: '971', commune: '01', departementHistorique: '9A', communeHistorique: '101' });
  assert.deepEqual(decomposerCommune('98613'), { departement: '986', commune: '13', departementHistorique: '9J', communeHistorique: '613' });
  assert.equal(decomposerCommune(null).departement, null);
});

test('ligneEntiteJuridique aplatit une PMEJ avec adresse et contact', () => {
  const ej = ligneEntiteJuridique(CLINIQUE, libellesTest());
  assert.equal(ej.finess_ej, '010000156');
  assert.equal(ej.denomination, 'CLINIQUE CONVERT');
  assert.equal(ej.siren, '772201489');
  assert.equal(ej.statut_juridique, '73');
  assert.equal(ej.statut_juridique_libelle, 'Société Anonyme (S.A.)');
  assert.equal(ej.code_postal, '01000');
  assert.equal(ej.commune_acheminement, 'BOURG EN BRESSE');
  assert.equal(ej.code_commune_insee, '01053');
  assert.equal(ej.departement, '01');
  assert.equal(ej.departement_libelle, 'Ain');
  assert.equal(ej.telephone, '0428631234');
  assert.equal(ej.latitude, '46.211257');
  assert.equal(ej.etat, 'A');
  assert.equal(ej.etat_libelle, 'actif');
  assert.equal(ej.nb_etablissements, CLINIQUE.ege.length);
  assert.equal(ej.date_derniere_maj, '2021-10-18T00:00:00');
});

test('lignesEtablissements aplatit les EGE avec libellés et agrégats', () => {
  const [et] = lignesEtablissements(CLINIQUE, libellesTest());
  assert.equal(et.finess_et, '010780195');
  assert.equal(et.finess_ej, '010000156');
  assert.equal(et.nom_long, 'CLINIQUE DOCTEUR CONVERT');
  assert.equal(et.siret, '77220148900022');
  assert.equal(et.categorie, '365');
  assert.equal(et.categorie_libelle, 'Etablissement de soins chirurgicaux');
  assert.equal(et.categorie_agregat_niv3, '1110');
  assert.equal(et.domaine, 'SAN');
  assert.equal(et.mode_fixation_tarifaire, '07');
  assert.equal(et.espic, '0');
  assert.equal(et.espic_libelle, 'Non concerné');
  assert.equal(et.type_budget, '01');
  assert.equal(et.date_ouverture, '1956-11-16');
  assert.equal(et.lieu_dit, 'BP 132');
  assert.equal(et.usage_adresse, '03');
  assert.equal(et.ej_denomination, 'CLINIQUE CONVERT');
  assert.equal(et.ej_code_ape, '86.10Z');
});

test('ligneHistorique reproduit les 32 champs de l’ancien flux', () => {
  const L = libellesTest();
  const [et] = lignesEtablissements(CLINIQUE, L);
  const h = ligneHistorique(et, L);
  assert.equal(Object.keys(h).length, 32);
  assert.deepEqual(Object.keys(h), COLONNES_HISTORIQUE);
  assert.equal(h.section, 'structureet');
  assert.equal(h.nofinesset, '010780195');
  assert.equal(h.nofinessej, '010000156');
  assert.equal(h.commune, '053');
  assert.equal(h.departement, '01');
  assert.equal(h.libdepartement, 'AIN');
  assert.equal(h.ligneacheminement, '01000 BOURG EN BRESSE');
  L.departement.set('01', "Val-d'Oise (95)");
  assert.equal(ligneHistorique(et, L).libdepartement, 'VAL D OISE', 'majuscules, sans accent, apostrophe ni numéro');
  assert.equal(h.libcategetab, 'Etablissement de Soins Chirurgicaux', 'le format historique prend le libellé long');
  assert.equal(h.categagretab, '1110');
  assert.equal(h.libcategagretab, 'Etablissements de Soins de Courte Durée');
  assert.equal(h.codeape, null, 'FINESS+ ne porte pas de code APE au niveau établissement');
  assert.equal(h.codesph, '0');
  assert.equal(h.libsph, 'Non concerné');
  assert.equal(h.datemaj, '2021-10-18');
});

test('majusculesSansAccents reproduit les libellés de département de l’ancien flux', () => {
  assert.equal(majusculesSansAccents("Côte-d'Or"), "COTE D'OR");
  assert.equal(majusculesSansAccents('La Réunion'), 'LA REUNION');
  assert.equal(majusculesSansAccents('Bourg-en-Bresse'), 'BOURG EN BRESSE');
  assert.equal(majusculesSansAccents(null), null);
});

test('libelleDepartement retire le numéro entre parenthèses', () => {
  const L = libellesVides();
  L.departement.set('69', 'Rhône (69)');
  L.departement.set('2A', 'Corse-du-Sud (2A)');
  L.departement.set('974', 'La Réunion (974)');
  L.departement.set('01', 'Ain');
  assert.equal(libelleDepartement(L, '69'), 'Rhône');
  assert.equal(libelleDepartement(L, '2A'), 'Corse-du-Sud');
  assert.equal(libelleDepartement(L, '974'), 'La Réunion');
  assert.equal(libelleDepartement(L, '01'), 'Ain');
  assert.equal(libelleDepartement(L, '99'), null);
  assert.equal(libelleDepartement(L, null), null);
});

test('convertirStructures produit tous les fichiers à partir du flux exemple', async () => {
  const sortie = dossierTemp();
  const resume = await convertirStructures({ entree: FLUX, sortie, libelles: libellesTest() });

  const nbEge = DOCUMENT.pmej.reduce((n, p) => n + (p.ege ?? []).length, 0);
  assert.equal(resume.entitesJuridiques, DOCUMENT.pmej.length);
  assert.equal(resume.etablissements, nbEge);
  assert.equal(resume.gcc, DOCUMENT.gcc.length);
  assert.equal(resume.gco, DOCUMENT.gco.length);
  assert.equal(resume.schemaVersion, 'v1.0.0');
  assert.equal(resume.generatedAt, DOCUMENT.generatedAt);
  for (const f of resume.fichiers) assert.ok(existsSync(join(sortie, f)), `fichier manquant : ${f}`);
  assert.ok(existsSync(join(sortie, 'structures-resume.json')));

  const etablissements = lireCsv(readFileSync(join(sortie, 'etablissements.csv'), 'utf8'));
  assert.equal(etablissements.length, nbEge);
  const convert = etablissements.find((l) => l.finess_et === '010780195');
  assert.equal(convert.categorie_libelle, 'Etablissement de soins chirurgicaux');
  assert.equal(convert.telephone, '0428631234');

  const ej = lireCsv(readFileSync(join(sortie, 'entites-juridiques.csv'), 'utf8'));
  assert.equal(ej.length, DOCUMENT.pmej.length);

  const jsonl = readFileSync(join(sortie, 'etablissements.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(jsonl.length, nbEge);
  assert.equal(jsonl.find((l) => l.finess_et === '010780195').siret, '77220148900022');

  const histo = readFileSync(join(sortie, 'etablissements-format-historique.csv'), 'utf8').trim().split('\n');
  assert.ok(histo[0].startsWith('finess;finess-plus;v1.0.0;'));
  assert.equal(histo.length, nbEge + 1);
  assert.equal(histo[1].split(';').length, 32);
  assert.ok(histo[1].startsWith('structureet;'));

  const membres = lireCsv(readFileSync(join(sortie, 'groupements-membres.csv'), 'utf8'));
  const gcc = lireCsv(readFileSync(join(sortie, 'groupements-conventionnels.csv'), 'utf8'));
  assert.equal(gcc.length, DOCUMENT.gcc.length);
  assert.equal(gcc[0].nom, DOCUMENT.gcc[0].nomGcc);
  assert.equal(membres.filter((m) => m.groupement_type === 'GCC').length,
    DOCUMENT.gcc.reduce((n, g) => n + g.pmejDuGcc.length + g.egeDuGcc.length, 0));
});

test('instantané mensuel introuvable : échec, sans repli sur le flux du jour', async () => {
  const vrai = globalThis.fetch;
  const appels = [];
  globalThis.fetch = async (url) => {
    appels.push(String(url));
    return new Response('indisponible', { status: 503 });
  };
  try {
    await assert.rejects(
      () => telechargerFlux('structures', { periodicite: 'mensuel', cache: dossierTemp() }),
      /instantané mensuel introuvable/,
    );
    assert.equal(appels.length, 1, 'seule l’API data.gouv.fr est interrogée, rien n’est téléchargé');
    assert.match(appels[0], /api\/1\/datasets\/finess-structures-1/);
  } finally {
    globalThis.fetch = vrai;
  }
});
