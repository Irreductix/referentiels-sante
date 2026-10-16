/**
 * Base de données publique des médicaments (ANSM, HAS, UNCAM), publiée en
 * Licence Ouverte. Fichiers texte tabulés, sans en-tête, en ISO-8859-1, dates
 * à la française : on les réécrit avec un en-tête, en UTF-8, dates ISO et
 * nombres normalisés.
 *
 * Description officielle des colonnes : document « Contenu et format des
 * fichiers téléchargeables dans la BDM » sur le site de la base.
 */

import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { recupererPage, telecharger } from '../commun/telecharger.js';
import { EcrivainCsv } from '../commun/csv.js';
import { dateIso, nombreFr, texte } from '../commun/dates.js';

export const BASE = 'https://base-donnees-publique.medicaments.gouv.fr';
export const PAGE = `${BASE}/telechargement`;

/**
 * Fichiers et colonnes. `types` indique les colonnes à convertir :
 * d = date, n = nombre ; les autres restent du texte.
 */
export const FICHIERS = {
  specialites: {
    fichier: 'CIS_bdpm.txt',
    colonnes: ['cis', 'denomination', 'forme_pharmaceutique', 'voies_administration', 'statut_amm', 'type_procedure_amm',
      'etat_commercialisation', 'date_amm', 'statut_bdm', 'numero_autorisation_europeenne', 'titulaires', 'surveillance_renforcee'],
    types: { date_amm: 'd' },
  },
  presentations: {
    fichier: 'CIS_CIP_bdpm.txt',
    colonnes: ['cis', 'cip7', 'libelle_presentation', 'statut_administratif', 'etat_commercialisation', 'date_declaration_commercialisation',
      'cip13', 'agrement_collectivites', 'taux_remboursement', 'prix_medicament', 'prix_public', 'honoraires_dispensation', 'indications_remboursement'],
    types: { date_declaration_commercialisation: 'd', prix_medicament: 'n', prix_public: 'n', honoraires_dispensation: 'n' },
  },
  compositions: {
    fichier: 'CIS_COMPO_bdpm.txt',
    colonnes: ['cis', 'designation_element', 'code_substance', 'denomination_substance', 'dosage', 'reference_dosage', 'nature_composant', 'numero_liaison'],
    types: {},
  },
  avisSmr: {
    fichier: 'CIS_HAS_SMR_bdpm.txt',
    colonnes: ['cis', 'code_dossier_has', 'motif_evaluation', 'date_avis', 'valeur_smr', 'libelle_smr'],
    types: { date_avis: 'd' },
  },
  avisAsmr: {
    fichier: 'CIS_HAS_ASMR_bdpm.txt',
    colonnes: ['cis', 'code_dossier_has', 'motif_evaluation', 'date_avis', 'valeur_asmr', 'libelle_asmr'],
    types: { date_avis: 'd' },
  },
  liensAvisCt: {
    fichier: 'HAS_LiensPageCT_bdpm.txt',
    colonnes: ['code_dossier_has', 'lien_avis_ct'],
    types: {},
  },
  generiques: {
    fichier: 'CIS_GENER_bdpm.txt',
    colonnes: ['identifiant_groupe', 'libelle_groupe', 'cis', 'type_generique', 'numero_tri'],
    types: { type_generique: 'n', numero_tri: 'n' },
  },
  conditionsPrescription: {
    fichier: 'CIS_CPD_bdpm.txt',
    colonnes: ['cis', 'condition_prescription_delivrance'],
    types: {},
  },
  informationsImportantes: {
    fichier: 'CIS_InfoImportantes.txt',
    url: `${BASE}/download/CIS_InfoImportantes.txt`,
    colonnes: ['cis', 'date_debut', 'date_fin', 'texte_et_lien'],
    types: { date_debut: 'd', date_fin: 'd' },
  },
  disponibilite: {
    fichier: 'CIS_CIP_Dispo_Spec.txt',
    colonnes: ['cis', 'cip13', 'code_statut', 'libelle_statut', 'date_debut', 'date_maj', 'lien_ansm'],
    types: { date_debut: 'd', date_maj: 'd' },
  },
};

/**
 * Les fichiers de la base ne sont pas tous dans le même encodage : certains
 * sont en ISO-8859-1, d'autres en UTF-8. On tente l'UTF-8 strict, sinon latin1.
 */
export function decoderTexte(tampon) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(tampon);
  } catch {
    return tampon.toString('latin1');
  }
}

export const TYPES_GENERIQUE = { 0: 'princeps', 1: 'générique', 2: 'générique par complémentarité posologique', 4: 'générique substituable' };

/**
 * Convertit le contenu texte d'un fichier BDPM en objets.
 * Une ligne qui a plus de colonnes que prévu garde ses colonnes supplémentaires
 * dans `colonne_N`, une ligne qui en a moins est complétée par des vides.
 */
export function convertirTexte(contenu, definition) {
  const lignes = contenu.split(/\r?\n/).filter((l) => l.trim() !== '');
  return lignes.map((l) => {
    const valeurs = l.split('\t');
    const objet = {};
    definition.colonnes.forEach((c, i) => {
      const brut = texte(valeurs[i]);
      const type = definition.types[c];
      objet[c] = type === 'd' ? dateIso(brut) : type === 'n' ? nombreFr(brut) : brut;
    });
    for (let i = definition.colonnes.length; i < valeurs.length; i++) {
      if (texte(valeurs[i]) !== null) objet[`colonne_${i + 1}`] = texte(valeurs[i]);
    }
    return objet;
  });
}

