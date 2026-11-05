import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { lireZip } from '../src/commun/zip.js';

vm.runInThisContext(readFileSync(new URL('../site/extraire/extraire.js', import.meta.url), 'utf8'));
const E = globalThis.Extraire;

const INDEX = [
  'finess_et;finess_ej;nom_court;nom_long;siret;categorie;categorie_libelle;domaine;secteur;adresse;code_postal;commune_acheminement;code_commune_insee;departement;departement_libelle;latitude;longitude;telephone;ej_denomination;ej_statut_juridique_libelle;ght_nom;ght_role;soins',
  '440000271;440000289;CHU NANTES HOTEL DIEU;CHU DE NANTES SITE HOTEL DIEU;26440013600012;101;Centre hospitalier régional (CHR);SAN;public;1 PLACE ALEXIS RICORDEAU;44093;NANTES CEDEX 1;44109;44;Loire-Atlantique;47.2117;-1.5536;0240083333;CHU DE NANTES;Etablissement Public Communal d\'Hospitalisation;Loire Atlantique;S;med chir obs urg crit',
  '440000453;440000289;CHU NANTES BELLIER;CHU DE NANTES SITE HOPITAL BELLIER;26440013600711;101;Centre hospitalier régional (CHR);SAN;public;41 RUE CURIE;44046;NANTES CEDEX 1;44109;44;Loire-Atlantique;47.2254;-1.5311;;CHU DE NANTES;Etablissement Public Communal d\'Hospitalisation;Loire Atlantique;S;med smr',
  '440044428;440000289;AMP BIO CHU NANTES;AMP BIO CHU NANTES SITE JULES VERNE;;101;Centre hospitalier régional (CHR);SAN;public;;44000;NANTES;44109;44;Loire-Atlantique;;;;CHU DE NANTES;Etablissement Public Communal d\'Hospitalisation;Loire Atlantique;S;',
  '440001234;440005678;CLINIQUE A & B;"CLINIQUE A & B <SITE; NORD>";12345678900011;365;Etablissement de Soins Pluridisciplinaire;SAN;privé lucratif;2 RUE X;44200;NANTES;44109;44;Loire-Atlantique;47.19;-1.54;;SAS CLINIQUE;Société par actions simplifiée (SAS);;;med chir',
  '010780112;010000057;CH BOURG;CENTRE HOSPITALIER DE BOURG EN BRESSE;26010004500012;355;Centre hospitalier (CH);SAN;public;900 ROUTE DE PARIS;01012;BOURG EN BRESSE CEDEX;01053;01;Ain;46.22;5.21;0474454647;CH DE BOURG-EN-BRESSE;Etablissement Public Communal d\'Hospitalisation;Bresse Haut-Bugey;M;med urg',
  '570001234;570009999;EHPAD LES LILAS;EHPAD LES LILAS;26570000000019;500;Etablissement d\'hébergement pour personnes âgées dépendantes;SOC;public;3 RUE Y;57000;METZ;57463;57;Moselle;49.12;6.17;;CCAS DE METZ;Centre Communal d\'Action Sociale;;;',
].join('\n') + '\n';

test('lireIndex : établissements, départements, catégories et GHT disponibles', () => {
  const index = E.lireIndex(INDEX);
  assert.equal(index.nombre, 6);
  assert.deepEqual(index.departements.map((d) => d.code + ':' + d.n), ['01:1', '44:4', '57:1']);
  assert.deepEqual(index.categories.find((c) => c.code === '101'), { code: '101', libelle: 'Centre hospitalier régional (CHR)', domaine: 'SAN', n: 3 });
  assert.deepEqual(index.ghts, [{ nom: 'Bresse Haut-Bugey', n: 1 }, { nom: 'Loire Atlantique', n: 3 }]);
  assert.deepEqual(index.etablissements[0].soins, ['med', 'chir', 'obs', 'urg', 'crit']);
  assert.throws(() => E.lireIndex('finess_et;nom_court\n1;2\n'), /colonne finess_ej absente/);
});

