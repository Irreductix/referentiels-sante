/**
 * Conversion des flux FINESS+ (JSON volumineux) en fichiers tabulaires.
 * Lecture en flux, écriture en flux : la mémoire reste stable quel que soit
 * le volume (le flux structures complet fait 750 Mo décompressés).
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { lireElements } from '../commun/json-flux.js';
import { EcrivainCsv, EcrivainJsonl } from '../commun/csv.js';
import {
  COLONNES_ENTITE_JURIDIQUE, COLONNES_ETABLISSEMENT, COLONNES_HISTORIQUE,
  COLONNES_GCC, COLONNES_GCO, COLONNES_MEMBRES,
  ligneEntiteJuridique, lignesEtablissements, ligneHistorique, lignesGcc, lignesGco, rattacherGht,
} from './aplatir.js';
import { COLONNES_ACTIVITE, lignesActivites } from './activites.js';
import { libellesVides } from './libelles.js';

/**
 * @param {object} options
 * @param {string} options.entree chemin du flux structures (.json ou .json.gz)
 * @param {string} options.sortie dossier de sortie
 * @param {object} [options.libelles] résultat de chargerLibelles(), sinon codes seuls
 * @param {boolean} [options.jsonl] écrire aussi des fichiers JSON Lines (défaut vrai)
 * @param {boolean} [options.historique] écrire le format de l'ancien flux (défaut vrai)
 * @param {(message: string) => void} [options.journal]
 */
export async function convertirStructures({ entree, sortie, libelles, jsonl = true, historique = true, journal = () => {} }) {
  const L = libelles ?? libellesVides();
  mkdirSync(sortie, { recursive: true });
  const debut = Date.now();

  const ej = new EcrivainCsv(join(sortie, 'entites-juridiques.csv'), COLONNES_ENTITE_JURIDIQUE);
  const et = new EcrivainCsv(join(sortie, 'etablissements.csv'), COLONNES_ETABLISSEMENT);
  const ejJsonl = jsonl ? new EcrivainJsonl(join(sortie, 'entites-juridiques.jsonl')) : null;
  const etJsonl = jsonl ? new EcrivainJsonl(join(sortie, 'etablissements.jsonl')) : null;
  const histo = historique
    ? new EcrivainCsv(join(sortie, 'etablissements-format-historique.csv'), COLONNES_HISTORIQUE, { bom: false, entete: false })
    : null;

  const meta = { schemaVersion: null, generatedAt: null };
  const index = { pmej: new Map(), ege: new Map() };
  const gccs = [];
  const gcos = [];
  // Les GHT (GCC) précèdent les entités juridiques dans le flux : leurs membres sont
  // connus avant d'écrire les lignes, qui portent ainsi le GHT de leur entité.
  const contexte = { ghtParPmej: new Map() };
  const stats = { entitesJuridiques: 0, etablissements: 0, etablissementsActifs: 0, gcc: 0, gco: 0, membres: 0, entitesEnGht: 0 };
  let enteteHistorique = false;
  let ghtApresEntites = false;

  for await (const e of lireElements(entree)) {
    if (e.type === 'meta') {
      if (e.cle in meta) meta[e.cle] = e.valeur;
      continue;
    }
    if (e.collection === 'pmej') {
      const ligneEj = ligneEntiteJuridique(e.objet, L, contexte);
      index.pmej.set(ligneEj.id_pmej, { finess: ligneEj.finess_ej, denomination: ligneEj.denomination });
      await ej.ecrire(ligneEj);
      if (ejJsonl) await ejJsonl.ecrire(ligneEj);
      stats.entitesJuridiques++;
      if (ligneEj.ght_id) stats.entitesEnGht++;
      for (const ligneEt of lignesEtablissements(e.objet, L, contexte)) {
        index.ege.set(ligneEt.id_ege, { finess: ligneEt.finess_et, denomination: ligneEt.nom_court });
        await et.ecrire(ligneEt);
        if (etJsonl) await etJsonl.ecrire(ligneEt);
        if (histo) {
          if (!enteteHistorique) {
            // Première ligne de l'ancien flux : « finess;etalab;<version>;<date> ».
            await histo.ecrireBrut(['finess', 'finess-plus', meta.schemaVersion ?? '', (meta.generatedAt ?? '').slice(0, 10)].join(';') + '\n');
            enteteHistorique = true;
          }
          await histo.ecrire(ligneHistorique(ligneEt, L));
        }
        stats.etablissements++;
        if (ligneEt.etat === 'A') stats.etablissementsActifs++;
      }
      if (stats.entitesJuridiques % 20000 === 0) journal(`${stats.entitesJuridiques} entités juridiques, ${stats.etablissements} établissements…`);
    } else if (e.collection === 'gcc') {
      gccs.push(e.objet);
      if (stats.entitesJuridiques > 0 && !ghtApresEntites) {
        ghtApresEntites = true;
        journal('les groupements arrivent après les entités juridiques : colonnes ght_* incomplètes, voir groupements-membres.csv');
      }
      rattacherGht(contexte, e.objet);
    } else if (e.collection === 'gco') gcos.push(e.objet);
  }

  // Les groupements référencent les entités par identifiant interne : on les
  // écrit après le parcours, une fois les index complets.
  const gcc = new EcrivainCsv(join(sortie, 'groupements-conventionnels.csv'), COLONNES_GCC);
  const gco = new EcrivainCsv(join(sortie, 'groupements-cooperation.csv'), COLONNES_GCO);
  const membres = new EcrivainCsv(join(sortie, 'groupements-membres.csv'), COLONNES_MEMBRES);
  for (const g of gccs) {
    const { groupement, membres: m } = lignesGcc(g, index);
    await gcc.ecrire(groupement);
    for (const x of m) await membres.ecrire(x);
    stats.gcc++;
    stats.membres += m.length;
  }
  for (const g of gcos) {
    const { groupement, membres: m } = lignesGco(g, index);
    await gco.ecrire(groupement);
    for (const x of m) await membres.ecrire(x);
    stats.gco++;
    stats.membres += m.length;
  }

  await Promise.all([ej.fermer(), et.fermer(), gcc.fermer(), gco.fermer(), membres.fermer(),
    ejJsonl?.fermer(), etJsonl?.fermer(), histo?.fermer()]);

  const resume = {
    source: entree,
    schemaVersion: meta.schemaVersion,
    generatedAt: meta.generatedAt,
    converti: new Date().toISOString(),
    dureeSecondes: Math.round((Date.now() - debut) / 100) / 10,
    tablesLibelles: L.tablesChargees ?? [],
    tablesLibellesEnEchec: L.tablesEnEchec ?? [],
    tablesLibellesDates: L.datesTables ?? {},
    ...stats,
    ghtApresEntites,
    fichiers: ['entites-juridiques.csv', 'etablissements.csv', 'groupements-conventionnels.csv',
      'groupements-cooperation.csv', 'groupements-membres.csv',
      ...(jsonl ? ['entites-juridiques.jsonl', 'etablissements.jsonl'] : []),
      ...(historique ? ['etablissements-format-historique.csv'] : [])],
  };
  writeFileSync(join(sortie, 'structures-resume.json'), JSON.stringify(resume, null, 2) + '\n');
  return resume;
}