/**
 * Compare, colonne typée par colonne typée, le nombre de valeurs présentes dans la
 * source et dans la conversion : une valeur lue mais non convertie est une perte.
 * Renvoie les colonnes qui perdent des valeurs.
 */
export function controlerConservation(contenu, definition, lignes) {
  const brutes = contenu.split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => l.split('\t'));
  const pertes = [];
  for (const [colonne, type] of Object.entries(definition.types)) {
    if (type !== 'd' && type !== 'n') continue;
    const i = definition.colonnes.indexOf(colonne);
    const source = brutes.filter((v) => texte(v[i]) !== null).length;
    const converti = lignes.filter((l) => l[colonne] !== null && l[colonne] !== undefined).length;
    if (converti < source) pertes.push({ colonne, source, converti });
  }
  return pertes;
}

/** Au-delà d'une valeur sur deux cents perdue dans une colonne, la conversion est refusée. */
export const SEUIL_PERTE = 0.005;

/**
 * Lit sur la page de téléchargement la date de mise à jour de la base et celle
 * de chaque fichier, que la Licence Ouverte demande de citer. Date absente : null.
 */
export function lireDatesMiseAJour(html) {
  const plat = String(html ?? '').replace(/\s+/g, ' ');
  const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const base = plat.match(/Derni[eè]re mise [àa] jour le (\d{2}\/\d{2}\/\d{4})/i);
  const fichiers = {};
  for (const [cle, definition] of Object.entries(FICHIERS)) {
    const lien = plat.match(new RegExp(`href="[^"]*${echapper(definition.fichier)}"[^>]*>(.*?)</a>`, 'i'));
    const date = lien?.[1].match(/Date de mise [àa] jour : (\d{2}\/\d{2}\/\d{4})/i);
    fichiers[cle] = date ? dateIso(date[1]) : null;
  }
  return { base: base ? dateIso(base[1]) : null, fichiers };
}

/**
 * Télécharge tous les fichiers (ou ceux demandés) et écrit un CSV par fichier
 * plus un résumé. Renvoie le résumé.
 */
export async function exporterBdpm({ fichiers, sortie = 'data/bdpm', cache = '.cache', forcer = false, journal = () => {}, lirePage = recupererPage }) {
  const cles = fichiers?.length ? fichiers : Object.keys(FICHIERS);
  for (const cle of cles) {
    if (!FICHIERS[cle]) throw new Error(`fichier BDPM inconnu : ${cle} (choix : ${Object.keys(FICHIERS).join(', ')})`);
  }
  mkdirSync(sortie, { recursive: true });
  const resume = {
    source: PAGE, producteurs: 'ANSM, HAS, UNCAM', licence: 'Licence Ouverte (ANSM, HAS, UNCAM)',
    miseAJour: null, converti: new Date().toISOString(), fichiers: {},
  };
  let dates = { base: null, fichiers: {} };
  try {
    const page = await lirePage(PAGE);
    if (page.ok) dates = lireDatesMiseAJour(page.texte);
  } catch (erreur) {
    journal(`page de téléchargement illisible (${erreur.message}) : dates de mise à jour inconnues`);
  }
  resume.miseAJour = dates.base;
  let cacheUtilise = false;

  for (const cle of cles) {
    const definition = FICHIERS[cle];
    const url = definition.url ?? `${BASE}/download/file/${definition.fichier}`;
    const chemin = join(cache, 'bdpm', definition.fichier);
    const { telecharge } = await telecharger(url, chemin, { forcer, journal });
    // Un fichier du cache peut dater d'avant la page lue : sa date est inconnue.
    if (!telecharge) {
      cacheUtilise = true;
      journal(`${definition.fichier} pris dans le cache : date de mise à jour inconnue (--forcer pour la connaître)`);
    }
    const brut = decoderTexte(readFileSync(chemin));
    const lignes = convertirTexte(brut, definition);
    const pertes = controlerConservation(brut, definition, lignes);
    for (const p of pertes) journal(`${cle} : ${p.source - p.converti} valeur(s) de ${p.colonne} lue(s) dans la source mais non converties`);
    const grave = pertes.find((p) => p.source - p.converti > p.source * SEUIL_PERTE);
    if (grave) throw new Error(`${cle} : ${grave.source - grave.converti} valeurs de ${grave.colonne} sur ${grave.source} perdues à la conversion, fichier refusé`);
    const nomCsv = `bdpm-${cle.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}.csv`;
    const colonnes = [...definition.colonnes];
    for (const l of lignes) for (const k of Object.keys(l)) if (!colonnes.includes(k)) colonnes.push(k);
    const csv = new EcrivainCsv(join(sortie, nomCsv), colonnes);
    for (const l of lignes) await csv.ecrire(l);
    await csv.fermer();
    resume.fichiers[cle] = { source: definition.fichier, fichier: nomCsv, lignes: lignes.length, miseAJour: telecharge ? (dates.fichiers[cle] ?? null) : null, pertes };
    journal(`${cle} : ${lignes.length} lignes`);
  }
  if (cacheUtilise) resume.miseAJour = null;
  writeFileSync(join(sortie, 'bdpm-resume.json'), JSON.stringify(resume, null, 2) + '\n');
  return resume;
}
