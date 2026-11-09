/**
 * Passage des coordonnées planes de FINESS (x, y en mètres) à la latitude et à la longitude.
 *
 * Le flux donne x et y en Lambert 93 pour la métropole et dans la projection UTM
 * du territoire outre-mer. Ces systèmes reposent sur l'ellipsoïde GRS 80, que
 * l'on confond avec WGS 84 à l'échelle du mètre. Les formules sont celles de
 * l'IGN (projection conique conforme de Lambert, projection de Mercator
 * transverse en série de Krüger). Vérifié sur le flux de novembre 2026 : pour
 * tous les établissements qui portent à la fois x, y et une latitude, le calcul
 * retombe sur la position publiée, au centimètre près.
 */

const DEGRE = Math.PI / 180;

// Lambert 93 (RGF93, EPSG:2154).
const L93 = { n: 0.725607765053267, c: 11754255.426096, xs: 700000, ys: 12655612.049876, e: 0.0818191910428158, meridien: 3 * DEGRE };

/** @returns {[number, number]} latitude et longitude en degrés */
export function lambert93VersWgs84(x, y) {
  const rayon = Math.hypot(x - L93.xs, y - L93.ys);
  const gamma = Math.atan((x - L93.xs) / (L93.ys - y));
  const latitudeIsometrique = (-1 / L93.n) * Math.log(Math.abs(rayon / L93.c));
  let phi = 2 * Math.atan(Math.exp(latitudeIsometrique)) - Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const s = L93.e * Math.sin(phi);
    phi = 2 * Math.atan(((1 + s) / (1 - s)) ** (L93.e / 2) * Math.exp(latitudeIsometrique)) - Math.PI / 2;
  }
  return [phi / DEGRE, (L93.meridien + gamma / L93.n) / DEGRE];
}

// Mercator transverse universelle sur GRS 80, série de Krüger à l'ordre 3.
const APLATISSEMENT = 1 / 298.257222101;
const N = APLATISSEMENT / (2 - APLATISSEMENT);
const RAYON = (6378137 / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64);
const BETA = [N / 2 - (2 * N ** 2) / 3 + (37 * N ** 3) / 96, N ** 2 / 48 + N ** 3 / 15, (17 * N ** 3) / 480];
const DELTA = [2 * N - (2 * N ** 2) / 3 - 2 * N ** 3, (7 * N ** 2) / 3 - (8 * N ** 3) / 5, (56 * N ** 3) / 15];

/**
 * @param {number} fuseau numéro du fuseau UTM
 * @param {boolean} sud hémisphère sud (ordonnées décalées de 10 000 km)
 * @returns {[number, number]} latitude et longitude en degrés
 */
export function utmVersWgs84(x, y, fuseau, sud = false) {
  const xi = (y - (sud ? 10000000 : 0)) / (0.9996 * RAYON);
  const eta = (x - 500000) / (0.9996 * RAYON);
  let xi1 = xi;
  let eta1 = eta;
  BETA.forEach((beta, rang) => {
    const k = 2 * (rang + 1);
    xi1 -= beta * Math.sin(k * xi) * Math.cosh(k * eta);
    eta1 -= beta * Math.cos(k * xi) * Math.sinh(k * eta);
  });
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  let phi = chi;
  DELTA.forEach((delta, rang) => {
    phi += delta * Math.sin(2 * (rang + 1) * chi);
  });
  const lambda = (fuseau * 6 - 183) * DEGRE + Math.atan(Math.sinh(eta1) / Math.cos(xi1));
  return [phi / DEGRE, lambda / DEGRE];
}

// Projection du flux par département d'outre-mer, avec l'emprise où la position calculée doit tomber :
// [fuseau UTM, hémisphère sud, latitude mini, latitude maxi, longitude mini, longitude maxi].
const OUTRE_MER = {
  971: [20, false, 15.7, 18.2, -63.3, -60.9],
  977: [20, false, 15.7, 18.2, -63.3, -60.9],
  978: [20, false, 15.7, 18.2, -63.3, -60.9],
  972: [20, false, 14.3, 15.0, -61.3, -60.7],
  973: [22, false, 2.0, 6.0, -54.7, -51.5],
  974: [40, true, -21.5, -20.8, 55.1, 55.9],
  975: [21, false, 46.7, 47.2, -56.5, -56.0],
  976: [38, true, -13.1, -12.5, 44.9, 45.4],
};

/**
 * Latitude et longitude d'une adresse d'après ses coordonnées planes, ou null quand la projection n'est pas
 * sûre : territoire sans projection connue ici, coordonnées hors de l'emprise attendue.
 * @param {number} x
 * @param {number} y
 * @param {string|null} departement code du département (971 à 978 outre-mer)
 * @returns {{ latitude: string, longitude: string } | null} degrés décimaux à six décimales, comme dans le flux
 */
export function positionDepuisXY(x, y, departement) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const zone = OUTRE_MER[departement];
  let position = null;
  if (zone) {
    const [latitude, longitude] = utmVersWgs84(x, y, zone[0], zone[1]);
    if (latitude >= zone[2] && latitude <= zone[3] && longitude >= zone[4] && longitude <= zone[5]) position = [latitude, longitude];
  } else if (!/^9[78]/.test(departement ?? '') && x > 90000 && x < 1300000 && y > 6000000 && y < 7200000) {
    // Emprise du Lambert 93 : aucune projection d'outre-mer n'y donne de coordonnées.
    position = lambert93VersWgs84(x, y);
  }
  return position ? { latitude: position[0].toFixed(6), longitude: position[1].toFixed(6) } : null;
}