test('filtrer : territoire, catégorie, secteur, activités de soins, GHT et nom', () => {
  const index = E.lireIndex(INDEX);
  const finess = (c) => E.filtrer(index, c).map((e) => e.finessEt);
  assert.equal(finess({}).length, 6);
  assert.deepEqual(finess({ departement: '44', categories: ['101'] }), ['440044428', '440000453', '440000271']);
  assert.deepEqual(finess({ departement: '44', categories: ['101'], soins: ['med'] }), ['440000453', '440000271'], 'les sites de CHR qui exercent la médecine');
  assert.deepEqual(finess({ soins: ['med', 'chir'] }), ['440001234', '440000271'], 'toutes les activités demandées sont exigées');
  assert.deepEqual(finess({ secteurs: ['privé lucratif'] }), ['440001234']);
  assert.deepEqual(finess({ domaine: 'SOC' }), ['570001234']);
  assert.deepEqual(finess({ lieu: 'nantes' }).length, 4);
  assert.deepEqual(finess({ lieu: '4420' }), ['440001234'], 'début de code postal');
  assert.deepEqual(finess({ lieu: '01053' }), ['010780112'], 'code commune INSEE');
  assert.deepEqual(finess({ ght: 'Loire Atlantique', support: true }).length, 3);
  assert.deepEqual(finess({ support: true, soins: ['med'] }), ['440000453', '440000271']);
  assert.deepEqual(finess({ texte: 'bellier' }), ['440000453']);
  assert.deepEqual(finess({ texte: 'ccas' }), ['570001234'], 'le nom de l\'entité juridique compte aussi');
});

test('regrouper : une ligne par entité juridique', () => {
  const index = E.lireIndex(INDEX);
  const entites = E.regrouper(E.filtrer(index, { departement: '44' }));
  assert.equal(entites.length, 2);
  const chu = entites.find((x) => x.finessEj === '440000289');
  assert.equal(chu.nb, 3);
  assert.deepEqual(chu.communes, ['NANTES', 'NANTES CEDEX 1']);
  assert.deepEqual(chu.soins, ['med', 'chir', 'obs', 'urg', 'crit', 'smr']);
  assert.equal(chu.ghtRole, 'S');
});

test('tableau, CSV et GeoJSON : zéros de tête conservés, points seulement pour les établissements géolocalisés', () => {
  const index = E.lireIndex(INDEX);
  const retenus = E.filtrer(index, { soins: ['med'] });
  const t = E.tableau(retenus, 'etablissements');
  assert.equal(t.colonnes[0], 'FINESS ET');
  assert.equal(t.lignes[0][0], '010780112');
  assert.equal(t.lignes[0][t.colonnes.indexOf('Rôle dans le GHT')], 'membre');
  assert.equal(t.lignes[0][t.colonnes.indexOf('Activités de soins')], 'médecine, urgences');
  const csv = E.versCsv(t);
  assert.ok(csv.startsWith('﻿FINESS ET;FINESS EJ;Nom;'));
  assert.ok(csv.includes('"CLINIQUE A & B <SITE; NORD>"'));
  const geo = JSON.parse(E.versGeoJson(E.filtrer(index, { departement: '44' })));
  assert.equal(geo.features.length, 3, 'l\'établissement sans coordonnées est laissé de côté');
  assert.deepEqual(geo.features.find((f) => f.properties.finess_et === '440000271').geometry.coordinates, [-1.5536, 47.2117]);
  const te = E.tableau(E.regrouper(retenus), 'entites');
  assert.equal(te.colonnes[0], 'FINESS EJ');
  assert.equal(te.types[te.colonnes.indexOf('Établissements retenus')], 'nombre');
});

test('versXlsx : un classeur lisible, cellules en texte, en-tête figé et filtre', async () => {
  assert.equal(E.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const index = E.lireIndex(INDEX);
  const t = E.tableau(E.filtrer(index, {}), 'etablissements');
  const octets = await E.versXlsx(t, 'Etablissements');
  const fichiers = lireZip(Buffer.from(octets));
  assert.deepEqual([...fichiers.keys()].sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
  const feuille = fichiers.get('xl/worksheets/sheet1.xml').toString('utf8');
  assert.ok(feuille.includes('<c r="A2" t="inlineStr"><is><t xml:space="preserve">010780112</t></is></c>'), 'le numéro FINESS reste un texte, zéro compris');
  assert.ok(feuille.includes('CLINIQUE A &amp; B &lt;SITE; NORD&gt;'), 'les caractères spéciaux sont échappés');
  assert.ok(/<c r="T2"><v>46\.22<\/v><\/c>/.test(feuille), 'les coordonnées sont des nombres');
  assert.ok(feuille.includes('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'));
  assert.ok(feuille.includes('<autoFilter ref="A1:U7"/>'));
  assert.equal((feuille.match(/<row /g) || []).length, 7);
  assert.ok(fichiers.get('xl/workbook.xml').toString('utf8').includes('<sheet name="Etablissements" sheetId="1" r:id="rId1"/>'));
});
