import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { convertirDbf, chapitres, concatener, convertirTableDbf, trouverArchives, ARCHIVES_CONNUES } from '../src/ccam/index.js';
import { lireCsv } from '../src/commun/csv.js';
import { construireDbf } from './_dbf.js';
import { dossierTemp } from './_util.js';

function ecrire(dossier, nom, champs, lignes) {
  writeFileSync(join(dossier, `${nom}.dbf`), construireDbf(champs, lignes));
}

/** Un mini jeu CCAM : deux actes, dont un en deux versions, avec activités, phases et prix. */
function jeuCcam(dossier) {
  mkdirSync(dossier, { recursive: true });
  ecrire(dossier, 'R_TYPE', [{ nom: 'COD_TYPE', type: 'N', longueur: 1 }, { nom: 'LIBELLE', type: 'C', longueur: 80 }], [
    { COD_TYPE: '0', LIBELLE: 'Acte isolé' }, { COD_TYPE: '1', LIBELLE: 'Procédure' }]);
  ecrire(dossier, 'R_ACTIVITE', [{ nom: 'COD_ACTIV', type: 'C', longueur: 1 }, { nom: 'LIBELLE', type: 'C', longueur: 100 }], [
    { COD_ACTIV: '1', LIBELLE: '1° activité chir/med' }, { COD_ACTIV: '4', LIBELLE: 'anesthésie' }]);
  ecrire(dossier, 'R_PHASE', [{ nom: 'COD_PHASE', type: 'N', longueur: 2 }, { nom: 'LIBELLE', type: 'C', longueur: 80 }], [{ COD_PHASE: '0', LIBELLE: 'Phase par défaut' }]);
  ecrire(dossier, 'R_REGROUPEMENT', [{ nom: 'COD_REGROU', type: 'C', longueur: 3 }, { nom: 'LIBELLE', type: 'C', longueur: 100 }], [
    { COD_REGROU: 'ADI', LIBELLE: 'Acte d imagerie' }, { COD_REGROU: 'ADC', LIBELLE: 'Actes de chirurgie' }]);
  ecrire(dossier, 'R_REMBOURSEMENT', [{ nom: 'COD_REMBOU', type: 'N', longueur: 1 }, { nom: 'LIBELLE', type: 'C', longueur: 80 }], [{ COD_REMBOU: '1', LIBELLE: 'Remboursable' }]);
  ecrire(dossier, 'R_TB23', [{ nom: 'COD_GRILLE', type: 'N', longueur: 3 }, { nom: 'LIBELLE', type: 'C', longueur: 100 }], [
    { COD_GRILLE: '0', LIBELLE: 'Tous secteurs' }, { COD_GRILLE: '1', LIBELLE: 'Secteur 1 / adhérent / SF' }]);
  ecrire(dossier, 'R_MENU', [{ nom: 'COD_MENU', type: 'N', longueur: 6 }, { nom: 'RANG', type: 'N', longueur: 6 }, { nom: 'LIBELLE', type: 'C', longueur: 254 }, { nom: 'COD_PERE', type: 'N', longueur: 6 }], [
    { COD_MENU: '1', RANG: '1', LIBELLE: 'Système nerveux', COD_PERE: '' },
    { COD_MENU: '573', RANG: '4', LIBELLE: 'Radiographie', COD_PERE: '570' },
    { COD_MENU: '570', RANG: '1', LIBELLE: 'Appareil respiratoire', COD_PERE: '' }]);
  const champsActe = [
    { nom: 'COD_ACTE', type: 'C', longueur: 13 }, { nom: 'DT_MODIF', type: 'D', longueur: 8 }, { nom: 'MENU_COD', type: 'N', longueur: 6 },
    { nom: 'FRAIDP_COD', type: 'C', longueur: 1 }, { nom: 'REMBOU_COD', type: 'N', longueur: 1 }, { nom: 'TYPE_COD', type: 'N', longueur: 1 },
    { nom: 'NOM_COURT', type: 'C', longueur: 70 }, { nom: 'NOM_LONG', type: 'C', longueur: 20 }, { nom: 'NOM_LONG0', type: 'C', longueur: 20 },
    { nom: 'SEXE', type: 'N', longueur: 1 }, { nom: 'DT_CREATIO', type: 'D', longueur: 8 }, { nom: 'DT_FIN', type: 'D', longueur: 8 },
    { nom: 'ENTENTE', type: 'C', longueur: 1 }, { nom: 'DT_EFFET', type: 'D', longueur: 8 }, { nom: 'DT_ARRETE', type: 'D', longueur: 8 }, { nom: 'DT_JO', type: 'D', longueur: 8 },
  ];
  ecrire(dossier, 'R_ACTE', champsActe, [
    { COD_ACTE: 'ZBQK002', DT_MODIF: '20050720', MENU_COD: '573', FRAIDP_COD: 'A', REMBOU_COD: '1', TYPE_COD: '0', NOM_COURT: 'Rx thor. (ancien)', NOM_LONG: 'Radiographie du ', NOM_LONG0: 'thorax (ancien)', SEXE: '0', DT_CREATIO: '20050301', DT_FIN: '', ENTENTE: 'N', DT_EFFET: '20050901', DT_ARRETE: '', DT_JO: '' },
    { COD_ACTE: 'ZBQK002', DT_MODIF: '20100121', MENU_COD: '573', FRAIDP_COD: 'A', REMBOU_COD: '1', TYPE_COD: '0', NOM_COURT: 'Rx thor.', NOM_LONG: 'Radiographie du ', NOM_LONG0: 'thorax', SEXE: '0', DT_CREATIO: '20050301', DT_FIN: '', ENTENTE: 'N', DT_EFFET: '20100201', DT_ARRETE: '20090721', DT_JO: '20090724' },
    { COD_ACTE: 'AAFA002', DT_MODIF: '20050720', MENU_COD: '1', FRAIDP_COD: 'N', REMBOU_COD: '1', TYPE_COD: '0', NOM_COURT: 'Exérèse tumeur', NOM_LONG: 'Exérèse de tumeur ', NOM_LONG0: 'du cerveau', SEXE: '0', DT_CREATIO: '20050301', DT_FIN: '', ENTENTE: 'N', DT_EFFET: '20050901', DT_ARRETE: '', DT_JO: '' },
  ]);
  const champsAct = [{ nom: 'COD_AA', type: 'C', longueur: 14 }, { nom: 'DT_MODIF', type: 'D', longueur: 8 }, { nom: 'ACTE_COD', type: 'C', longueur: 13 }, { nom: 'ACDT_MODIF', type: 'D', longueur: 8 }, { nom: 'ACTIV_COD', type: 'C', longueur: 1 }, { nom: 'REGROU_COD', type: 'C', longueur: 3 }, { nom: 'CATMED_COD', type: 'C', longueur: 2 }];
  ecrire(dossier, 'R_ACTE_IVITE', champsAct, [
    { COD_AA: 'ZBQK0021', DT_MODIF: '20100121', ACTE_COD: 'ZBQK002', ACDT_MODIF: '20100121', ACTIV_COD: '1', REGROU_COD: 'ADI', CATMED_COD: '99' },
    { COD_AA: 'AAFA0021', DT_MODIF: '20050720', ACTE_COD: 'AAFA002', ACDT_MODIF: '20050720', ACTIV_COD: '1', REGROU_COD: 'ADC', CATMED_COD: '99' },
    { COD_AA: 'AAFA0024', DT_MODIF: '20050720', ACTE_COD: 'AAFA002', ACDT_MODIF: '20050720', ACTIV_COD: '4', REGROU_COD: 'ADA', CATMED_COD: '99' },
  ]);
  const champsPhase = [{ nom: 'COD_AAP', type: 'C', longueur: 16 }, { nom: 'DT_MODIF', type: 'D', longueur: 8 }, { nom: 'AA_COD', type: 'C', longueur: 14 }, { nom: 'PHASE_COD', type: 'N', longueur: 2 }, { nom: 'PU_BASE', type: 'N', longueur: 7, decimales: 2 }, { nom: 'SUPPLEMENT', type: 'N', longueur: 7, decimales: 2 }, { nom: 'COEFFICIEN', type: 'N', longueur: 7, decimales: 2 }, { nom: 'NB_SEANCES', type: 'N', longueur: 2 }, { nom: 'AGE_MIN', type: 'N', longueur: 3 }, { nom: 'AGE_MAX', type: 'N', longueur: 3 }, { nom: 'UOEUVR_COD', type: 'C', longueur: 3 }, { nom: 'PAIEM_COD', type: 'C', longueur: 1 }];
  ecrire(dossier, 'R_ACTE_IVITE_PHASE', champsPhase, [
    { COD_AAP: 'ZBQK00210', DT_MODIF: '20100121', AA_COD: 'ZBQK0021', PHASE_COD: '0', PU_BASE: '21.28', SUPPLEMENT: '0', COEFFICIEN: '0', NB_SEANCES: '0', AGE_MIN: '0', AGE_MAX: '0', UOEUVR_COD: '5.3', PAIEM_COD: '' },
    { COD_AAP: 'AAFA00210', DT_MODIF: '20050720', AA_COD: 'AAFA0021', PHASE_COD: '0', PU_BASE: '1234.56', SUPPLEMENT: '0', COEFFICIEN: '0', NB_SEANCES: '0', AGE_MIN: '0', AGE_MAX: '0', UOEUVR_COD: '5.3', PAIEM_COD: '' },
    { COD_AAP: 'AAFA00240', DT_MODIF: '20050720', AA_COD: 'AAFA0024', PHASE_COD: '0', PU_BASE: '300', SUPPLEMENT: '0', COEFFICIEN: '0', NB_SEANCES: '0', AGE_MIN: '0', AGE_MAX: '0', UOEUVR_COD: '5.3', PAIEM_COD: '' },
  ]);
  ecrire(dossier, 'R_AAP_PMSI', [{ nom: 'AAP_COD', type: 'C', longueur: 16 }, { nom: 'ICR', type: 'N', longueur: 4 }, { nom: 'CLASSANT', type: 'C', longueur: 1 }], [
    { AAP_COD: 'AAFA00210', ICR: '250', CLASSANT: 'O' }]);
  ecrire(dossier, 'R_PU_BASE', [{ nom: 'AAP_COD', type: 'C', longueur: 16 }, { nom: 'GRILLE_COD', type: 'N', longueur: 3 }, { nom: 'PU_BASE', type: 'N', longueur: 7, decimales: 2 }, { nom: 'APDT_MODIF', type: 'D', longueur: 8 }], [
    { AAP_COD: 'ZBQK00210', GRILLE_COD: '0', PU_BASE: '21.28', APDT_MODIF: '20100121' },
    { AAP_COD: 'ZBQK00210', GRILLE_COD: '1', PU_BASE: '21.28', APDT_MODIF: '20150101' }]);
  ecrire(dossier, 'R_TB11', [{ nom: 'COD_MODIFI', type: 'C', longueur: 1 }, { nom: 'DT_DEBUT', type: 'D', longueur: 8 }, { nom: 'LIBELLE', type: 'C', longueur: 100 }, { nom: 'COEF', type: 'N', longueur: 5, decimales: 3 }, { nom: 'FORFAIT', type: 'N', longueur: 8, decimales: 2 }, { nom: 'DT_FIN', type: 'D', longueur: 8 }, { nom: 'GRILLE_COD', type: 'N', longueur: 3 }], [
    { COD_MODIFI: 'U', DT_DEBUT: '20050325', LIBELLE: 'Majoration urgence', COEF: '1.000', FORFAIT: '25.15', DT_FIN: '', GRILLE_COD: '0' }]);
  ecrire(dossier, 'R_NOTE_ACTE', [{ nom: 'ACTE_COD', type: 'C', longueur: 13 }, { nom: 'ACDT_MODIF', type: 'D', longueur: 8 }, { nom: 'ORDRE_NOTE', type: 'N', longueur: 4 }, { nom: 'TYPNOT_COD', type: 'N', longueur: 2 }, { nom: 'TEXTE_NOTE', type: 'C', longueur: 30 }, { nom: 'TEXTE_NOT0', type: 'C', longueur: 30 }, { nom: 'RENVOI_COD', type: 'C', longueur: 13 }], [
    { ACTE_COD: 'ZBQK002', ACDT_MODIF: '20100121', ORDRE_NOTE: '1', TYPNOT_COD: '2', TEXTE_NOTE: 'Facturation : avec ou sans ', TEXTE_NOT0: 'préparation', RENVOI_COD: '' }]);
}

