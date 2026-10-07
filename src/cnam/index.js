/**
 * Tables de codage publiées par l'Assurance Maladie sur codage.ext.cnamts.fr,
 * au format DBF (page de code DOS) :
 *
 *   nabm   nomenclature des actes de biologie médicale (table nationale de biologie)
 *   lpp    liste des produits et prestations (dispositifs médicaux)
 *   ucd    unités communes de dispensation (médicaments à l'hôpital)
 *
 * Les pages de téléchargement changent de numéro de version à chaque
 * publication : on lit la page pour trouver les fichiers « total » courants,
 * puis chaque table DBF est convertie telle quelle en CSV UTF-8.
 */

import { join, basename } from 'node:path';
import { mkdirSync, readdirSync, writeFileSync, openSync, readSync, closeSync, copyFileSync } from 'node:fs';

import { telecharger, recupererTexte } from '../commun/telecharger.js';
import { extraireZip } from '../commun/zip.js';
import { convertirTableDbf } from '../ccam/index.js';
import { documenterTable } from './colonnes.js';

const HOTE = 'http://www.codage.ext.cnamts.fr';

export const SOURCES = {
  nabm: {
    libelle: 'Nomenclature des actes de biologie médicale (TNB)',
    page: `${HOTE}/codif/nabm/telecharge/index_tele.php?p_site=AMELI`,
    motif: /href=['"]([^'"]*download_file\.php\?filename=nabm\/(NABM_[A-Z]+_TOT\d+\.dbf))['"]/gi,
    base: `${HOTE}/codif/nabm/telecharge/`,
  },
  lpp: {
    // LPP<version>.zip contient les tables DBF ; LPPTOT<version>.zip est un fichier texte à longueur fixe.
    libelle: 'Liste des produits et prestations (LPP)',
    page: `${HOTE}/codif/tips//telecharge/index_tele.php?p_site=AMELI`,
    motif: /href=['"]([^'"]*download_file\.php\?filename=tips\/(LPP\d+\.zip))['"]/gi,
    base: HOTE,
  },
  ucd: {
    // Les tables DBF sont publiées directement (ucd_total, ucd_histo_prix, retro_histo_taux…).
    libelle: 'Unités communes de dispensation (UCD)',
    page: `${HOTE}/codif/bdm_it/index_tele_ucd.php?p_site=AMELI`,
    motif: /href=['"]([^'"]*download_file\.php\?filename=bdm_it\/([A-Za-z_]+_\d+(?:_\d+)?\.dbf))['"]/gi,
    base: HOTE,
  },
};

/**
 * Dernières versions connues au moment de la publication, utilisées si la page
 * de téléchargement est injoignable ou méconnaissable. La commande `verifier`
 * signale quand elles sont dépassées.
 */
export const VERSIONS_CONNUES = {
  nabm: {
    version: '105',
    fichiers: ['NABM_FICHE_TOT105.dbf', 'NABM_HISTO_TOT105.dbf', 'NABM_INCOMP_TOT105.dbf']
      .map((nom) => ({ nom, url: `${HOTE}/codif/nabm/download_file.php?filename=nabm/${nom}` })),
  },
  lpp: {
    version: '904',
    fichiers: [{ nom: 'LPP904.zip', url: `${HOTE}/codif/tips/download_file.php?filename=tips/LPP904.zip` }],
  },
  ucd: {
    version: '00805',
    fichiers: ['ucd_total_00805_20260929.dbf', 'ucd_maj_00805_20260929.dbf', 'ucd_histo_prix_00805_20260929.dbf',
      'retro_histo_taux_00805_20260929.dbf', 'retro_histo_cout_sup_00805_20260929.dbf']
      .map((nom) => ({ nom, url: `${HOTE}/codif/bdm_it/download_file.php?filename=bdm_it/${nom}` })),
  },
};

/** Lit la page de téléchargement et renvoie les fichiers « total » courants. */
export async function trouverFichiers(nom, { journal = () => {} } = {}) {
  const source = SOURCES[nom];
  if (!source) throw new Error(`source inconnue : ${nom} (choix : ${Object.keys(SOURCES).join(', ')})`);
  let html;
  try {
    html = await recupererTexte(source.page);
  } catch (erreur) {
    journal(`page injoignable (${erreur.message}), utilisation de la version connue ${VERSIONS_CONNUES[nom].version}`);
    return { ...VERSIONS_CONNUES[nom], repli: true, statut: erreur.statut };
  }
  const fichiers = [];
  for (const m of html.matchAll(source.motif)) {
    const url = new URL(m[1], source.base).toString();
    if (!fichiers.some((f) => f.url === url)) fichiers.push({ url, nom: m[2] });
  }
  if (!fichiers.length) {
    journal(`aucun fichier reconnu sur la page, utilisation de la version connue ${VERSIONS_CONNUES[nom].version}`);
    return { ...VERSIONS_CONNUES[nom], repli: true };
  }
  // Premier groupe de chiffres du nom : LPP901.zip, NABM_FICHE_TOT105.dbf, ucd_total_00802_20260907.dbf.
  const version = fichiers[0].nom.match(/(\d{3,})/)?.[1] ?? 'inconnue';
  journal(`${source.libelle} : version ${version}, ${fichiers.length} fichier(s)`);
  return { version, fichiers, repli: false };
}

