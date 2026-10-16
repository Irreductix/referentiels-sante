/**
 * Vérification des sources sans téléchargement lourd : chaque page est lue,
 * chaque fichier attendu fait l'objet d'une requête d'en-tête. Le but est de
 * détecter tôt qu'une page a changé de forme, qu'une adresse a disparu ou
 * qu'une version de repli est dépassée, avant qu'un utilisateur ne tombe
 * dessus. Conçu pour tourner chaque semaine en intégration continue.
 */

import { AGENT_UTILISATEUR, recupererPage } from '../commun/telecharger.js';
import { JEUX, URL_STABLES, trouverRessource } from '../finess/sources.js';
import { TABLES, urlTable } from '../nos/index.js';
import { ARCHIVES, trouverArchive } from '../ghs/index.js';
import { trouverArchives, ARCHIVES_CONNUES } from '../ccam/index.js';
import { EDITIONS } from '../cim10/index.js';
import { FICHIERS, BASE as BASE_BDPM, PAGE as PAGE_BDPM, lireDatesMiseAJour } from '../bdpm/index.js';
import { SOURCES, VERSIONS_CONNUES, trouverFichiers } from '../cnam/index.js';
import { trouverRessources as trouverCommunes, REPLIS as REPLIS_COMMUNES } from '../communes/index.js';

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
export const estDonnee = (s) => s.ok && !(s.type ?? '').includes('text/html');

async function sonderTout(urls) {
  const sondes = [];
  for (const url of urls) sondes.push(await sonder(url));
  return sondes;
}

// Un repli en retard qui se télécharge encore n'est pas une panne : avertissement, et la CI propose la mise à jour.
export function controleRepli(source, controle, page, repli, sondes = []) {
  if (page === repli) return resultat(source, controle, true, `page : ${page}, repli : ${repli}`);
  const ko = sondes.filter((s) => !estDonnee(s) && s.statut !== 403);
  if (!ko.length) return resultat(source, controle, true, `page : ${page}, repli : ${repli}, encore téléchargeable`, true);
  return resultat(source, controle, false, `page : ${page}, repli : ${repli}, repli injoignable (${ko.map((s) => s.statut ?? s.erreur).join(', ')})`);
}

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
      const nom = (url) => decodeURIComponent(String(url).split('/').pop());
      r.push(controleRepli('ghs', `campagne ${annee} : adresse de repli à jour`, nom(trouve.url), nom(connue), await sonderTout([connue])));
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
    const sondes = trouve.version === ARCHIVES_CONNUES.version ? [] : await sonderTout(ARCHIVES_CONNUES.archives);
    r.push(controleRepli('ccam', 'version de repli à jour', trouve.version, ARCHIVES_CONNUES.version, sondes));
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

export async function verifierBdpm({ lirePage = recupererPage } = {}) {
  const r = [];
  // La date de mise à jour lue sur la page entre dans la mention de source des fichiers publiés.
  try {
    const page = await lirePage(PAGE_BDPM);
    if (page.statut === 403) {
      r.push(resultat('bdpm', 'page de téléchargement', true, "403 : page refusée depuis cette adresse, non vérifiable d'ici", true));
    } else {
      const { base } = lireDatesMiseAJour(page.texte);
      r.push(resultat('bdpm', 'page de téléchargement : date de mise à jour', Boolean(base),
        base ? `base mise à jour le ${base}` : `date « Dernière mise à jour le » introuvable (${page.statut})`));
    }
  } catch (e) {
    r.push(resultat('bdpm', 'page de téléchargement', false, e.message));
  }
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
        const connue = VERSIONS_CONNUES[nom];
        const sondes = connue?.version === version ? [] : await sonderTout((connue?.fichiers ?? []).map((f) => f.url));
        r.push(controleRepli(nom, 'version de repli à jour', version, connue?.version, connue ? sondes : [{ statut: 'aucun repli' }]));
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

export async function verifierCommunes() {
  const r = [];
  const annee = new Date().getUTCFullYear();
  let ressources = null;
  for (const candidate of [annee, annee - 1]) {
    try {
      ressources = await trouverCommunes(candidate);
      r.push(resultat('communes', `millésime ${candidate} : API data.gouv.fr`, true, ressources.dateModification ?? 'date inconnue', candidate !== annee));
      break;
    } catch (e) {
      r.push(resultat('communes', `millésime ${candidate} : API data.gouv.fr`, candidate === annee, e.message, candidate === annee));
    }
  }
  const adresses = ressources ?? REPLIS_COMMUNES[Math.max(...Object.keys(REPLIS_COMMUNES).map(Number))];
  for (const cle of ['communes', 'outremer']) {
    const s = await sonder(adresses[cle]);
    r.push(controleFichier('communes', `${cle} : ${adresses[cle].split('/').pop()}`, s));
  }
  return r;
}

/**
 * Lance toutes les vérifications (ou celles demandées) et renvoie
 * { resultats, echecs, ok }.
 */
export async function verifierTout({ sources, journal = () => {} } = {}) {
  const tout = { finess: verifierFiness, nos: verifierNos, ghs: verifierGhs, ccam: verifierCcam, cim10: verifierCim10, bdpm: verifierBdpm, cnam: verifierCnam, communes: verifierCommunes };
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