test('chapitres numérote l’arborescence des menus', () => {
  const arbre = chapitres([
    { COD_MENU: 1, RANG: 1, LIBELLE: 'Système nerveux', COD_PERE: null },
    { COD_MENU: 10, RANG: 2, LIBELLE: 'Encéphale', COD_PERE: 1 },
    { COD_MENU: 11, RANG: 3, LIBELLE: 'Exérèse', COD_PERE: 10 },
  ]);
  assert.equal(arbre.get('11').numero, '01.02.03');
  assert.equal(arbre.get('11').niveau, 3);
  assert.equal(arbre.get('11').chemin, 'Système nerveux > Encéphale > Exérèse');
  assert.equal(arbre.get('1').parent_code_menu, null);
});

test('chapitres ignore le nœud racine « ARBORESCENCE CCAM » dans la numérotation', () => {
  const arbre = chapitres([
    { COD_MENU: 0, RANG: 0, LIBELLE: 'ARBORESCENCE CCAM', COD_PERE: null },
    { COD_MENU: 1, RANG: 1, LIBELLE: 'SYSTÈME NERVEUX', COD_PERE: 0 },
    { COD_MENU: 10, RANG: 2, LIBELLE: 'Actes thérapeutiques', COD_PERE: 1 },
  ]);
  assert.equal(arbre.get('0').numero, null);
  assert.equal(arbre.get('0').niveau, 0);
  assert.equal(arbre.get('1').numero, '01');
  assert.equal(arbre.get('1').niveau, 1);
  assert.equal(arbre.get('10').numero, '01.02');
  assert.equal(arbre.get('10').chemin, 'SYSTÈME NERVEUX > Actes thérapeutiques');
});