/**
 * @param {object} options
 * @param {string} options.entree chemin du flux activités (.json ou .json.gz)
 * @param {string} options.sortie dossier de sortie
 * @param {object} [options.libelles]
 * @param {boolean} [options.jsonl]
 * @param {(message: string) => void} [options.journal]
 */
export async function convertirActivites({ entree, sortie, libelles, jsonl = true, journal = () => {} }) {
  const L = libelles ?? libellesVides();
  mkdirSync(sortie, { recursive: true });
  const debut = Date.now();
  const csv = new EcrivainCsv(join(sortie, 'activites.csv'), COLONNES_ACTIVITE);
  const jl = jsonl ? new EcrivainJsonl(join(sortie, 'activites.jsonl')) : null;
  const meta = { schemaVersion: null, generatedAt: null };
  const stats = { entitesJuridiques: 0, activitesAutorisees: 0, activitesExercees: 0 };

  for await (const e of lireElements(entree)) {
    if (e.type === 'meta') { if (e.cle in meta) meta[e.cle] = e.valeur; continue; }
    if (e.collection !== 'pmej') continue;
    stats.entitesJuridiques++;
    const dateFlux = meta.generatedAt ? meta.generatedAt.slice(0, 10) : null;
    for (const ligne of lignesActivites(e.objet, L, dateFlux)) {
      await csv.ecrire(ligne);
      if (jl) await jl.ecrire(ligne);
      if (ligne.niveau === 'autorisee') stats.activitesAutorisees++; else stats.activitesExercees++;
    }
    if (stats.entitesJuridiques % 20000 === 0) journal(`${stats.entitesJuridiques} entités juridiques traitées…`);
  }
  await Promise.all([csv.fermer(), jl?.fermer()]);

  const resume = {
    source: entree,
    schemaVersion: meta.schemaVersion,
    generatedAt: meta.generatedAt,
    converti: new Date().toISOString(),
    dureeSecondes: Math.round((Date.now() - debut) / 100) / 10,
    tablesLibelles: L.tablesChargees ?? [],
    tablesLibellesEnEchec: L.tablesEnEchec ?? [],
    tablesLibellesDates: L.datesTables ?? {},
    ...stats,
    fichiers: ['activites.csv', ...(jsonl ? ['activites.jsonl'] : [])],
  };
  writeFileSync(join(sortie, 'activites-resume.json'), JSON.stringify(resume, null, 2) + '\n');
  return resume;
}
