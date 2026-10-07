/**
 * CCAM (classification commune des actes médicaux) depuis les fichiers DBF
 * publiés par l'Assurance Maladie. La base compte 72 tables (version 84) ;
 * les principales sont :
 *
 *   R_ACTE               un acte par version (code sur 7 caractères, libellés, dates)
 *   R_ACTE_IVITE         les activités d'un acte (code acte + chiffre d'activité)
 *   R_ACTE_IVITE_PHASE   les phases d'une activité, avec le prix unitaire de base
 *   R_PU_BASE            les prix unitaires par grille tarifaire (secteur, spécialité)
 *   R_MENU               l'arborescence des chapitres
 *   R_TB11, R_TB23       les modificateurs et les grilles tarifaires
 *   R_NOTE_ACTE          les notes de facturation et de codage
 *
 * Chaque table est historisée : un même code apparaît une fois par date de
 * modification. La synthèse retient la version la plus récente ; les tables
 * complètes restent disponibles avec l'option `brut`.
 */

import { join, basename } from 'node:path';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';

import { telecharger, recupererPage } from '../commun/telecharger.js';
import { extraireZip } from '../commun/zip.js';
import { lireDbf, chargerDbf, lireEnteteDbf } from '../commun/dbf.js';
import { EcrivainCsv } from '../commun/csv.js';
import { texte } from '../commun/dates.js';

export const PAGE_TELECHARGEMENT = 'https://www.ameli.fr/accueil-de-la-ccam/telechargement/fichiers-informatiques-nouvelle-structure/index.php';
const BASE = 'https://www.ameli.fr';

/** Dernière version connue au moment de la publication, utilisée si la page ameli est injoignable. */
export const ARCHIVES_CONNUES = {
  version: '08400',
  archives: [
    `${BASE}/fileadmin/user_upload/documents/CCAM08400_DBF_PART1.zip`,
    `${BASE}/fileadmin/user_upload/documents/CCAM8400_DBF_PART2.zip`,
    `${BASE}/fileadmin/user_upload/documents/CCAM08400_DBF_PART3.zip`,
  ],
};

/**
 * Repère sur la page ameli les archives DBF de la version courante. La page est
 * lue même servie sous un code d'erreur : ameli répond 500 avec le contenu complet.
 */
export async function trouverArchives({ journal = () => {}, lirePage = recupererPage } = {}) {
  let page;
  try {
    page = await lirePage(PAGE_TELECHARGEMENT);
  } catch (erreur) {
    journal(`page ameli injoignable (${erreur.message}), utilisation de la version connue ${ARCHIVES_CONNUES.version}`);
    return { ...ARCHIVES_CONNUES, repli: true };
  }
  const urls = [...page.texte.matchAll(/href="([^"]*\/CCAM0?(\d{4,5})_DBF_PART(\d)\.zip)"/gi)]
    .map((m) => ({ url: m[1].startsWith('http') ? m[1] : BASE + m[1], version: m[2].padStart(5, '0'), partie: Number(m[3]) }))
    .sort((a, b) => a.partie - b.partie);
  if (!urls.length) {
    journal(`aucune archive reconnue sur la page ameli (${page.statut}), utilisation de la version connue ${ARCHIVES_CONNUES.version}`);
    return { ...ARCHIVES_CONNUES, repli: true, statut: page.statut };
  }
  const version = urls[0].version;
  journal(`CCAM version ${version} : ${urls.length} archives`);
  return { version, archives: urls.filter((u) => u.version === version).map((u) => u.url), repli: false, statut: page.statut };
}

/**
 * Télécharge et extrait les DBF dans le cache. Renvoie le dossier des DBF et la version.
 */