test('concatener assemble les colonnes de libellé long dans l’ordre', () => {
  assert.equal(concatener({ NOM_LONG: 'Radiographie du ', NOM_LONG0: 'thorax', NOM_LONG1: null, AUTRE: 'x' }, 'NOM_LONG'), 'Radiographie du thorax');
  assert.equal(concatener({ NOM_LONG: null }, 'NOM_LONG'), null);
});

test('convertirDbf produit la synthèse des actes depuis un jeu de DBF', async () => {
  const dossier = dossierTemp();
  const dbf = join(dossier, 'dbf');
  jeuCcam(dbf);
  const sortie = join(dossier, 'sortie');
  const resume = await convertirDbf({ dossierDbf: dbf, sortie, version: 'test', brut: true });
  assert.equal(resume.actes, 2);
  assert.equal(resume.versionsActes, 3);
  assert.equal(resume.activites, 3);
  assert.equal(resume.tarifsGrilles, 2);
  for (const f of resume.fichiers) assert.ok(existsSync(join(sortie, f)), `fichier manquant : ${f}`);

  const actes = lireCsv(readFileSync(join(sortie, 'ccam-actes.csv'), 'utf8'));
  const rx = actes.find((a) => a.code === 'ZBQK002');
  assert.equal(rx.libelle_court, 'Rx thor.', 'la version la plus récente est retenue');
  assert.equal(rx.libelle_long, 'Radiographie du thorax');
  assert.equal(rx.type_libelle, 'Acte isolé');
  assert.equal(rx.chapitre_numero, '01.04');
  assert.equal(rx.chapitre_chemin, 'Appareil respiratoire > Radiographie');
  assert.equal(rx.date_effet, '2010-02-01');
  assert.equal(rx.tarif_base, '21.28');
  assert.equal(rx.regroupement_libelle, 'Acte d imagerie');
  assert.equal(rx.version, 'test');
  const exerese = actes.find((a) => a.code === 'AAFA002');
  assert.equal(exerese.nb_activites, '2');
  assert.equal(exerese.activites, '1|4');
  assert.equal(exerese.tarif_base, '1234.56');
  assert.equal(exerese.icr, '250');
  assert.equal(exerese.classant, 'O');

  const tarifs = lireCsv(readFileSync(join(sortie, 'ccam-tarifs-grilles.csv'), 'utf8'));
  assert.equal(tarifs[1].grille_libelle, 'Secteur 1 / adhérent / SF');
  const notes = lireCsv(readFileSync(join(sortie, 'ccam-notes.csv'), 'utf8'));
  assert.equal(notes[0].texte, 'Facturation : avec ou sans préparation');
  assert.ok(existsSync(join(sortie, 'brut', 'r_acte.csv')));
  assert.equal(resume.tablesBrutes.find((t) => t.table === 'r_acte').lignes, 3);
});

