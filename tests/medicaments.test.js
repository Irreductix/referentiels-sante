import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

vm.runInThisContext(readFileSync(new URL('../site/medicaments/medicaments.js', import.meta.url), 'utf8'));
const M = globalThis.Medicaments;

const INDEX = [
  'cip13;cip7;cis;denomination;forme;presentation;titulaires;statut_amm;etat_specialite;statut_presentation;etat_presentation;date_commercialisation;agrement_collectivites;taux_remboursement;prix_medicament;prix_public;honoraires;groupe_generique;type_generique;disponibilite',
  "3400949497294;4949729;60002283;DOLIPRANE 1000 mg, comprimé;comprimé;plaquette(s) PVC PVDC aluminium de 30 comprimé(s);SANOFI AVENTIS FRANCE;Autorisation active;Commercialisée;Présentation active;Déclaration de commercialisation;2011-03-16;oui;100%;24.34;25.36;1.02;PARACETAMOL 1000 mg - DOLIPRANE 1000 mg, comprimé;princeps;",
  "3400930000001;3000001;60002283;DOLIPRANE 1000 mg, comprimé;comprimé;plaquette(s) de 8 comprimé(s);SANOFI AVENTIS FRANCE;Autorisation active;Commercialisée;Présentation active;Déclaration d'arrêt de commercialisation;2019-06-30;oui;100%;;;;PARACETAMOL 1000 mg - DOLIPRANE 1000 mg, comprimé;princeps;",
  "3400927849800;2784980;60025054;ACIDE ZOLEDRONIQUE ARROW 4 mg/5 ml, solution à diluer;solution;flacon(s) en verre de 5 ml;ARROW GENERIQUES;Autorisation active;Commercialisée;Présentation active;Déclaration de commercialisation;2014-06-24;oui;30%;1466.29;1469.05;2.76;ACIDE ZOLEDRONIQUE 4 mg/5 ml - ZOMETA;générique;Tension d'approvisionnement",
].join('\n') + '\n';

test('cleCip13Valide et lireCode reconnaissent CIP13, CIP7 et CIS', () => {
  assert.equal(M.cleCip13Valide('3400949497294'), true);
  assert.equal(M.cleCip13Valide('3400949497295'), false);
  assert.deepEqual(M.lireCode('3 400 949 497 294'), { type: 'cip13', valeur: '3400949497294' });
  assert.deepEqual(M.lireCode('4949729'), { type: 'cip7', valeur: '4949729' });
  assert.deepEqual(M.lireCode('60002283'), { type: 'cis', valeur: '60002283' });
  assert.deepEqual(M.lireCode('-'), { type: '', valeur: '' });
  assert.equal(M.lireCode('ABC').type, 'illisible');
});

test('lireIndex et chercher : par nom, par CIP, par CIS, les présentations commercialisées d\'abord', () => {
  const index = M.lireIndex(INDEX);
  assert.equal(index.nombre, 3);
  assert.equal(index.specialites, 2);
  assert.equal(index.commercialisees, 2);
  assert.deepEqual(M.chercher(index, 'doliprane 1000').map((p) => p.cip7), ['4949729', '3000001']);
  assert.deepEqual(M.chercher(index, '34009278').map((p) => p.cip13), ['3400927849800']);
  assert.deepEqual(M.chercher(index, 'zolédronique arrow').map((p) => p.cis), ['60025054']);
});

test('controler : présentations trouvées, arrêtées, tensions, codes inconnus et CIS', () => {
  const index = M.lireIndex(INDEX);
  const liste = M.lireListe('Produit;Code CIP\nDoliprane 1000;3400949497294\nDoliprane 8;3000001\nZoledronique;3400927849800\nInconnu;3400949497295\nParacetamol;60002283\nBizarre;ABC\n');
  assert.deepEqual(liste.colonnes, { code: 1, nom: 0 });
  const r = M.controler(index, liste);
  const par = (ligne) => r.resultats.find((x) => x.ligne === ligne);
  assert.equal(par(2).resultat, 'présentation trouvée');
  assert.equal(par(2).gravite, 0);
  assert.match(par(2).etat, /commercialisée depuis le 2011-03-16/);
  assert.equal(par(3).gravite, 3);
  assert.match(par(3).etat, /arrêt de commercialisation le 2019-06-30/);
  assert.equal(par(4).gravite, 1);
  assert.match(par(4).etat, /tension d'approvisionnement/);
  assert.ok(par(4).pistes.some((p) => /générique du groupe/.test(p)));
  assert.equal(par(5).resultat, 'CIP13 inconnu');
  assert.ok(par(5).pistes.some((p) => /clé de contrôle/.test(p)));
  assert.ok(par(5).pistes.some((p) => /CIP7 4949729/.test(p)), 'les sept derniers chiffres retrouvent la présentation');
  assert.match(par(6).resultat, /spécialité trouvée \(2 présentations\)/);
  assert.match(par(6).etat, /1 présentation commercialisée sur 2/);
  assert.equal(par(7).resultat, 'code illisible');
  assert.equal(r.comptes.ecarts, 3);
  assert.ok(M.rapportCsv(r).startsWith('﻿ligne;nom_liste;code;'));
});

test('lireListe accepte une simple colonne de codes sans en-tête, mélangeant CIP13 et CIP7', () => {
  const l = M.lireListe('3400949497294\n4949729\n\n2784980\n');
  assert.deepEqual(l.colonnes, { code: 0 });
  assert.deepEqual(l.numeros, [1, 2, 4]);
  const r = M.controler(M.lireIndex(INDEX), l);
  assert.equal(r.comptes.conformes, 2);
  assert.equal(r.comptes.aVerifier, 1);
});
