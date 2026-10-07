/**
 * Vérification des sources sans téléchargement lourd : chaque page est lue,
 * chaque fichier attendu fait l'objet d'une requête d'en-tête. Le but est de
 * détecter tôt qu'une page a changé de forme, qu'une adresse a disparu ou
 * qu'une version de repli est dépassée, avant qu'un utilisateur ne tombe
 * dessus. Conçu pour tourner chaque semaine en intégration continue.
 */

import { AGENT_UTILISATEUR } from '../commun/telecharger.js';
import { JEUX, URL_STABLES, trouverRessource } from '../finess/sources.js';
import { TABLES, urlTable } from '../nos/index.js';
import { ARCHIVES, trouverArchive } from '../ghs/index.js';
import { trouverArchives, ARCHIVES_CONNUES } from '../ccam/index.js';
import { EDITIONS } from '../cim10/index.js';
import { FICHIERS, BASE as BASE_BDPM } from '../bdpm/index.js';
import { SOURCES, VERSIONS_CONNUES, trouverFichiers } from '../cnam/index.js';

/** Requête d'en-tête (repli sur GET sans lire le corps si HEAD est refusé). */
export async function sonder(url, { delai = 20000 } = {}) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delai);
  try {
    let reponse = await fetch(url, { method: 'HEAD', headers: { 'user-agent': AGENT_UTILISATEUR }, redirect: 'follow', signal: controleur.signal });
    if (reponse.status === 405 || reponse.status === 403) {
      reponse = await fetch(url, { method: 'GET', headers: { 'user-agent': AGENT_UTILISATEUR, range: 'bytes=0-0' }, redirect: 'follow', signal: controleur.signal });
      await reponse.body?.cancel();
    }
    const taille = Number(reponse.headers.get('content-length')) || null;
    const type = reponse.headers.get('content-type') ?? null;
    return { url, statut: reponse.status, ok: reponse.ok, taille, type };
  } catch (erreur) {
    return { url, statut: null, ok: false, taille: null, type: null, erreur: erreur.message };
  } finally {
    clearTimeout(minuteur);
  }
}

const resultat = (source, controle, ok, detail = '', avertissement = false) => ({ source, controle, ok, detail, avertissement });

/** Un fichier de données ne doit pas être une page HTML. */
const estDonnee = (s) => s.ok && !(s.type ?? '').includes('text/html');

/**
 * Un 403 dit seulement que cette adresse est refusée, pas que le fichier a disparu :
 * ameli refuse les serveurs d'intégration continue et sert les mêmes fichiers à un
 * poste en France. On le signale sans le compter en échec, sinon la CCAM crierait
 * chaque lundi et plus personne ne lirait le ticket.
 */
export function controleFichier(source, controle, s) {
  if (s.statut === 403) return resultat(source, controle, true, "403 : refusé depuis cette adresse, non vérifiable d'ici", true);
  return resultat(source, controle, estDonnee(s), `${s.statut ?? s.erreur}`);
}

/** Même règle pour une page lue par un module : repli sur 403, avertissement ; page servie en erreur mais complète, avertissement. */
function controlePage(source, controle, trouve, detail) {
  if (trouve.repli) {
    if (trouve.statut === 403) return resultat(source, controle, true, "403 : page refusée depuis cette adresse, repli sur l'adresse connue", true);
    return resultat(source, controle, false, detail);
  }
  if (trouve.statut && trouve.statut >= 500) return resultat(source, controle, true, `page servie avec le code ${trouve.statut} mais complète ; ${detail}`, true);
  return resultat(source, controle, true, detail);
}

export async function verifierFiness() {
  const r = [];
  for (const type of Object.keys(JEUX)) {
    try {
      const ressource = await trouverRessource(type);
      const s = await sonder(ressource.url);
      r.push(resultat('finess', `${type} : ressource quotidienne`, estDonnee(s), `${ressource.titre}, ${s.statut}, ${s.taille ? Math.round(s.taille / 1e6) + ' Mo' : 'taille inconnue'}`));
    } catch (e) {
      r.push(resultat('finess', `${type} : API data.gouv.fr`, false, e.message));
    }
    const s = await sonder(URL_STABLES[type]);
    r.push(controleFichier('finess', `${type} : URL stable de repli`, s));
  }
  return r;
}

export async function verifierNos() {
  const r = [];
  for (const nom of Object.values(TABLES)) {
    const s = await sonder(urlTable(nom));
    r.push(controleFichier('nos', nom, s));
  }
  return r;
}