const SIGNATURE_ZIP = Buffer.from('PK', 'latin1');

/** Reconnaît un DBF à son premier octet (version dBase) et à un en-tête cohérent. */
export function ressembleDbf(chemin) {
  const fd = openSync(chemin, 'r');
  try {
    const b = Buffer.alloc(32);
    const lus = readSync(fd, b, 0, 32, 0);
    if (lus < 32) return false;
    const version = b[0] & 0x07;
    const longueurEntete = b.readUInt16LE(8);
    return (version === 3 || version === 4 || version === 5) && longueurEntete >= 33 && (longueurEntete - 33) % 32 === 0;
  } finally {
    closeSync(fd);
  }
}

/**
 * Dépose dans `dossierDbf` les tables contenues dans un fichier téléchargé :
 * DBF direct, archive ZIP (dont les entrées sans extension, fréquentes chez
 * l'Assurance Maladie, qui peuvent être un DBF ou une archive imbriquée).
 */
export async function deposerDbf(chemin, dossierDbf, profondeur = 0) {
  if (profondeur > 3) return;
  const entete = Buffer.alloc(4);
  const fd = openSync(chemin, 'r');
  try { readSync(fd, entete, 0, 4, 0); } finally { closeSync(fd); }
  if (entete.equals(SIGNATURE_ZIP)) {
    const temporaire = join(dossierDbf, '..', `extrait-${profondeur}-${basename(chemin)}`);
    for (const extrait of await extraireZip(chemin, temporaire)) await deposerDbf(extrait, dossierDbf, profondeur + 1);
    return;
  }
  if (ressembleDbf(chemin)) {
    const nom = /\.dbf$/i.test(chemin) ? basename(chemin) : `${basename(chemin)}.dbf`;
    copyFileSync(chemin, join(dossierDbf, nom));
  }
}

/**
 * Télécharge, extrait et convertit toutes les tables DBF d'une source.
 */
export async function exporterTableCnam(nom, { sortie, cache = '.cache', forcer = false, encodage = 'cp850', journal = () => {} } = {}) {
  const source = SOURCES[nom];
  const { version, fichiers } = await trouverFichiers(nom, { journal });
  const dossierCache = join(cache, nom, version);
  const dossierDbf = join(dossierCache, 'dbf');
  mkdirSync(dossierDbf, { recursive: true });
  for (const f of fichiers) {
    const chemin = join(dossierCache, f.nom);
    await telecharger(f.url, chemin, { forcer, journal });
    await deposerDbf(chemin, dossierDbf);
  }
  const dossierSortie = sortie ?? `data/${nom}`;
  mkdirSync(dossierSortie, { recursive: true });
  const dbfs = readdirSync(dossierDbf).filter((x) => /\.dbf$/i.test(x));
  if (!dbfs.length) throw new Error(`aucune table DBF obtenue pour ${nom} : vérifiez les fichiers dans ${dossierCache}`);
  const tables = [];
  for (const f of dbfs) {
    tables.push(await convertirTableDbf(join(dossierDbf, f), dossierSortie, { encodage, journal }));
  }

  // Dictionnaire des colonnes, pour que les tables restent lisibles sans la notice.
  const documentation = [
    `# ${source.libelle} : colonnes`, '',
    `Version ${version}, tables converties le ${new Date().toISOString().slice(0, 10)} depuis ${source.page}.`, '',
    'La colonne « Source » indique si la description vient de la notice officielle publiée avec les fichiers,',
    'si elle est déduite du nom de la colonne et des valeurs observées, ou si la colonne n\'est pas documentée.', '',
    ...tables.map((t) => documenterTable(t.table, t.colonnes) + '\n'),
  ].join('\n');
  writeFileSync(join(dossierSortie, `${nom}-colonnes.md`), documentation);

  const resume = {
    source: source.page, libelle: source.libelle, version, converti: new Date().toISOString(),
    fichiersSources: fichiers.map((f) => f.nom), tables, dictionnaire: `${nom}-colonnes.md`,
  };
  writeFileSync(join(dossierSortie, `${nom}-resume.json`), JSON.stringify(resume, null, 2) + '\n');
  return resume;
}