export async function preparerDbf({ cache = '.cache', forcer = false, journal = () => {}, archives } = {}) {
  let version = 'locale';
  let liste = archives;
  if (!liste) ({ version, archives: liste } = await trouverArchives({ journal }));
  const dossier = join(cache, 'ccam', version, 'dbf');
  const dejaExtrait = existsSync(dossier) && readdirSync(dossier).some((f) => /\.dbf$/i.test(f));
  if (dejaExtrait && !forcer) { journal(`DBF déjà extraits : ${dossier}`); return { dossier, version }; }
  for (const url of liste) {
    const chemin = join(cache, 'ccam', version, basename(url));
    await telecharger(url, chemin, { forcer, journal });
    journal(`extraction : ${basename(url)}`);
    await extraireZip(chemin, dossier, { filtre: (n) => /\.dbf$/i.test(n) });
  }
  return { dossier, version };
}

const cheminTable = (dossier, nom) => {
  const fichiers = readdirSync(dossier);
  const f = fichiers.find((x) => x.toLowerCase() === `${nom.toLowerCase()}.dbf`);
  return f ? join(dossier, f) : null;
};

async function table(dossier, nom) {
  const chemin = cheminTable(dossier, nom);
  return chemin ? chargerDbf(chemin) : [];
}

const index = (lignes, cle, valeur = 'LIBELLE') => new Map(lignes.map((l) => [String(l[cle]), l[valeur]]));

/**
 * Concatène les colonnes NOM_LONG, NOM_LONG0 … NOM_LONGE (ou TEXTE_NOTE…) dans
 * l'ordre du fichier. Les textes longs sont découpés mécaniquement par
 * tranches de 254 caractères, parfois au milieu d'un mot, parfois juste après
 * un espace : il faut donc travailler sur les valeurs brutes (espaces de fin
 * compris) et ne nettoyer qu'après assemblage.
 */