export async function verifierGhs() {
  const r = [];
  for (const [annee, connue] of Object.entries(ARCHIVES)) {
    const journal = [];
    const trouve = await trouverArchive(annee, { journal: (m) => journal.push(m) });
    r.push(controlePage('ghs', `campagne ${annee} : page ATIH`, trouve, journal.join(' ; ')));
    if (!trouve.repli && trouve.url !== connue) {
      r.push(resultat('ghs', `campagne ${annee} : adresse de repli à jour`, false, `page : ${trouve.url}, repli : ${connue}`));
    }
    const s = await sonder(trouve.url);
    r.push(controleFichier('ghs', `campagne ${annee} : ${decodeURIComponent(trouve.url.split('/').pop())}`, s));
  }
  return r;
}

export async function verifierCcam() {
  const r = [];
  const journal = [];
  const trouve = await trouverArchives({ journal: (m) => journal.push(m) });
  r.push(controlePage('ccam', 'page ameli', trouve, journal.join(' ; ')));
  if (!trouve.repli) {
    const aJour = trouve.version === ARCHIVES_CONNUES.version;
    r.push(resultat('ccam', 'version de repli à jour', aJour, aJour ? trouve.version : `page : ${trouve.version}, repli : ${ARCHIVES_CONNUES.version}`));
  }
  for (const url of trouve.archives) {
    const s = await sonder(url);
    r.push(controleFichier('ccam', url.split('/').pop(), s));
  }
  return r;
}

export async function verifierCim10() {
  const r = [];
  for (const [edition, url] of Object.entries(EDITIONS)) {
    const s = await sonder(url);
    r.push(controleFichier('cim10', `édition ${edition}`, s));
  }
  return r;
}

export async function verifierBdpm() {
  const r = [];
  for (const [cle, d] of Object.entries(FICHIERS)) {
    const s = await sonder(d.url ?? `${BASE_BDPM}/download/file/${d.fichier}`);
    r.push(controleFichier('bdpm', cle, s));
  }
  return r;
}

export async function verifierCnam() {
  const r = [];
  for (const nom of Object.keys(SOURCES)) {
    try {
      const journal = [];
      const trouve = await trouverFichiers(nom, { journal: (m) => journal.push(m) });
      const { version, fichiers } = trouve;
      r.push(controlePage(nom, 'page de téléchargement', trouve, trouve.repli ? journal.join(' ; ') : `version ${version}, ${fichiers.length} fichier(s)`));
      if (!trouve.repli) {
        const connue = VERSIONS_CONNUES[nom]?.version;
        r.push(resultat(nom, 'version de repli à jour', connue === version, `page : ${version}, repli : ${connue}`));
      }
      for (const f of fichiers) {
        const s = await sonder(f.url);
        r.push(controleFichier(nom, f.nom, s));
      }
    } catch (e) {
      r.push(resultat(nom, 'page de téléchargement', false, e.message));
    }
  }
  return r;
}

/**
 * Lance toutes les vérifications (ou celles demandées) et renvoie
 * { resultats, echecs, ok }.
 */
export async function verifierTout({ sources, journal = () => {} } = {}) {
  const tout = { finess: verifierFiness, nos: verifierNos, ghs: verifierGhs, ccam: verifierCcam, cim10: verifierCim10, bdpm: verifierBdpm, cnam: verifierCnam };
  const cles = sources?.length ? sources : Object.keys(tout);
  const resultats = [];
  for (const cle of cles) {
    if (!tout[cle]) throw new Error(`source inconnue : ${cle} (choix : ${Object.keys(tout).join(', ')})`);
    journal(`vérification : ${cle}`);
    resultats.push(...(await tout[cle]()));
  }
  const echecs = resultats.filter((x) => !x.ok);
  const avertissements = resultats.filter((x) => x.ok && x.avertissement);
  return { resultats, echecs, avertissements, ok: echecs.length === 0, date: new Date().toISOString() };
}

/** Rapport texte, une ligne par contrôle. */
export function formaterRapport({ resultats, echecs, avertissements = [], date }) {
  const etat = (x) => (!x.ok ? 'ECHEC ' : x.avertissement ? 'AVERT ' : 'OK    ');
  const lignes = resultats.map((x) => `${etat(x)} ${x.source.padEnd(7)} ${x.controle}${x.detail ? ` (${x.detail})` : ''}`);
  const bilan = `${resultats.length} contrôles, ${echecs.length} échec(s)${avertissements.length ? `, ${avertissements.length} avertissement(s)` : ''}, ${date}`;
  lignes.push('', bilan);
  return lignes.join('\n');
}