test('convertirTableDbf convertit un DBF quelconque en CSV', async () => {
  const dossier = dossierTemp();
  const chemin = join(dossier, 'NABM_FICHE_TOT105.dbf');
  writeFileSync(chemin, construireDbf([{ nom: 'CODE', type: 'N', longueur: 4 }, { nom: 'LIBELLE', type: 'C', longueur: 60 }], [
    { CODE: '1104', LIBELLE: 'Numération formule sanguine' }, { CODE: '9105', LIBELLE: 'Glycémie à jeun' }]));
  const r = await convertirTableDbf(chemin, join(dossier, 'sortie'));
  assert.equal(r.lignes, 2);
  assert.deepEqual(r.colonnes, ['code', 'libelle']);
  const lignes = lireCsv(readFileSync(join(dossier, 'sortie', 'nabm_fiche_tot105.csv'), 'utf8'));
  assert.deepEqual(lignes[1], { code: '9105', libelle: 'Glycémie à jeun' });
});

const PAGE_AMELI = [1, 2, 3].map((n) => `<a href="/fileadmin/user_upload/documents/CCAM08400_DBF_PART${n}.zip">Partie ${n}</a>`).join('');
const page = (texte, statut = 200) => async () => ({ statut, ok: statut < 400, texte });

test('trouverArchives lit la page ameli même servie sous un code 500', async () => {
  const journal = [];
  const r = await trouverArchives({ lirePage: page(PAGE_AMELI, 500), journal: (m) => journal.push(m) });
  assert.equal(r.version, '08400');
  assert.equal(r.archives.length, 3);
  assert.equal(r.repli, false, 'les liens sont là : ce n’est pas un repli');
  assert.equal(r.statut, 500);
});

test('trouverArchives se rabat sur la version connue sans lien ou sans page', async () => {
  const sansLien = await trouverArchives({ lirePage: page('<p>rien</p>', 500) });
  assert.equal(sansLien.repli, true);
  assert.equal(sansLien.version, ARCHIVES_CONNUES.version);
  assert.equal(sansLien.statut, 500);

  const injoignable = await trouverArchives({ lirePage: async () => { throw new Error('réseau'); } });
  assert.equal(injoignable.repli, true);
  assert.deepEqual(injoignable.archives, ARCHIVES_CONNUES.archives);
});
