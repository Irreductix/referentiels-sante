import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Le script de la page est un script classique (il doit s'ouvrir depuis un fichier local) :
// on l'exécute dans le contexte des tests et on lit ce qu'il expose sur globalThis.
vm.runInThisContext(readFileSync(new URL('../site/controle/controle.js', import.meta.url), 'utf8'));
const C = globalThis.Controle;

const INDEX = [
  'finess_et;finess_ej;nom_court;nom_long;siret;categorie;categorie_libelle;etat;date_fermeture;code_postal;commune_acheminement;ej_denomination',
  '170000061;170024194;SMR MARLONGES;SMR - Marlonges;20004783500422;108;Etablissement de soins médicaux et de réadaptation;A;;17000;LA ROCHELLE;GH LA ROCHELLE',
  '170000087;170024194;HOPITAL ST LOUIS;HOPITAL SAINT-LOUIS - LA ROCHELLE;20004783500018;355;Centre hospitalier (CH);A;;17019;LA ROCHELLE CEDEX 1;GH LA ROCHELLE',
  '170017644;170024194;CENTRE DE CRISE;CENTRE DE CRISE HOPITAL ST LOUIS;20004783500430;355;Centre hospitalier (CH);A;;17000;LA ROCHELLE;GH LA ROCHELLE',
  '170017552;170024194;MAISON RETRAITE;MAISON DE RETRAITE DU PORT;20004783500299;500;EHPAD;I;2019-12-31;17000;LA ROCHELLE;GH LA ROCHELLE',
  '2A0003125;2A0000014;ANTENNE SMUR;ANTENNE DU SMUR SARTENE;26200000100044;355;Centre hospitalier (CH);A;;20100;SARTENE;CH AJACCIO',
  '750073637;750072639;LA POSTE;LA POSTE SIEGE;35600000000048;999;Autre;A;;75015;PARIS;LA POSTE',
].join('\n') + '\n';

test('les fonctions de base reprennent les règles vérifiées : clés, numéros, SIRET, codes postaux', () => {
  assert.equal(C.cleFinessValide('170000061'), true);
  assert.equal(C.cleFinessValide('2A0003125'), true);
  assert.equal(C.cleFinessValide('2A0003126'), false);
  assert.equal(C.normaliserFiness('17 000 006 1'), '170000061');
  assert.equal(C.normaliserFiness('2a 000 312 5'), '2A0003125');
  assert.equal(C.normaliserFiness('10780195'), '010780195', 'zéro de tête perdu par Excel');
  assert.deepEqual(C.lireSiret('200.047.835.00422'), { forme: 'siret', valeur: '20004783500422' });
  assert.deepEqual(C.lireSiret(' - '), { forme: 'absent', valeur: null });
  assert.equal(C.cleSiretValide('35600000000048'), true, 'siège de La Poste');
  assert.equal(C.codePostal('BP 70587 17026 LA ROCHELLE CEDEX 1'), '17026');
  assert.equal(C.codePostal('75013PARIS'), '75013');
  assert.equal(C.normaliserCommune('17019 LA ROCHELLE CEDEX 1'), 'LA ROCHELLE');
});

test("lireIndex et chercher : par nom sans accents, par numéro, par SIRET", () => {
  const index = C.lireIndex(INDEX);
  assert.equal(index.nombre, 6);
  assert.equal(index.actifs, 5);
  assert.deepEqual(C.chercher(index, 'hopital saint louis').map((e) => e.et), ['170000087', '170017644']);
  assert.deepEqual(C.chercher(index, '17 001 7').map((e) => e.et), ['170017644', '170017552']);
  assert.deepEqual(C.chercher(index, '200047835004').map((e) => e.et), ['170000061', '170017644']);
  assert.deepEqual(C.chercher(index, 'sartène').map((e) => e.et), ['2A0003125']);
  assert.deepEqual(C.chercher(index, 'x'), []);
});

test('lireListe reconnaît les colonnes, avec ou sans en-tête, collées depuis Excel ou en CSV', () => {
  const tsv = 'Raison sociale\tCode postal et commune\tN° FINESS \tN° SIRET\tAPE\nSMR MARLONGES\t17000 LA ROCHELLE\t17 000 006 1\t200.047.835.00422\t8610 Z\n';
  const l1 = C.lireListe(tsv);
  assert.equal(l1.entete, true);
  assert.deepEqual(l1.colonnes, { finess: 2, siret: 3, cp: 1, nom: 0 });
  assert.equal(l1.lignes.length, 1);
  const csv = '170000061;SMR Marlonges;17000 La Rochelle;20004783500422\n170000087;Hopital St Louis;17019 La Rochelle Cedex 1;20004783500018\n';
  const l2 = C.lireListe(csv);
  assert.equal(l2.entete, false);
  assert.deepEqual(l2.colonnes, { finess: 0, siret: 3, cp: 2, nom: 1 });
});

test("lireListe trouve l'en-tête après des lignes d'explication, saute les titres de section et les en-têtes répétés", () => {
  const csv = [
    'FINESS : Fichier national des établissements sanitaires et sociaux;;;;',
    'SIREN = 9 premiers chiffres du SIRET;;;;',
    ';;;;',
    'GH La Rochelle;;;;',
    'Raison sociale;Code postal et commune;N° FINESS ;N° SIRET;APE',
    'SMR MARLONGES;17000 LA ROCHELLE;17 000 006 1;200.047.835.00422;8610 Z',
    ';;;;',
    'CH Ajaccio;;;;',
    'Raison sociale;Code postal et commune;N° FINESS ;N° SIRET;APE',
    'ANTENNE SMUR SARTENE;20100 SARTENE;2A 000 312 5;262.000.001.00044;8610 Z',
    '"\tEHPAD SANS NUMERO";20100 SARTENE;;262.000.001.00051;8710 A',
  ].join('\r\n') + '\r\n';
  const l = C.lireListe(csv);
  assert.equal(l.entete, true);
  assert.equal(l.ligneEntete, 5);
  assert.deepEqual(l.colonnes, { finess: 2, siret: 3, cp: 1, nom: 0 });
  assert.deepEqual(l.numeros, [6, 10, 11]);
  const r = C.controler(C.lireIndex(INDEX), l);
  const par = (ligne) => r.resultats.find((x) => x.ligne === ligne);
  assert.equal(par(6).resultat, 'établissement trouvé');
  assert.equal(par(10).resultat, 'établissement trouvé');
  assert.equal(par(11).resultat, 'pas de numéro FINESS');
  assert.equal(par(11).nom, 'EHPAD SANS NUMERO');
});

test('controler retrouve les écarts connus et les explique', () => {
  const index = C.lireIndex(INDEX);
  const liste = C.lireListe([
    'Raison sociale\tCode postal et commune\tN° FINESS\tN° SIRET',
    'SMR MARLONGES\t17000 LA ROCHELLE\t17 000 006 1\t200.047.835.00430',
    'CENTRE DE CRISE\t17000 LA ROCHELLE\t17 001 764 4\t200.047.835.00422',
    'HOPITAL ST LOUIS\t17000 LA ROCHELLE\t17 000 008 7\t200.047.835.00018',
    'MAISON DE RETRAITE DU PORT\t17000 LA ROCHELLE\t17 001 755 2\t-',
    'CENTRE INCONNU\t17000 LA ROCHELLE\t17 001 764 5\t200.047.835.00430',
    'GH LA ROCHELLE\t17000 LA ROCHELLE\t17 002 419 4\t200 047 835',
  ].join('\n'));
  const r = C.controler(index, liste);
  const par = (ligne) => r.resultats.find((x) => x.ligne === ligne);
  assert.equal(par(2).verdictSiret, 'différent : même SIREN, autre établissement');
  assert.ok(par(2).pistes.some((p) => p.indexOf('170017644') >= 0), 'le SIRET de la ligne 2 est celui du centre de crise');
  assert.ok(par(2).pistes.indexOf('SIRET intervertis entre deux lignes') >= 0);
  assert.equal(par(4).verdictCp, 'même commune, code CEDEX dans FINESS');
  assert.equal(par(4).gravite, 1);
  assert.equal(par(5).etat, 'fermé le 2019-12-31');
  assert.equal(par(5).gravite, 3);
  assert.equal(par(6).resultat, 'inconnu de FINESS');
  assert.equal(par(6).cle, 'invalide');
  assert.ok(par(6).pistes[0].indexOf('170017644') >= 0 && par(6).pistes[0].indexOf('même SIRET') >= 0, par(6).pistes[0]);
  assert.equal(par(7).resultat, "numéro d'entité juridique");
  assert.equal(par(7).verdictSiret, 'SIREN cohérent');
  assert.deepEqual(r.absents.map((a) => a.finess), [], 'tous les actifs de l entité sont dans la liste');
  assert.equal(r.comptes.ecarts, 4);
  assert.equal(r.resultats[0].gravite, 3, 'trié par gravité');
  const csv = C.rapportCsv(r);
  assert.ok(csv.startsWith('﻿ligne;nom_liste;finess;'));
  assert.equal(csv.split('\r\n').length, 2 + r.resultats.length);
});

test('controler liste les établissements actifs absents de la liste, entité par entité', () => {
  const index = C.lireIndex(INDEX);
  const r = C.controler(index, C.lireListe('170000061;SMR\n'));
  assert.deepEqual(r.absents.map((a) => a.finess).sort(), ['170000087', '170017644']);
  assert.equal(r.entites[0].manquants, 2);
  assert.equal(r.comptes.absents, 2);
});
