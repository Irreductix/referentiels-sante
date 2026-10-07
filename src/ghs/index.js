/**
 * Tarifs des GHS, GHT et suppléments publiés par l'ATIH (fichiers « ghs_web »),
 * issus des arrêtés tarifaires annuels. Les archives contiennent six CSV en
 * ISO-8859-1, séparateur « ; », virgule décimale, dates JJ/MM/AAAA :
 *   ghs_pub.csv / ghs_pri.csv   tarifs GHS des secteurs public et privé
 *   ght_pub.csv / ght_pri.csv   tarifs des GHT (hospitalisation à domicile)
 *   sup_pub.csv / sup_pri.csv   suppléments journaliers (réanimation, soins intensifs…)
 */

import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { lireZip } from '../commun/zip.js';
import { lireCsv, EcrivainCsv } from '../commun/csv.js';
import { dateIso, nombreFr, texte } from '../commun/dates.js';
import { telecharger, recupererPage } from '../commun/telecharger.js';

const DOCUMENTS = 'https://www.atih.sante.fr/sites/default/files/content/documents';

/** Adresses connues par campagne, utilisées si la page de l'ATIH ne répond plus. */
export const ARCHIVES = {
  2026: `${DOCUMENTS}/2026%20-%20ghs_web_20260101.zip`,
  2025: `${DOCUMENTS}/2025%20-%20ghs_web_20250301_1.zip`,
  2024: `${DOCUMENTS}/2024%20-%20ghs_web_20240301.zip`,
  2023: `${DOCUMENTS}/2023%20-%20ghs_web_20230301.zip`,
};

export const PAGE_ATIH = 'https://www.atih.sante.fr/tarifs-mco-et-had';
export const pageCampagne = (annee) =>
  `https://www.atih.sante.fr/campagnes-de-financement/campagne-de-financement-des-etablissements-mco-et-had-${annee}`;

/**
 * Repère l'archive ghs_web sur la page de campagne de l'ATIH. L'adresse des
 * fichiers a déjà changé sans préavis : on la lit sur la page, et l'adresse
 * connue ne sert que de repli.
 */
export async function trouverArchive(annee, { journal = () => {}, lirePage = recupererPage } = {}) {
  const connue = ARCHIVES[annee];
  const repli = connue ? ", utilisation de l'adresse connue" : '';
  let page;
  try {
    page = await lirePage(pageCampagne(annee));
  } catch (erreur) {
    journal(`page ATIH ${annee} injoignable (${erreur.message})${repli}`);
    return { url: connue, repli: true };
  }
  // Plusieurs archives peuvent coexister sur une page ; la plus récente porte la date la plus haute.
  const urls = [...page.texte.matchAll(/href="([^"]*ghs_web_\d{8}(?:_\d+)?\.zip)"/gi)]
    .map((m) => new URL(m[1].replace(/&amp;/g, '&'), pageCampagne(annee)).toString())
    .sort()
    .reverse();
  if (!urls.length) {
    journal(`aucune archive ghs_web sur la page ATIH ${annee} (${page.statut})${repli}`);
    return { url: connue, repli: true, statut: page.statut };
  }
  journal(`campagne ${annee} : ${urls[0]}`);
  return { url: urls[0], repli: false, statut: page.statut };
}

const SECTEURS = { pub: 'public', pri: 'prive' };

export const COLONNES_GHS = ['secteur', 'ghs', 'cmd', 'activite_soins', 'ghm', 'libelle', 'seuil_bas', 'seuil_haut',
  'tarif', 'exb_forfait', 'exb_journalier', 'exh_journalier', 'date_effet'];
export const COLONNES_GHT = ['secteur', 'ght', 'libelle', 'tarif', 'date_effet'];
export const COLONNES_SUPPLEMENTS = ['secteur', 'code', 'tarif'];

const decoderLatin1 = (tampon) => new TextDecoder('latin1').decode(tampon);

