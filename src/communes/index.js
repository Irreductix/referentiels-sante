/**
 * Code officiel géographique de l'INSEE (Licence Ouverte 2.0) : la liste des communes,
 * arrondissements municipaux, communes déléguées et associées au 1er janvier, et celle des
 * communes des collectivités d'outre-mer. Les deux fichiers sont publiés sur insee.fr et
 * référencés sur data.gouv.fr, un millésime par an.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { telecharger, AGENT_UTILISATEUR } from '../commun/telecharger.js';
import { EcrivainCsv } from '../commun/csv.js';

export const JEU = '58c984b088ee386cdb1261f3';

/** Adresses connues, utilisées si l'API de data.gouv.fr ne répond pas. */
export const REPLIS = {
  2026: {
    communes: 'https://www.insee.fr/fr/statistiques/fichier/8740222/v_commune_2026.csv',
    outremer: 'https://www.insee.fr/fr/statistiques/fichier/8740222/v_commune_comer_2026.csv',
  },
};

export const COLONNES = ['code_commune', 'type', 'libelle', 'libelle_majuscules', 'article', 'departement', 'region',
  'arrondissement', 'canton', 'commune_parente', 'territoire'];

export const TYPES = { COM: 'commune', ARM: 'arrondissement municipal', COMD: 'commune déléguée', COMA: 'commune associée' };

/**
 * Cherche sur data.gouv.fr les deux fichiers du millésime demandé.
 * @returns {Promise<{ annee: number, communes: string, outremer: string, dateModification: string|null }>}
 */
export async function trouverRessources(annee) {
  const reponse = await fetch(`https://www.data.gouv.fr/api/1/datasets/${JEU}/`, { headers: { 'user-agent': AGENT_UTILISATEUR } });
  if (!reponse.ok) throw new Error(`API data.gouv.fr indisponible (${reponse.status})`);
  const jeu = await reponse.json();
  const ressources = jeu.resources ?? [];
  const chercher = (motif) => ressources.find((r) => motif.test(r.title ?? ''));
  const communes = chercher(new RegExp(`^Millésime ${annee} : Liste des communes, arrondissements municipaux`, 'i'));
  const outremer = chercher(new RegExp(`^Millésime ${annee} : Liste des communes des collectivités et territoires`, 'i'));
  if (!communes || !outremer) throw new Error(`millésime ${annee} introuvable sur data.gouv.fr`);
  return { annee, communes: communes.url, outremer: outremer.url, dateModification: communes.last_modified ?? null };
}

/** Les fichiers de l'INSEE citent chaque champ entre guillemets, séparés par des virgules. */
export function lireCsvInsee(texte) {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const champs = (l) => {
    const r = [];
    const re = /"((?:[^"]|"")*)"|([^,]*)/g;
    let m;
    let i = 0;
    while (i < l.length && (m = re.exec(l))) {
      r.push(m[1] !== undefined ? m[1].replace(/""/g, '"') : m[2]);
      i = re.lastIndex;
      if (l[i] === ',') { i += 1; re.lastIndex = i; } else break;
    }
    return r;
  };
  const entete = champs(lignes.shift() ?? '');
  return lignes.map((l) => {
    const v = champs(l);
    return Object.fromEntries(entete.map((c, i) => [c, v[i] ?? '']));
  });
}

export function convertirCommunes(texteCommunes, texteOutremer) {
  const lignes = lireCsvInsee(texteCommunes).map((l) => ({
    code_commune: l.COM, type: l.TYPECOM, libelle: l.LIBELLE, libelle_majuscules: l.NCC, article: l.TNCC,
    departement: l.DEP, region: l.REG, arrondissement: l.ARR, canton: l.CAN, commune_parente: l.COMPARENT, territoire: '',
  }));
  const outremer = texteOutremer ? lireCsvInsee(texteOutremer).map((l) => ({
    code_commune: l.COM_COMER, type: 'COM', libelle: l.LIBELLE, libelle_majuscules: l.NCC, article: l.TNCC,
    departement: l.COMER, region: '', arrondissement: '', canton: '', commune_parente: '', territoire: l.LIBELLE_COMER,
  })) : [];
  return [...lignes, ...outremer].filter((c) => c.code_commune);
}

/**
 * Télécharge le millésime demandé (ou le précédent s'il n'est pas encore publié) et écrit
 * communes.csv et communes-resume.json dans `sortie`. Renvoie le résumé.
 */
export async function exporterCommunes({ annee, sortie = 'data/communes', cache = '.cache', forcer = false, journal = () => {}, urls = null } = {}) {
  const demandee = annee ?? new Date().getUTCFullYear();
  let ressources = urls ? { annee: demandee, ...urls } : null;
  if (!ressources) {
    for (const candidate of [demandee, demandee - 1]) {
      try {
        ressources = await trouverRessources(candidate);
        if (candidate !== demandee) journal(`millésime ${demandee} pas encore publié : millésime ${candidate} utilisé`);
        break;
      } catch (erreur) {
        if (REPLIS[candidate]) {
          journal(`API data.gouv.fr (${erreur.message}) : adresses de repli du millésime ${candidate}`);
          ressources = { annee: candidate, ...REPLIS[candidate] };
          break;
        }
        journal(`millésime ${candidate} : ${erreur.message}`);
      }
    }
  }
  if (!ressources) throw new Error(`aucun millésime du code officiel géographique trouvé pour ${demandee}`);
  mkdirSync(sortie, { recursive: true });
  const textes = {};
  for (const cle of ['communes', 'outremer']) {
    const url = ressources[cle];
    const chemin = join(cache, 'communes', url.split('/').pop());
    await telecharger(url, chemin, { forcer, journal });
    textes[cle] = readFileSync(chemin, 'utf8');
  }
  const lignes = convertirCommunes(textes.communes, textes.outremer);
  const csv = new EcrivainCsv(join(sortie, 'communes.csv'), COLONNES);
  for (const l of lignes) await csv.ecrire(l);
  await csv.fermer();
  const compte = (type) => lignes.filter((l) => l.type === type && !l.territoire).length;
  const resume = {
    source: { communes: ressources.communes, outremer: ressources.outremer }, producteur: 'INSEE', licence: 'Licence Ouverte 2.0',
    annee: ressources.annee, dateModification: ressources.dateModification ?? null, converti: new Date().toISOString(),
    communes: compte('COM'), arrondissements: compte('ARM'), deleguees: compte('COMD') + compte('COMA'),
    outremer: lignes.filter((l) => l.territoire).length, lignes: lignes.length, fichiers: ['communes.csv'],
  };
  writeFileSync(join(sortie, 'communes-resume.json'), JSON.stringify(resume, null, 2) + '\n');
  return resume;
}
