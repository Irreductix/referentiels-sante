import { test } from 'node:test';
import assert from 'node:assert/strict';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { COLONNES_INDEX, COLONNES_EXTRACTION, construireIndex, construireIndexExtraction, lireCsv, soinsDeLigne, soinsDepuisActivites } from '../.github/scripts/index-finess.mjs';
import { dossierTemp } from './_util.js';

test('soinsDeLigne : seules comptent les activités de soins exercées, actives et mises en œuvre', () => {
  const ligne = (nature, activite, plus = {}) => ({ niveau: 'exercee', etat: 'A', statut: '1', nature, activite, ...plus });
  assert.equal(soinsDeLigne(ligne('AMM', 'QA001')), 'med');
  assert.equal(soinsDeLigne(ligne('AMF', '01')), 'med');
  assert.equal(soinsDeLigne(ligne('AMF', '55')), 'smr');
  assert.equal(soinsDeLigne(ligne('AMM', 'QA014')), 'urg');
  assert.equal(soinsDeLigne(ligne('AMM', 'QA001', { statut: '2' })), null, 'active mais non mise en œuvre');
  assert.equal(soinsDeLigne(ligne('AMM', 'QA001', { niveau: 'autorisee' })), null);
  assert.equal(soinsDeLigne(ligne('AMM', 'QA001', { etat: 'I' })), null);
  assert.equal(soinsDeLigne(ligne('AMSR', '01')), null, 'une activité médico-sociale de même code n\'est pas une activité de soins');
});

test('index d\'extraction : établissements en activité, adresse, coordonnées plausibles, activités de soins', async () => {
  const dossier = dossierTemp();
  const activites = join(dossier, 'activites.csv');
  writeFileSync(activites, [
    '﻿date_flux;finess_ej;finess_et;niveau;id_activite;nature;nature_libelle;code_activite;activite;activite_libelle;etat;statut',
    '2026-10-01;570005165;570000141;exercee;1;AMM;"Activité de soin; AMM";AMM_QA014;QA014;Médecine d\'urgence;A;1',
    '2026-10-01;570005165;570000141;exercee;2;AMM;Activité de soin;AMM_QA001;QA001;Médecine;A;1',
    '2026-10-01;570005165;570000141;autorisee;3;AMM;Activité de soin;AMM_QA002;QA002;Chirurgie;A;2',
    '2026-10-01;570005165;570000999;exercee;4;AMF;Activité de soins;AMF_50;50;SSR;A;1',
  ].join('\r\n') + '\r\n');
  const soins = await soinsDepuisActivites(activites);
  assert.deepEqual([...soins.get('570000141')].sort(), ['med', 'urg']);
  assert.deepEqual([...soins.get('570000999')], ['smr']);

  const entete = ['finess_et', 'finess_ej', 'nom_court', 'nom_long', 'siret', 'categorie', 'categorie_libelle', 'domaine', 'secteur', 'etat',
    'numero_voie', 'type_voie', 'libelle_voie', 'adresse_ligne_4', 'code_postal', 'commune_acheminement', 'code_commune_insee', 'departement',
    'departement_libelle', 'latitude', 'longitude', 'telephone', 'ej_denomination', 'ej_statut_juridique_libelle', 'ght_nom', 'ght_role'];
  const lignes = [
    ['570000141', '570005165', 'CHR METZ', 'HOPITAL DE MERCY', '26570280300510', '101', 'Centre hospitalier régional (CHR)', 'SAN', 'public', 'A',
      '1', 'ALL', 'DU CHATEAU', '1 ALLEE DU CHATEAU', '57085', 'METZ CEDEX 03', '57019', '57', 'Moselle', '49.08', '6.24', '0387553131', 'CHR METZ-THIONVILLE', 'Etablissement Public Régional d\'Hospitalisation', 'Lorraine Nord', 'S'],
    ['570000999', '570005165', 'SSR', 'SSR', '', '109', 'SSR', 'SAN', 'public', 'A', '12', 'R', 'DES LILAS', '', '57000', 'METZ', '57463', '57', 'Moselle', '6545575.76', '901271.06', '', 'CHR METZ-THIONVILLE', 'EPR', 'Lorraine Nord', 'S'],
    ['570000777', '570005165', 'ANCIEN SITE', 'ANCIEN SITE', '', '101', 'CHR', 'SAN', 'public', 'I', '', '', '', '', '57000', 'METZ', '57463', '57', 'Moselle', '49.1', '6.2', '', 'CHR METZ-THIONVILLE', 'EPR', 'Lorraine Nord', 'S'],
  ];
  const index = construireIndexExtraction(`﻿${entete.join(';')}\r\n${lignes.map((l) => l.join(';')).join('\r\n')}\r\n`, soins);
  const [e, a, b, vide] = index.split('\n');
  assert.equal(e, COLONNES_EXTRACTION.join(';'));
  assert.equal(a, '570000141;570005165;CHR METZ;HOPITAL DE MERCY;26570280300510;101;Centre hospitalier régional (CHR);SAN;public;1 ALLEE DU CHATEAU;57085;METZ CEDEX 03;57019;57;Moselle;49.08;6.24;0387553131;CHR METZ-THIONVILLE;Etablissement Public Régional d\'Hospitalisation;Lorraine Nord;S;med urg');
  assert.equal(b, '570000999;570005165;SSR;SSR;;109;SSR;SAN;public;12 R DES LILAS;57000;METZ;57463;57;Moselle;;;;CHR METZ-THIONVILLE;EPR;Lorraine Nord;S;smr', 'adresse recomposée, coordonnées hors WGS 84 écartées');
  assert.equal(vide, '', 'l\'établissement inactif n\'est pas dans l\'index');
  assert.throws(() => construireIndexExtraction('finess_et;nom_court\n1;2\n'), /colonne finess_ej absente/);
});

test('lireCsv lit les guillemets doublés, les points-virgules cités et le BOM', () => {
  const lignes = [];
  lireCsv('﻿a;b;c\r\n"x;y";"dit ""oui""";\r\n1;2;3\n', (l) => lignes.push(l));
  assert.deepEqual(lignes, [['a', 'b', 'c'], ['x;y', 'dit "oui"', ''], ['1', '2', '3']]);
});

test("construireIndex garde douze colonnes d'etablissements.csv, dans l'ordre de l'index", () => {
  const entete = ['id_ege', 'finess_ej', 'finess_et', 'nom_long', 'nom_court', 'siret', 'categorie', 'categorie_libelle', 'etat',
    'date_fermeture', 'code_postal', 'commune_acheminement', 'ej_denomination', 'telephone'];
  const ligne = ['9', '570005165', '570000141', 'HOPITAL DE MERCY', 'CHR METZ', '26570280300510', '355', 'Centre hospitalier régional (CHR)', 'A',
    '', '57085', 'METZ CEDEX 03', 'CHR METZ-THIONVILLE', '0387553131'];
  const csv = `﻿${entete.join(';')}\r\n${ligne.join(';')}\r\n`;
  const index = construireIndex(csv);
  const [e, l, vide] = index.split('\n');
  assert.equal(e, COLONNES_INDEX.join(';'));
  assert.equal(l, '570000141;570005165;CHR METZ;HOPITAL DE MERCY;26570280300510;355;Centre hospitalier régional (CHR);A;;57085;METZ CEDEX 03;CHR METZ-THIONVILLE');
  assert.equal(vide, '');
  assert.throws(() => construireIndex('finess_et;nom_court\n1;2\n'), /colonne finess_ej absente/);
});
