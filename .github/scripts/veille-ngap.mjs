// Veille de la NGAP. Chaque modification de la nomenclature passe par une décision de l'Union nationale des
// caisses d'assurance maladie (UNCAM) publiée au Journal officiel. Ce script lit les archives quotidiennes du
// Journal officiel (données ouvertes de la DILA), repère ces décisions et dit lesquelles touchent la NGAP :
// c'est le moment de redemander le document Word à l'Assurance Maladie, qui ne le met pas en ligne.
// Quand la DILA refait son archive complète, elle retire les archives quotidiennes antérieures : la période
// à couvrir se lit alors dans l'archive complète. Tout est lu en flux, sans rien garder sur le disque.
import { createReadStream, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

import { AGENT_UTILISATEUR } from '../../src/commun/telecharger.js';
import { decoderEntites } from '../../src/commun/xml.js';

export const ARCHIVES = 'https://echanges.dila.gouv.fr/OPENDATA/JORF/';
const LEGIFRANCE = 'https://www.legifrance.gouv.fr/jorf/id/';
const AMELI = 'https://www.ameli.fr/medecin/exercice-liberal/facturation-remuneration/consultations-actes/nomenclatures-codage/ngap';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Les trois nomenclatures que modifient les décisions « relatives à la liste des actes et prestations ».
const NOMENCLATURES = [
  ['NGAP', /nomenclature generale des actes professionnels|\bngap\b/],
  ['NABM', /nomenclature des actes de biologie medicale|\bnabm\b/],
  ['CCAM', /classification commune des actes medicaux|\bccam\b/],
];

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** Texte sans accents ni majuscules, apostrophes et espaces unifiés, pour comparer des intitulés. */
export function normaliser(texte) {
  return String(texte)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019\u02bc]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** « 27 octobre 2026 » depuis 2026-10-27 ou 20261027. */
export function dateEnClair(date) {
  const trouve = String(date ?? '').match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (!trouve || !MOIS[Number(trouve[2]) - 1]) return String(date ?? '');
  const jour = Number(trouve[3]);
  return `${jour === 1 ? '1er' : jour} ${MOIS[Number(trouve[2]) - 1]} ${trouve[1]}`;
}

/** Lit un flux d'octets par quantités exactes, sans jamais le charger en entier. */
function lecteur(flux) {
  const iterateur = flux[Symbol.asyncIterator]();
  let morceaux = [];
  let disponible = 0;
  async function remplir(quantite) {
    while (disponible < quantite) {
      const { value, done } = await iterateur.next();
      if (done) return false;
      if (value.length) {
        morceaux.push(value);
        disponible += value.length;
      }
    }
    return true;
  }
  return {
    /** Les octets suivants, ou null si le flux se termine avant. */
    async lire(quantite) {
      if (!quantite) return Buffer.alloc(0);
      if (!(await remplir(quantite))) return null;
      const tout = morceaux.length === 1 ? morceaux[0] : Buffer.concat(morceaux);
      morceaux = tout.length > quantite ? [tout.subarray(quantite)] : [];
      disponible = tout.length - quantite;
      return tout.subarray(0, quantite);
    },
    /** Passe des octets sans les garder. */
    async sauter(quantite) {
      let reste = quantite;
      while (reste > 0) {
        if (!disponible && !(await remplir(1))) return;
        const premier = morceaux[0];
        if (premier.length <= reste) {
          morceaux.shift();
          disponible -= premier.length;
          reste -= premier.length;
        } else {
          morceaux[0] = premier.subarray(reste);
          disponible -= reste;
          reste = 0;
        }
      }
    },
  };
}

function champ(entete, debut, longueur) {
  const fin = entete.indexOf(0, debut);
  return entete.toString('utf8', debut, fin < 0 || fin > debut + longueur ? debut + longueur : fin);
}

/**
 * Fichiers ordinaires d'une archive tar lue en flux. Seuls ceux que retient `garder(nom)` sont lus,
 * les autres sont passés.
 * @param {AsyncIterable<Buffer>} flux archive décompressée
 * @param {(nom: string) => boolean} [garder]
 * @returns {AsyncGenerator<{ nom: string, octets: Buffer }>}
 */
export async function* fichiersTar(flux, garder = () => true) {
  const source = lecteur(flux);
  let nomSuivant = '';
  for (;;) {
    const entete = await source.lire(512);
    // Une archive entière se termine par un bloc de zéros : un flux qui s'arrête avant a été coupé.
    if (!entete) throw new Error('archive tar tronquée');
    if (entete[0] === 0) return;
    const taille = parseInt(entete.toString('latin1', 124, 136).replace(/[\0 ]+$/, '') || '0', 8);
    if (!Number.isFinite(taille)) throw new Error('archive tar illisible');
    const type = entete[156];
    const place = Math.ceil(taille / 512) * 512;
    if (type === 0x4c || type === 0x78) {
      // Un nom trop long pour l'en-tête précède son fichier, dans une entrée « L » (GNU) ou « x » (pax).
      const contenu = await source.lire(place);
      if (!contenu) throw new Error('archive tar tronquée');
      const texte = contenu.toString('utf8', 0, taille);
      nomSuivant = type === 0x4c ? texte.replace(/\0+$/, '') : (texte.match(/\d+ path=([^\n]*)\n/)?.[1] ?? '');
      continue;
    }
    // Le préfixe de chemin n'existe qu'au format ustar ; le format GNU range autre chose à cet endroit.
    const ustar = entete.toString('latin1', 257, 262) === 'ustar' && entete[262] === 0;
    const prefixe = ustar ? champ(entete, 345, 155) : '';
    const nom = nomSuivant || (prefixe ? `${prefixe}/` : '') + champ(entete, 0, 100);
    nomSuivant = '';
    if ((type === 0 || type === 0x30) && garder(nom)) {
      const contenu = await source.lire(place);
      if (!contenu) throw new Error('archive tar tronquée');
      yield { nom, octets: contenu.subarray(0, taille) };
    } else {
      await source.sauter(place);
    }
  }
}

function texteXml(octets) {
  try {
    return utf8.decode(octets);
  } catch {
    return Buffer.from(octets).toString('latin1');
  }
}

const estUnArticle = (nom) => nom.includes('/article/');

/**
 * Lit une archive du Journal officiel et ajoute à `decisions` les décisions de l'UNCAM relatives à la liste des
 * actes et prestations publiées depuis une date, avec les nomenclatures que citent leurs articles et ce qu'ils
 * disent de l'entrée en vigueur. Chaque fichier d'article porte l'identifiant, la date de publication et
 * l'intitulé de son texte : une passe suffit, quel que soit l'ordre des fichiers.
 * @param {AsyncIterable<Buffer>} flux archive tar décompressée
 * @param {{ depuis?: string, decisions?: Map<string, object> }} [options] depuis : AAAAMMJJ
 */
export async function lireArchive(flux, { depuis = '', decisions = new Map() } = {}) {
  const seuil = depuis.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  for await (const { octets } of fichiersTar(flux, estUnArticle)) {
    // La date se compare sur les octets, avant tout décodage : l'archive complète compte des millions d'articles.
    const rang = octets.indexOf('date_publi="');
    if (rang < 0 || octets.toString('latin1', rang + 12, rang + 22) < seuil) continue;
    const xml = texteXml(octets);
    const contexte = xml.match(/<TEXTE\b([^>]*)>\s*<TITRE_TXT\b[^>]*>([^<]*)</);
    if (!contexte) continue;
    const titre = decoderEntites(contexte[2]).replace(/\s+/g, ' ').trim();
    const repere = normaliser(titre);
    if (!repere.includes("union nationale des caisses d'assurance maladie")) continue;
    if (!repere.includes('relative a la liste des actes et prestations')) continue;
    const attribut = (nom) => contexte[1].match(new RegExp(` ${nom}="([^"]*)"`))?.[1] ?? '';
    const id = attribut('cid');
    if (!decisions.has(id)) {
      decisions.set(id, { id, nor: attribut('nor'), publication: attribut('date_publi'), date: attribut('date_signature'), titre, nomenclatures: [], vigueur: [] });
    }
    const decision = decisions.get(id);
    const brut = decoderEntites((xml.match(/<BLOC_TEXTUEL>([\s\S]*?)<\/BLOC_TEXTUEL>/)?.[1] ?? '').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .replace(/\b1 er\b/g, '1er')
      .trim();
    const corps = normaliser(brut);
    // L'article d'entrée en vigueur est court ; les longs articles citent « en vigueur » pour autre chose.
    if (brut.length <= 900 && /entr\w* en vigueur|prend\w* effet/.test(corps) && !decision.vigueur.includes(brut)) decision.vigueur.push(brut);
    for (const [nom, motif] of NOMENCLATURES) {
      if (motif.test(corps) && !decision.nomenclatures.includes(nom)) decision.nomenclatures.push(nom);
    }
  }
  return decisions;
}

/** Noms des archives quotidiennes listées par la page d'index, à partir d'une date AAAAMMJJ. */
export function archivesDepuis(page, depuis) {
  const noms = new Set(String(page).match(/JORF_\d{8}-\d{6}\.tar\.gz/g) ?? []);
  return [...noms].filter((nom) => nom.slice(5, 13) >= depuis).sort();
}

/**
 * Archives à lire pour couvrir la période qui commence à une date AAAAMMJJ. Si la dernière archive complète
 * date de cette période, les archives quotidiennes antérieures ont été retirées : on la lit d'abord, puis les
 * archives quotidiennes produites depuis.
 */
export function archivesALire(page, depuis) {
  const completes = [...new Set(String(page).match(/Freemium_jorf_global_\d{8}-\d{6}\.tar\.gz/g) ?? [])].sort();
  const complete = completes.at(-1);
  const jour = complete?.slice(21, 29);
  if (complete && jour >= depuis) return [complete, ...archivesDepuis(page, jour)];
  return archivesDepuis(page, depuis);
}

/**
 * Ticket à ouvrir pour une décision. Une décision qui ne cite que la CCAM ou la NABM n'en demande pas ;
 * une décision dont aucune nomenclature n'est reconnue en demande un, à vérifier.
 * @param {{ id: string, publication: string, titre: string, nomenclatures: string[], vigueur?: string[] }} decision
 * @param {{ publiee?: string }} [options] publiee : nom de la dernière release des tables (ngap-AAAAMMJJ)
 */
export function ticketPour(decision, { publiee = '' } = {}) {
  const ngap = decision.nomenclatures.includes('NGAP');
  if (!ngap && decision.nomenclatures.length) return null;
  const jour = dateEnClair(decision.publication);
  const version = publiee.match(/^ngap-(\d{8})$/);
  const vigueur = decision.vigueur ?? [];
  const lignes = [
    ngap
      ? `Le Journal officiel du ${jour} publie une décision de l'UNCAM dont les articles citent la NGAP :`
      : `Le Journal officiel du ${jour} publie une décision de l'UNCAM relative à la liste des actes et prestations. Ses articles ne citent ni la NGAP, ni la CCAM, ni la NABM : à lire pour savoir si elle touche la NGAP.`,
    '',
    `> ${decision.titre}`,
    '',
    `${LEGIFRANCE}${decision.id}`,
    '',
    version
      ? `Version de la NGAP publiée ici : celle du ${dateEnClair(version[1])} (release \`${publiee}\`).`
      : 'Aucune version de la NGAP publiée ici pour le moment.',
    '',
    ...(vigueur.length ? ["Entrée en vigueur, d'après la décision :", '', ...vigueur.map((phrase) => `> ${phrase}`), ''] : []),
    'À faire :',
    '',
    `1. ${vigueur.length ? 'Noter chaque date' : 'Lire dans la décision sa date'} d'entrée en vigueur. À cette date, l'Assurance Maladie met en ligne le PDF de la version consolidée, dont le nom porte la date : ${AMELI}`,
    "2. Quand ce PDF est plus récent que la version publiée ici, demander le document Word de cette version à la personne responsable de l'accès aux documents administratifs de la Cnam.",
    '3. À réception, enregistrer le document en .docx, le convertir avec `referentiels-sante ngap <fichier.docx> --communique AAAA-MM-JJ`, puis publier les tables : release `ngap-AAAAMMJJ` et fichier `ngap.zip` de la release `donnees-du-mois`. Ne joindre le document lui-même qu\'après avoir retiré les noms de personnes de ses propriétés.',
    "4. Fermer ce ticket une fois publiée la version de la dernière date d'entrée en vigueur.",
  ];
  return {
    titre: ngap ? `NGAP : décision de l'UNCAM au Journal officiel du ${jour}, version à redemander` : `NGAP : décision de l'UNCAM au Journal officiel du ${jour}, à vérifier`,
    corps: `${lignes.join('\n')}\n`,
  };
}

async function recuperer(adresse) {
  const reponse = await fetch(adresse, { headers: { 'user-agent': AGENT_UTILISATEUR }, redirect: 'follow' });
  if (!reponse.ok || !reponse.body) throw new Error(`récupération impossible (${reponse.status}) : ${adresse}`);
  return reponse;
}

/** Flux décompressé d'une archive, locale ou en ligne. Une erreur de lecture interrompt le flux décompressé. */
async function ouvrir(nom, dossier) {
  const source = dossier ? createReadStream(join(dossier, nom)) : Readable.fromWeb((await recuperer(ARCHIVES + nom)).body);
  const decompresse = createGunzip();
  pipeline(source, decompresse, () => {});
  return decompresse;
}

/**
 * Décisions publiées depuis une date, lues en ligne ou dans un dossier d'archives déjà téléchargées.
 * @param {{ depuis: string, dossier?: string, journal?: (message: string) => void }} options depuis : AAAAMMJJ
 */
export async function veiller({ depuis, dossier, journal = () => {} }) {
  const page = dossier ? readdirSync(dossier).join('\n') : await (await recuperer(ARCHIVES)).text();
  const archives = archivesALire(page, depuis);
  if (!archives.length) throw new Error(`aucune archive du Journal officiel depuis le ${depuis} : ${dossier ?? ARCHIVES}`);
  const decisions = new Map();
  for (const nom of archives) await lireArchive(await ouvrir(nom, dossier), { depuis, decisions });
  const complete = archives[0].startsWith('Freemium') ? `, dont l'archive complète du ${archives[0].slice(21, 29)}` : '';
  journal(`archives lues : ${archives.length}${complete}, pour la période depuis le ${depuis} ; décisions de l'UNCAM sur la liste des actes : ${decisions.size}`);
  return [...decisions.values()].sort((a, b) => a.publication.localeCompare(b.publication) || a.id.localeCompare(b.id));
}

function option(arguments_, nom) {
  const rang = arguments_.indexOf(nom);
  return rang >= 0 ? arguments_[rang + 1] : undefined;
}

// Usage : veille-ngap.mjs [--jours 16 | --depuis AAAAMMJJ] [--dossier <archives locales>] [--publiee ngap-AAAAMMJJ]
// Écrit en JSON les décisions trouvées ; celles qui demandent un ticket portent son titre et son corps.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const arguments_ = process.argv.slice(2);
  const jours = Number(option(arguments_, '--jours') ?? 16);
  const depuis = option(arguments_, '--depuis') ?? new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
  const decisions = await veiller({ depuis, dossier: option(arguments_, '--dossier'), journal: (message) => console.error(message) });
  const sortie = decisions.map((decision) => {
    const ticket = ticketPour(decision, { publiee: option(arguments_, '--publiee') ?? '' });
    console.error(`${decision.publication} ${decision.id} [${decision.nomenclatures.join(', ') || 'aucune nomenclature reconnue'}]${ticket ? ' : ticket' : ''}`);
    return { ...decision, ticket: Boolean(ticket), titreTicket: ticket?.titre ?? '', corps: ticket?.corps ?? '' };
  });
  console.log(JSON.stringify(sortie, null, 2));
}
