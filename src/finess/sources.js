/**
 * Localisation et téléchargement des flux FINESS+ publiés par l'Agence du
 * Numérique en Santé sur data.gouv.fr (Licence Ouverte 2.0).
 *
 * Deux jeux de données complémentaires :
 *   finess-structures-1  entités juridiques, établissements, groupements
 *   finess-activites-1   activités autorisées et exercées
 *
 * Chaque jeu contient un fichier quotidien (remplacé chaque jour), un
 * instantané mensuel et un instantané annuel, tous en JSON compressé gzip.
 */

import { join } from 'node:path';

import { telecharger, AGENT_UTILISATEUR } from '../commun/telecharger.js';

export const JEUX = {
  structures: 'finess-structures-1',
  activites: 'finess-activites-1',
};

/** URL stables « dernière version » des ressources quotidiennes, en secours. */
export const URL_STABLES = {
  structures: 'https://www.data.gouv.fr/api/1/datasets/r/cd493959-fb03-41e5-9347-0edd14dfbc22',
  activites: 'https://www.data.gouv.fr/api/1/datasets/r/ed12913c-6bb2-4e47-8434-2f6e4f961c8e',
};

export const SPECIFICATION = 'https://github.com/ansforge/finess';

/**
 * Interroge l'API data.gouv.fr pour trouver la ressource voulue.
 * @param {'structures'|'activites'} type
 * @param {{ periodicite?: 'journalier'|'mensuel'|'annuel' }} [options]
 * @returns {Promise<{ titre: string, url: string, taille: number|null, dateModification: string|null }>}
 */
export async function trouverRessource(type, { periodicite = 'journalier' } = {}) {
  const slug = JEUX[type];
  if (!slug) throw new Error(`type de flux inconnu : ${type}`);
  const reponse = await fetch(`https://www.data.gouv.fr/api/1/datasets/${slug}/`, {
    headers: { 'user-agent': AGENT_UTILISATEUR },
  });
  if (!reponse.ok) throw new Error(`API data.gouv.fr indisponible (${reponse.status})`);
  const jeu = await reponse.json();
  const prefixe = `finess-${type}-${periodicite}`;
  const candidates = (jeu.resources ?? [])
    .filter((r) => (r.title ?? '').startsWith(prefixe))
    .sort((a, b) => String(b.last_modified).localeCompare(String(a.last_modified)));
  if (!candidates.length) throw new Error(`aucune ressource « ${prefixe} » dans ${slug}`);
  const r = candidates[0];
  return { titre: r.title, url: r.url, taille: r.filesize ?? null, dateModification: r.last_modified ?? null };
}

/**
 * Télécharge le flux dans le cache et renvoie son chemin local.
 * Si l'API est injoignable, retombe sur l'URL stable de la ressource quotidienne,
 * pour le flux du jour seulement : un instantané mensuel ou annuel n'a pas de repli.
 */
export async function telechargerFlux(type, { cache = '.cache', forcer = false, periodicite = 'journalier', journal = () => {} } = {}) {
  let url = URL_STABLES[type];
  let nom = `finess-${type}-${periodicite}.json.gz`;
  try {
    const ressource = await trouverRessource(type, { periodicite });
    url = ressource.url;
    nom = ressource.titre.endsWith('.json.gz') ? ressource.titre : `${ressource.titre}.json.gz`;
    journal(`ressource : ${ressource.titre} (${ressource.dateModification ?? 'date inconnue'})`);
  } catch (erreur) {
    if (periodicite !== 'journalier') {
      throw new Error(`instantané ${periodicite} introuvable (${erreur.message}) : le flux du jour ne le remplace pas`);
    }
    journal(`API data.gouv.fr indisponible (${erreur.message}), utilisation de l'URL stable`);
  }
  const chemin = join(cache, 'finess', nom);
  await telecharger(url, chemin, { forcer, journal });
  return chemin;
}
