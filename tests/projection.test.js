import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lambert93VersWgs84, positionDepuisXY, utmVersWgs84 } from '../src/commun/projection.js';
import { COLONNES_ENTITE_JURIDIQUE, COLONNES_ETABLISSEMENT, completerPosition, ligneEntiteJuridique, lignesEtablissements } from '../src/finess/aplatir.js';
import { libellesVides } from '../src/finess/libelles.js';

// Points de contrôle : adresses du flux FINESS de novembre 2026 qui portent à la fois x, y, latitude et longitude.
const METROPOLE = [
  [871083.82, 6569131.67, '46.200393', '5.218958'],
  [1044172.62, 6300626.46, '43.720849', '7.272267'],
];
const OUTRE_MER = [
  ['971', 635953.93, 1768937.36, '15.996262', '-61.729415'],
  ['977', 515782.31, 1979129.29, '17.900009', '-62.851001'],
  ['978', 491161.88, 1997772.45, '18.068557', '-63.083519'],
  ['972', 717454.54, 1607326.81, '14.530206', '-60.982014'],
  ['973', 357629.08, 540490.16, '4.888635', '-52.283985'],
  ['974', 339837.95, 7689388.62, '-20.888827', '55.460202'],
  ['975', 563076.02, 5181276.28, '46.782052', '-56.173684'],
  ['976', 524237.71, 8586715.15, '-12.784227', '45.223318'],
];

test('Lambert 93 vers latitude et longitude : on retombe sur les positions du flux', () => {
  for (const [x, y, latitude, longitude] of METROPOLE) {
    const [lat, lon] = lambert93VersWgs84(x, y);
    assert.equal(lat.toFixed(6), latitude);
    assert.equal(lon.toFixed(6), longitude);
    assert.deepEqual(positionDepuisXY(x, y, '06'), { latitude, longitude });
    assert.deepEqual(positionDepuisXY(x, y, null), { latitude, longitude }, "l'emprise suffit quand le département manque");
  }
});

test("UTM vers latitude et longitude : chaque territoire d'outre-mer dans son fuseau", () => {
  for (const [departement, x, y, latitude, longitude] of OUTRE_MER) {
    assert.deepEqual(positionDepuisXY(x, y, departement), { latitude, longitude }, `département ${departement}`);
  }
  const [lat, lon] = utmVersWgs84(339837.95, 7689388.62, 40, true);
  assert.equal(lat.toFixed(6), '-20.888827');
  assert.equal(lon.toFixed(6), '55.460202');
});

test("pas de position quand la projection n'est pas sûre", () => {
  assert.equal(positionDepuisXY(339837.95, 7689388.62, '971'), null, 'des coordonnées de La Réunion sous un code de Guadeloupe');
  assert.equal(positionDepuisXY(339837.95, 7689388.62, null), null, "hors de l'emprise du Lambert 93, sans département");
  assert.equal(positionDepuisXY(871083.82, 6569131.67, '974'), null, 'des coordonnées de métropole sous un code de La Réunion');
  assert.equal(positionDepuisXY(375068, 8419154, '986'), null, 'Wallis-et-Futuna : projection non vérifiée, rien de calculé');
  assert.equal(positionDepuisXY(5.218958, 46.200393, '01'), null, 'des degrés à la place des mètres, comme dans les flux antérieurs au 6 octobre 2026');
  assert.equal(positionDepuisXY(Number.NaN, 6569131.67, '01'), null);
});

test("l'origine de la position est écrite sur chaque ligne, en dernière colonne", () => {
  assert.equal(COLONNES_ETABLISSEMENT.at(-1), 'latitude_longitude_origine');
  assert.equal(COLONNES_ENTITE_JURIDIQUE.at(-1), 'latitude_longitude_origine');

  const source = { latitude: '46.200393', longitude: '5.218958', coordonnee_x: '871083.82', coordonnee_y: '6569131.67', departement: '01' };
  assert.equal(completerPosition(source), 'source');
  assert.equal(source.latitude, '46.200393', 'une position donnée par le flux reste telle quelle');
  const calculee = { latitude: null, longitude: null, coordonnee_x: '1044172.62', coordonnee_y: '6300626.46', departement: '06' };
  assert.equal(completerPosition(calculee), 'calcul');
  assert.deepEqual([calculee.latitude, calculee.longitude], ['43.720849', '7.272267']);
  const vide = { latitude: null, longitude: null, coordonnee_x: null, coordonnee_y: null, departement: '06' };
  assert.equal(completerPosition(vide), null);
  assert.equal(vide.latitude, null);

  const adresse = (geo) => [{ usageAdresse: '03', cogCommune: '06088', coordonneesGeographique: geo }];
  const pmej = {
    informationsGeneralesPMEJ: { numFinessPm: '060000001', pmSmsseId: '1' },
    adresse: [{ usageAdresse: '02', cogCommune: '06088', coordonneesGeographique: { coordonneeX: '1044172.62', coordonneeY: '6300626.46', directionLatitude: null, directionLongitude: null } }],
    ege: [
      { informationsGeneralesEGE: { egeId: '10', numFinessEge: '060000010' }, adresse: adresse({ coordonneeX: '1044172.62', coordonneeY: '6300626.46', directionLatitude: null, directionLongitude: null }) },
      { informationsGeneralesEGE: { egeId: '11', numFinessEge: '060000011' }, adresse: adresse({ coordonneeX: '1044172.62', coordonneeY: '6300626.46', directionLatitude: '43.720849', directionLongitude: '7.272267' }) },
      { informationsGeneralesEGE: { egeId: '12', numFinessEge: '060000012' }, adresse: adresse({}) },
    ],
  };
  const L = libellesVides();
  const lignes = lignesEtablissements(pmej, L);
  assert.deepEqual(lignes.map((l) => [l.finess_et, l.latitude, l.longitude, l.latitude_longitude_origine]), [
    ['060000010', '43.720849', '7.272267', 'calcul'],
    ['060000011', '43.720849', '7.272267', 'source'],
    ['060000012', null, null, null],
  ]);
  const entite = ligneEntiteJuridique(pmej, L);
  assert.deepEqual([entite.latitude, entite.longitude, entite.latitude_longitude_origine], ['43.720849', '7.272267', 'calcul']);
});
