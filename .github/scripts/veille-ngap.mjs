// Veille de la NGAP. Chaque modification de la nomenclature passe par une décision de l'Union nationale des
// caisses d'assurance maladie (UNCAM) publiée au Journal officiel. Ce script lit les archives quotidiennes du
// Journal officiel (données ouvertes de la DILA), repère ces décisions et dit lesquelles touchent la NGAP :
// c'est le moment de redemander le document Word à l'Assurance Maladie, qui ne le met pas en ligne.
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

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

/** Contenu des fichiers ordinaires d'une archive tar déjà décompressée. */
export function* fichiersTar(tampon) {
  let position = 0;
  while (position + 512 <= tampon.length && tampon[position] !== 0) {
    const taille = parseInt(tampon.toString('latin1', position + 124, position + 136).replace(/[\0 ]+$/, '') || '0', 8);
    if (!Number.isFinite(taille)) throw new Error('archive tar illisible');
    const type = tampon[position + 156];
    const debut = position + 512;
    if (type === 0 || type === 0x30) yield tampon.subarray(debut, debut + taille);
    position = debut + Math.ceil(taille / 512) * 512;
  }
}

function texteXml(octets) {
  try {
    return utf8.decode(octets);
  } catch {
    return Buffer.from(octets).toString('latin1');
  }
}

function balise(xml, nom) {
  const trouve = xml.match(new RegExp(`<${nom}>([^<]*)</${nom}>`));
  return trouve ? decoderEntites(trouve[1]).replace(/\s+/g, ' ').trim() : '';
}

/**
 * Décisions de l'UNCAM relatives à la liste des actes et prestations publiées dans une archive quotidienne,
 * avec les nomenclatures que citent leurs articles et ce qu'ils disent de l'entrée en vigueur.
 * @param {Buffer} tampon archive tar décompressée
 */
export function decisionsDeLArchive(tampon) {
  const decisions = new Map();
  for (const octets of fichiersTar(tampon)) {
    if (!octets.includes('<TEXTE_VERSION')) continue;
    const xml = texteXml(octets);
    const titre = balise(xml, 'TITREFULL');
    const repere = normaliser(titre);
    if (!repere.includes("union nationale des caisses d'assurance maladie")) continue;
    if (!repere.includes('relative a la liste des actes et prestations')) continue;
    const id = balise(xml, 'ID');
    decisions.set(id, { id, nor: balise(xml, 'NOR'), publication: balise(xml, 'DATE_PUBLI'), date: balise(xml, 'DATE_TEXTE'), titre, nomenclatures: [], vigueur: [] });
  }
  if (!decisions.size) return [];
  // Le corps des textes est dans des fichiers d'articles, rattachés au texte par son identifiant.
  for (const octets of fichiersTar(tampon)) {
    if (!octets.includes('<ARTICLE')) continue;
    const xml = texteXml(octets);
    const decision = decisions.get(xml.match(/<TEXTE\b[^>]*\bcid="(JORFTEXT\d+)"/)?.[1]);
    if (!decision) continue;
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
  return [...decisions.values()];
}

/** Noms des archives quotidiennes listées par la page d'index, à partir d'une date AAAAMMJJ. */
export function archivesDepuis(page, depuis) {
  const noms = new Set(String(page).match(/JORF_\d{8}-\d{6}\.tar\.gz/g) ?? []);
  return [...noms].filter((nom) => nom.slice(5, 13) >= depuis).sort();
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
  if (!reponse.ok) throw new Error(`récupération impossible (${reponse.status}) : ${adresse}`);
  return Buffer.from(await reponse.arrayBuffer());
}

/**
 * Décisions publiées depuis une date, lues en ligne ou dans un dossier d'archives déjà téléchargées.
 * @param {{ depuis: string, dossier?: string, journal?: (message: string) => void }} options depuis : AAAAMMJJ
 */
export async function veiller({ depuis, dossier, journal = () => {} }) {
  const page = dossier ? readdirSync(dossier).join('\n') : (await recuperer(ARCHIVES)).toString('utf8');
  const archives = archivesDepuis(page, depuis);
  if (!archives.length) throw new Error(`aucune archive du Journal officiel depuis le ${depuis} : ${dossier ?? ARCHIVES}`);
  const decisions = new Map();
  for (const nom of archives) {
    const tampon = gunzipSync(dossier ? readFileSync(join(dossier, nom)) : await recuperer(ARCHIVES + nom));
    for (const decision of decisionsDeLArchive(tampon)) {
      const connue = decisions.get(decision.id);
      if (connue) {
        decision.nomenclatures = [...new Set([...connue.nomenclatures, ...decision.nomenclatures])];
        decision.vigueur = [...new Set([...connue.vigueur, ...decision.vigueur])];
      }
      decisions.set(decision.id, decision);
    }
  }
  journal(`archives lues : ${archives.length} (${archives[0].slice(5, 13)} à ${archives.at(-1).slice(5, 13)}) ; décisions de l'UNCAM sur la liste des actes : ${decisions.size}`);
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
