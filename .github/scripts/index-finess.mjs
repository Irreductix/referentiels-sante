// Index allégé des établissements, pour une recherche ou un contrôle dans le navigateur :
// douze colonnes d'etablissements.csv, en CSV compressé (environ 6 Mo).
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const COLONNES_INDEX = ['finess_et', 'finess_ej', 'nom_court', 'nom_long', 'siret', 'categorie', 'categorie_libelle',
  'etat', 'date_fermeture', 'code_postal', 'commune_acheminement', 'ej_denomination'];

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

if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [entree, sortie] = process.argv.slice(2);
  if (!sortie) throw new Error('usage : index-finess.mjs <etablissements.csv> <index-finess.csv.gz>');
  const index = construireIndex(readFileSync(entree, 'utf8'));
  writeFileSync(sortie, gzipSync(index, { level: 9 }));
  console.log(`${index.split('\n').length - 2} établissements dans ${sortie}`);
}
