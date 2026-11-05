// Index des établissements pour les pages du site, en CSV compressé :
// - index-finess.csv.gz : douze colonnes d'etablissements.csv, tous les établissements (environ 6 Mo), pour la recherche et le contrôle ;
// - index-extraction.csv.gz : les établissements en activité, avec adresse, coordonnées, secteur, GHT et activités de soins exercées, pour la page Extraire.
import { createReadStream, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const COLONNES_INDEX = ['finess_et', 'finess_ej', 'nom_court', 'nom_long', 'siret', 'categorie', 'categorie_libelle',
  'etat', 'date_fermeture', 'code_postal', 'commune_acheminement', 'ej_denomination'];

export const COLONNES_EXTRACTION = ['finess_et', 'finess_ej', 'nom_court', 'nom_long', 'siret', 'categorie', 'categorie_libelle', 'domaine', 'secteur',
  'adresse', 'code_postal', 'commune_acheminement', 'code_commune_insee', 'departement', 'departement_libelle', 'latitude', 'longitude', 'telephone',
  'ej_denomination', 'ej_statut_juridique_libelle', 'ght_nom', 'ght_role', 'soins'];

// Activités de soins retenues pour la colonne `soins` : code d'activité du régime AMM (QA…) et codes du régime AMF.
export const SOINS = {
  med: { amm: ['QA001'], amf: ['01'] },
  chir: { amm: ['QA002'], amf: ['02'] },
  obs: { amm: ['QA003'], amf: ['03'] },
  psy: { amm: ['QA004'], amf: ['04'] },
  sld: { amm: ['QA007'], amf: ['07'] },
  urg: { amm: ['QA014'], amf: ['14'] },
  crit: { amm: ['QA015'], amf: ['15'] },
  dial: { amm: ['QA016'], amf: ['16'] },
  cancer: { amm: ['QA018'], amf: ['18'] },
  had: { amm: ['QA020'], amf: [] },
  smr: { amm: ['QA050'], amf: ['50', '51', '52', '53', '54', '55', '56', '57', '58', '59'] },
};
const ORDRE_SOINS = Object.keys(SOINS);
const JETON_PAR_CODE = new Map();
for (const [jeton, d] of Object.entries(SOINS)) {
  for (const c of d.amm) JETON_PAR_CODE.set(`AMM ${c}`, jeton);
  for (const c of d.amf) JETON_PAR_CODE.set(`AMF ${c}`, jeton);
}

/** Lit un CSV « ; » à guillemets doublés, BOM facultatif, et appelle surLigne pour chaque ligne. */
export function lireCsv(texte, surLigne) {
  const n = texte.length;
  let i = texte.charCodeAt(0) === 0xfeff ? 1 : 0;
  let ligne = [];
  while (i < n) {
    let champ;
    if (texte.charCodeAt(i) === 34) {
      let j = i + 1;
      champ = '';
      for (;;) {
        const k = texte.indexOf('"', j);
        if (k < 0) throw new Error(`guillemet non fermé à la position ${i}`);
        champ += texte.slice(j, k);
        if (texte.charCodeAt(k + 1) === 34) {
          champ += '"';
          j = k + 2;
          continue;
        }
        i = k + 1;
        break;
      }
    } else {
      let j = i;
      while (j < n) {
        const c = texte.charCodeAt(j);
        if (c === 59 || c === 10 || c === 13) break;
        j += 1;
      }
      champ = texte.slice(i, j);
      i = j;
    }
    ligne.push(champ);
    if (texte.charCodeAt(i) === 59) {
      i += 1;
      if (i >= n) {
        ligne.push('');
        surLigne(ligne);
        ligne = [];
      }
      continue;
    }
    if (texte.charCodeAt(i) === 13) i += 1;
    if (i >= n || texte.charCodeAt(i) === 10) {
      surLigne(ligne);
      ligne = [];
      i += 1;
      continue;
    }
    throw new Error(`caractère inattendu après un champ, position ${i}`);
  }
  if (ligne.length) surLigne(ligne);
}

const champ = (v) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function construireIndex(texteCsv) {
  let positions = null;
  const lignes = [];
  lireCsv(texteCsv, (l) => {
    if (!positions) {
      positions = COLONNES_INDEX.map((c) => {
        const i = l.indexOf(c);
        if (i < 0) throw new Error(`colonne ${c} absente d'etablissements.csv`);
        return i;
      });
      return;
    }
    if (l.length === 1 && l[0] === '') return;
    lignes.push(positions.map((i) => champ(l[i] ?? '')).join(';'));
  });
  return `${COLONNES_INDEX.join(';')}\n${lignes.join('\n')}\n`;
}

/**
 * Activité de soins retenue pour une ligne d'activites.csv, ou null : seules comptent les activités
 * exercées, actives et mises en œuvre (niveau `exercee`, état `A`, statut `1`).
 */
export function soinsDeLigne(a) {
  if (a.niveau !== 'exercee' || a.etat !== 'A' || a.statut !== '1') return null;
  return JETON_PAR_CODE.get(`${a.nature} ${a.activite}`) ?? null;
}

function decouperLigne(l) {
  const c = [];
  let v = '';
  let cite = false;
  for (let i = 0; i < l.length; i += 1) {
    const ch = l[i];
    if (cite) {
      if (ch === '"') {
        if (l[i + 1] === '"') { v += '"'; i += 1; } else cite = false;
      } else v += ch;
    } else if (ch === '"') cite = true;
    else if (ch === ';') { c.push(v); v = ''; } else v += ch;
  }
  c.push(v);
  return c;
}

/** Parcourt activites.csv en flux et rend, par établissement, les activités de soins qu'il exerce. */
export async function soinsDepuisActivites(chemin) {
  const parEtablissement = new Map();
  let pos = null;
  const lecteur = createInterface({ input: createReadStream(chemin, 'utf8'), crlfDelay: Infinity });
  for await (const brut of lecteur) {
    if (!pos) {
      const entete = decouperLigne(brut.replace(/^﻿/, ''));
      pos = {};
      for (const c of ['finess_et', 'niveau', 'nature', 'activite', 'etat', 'statut']) {
        pos[c] = entete.indexOf(c);
        if (pos[c] < 0) throw new Error(`colonne ${c} absente d'activites.csv`);
      }
      continue;
    }
    if (brut === '') continue;
    const l = decouperLigne(brut);
    const jeton = soinsDeLigne({ niveau: l[pos.niveau], nature: l[pos.nature], activite: l[pos.activite], etat: l[pos.etat], statut: l[pos.statut] });
    if (!jeton) continue;
    const et = l[pos.finess_et];
    if (!parEtablissement.has(et)) parEtablissement.set(et, new Set());
    parEtablissement.get(et).add(jeton);
  }
  return parEtablissement;
}

const coordonnee = (v, max) => (v !== '' && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= max ? v : '');

/** Index d'extraction : les établissements en activité, une ligne chacun, avec les activités de soins exercées. */
export function construireIndexExtraction(texteCsv, soinsParEtablissement = new Map()) {
  let pos = null;
  const lignes = [];
  lireCsv(texteCsv, (l) => {
    if (!pos) {
      pos = {};
      for (const c of ['finess_et', 'finess_ej', 'nom_court', 'nom_long', 'siret', 'categorie', 'categorie_libelle', 'domaine', 'secteur', 'etat',
        'numero_voie', 'type_voie', 'libelle_voie', 'adresse_ligne_4', 'code_postal', 'commune_acheminement', 'code_commune_insee', 'departement',
        'departement_libelle', 'latitude', 'longitude', 'telephone', 'ej_denomination', 'ej_statut_juridique_libelle', 'ght_nom', 'ght_role']) {
        pos[c] = l.indexOf(c);
        if (pos[c] < 0) throw new Error(`colonne ${c} absente d'etablissements.csv`);
      }
      return;
    }
    if (l.length === 1 && l[0] === '') return;
    const g = (c) => l[pos[c]] ?? '';
    if (g('etat') !== 'A') return;
    const latitude = coordonnee(g('latitude'), 90);
    const longitude = coordonnee(g('longitude'), 180);
    const soins = soinsParEtablissement.get(g('finess_et'));
    const valeurs = {
      adresse: g('adresse_ligne_4') || [g('numero_voie'), g('type_voie'), g('libelle_voie')].filter(Boolean).join(' '),
      latitude: latitude && longitude ? latitude : '',
      longitude: latitude && longitude ? longitude : '',
      soins: soins ? ORDRE_SOINS.filter((j) => soins.has(j)).join(' ') : '',
    };
    lignes.push(COLONNES_EXTRACTION.map((c) => champ(c in valeurs ? valeurs[c] : g(c))).join(';'));
  });
  return `${COLONNES_EXTRACTION.join(';')}\n${lignes.join('\n')}\n`;
}

if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [entree, sortie, activites, sortieExtraction] = process.argv.slice(2);
  if (!sortie) throw new Error('usage : index-finess.mjs <etablissements.csv> <index-finess.csv.gz> [<activites.csv> <index-extraction.csv.gz>]');
  const texte = readFileSync(entree, 'utf8');
  const index = construireIndex(texte);
  writeFileSync(sortie, gzipSync(index, { level: 9 }));
  console.log(`${index.split('\n').length - 2} établissements dans ${sortie}`);
  if (sortieExtraction) {
    const soins = await soinsDepuisActivites(activites);
    const extraction = construireIndexExtraction(texte, soins);
    writeFileSync(sortieExtraction, gzipSync(extraction, { level: 9 }));
    console.log(`${extraction.split('\n').length - 2} établissements en activité dans ${sortieExtraction}, dont ${soins.size} avec une activité de soins`);
  }
}