function ligneGhs(secteur, l) {
  return {
    secteur,
    ghs: texte(l['GHS-NRO']),
    cmd: texte(l['CMD-COD']),
    activite_soins: texte(l['DCS-MCO']),
    ghm: texte(l['GHM-NRO']),
    libelle: texte(l['GHS-LIB']),
    seuil_bas: nombreFr(l['SEU-BAS']),
    seuil_haut: nombreFr(l['SEU-HAU']),
    tarif: nombreFr(l['GHS-PRI']),
    exb_forfait: nombreFr(l['EXB-FORFAIT']),
    exb_journalier: nombreFr(l['EXB-JOURNALIER']),
    exh_journalier: nombreFr(l['EXH-PRI']),
    date_effet: dateIso(l['DATE-EFFET'] ?? l['DAT-EFFET']),
  };
}

const ligneGht = (secteur, l) => ({
  secteur, ght: texte(l['GHT-NRO']), libelle: texte(l['GHT-LIB']), tarif: nombreFr(l['GHT-PRI']),
  date_effet: dateIso(l['DATE-EFFET'] ?? l['DAT-EFFET']),
});

const ligneSupplement = (secteur, l) => ({ secteur, code: texte(l.CODE), tarif: nombreFr(l.TARIF) });

/**
 * Convertit une archive ghs_web (Buffer ou chemin) en tableaux normalisés.
 * @returns {{ ghs: object[], ght: object[], supplements: object[], fichiers: string[] }}
 */
export function convertirArchive(source) {
  const entrees = lireZip(source);
  const resultat = { ghs: [], ght: [], supplements: [], fichiers: [...entrees.keys()] };
  for (const [nom, contenu] of entrees) {
    const m = /^(?:.*\/)?(ghs|ght|sup)_(pub|pri)\.csv$/i.exec(nom);
    if (!m) continue;
    const secteur = SECTEURS[m[2].toLowerCase()];
    const lignes = lireCsv(decoderLatin1(contenu), { separateur: ';' });
    if (m[1].toLowerCase() === 'ghs') resultat.ghs.push(...lignes.map((l) => ligneGhs(secteur, l)));
    else if (m[1].toLowerCase() === 'ght') resultat.ght.push(...lignes.map((l) => ligneGht(secteur, l)));
    else resultat.supplements.push(...lignes.map((l) => ligneSupplement(secteur, l)));
  }
  return resultat;
}

/**
 * Télécharge l'archive d'une campagne (ou lit un fichier local / une URL) et
 * écrit ghs.csv, ght.csv, supplements.csv et tarifs.json dans `sortie`.
 */
export async function exporterTarifs({ annee, source, sortie = 'data/ghs', cache = '.cache', forcer = false, journal = () => {} }) {
  let chemin;
  if (source && !/^https?:/.test(source)) chemin = source;
  else {
    const url = source ?? (annee ? (await trouverArchive(annee, { journal })).url : undefined);
    if (!url) throw new Error(`campagne ${annee} inconnue : indiquez l'URL de l'archive ATIH (voir ${PAGE_ATIH})`);
    // L'ATIH préfixe le nom de l'année et d'un tiret : on garde la partie stable pour le cache.
    const nom = url.match(/ghs_web_\d{8}(?:_\d+)?\.zip/i)?.[0] ?? decodeURIComponent(url.split('/').pop());
    chemin = join(cache, 'ghs', nom);
    await telecharger(url, chemin, { forcer, journal });
  }
  const donnees = convertirArchive(readFileSync(chemin));
  mkdirSync(sortie, { recursive: true });

  for (const [nom, colonnes, lignes] of [
    ['ghs', COLONNES_GHS, donnees.ghs], ['ght', COLONNES_GHT, donnees.ght], ['supplements', COLONNES_SUPPLEMENTS, donnees.supplements],
  ]) {
    const csv = new EcrivainCsv(join(sortie, `${nom}.csv`), colonnes);
    for (const l of lignes) await csv.ecrire(l);
    await csv.fermer();
  }
  const resume = {
    source: chemin, campagne: annee ?? null, converti: new Date().toISOString(),
    ghs: donnees.ghs.length, ght: donnees.ght.length, supplements: donnees.supplements.length,
    datesEffet: [...new Set(donnees.ghs.map((l) => l.date_effet).filter(Boolean))].sort(),
  };
  writeFileSync(join(sortie, 'tarifs.json'), JSON.stringify({ resume, ...donnees }, null, 1) + '\n');
  writeFileSync(join(sortie, 'tarifs-resume.json'), JSON.stringify(resume, null, 2) + '\n');
  return resume;
}
