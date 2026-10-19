// Index allégé de la base des médicaments pour la page de recherche et de contrôle :
// une ligne par présentation (CIP), avec sa spécialité, son groupe générique et sa disponibilité.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireCsv } from './index-finess.mjs';

export const COLONNES_INDEX = ['cip13', 'cip7', 'cis', 'denomination', 'forme', 'presentation', 'titulaires', 'statut_amm', 'etat_specialite',
  'statut_presentation', 'etat_presentation', 'date_commercialisation', 'agrement_collectivites', 'taux_remboursement', 'prix_medicament',
  'prix_public', 'honoraires', 'groupe_generique', 'type_generique', 'disponibilite'];

const champ = (v) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function tableau(texte) {
  let entete = null;
  const lignes = [];
  lireCsv(texte, (l) => {
    if (!entete) { entete = l; return; }
    if (l.length === 1 && l[0] === '') return;
    const o = {};
    entete.forEach((c, i) => { o[c] = l[i] ?? ''; });
    lignes.push(o);
  });
  return lignes;
}

const TYPES_GENERIQUE = { 0: 'princeps', 1: 'générique', 2: 'générique par complémentarité posologique', 4: 'générique substituable' };

export function construireIndex({ specialites, presentations, generiques = '', disponibilite = '' }) {
  const parCis = new Map(tableau(specialites).map((s) => [s.cis, s]));
  const groupes = new Map();
  for (const g of tableau(generiques)) if (!groupes.has(g.cis)) groupes.set(g.cis, g);
  const dispo = new Map();
  for (const d of tableau(disponibilite)) if (d.cip13) dispo.set(d.cip13, d.libelle_statut || d.code_statut || '');
  const lignes = [];
  for (const p of tableau(presentations)) {
    const s = parCis.get(p.cis) ?? {};
    const g = groupes.get(p.cis);
    lignes.push([p.cip13, p.cip7, p.cis, s.denomination ?? '', s.forme_pharmaceutique ?? '', p.libelle_presentation, s.titulaires ?? '',
      s.statut_amm ?? '', s.etat_commercialisation ?? '', p.statut_administratif, p.etat_commercialisation, p.date_declaration_commercialisation,
      p.agrement_collectivites, p.taux_remboursement, p.prix_medicament, p.prix_public, p.honoraires_dispensation,
      g ? g.libelle_groupe : '', g ? (TYPES_GENERIQUE[g.type_generique] ?? g.type_generique) : '', dispo.get(p.cip13) ?? ''].map((v) => champ(String(v ?? ''))).join(';'));
  }
  return `${COLONNES_INDEX.join(';')}\n${lignes.join('\n')}\n`;
}

if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [dossier, sortie] = process.argv.slice(2);
  if (!sortie) throw new Error('usage : index-medicaments.mjs <dossier bdpm converti> <index-medicaments.csv.gz>');
  const lire = (nom) => { try { return readFileSync(join(dossier, nom), 'utf8'); } catch (e) { return ''; } };
  const index = construireIndex({
    specialites: lire('bdpm-specialites.csv'), presentations: lire('bdpm-presentations.csv'),
    generiques: lire('bdpm-generiques.csv'), disponibilite: lire('bdpm-disponibilite.csv'),
  });
  writeFileSync(sortie, gzipSync(index, { level: 9 }));
  console.log(`${index.split('\n').length - 2} présentations dans ${sortie}`);
}