export function concatener(ligne, prefixe) {
  return Object.keys(ligne)
    .filter((k) => k.startsWith(prefixe))
    .map((k) => ligne[k] ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

/**
 * Ne garde, pour chaque clé, que la version en vigueur : la ligne à la date de
 * modification la plus récente, ou, si `dateReference` est donnée (AAAA-MM-JJ),
 * la plus récente parmi celles dont la date de modification lui est antérieure
 * ou égale. Une clé sans version à cette date est absente du résultat.
 */
export function versionEnVigueur(lignes, cle, date, dateReference = null) {
  const m = new Map();
  for (const l of lignes) {
    const d = String(l[date] ?? '');
    if (dateReference && d > dateReference) continue;
    const k = String(l[cle]);
    const courant = m.get(k);
    if (!courant || d >= String(courant[date] ?? '')) m.set(k, l);
  }
  return m;
}

/**
 * Arborescence des chapitres avec numérotation « 01.02.03 » calculée sur les
 * rangs. Le nœud racine « ARBORESCENCE CCAM » (sans parent, rang 0) n'entre
 * ni dans la numérotation ni dans le chemin : les chapitres officiels
 * commencent à 01.
 */
export function chapitres(menus) {
  const parCode = new Map(menus.map((m) => [String(m.COD_MENU), m]));
  const resultat = new Map();
  const estRacine = (m) => (m.COD_PERE == null || !parCode.has(String(m.COD_PERE))) && Number(m.RANG ?? 0) === 0;
  const construire = (code, visites = new Set()) => {
    if (resultat.has(code)) return resultat.get(code);
    const m = parCode.get(code);
    if (!m || visites.has(code)) return null;
    visites.add(code);
    const pere = m.COD_PERE != null && parCode.has(String(m.COD_PERE)) ? construire(String(m.COD_PERE), visites) : null;
    const rang = String(m.RANG ?? '').padStart(2, '0');
    const racine = estRacine(m);
    const pereUtile = pere && pere.numero !== null ? pere : null;
    const c = {
      code_menu: code,
      numero: racine ? null : pereUtile ? `${pereUtile.numero}.${rang}` : rang,
      libelle: m.LIBELLE,
      parent_code_menu: pere ? pere.code_menu : null,
      niveau: racine ? 0 : pereUtile ? pereUtile.niveau + 1 : 1,
      chemin: pereUtile ? `${pereUtile.chemin} > ${m.LIBELLE}` : m.LIBELLE,
    };
    resultat.set(code, c);
    return c;
  };
  for (const code of parCode.keys()) construire(code);
  return resultat;
}

export const COLONNES_ACTES = [
  'code', 'libelle_court', 'libelle_long', 'type', 'type_libelle', 'chapitre_numero', 'chapitre_libelle', 'chapitre_chemin', 'code_menu',
  'remboursement', 'remboursement_libelle', 'frais_deplacement', 'frais_deplacement_libelle', 'entente_prealable', 'sexe',
  'date_creation', 'date_effet', 'date_fin', 'date_arrete', 'date_jo', 'date_modification',
  'nb_activites', 'activites', 'regroupement', 'regroupement_libelle', 'tarif_base', 'icr', 'classant', 'version',
];
export const COLONNES_ACTIVITES = ['code_activite', 'code_acte', 'activite', 'activite_libelle', 'regroupement', 'regroupement_libelle', 'categorie_medicale', 'categorie_medicale_libelle', 'date_modification'];
export const COLONNES_PHASES = ['code_phase', 'code_activite', 'code_acte', 'activite', 'phase', 'phase_libelle', 'tarif_base', 'supplement', 'coefficient', 'nb_seances', 'age_min', 'age_max', 'unite_oeuvre', 'paiement', 'paiement_libelle', 'icr', 'classant', 'date_modification'];
export const COLONNES_TARIFS = ['code_phase', 'code_acte', 'grille', 'grille_libelle', 'tarif', 'date_modification'];
export const COLONNES_MODIFICATEURS = ['code', 'libelle', 'coefficient', 'forfait', 'grille', 'grille_libelle', 'date_debut', 'date_fin'];
export const COLONNES_ACTIVITES_MODIFICATEURS = ['code_activite', 'code_acte', 'modificateur', 'date_modification'];
export const COLONNES_CHAPITRES = ['numero', 'libelle', 'niveau', 'code_menu', 'parent_code_menu', 'chemin'];
export const COLONNES_NOTES = ['code_acte', 'ordre', 'type_note', 'type_note_libelle', 'texte', 'renvoi', 'date_modification'];

/**
 * Produit les fichiers de synthèse depuis un dossier de DBF.
 * @param {object} o
 * @param {string} o.dossierDbf
 * @param {string} o.sortie
 * @param {string} [o.version]
 * @param {boolean} [o.brut] convertir aussi chaque table telle quelle dans sortie/brut
 * @param {string} [o.dateReference] AAAA-MM-JJ : synthèse telle qu'en vigueur à cette date (défaut : la plus récente)
 */
export async function convertirDbf({ dossierDbf, sortie, version = null, brut = false, dateReference = null, journal = () => {} }) {
  if (dateReference && !/^\d{4}-\d{2}-\d{2}$/.test(dateReference)) throw new Error(`date de référence invalide : ${dateReference} (attendu AAAA-MM-JJ)`);
  mkdirSync(sortie, { recursive: true });
  const debut = Date.now();

  const lib = {
    type: index(await table(dossierDbf, 'R_TYPE'), 'COD_TYPE'),
    activite: index(await table(dossierDbf, 'R_ACTIVITE'), 'COD_ACTIV'),
    phase: index(await table(dossierDbf, 'R_PHASE'), 'COD_PHASE'),
    regroupement: index(await table(dossierDbf, 'R_REGROUPEMENT'), 'COD_REGROU'),
    categorieMedicale: index(await table(dossierDbf, 'R_CATEGORIE_MEDIC'), 'COD_CATMED'),
    remboursement: index(await table(dossierDbf, 'R_REMBOURSEMENT'), 'COD_REMBOU'),
    fraisDeplacement: index(await table(dossierDbf, 'R_FRAIS_DEP'), 'COD_FRAIDP'),
    paiement: index(await table(dossierDbf, 'R_PAIEMENT'), 'COD_PAIEMT'),
    grille: index(await table(dossierDbf, 'R_TB23'), 'COD_GRILLE'),
    typeNote: index(await table(dossierDbf, 'R_TYPE_NOTE'), 'COD_TYPNOT'),
  };
  const arbre = chapitres(await table(dossierDbf, 'R_MENU'));
  journal(`tables de codes chargées, ${arbre.size} chapitres`);

  // Activités et phases : version la plus récente de chaque code.
  const activites = versionEnVigueur(await table(dossierDbf, 'R_ACTE_IVITE'), 'COD_AA', 'DT_MODIF', dateReference);
  const phases = versionEnVigueur(await table(dossierDbf, 'R_ACTE_IVITE_PHASE'), 'COD_AAP', 'DT_MODIF', dateReference);
  const pmsi = new Map((await table(dossierDbf, 'R_AAP_PMSI')).map((l) => [l.AAP_COD, l]));
  const activitesParActe = new Map();
  for (const a of activites.values()) {
    if (!activitesParActe.has(a.ACTE_COD)) activitesParActe.set(a.ACTE_COD, []);
    activitesParActe.get(a.ACTE_COD).push(a);
  }
  journal(`${activites.size} activités, ${phases.size} phases`);

  // Actes : le fichier est volumineux (libellés longs), on ne garde que la dernière version.
  const actes = new Map();
  let versionsActes = 0;
  const cheminActes = cheminTable(dossierDbf, 'R_ACTE');
  if (cheminActes) {
    for await (const l of lireDbf(cheminActes, { champsBruts: (n) => n.startsWith('NOM_LONG') })) {
      versionsActes++;
      if (dateReference && String(l.DT_MODIF ?? '') > dateReference) continue;
      const courant = actes.get(l.COD_ACTE);
      if (!courant || String(l.DT_MODIF ?? '') >= String(courant.DT_MODIF ?? '')) {
        actes.set(l.COD_ACTE, { ...l, libelle_long: concatener(l, 'NOM_LONG') });
      }
    }
  }
  journal(`${actes.size} actes (${versionsActes} versions)`);

  const csvActes = new EcrivainCsv(join(sortie, 'ccam-actes.csv'), COLONNES_ACTES);
  for (const a of [...actes.values()].sort((x, y) => x.COD_ACTE.localeCompare(y.COD_ACTE))) {
    const acts = (activitesParActe.get(a.COD_ACTE) ?? []).sort((x, y) => String(x.ACTIV_COD).localeCompare(String(y.ACTIV_COD)));
    const premiere = acts.find((x) => String(x.ACTIV_COD) === '1') ?? acts[0];
    const phase0 = premiere ? phases.get(`${premiere.COD_AA}0`) : null;
    const chap = arbre.get(String(a.MENU_COD));
    await csvActes.ecrire({
      code: a.COD_ACTE,
      libelle_court: a.NOM_COURT,
      libelle_long: a.libelle_long,
      type: a.TYPE_COD,
      type_libelle: lib.type.get(String(a.TYPE_COD)) ?? null,
      chapitre_numero: chap?.numero ?? null,
      chapitre_libelle: chap?.libelle ?? null,
      chapitre_chemin: chap?.chemin ?? null,
      code_menu: a.MENU_COD,
      remboursement: a.REMBOU_COD,
      remboursement_libelle: lib.remboursement.get(String(a.REMBOU_COD)) ?? null,
      frais_deplacement: a.FRAIDP_COD,
      frais_deplacement_libelle: lib.fraisDeplacement.get(String(a.FRAIDP_COD)) ?? null,
      entente_prealable: a.ENTENTE,
      sexe: a.SEXE,
      date_creation: a.DT_CREATIO,
      date_effet: a.DT_EFFET,
      date_fin: a.DT_FIN,
      date_arrete: a.DT_ARRETE,
      date_jo: a.DT_JO,
      date_modification: a.DT_MODIF,
      nb_activites: acts.length,
      activites: acts.map((x) => x.ACTIV_COD).join('|') || null,
      regroupement: premiere?.REGROU_COD ?? null,
      regroupement_libelle: premiere ? lib.regroupement.get(String(premiere.REGROU_COD)) ?? null : null,
      tarif_base: phase0?.PU_BASE ?? null,
      icr: phase0 ? pmsi.get(phase0.COD_AAP)?.ICR ?? null : null,
      classant: phase0 ? texte(pmsi.get(phase0.COD_AAP)?.CLASSANT) : null,
      version,
    });
  }
  await csvActes.fermer();

  const csvActivites = new EcrivainCsv(join(sortie, 'ccam-activites.csv'), COLONNES_ACTIVITES);
  for (const a of activites.values()) {
    await csvActivites.ecrire({
      code_activite: a.COD_AA, code_acte: a.ACTE_COD, activite: a.ACTIV_COD,
      activite_libelle: lib.activite.get(String(a.ACTIV_COD)) ?? null,
      regroupement: a.REGROU_COD, regroupement_libelle: lib.regroupement.get(String(a.REGROU_COD)) ?? null,
      categorie_medicale: a.CATMED_COD, categorie_medicale_libelle: lib.categorieMedicale.get(String(a.CATMED_COD)) ?? null,
      date_modification: a.DT_MODIF,
    });
  }
  await csvActivites.fermer();

  const csvPhases = new EcrivainCsv(join(sortie, 'ccam-phases.csv'), COLONNES_PHASES);
  for (const p of phases.values()) {
    const acte = activites.get(p.AA_COD)?.ACTE_COD ?? String(p.COD_AAP).slice(0, 7);
    await csvPhases.ecrire({
      code_phase: p.COD_AAP, code_activite: p.AA_COD, code_acte: acte, activite: String(p.AA_COD).slice(7),
      phase: p.PHASE_COD, phase_libelle: lib.phase.get(String(p.PHASE_COD)) ?? null,
      tarif_base: p.PU_BASE, supplement: p.SUPPLEMENT, coefficient: p.COEFFICIEN, nb_seances: p.NB_SEANCES,
      age_min: p.AGE_MIN, age_max: p.AGE_MAX, unite_oeuvre: p.UOEUVR_COD,
      paiement: p.PAIEM_COD, paiement_libelle: lib.paiement.get(String(p.PAIEM_COD)) ?? null,
      icr: pmsi.get(p.COD_AAP)?.ICR ?? null, classant: texte(pmsi.get(p.COD_AAP)?.CLASSANT), date_modification: p.DT_MODIF,
    });
  }
  await csvPhases.fermer();

  // Prix par grille : près d'un million de lignes, en flux.
  let nbTarifs = 0;
  const cheminPu = cheminTable(dossierDbf, 'R_PU_BASE');
  const csvTarifs = new EcrivainCsv(join(sortie, 'ccam-tarifs-grilles.csv'), COLONNES_TARIFS);
  if (cheminPu) {
    for await (const l of lireDbf(cheminPu)) {
      nbTarifs++;
      await csvTarifs.ecrire({
        code_phase: l.AAP_COD, code_acte: String(l.AAP_COD).slice(0, 7), grille: l.GRILLE_COD,
        grille_libelle: lib.grille.get(String(l.GRILLE_COD)) ?? null, tarif: l.PU_BASE, date_modification: l.APDT_MODIF,
      });
    }
  }
  await csvTarifs.fermer();
  journal(`${nbTarifs} prix par grille`);

  const csvModif = new EcrivainCsv(join(sortie, 'ccam-modificateurs.csv'), COLONNES_MODIFICATEURS);
  for (const m of await table(dossierDbf, 'R_TB11')) {
    await csvModif.ecrire({
      code: m.COD_MODIFI, libelle: m.LIBELLE, coefficient: m.COEF, forfait: m.FORFAIT, grille: m.GRILLE_COD,
      grille_libelle: lib.grille.get(String(m.GRILLE_COD)) ?? null, date_debut: m.DT_DEBUT, date_fin: m.DT_FIN,
    });
  }
  await csvModif.fermer();

  let nbActModif = 0;
  const cheminAm = cheminTable(dossierDbf, 'R_ACTIVITE_MODIFICATEUR');
  const csvAm = new EcrivainCsv(join(sortie, 'ccam-activites-modificateurs.csv'), COLONNES_ACTIVITES_MODIFICATEURS);
  if (cheminAm) {
    for await (const l of lireDbf(cheminAm)) {
      nbActModif++;
      await csvAm.ecrire({ code_activite: l.AA_CODE, code_acte: String(l.AA_CODE).slice(0, 7), modificateur: l.MODIFI_COD, date_modification: l.AADT_MODIF });
    }
  }
  await csvAm.fermer();

  const csvChap = new EcrivainCsv(join(sortie, 'ccam-chapitres.csv'), COLONNES_CHAPITRES);
  for (const c of [...arbre.values()].filter((x) => x.numero !== null).sort((x, y) => x.numero.localeCompare(y.numero))) await csvChap.ecrire(c);
  await csvChap.fermer();

  let nbNotes = 0;
  const cheminNotes = cheminTable(dossierDbf, 'R_NOTE_ACTE');
  const csvNotes = new EcrivainCsv(join(sortie, 'ccam-notes.csv'), COLONNES_NOTES);
  if (cheminNotes) {
    for await (const l of lireDbf(cheminNotes, { champsBruts: (n) => n.startsWith('TEXTE_NOT') })) {
      nbNotes++;
      await csvNotes.ecrire({
        code_acte: l.ACTE_COD, ordre: l.ORDRE_NOTE, type_note: l.TYPNOT_COD, type_note_libelle: lib.typeNote.get(String(l.TYPNOT_COD)) ?? null,
        texte: concatener(l, 'TEXTE_NOT'), renvoi: l.RENVOI_COD, date_modification: l.ACDT_MODIF,
      });
    }
  }
  await csvNotes.fermer();

  const tablesBrutes = [];
  if (brut) {
    const dossierBrut = join(sortie, 'brut');
    for (const f of readdirSync(dossierDbf).filter((x) => /\.dbf$/i.test(x))) {
      const r = await convertirTableDbf(join(dossierDbf, f), dossierBrut, { journal });
      tablesBrutes.push(r);
    }
  }

  const resume = {
    source: dossierDbf, version, dateReference, converti: new Date().toISOString(), dureeSecondes: Math.round((Date.now() - debut) / 100) / 10,
    actes: actes.size, versionsActes, activites: activites.size, phases: phases.size, tarifsGrilles: nbTarifs,
    activitesModificateurs: nbActModif, chapitres: arbre.size, notes: nbNotes, tablesBrutes,
    fichiers: ['ccam-actes.csv', 'ccam-activites.csv', 'ccam-phases.csv', 'ccam-tarifs-grilles.csv', 'ccam-modificateurs.csv',
      'ccam-activites-modificateurs.csv', 'ccam-chapitres.csv', 'ccam-notes.csv'],
  };
  writeFileSync(join(sortie, 'ccam-resume.json'), JSON.stringify(resume, null, 2) + '\n');
  return resume;
}

/**
 * Convertit une table DBF quelconque en CSV (colonnes du fichier, en minuscules).
 * Sert aux tables CCAM brutes, à la NABM, à la LPP, aux UCD et à tout DBF local.
 */
export async function convertirTableDbf(chemin, dossierSortie, { encodage = 'cp850', journal = () => {} } = {}) {
  mkdirSync(dossierSortie, { recursive: true });
  const entete = lireEnteteDbf(chemin);
  const colonnes = entete.champs.map((c) => c.nom.toLowerCase());
  const nom = basename(chemin).replace(/\.dbf$/i, '').toLowerCase();
  const csv = new EcrivainCsv(join(dossierSortie, `${nom}.csv`), colonnes);
  let n = 0;
  for await (const l of lireDbf(chemin, { encodage })) {
    n++;
    await csv.ecrire(entete.champs.map((c) => l[c.nom]));
  }
  await csv.fermer();
  journal(`${nom} : ${n} lignes`);
  return { table: nom, fichier: `${nom}.csv`, lignes: n, colonnes };
}

/** Téléchargement, extraction et conversion en une étape. */
export async function exporterCcam({ sortie = 'data/ccam', cache = '.cache', forcer = false, brut = false, dateReference = null, dossierDbf, archives, journal = () => {} }) {
  let dossier = dossierDbf;
  let version = null;
  if (!dossier) ({ dossier, version } = await preparerDbf({ cache, forcer, journal, archives }));
  return convertirDbf({ dossierDbf: dossier, sortie, version, brut, dateReference, journal });
}
