/**
 * NGAP : conversion du document Word de l'Assurance Maladie (.docx) en tables.
 *
 * La nomenclature générale des actes professionnels n'est publiée en ligne qu'en
 * PDF ; la Cnam communique son document Word sur demande. Ce document porte les
 * actes dans des tableaux « Désignation de l'acte, Coefficient, Lettre clé » :
 * on les recopie ligne à ligne, avec la partie, le titre, le chapitre et
 * l'article sous lesquels ils se trouvent. Rien n'est corrigé ni interprété.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { lireZip } from '../commun/zip.js';
import { analyserXml, enfant, enfants } from '../commun/xml.js';
import { EcrivainCsv } from '../commun/csv.js';

export const COLONNES_ACTES = [
  'ordre', 'partie', 'titre', 'sous_titre', 'chapitre', 'section', 'article', 'rubrique', 'modifie_par',
  'tableau', 'ligne', 'type', 'regroupement', 'code', 'designation',
  'coefficient', 'coefficient_nombre', 'lettre_cle', 'lettres', 'accord_prealable',
];
export const COLONNES_PLAN = ['ordre', 'niveau', 'texte', 'abroge', 'modifie_par'];

const NIVEAUX = ['partie', 'titre', 'sous_titre', 'chapitre', 'section', 'article', 'rubrique'];
const NOMBRE = /^\d+(?:[,.]\d+)?$/;

/** Texte d'un paragraphe ou d'une cellule : les passages supprimés en suivi de modifications sont ignorés. */
export function texteDe(element) {
  const morceaux = [];
  (function voir(e) {
    for (const c of e.enfants ?? []) {
      if (c.nom === '#texte') continue;
      if (c.nom === 'w:t') {
        for (const x of c.enfants) if (x.nom === '#texte') morceaux.push(x.texte);
      } else if (c.nom === 'w:tab' || c.nom === 'w:br' || c.nom === 'w:cr') morceaux.push(' ');
      else if (c.nom === 'w:pPr' || c.nom === 'w:rPr' || c.nom === 'w:del' || c.nom === 'w:instrText') continue;
      else voir(c);
    }
  })(element);
  return morceaux.join('').replace(/\s+/g, ' ').trim();
}

/** Blocs du corps dans l'ordre du document : paragraphes et tableaux, y compris dans les contrôles de contenu. */
function* blocs(conteneur) {
  for (const c of conteneur.enfants) {
    if (c.nom === 'w:p' || c.nom === 'w:tbl') yield c;
    else if (c.nom === 'w:sdt') {
      const contenu = enfant(c, 'w:sdtContent');
      if (contenu) yield* blocs(contenu);
    }
  }
}

function lireStyles(xml) {
  const styles = new Map();
  if (!xml) return styles;
  for (const s of enfants(analyserXml(xml), 'w:style')) {
    const nom = enfant(s, 'w:name');
    styles.set(s.attributs['w:styleId'], nom ? nom.attributs['w:val'] : '');
  }
  return styles;
}

function styleDe(paragraphe, styles) {
  const proprietes = enfant(paragraphe, 'w:pPr');
  const style = proprietes ? enfant(proprietes, 'w:pStyle') : null;
  if (!style) return 'Normal';
  const id = style.attributs['w:val'];
  return styles.get(id) || id;
}

const estMajuscules = (t) => t === t.toUpperCase() && /[A-ZÀ-Ý]/.test(t);

/** Niveau d'un paragraphe dans le plan de la nomenclature, ou null pour du texte courant. */
export function niveauDe(texte, style) {
  const t = texte;
  if (!t) return null;
  if (/^(PREMI[ÈE]RE|DEUXI[ÈE]ME|TROISI[ÈE]ME|QUATRI[ÈE]ME|CINQUI[ÈE]ME|SIXI[ÈE]ME)\s+PARTIE$/.test(t) || t === 'ANNEXES') return 'partie';
  if (/^NOMENCLATURE DES ACTES/.test(t)) return 'partie_libelle';
  if (/^\((Modifi|Cr[ée]|Abrog|Supprim|Ins[ée]r)/i.test(t)) return 'modification';
  if (/^ANNEXE\s+\d+/i.test(t) || (/^TITRE\s+[IVXLC]+\b/.test(t) && estMajuscules(t.slice(0, 8)))) return 'titre';
  if (/^PARTIE\s+[IVX]+\b/.test(t)) return 'sous_titre';
  if (/^CHAPITRE\s+[IVXLC\d]+/i.test(t)) return 'chapitre';
  if (/^Section\s+[IVXLC\d]+/i.test(t)) return 'section';
  if (/^Articles?\s+(\d|1er|premier)/i.test(t)) return 'article';
  if (style === 'sous partie' || (style === 'article' && t.length <= 200)) return 'rubrique';
  return null;
}

function cellules(ligne) {
  return enfants(ligne, 'w:tc').map((tc) => enfants(tc, 'w:p').map(texteDe).filter(Boolean));
}

/** Un tableau est un tableau d'actes s'il a l'en-tête attendu, ou si ses lignes ont une cotation en 2e et 3e colonnes. */
export function natureTableau(lignes) {
  if (!lignes.length) return null;
  const premiere = lignes[0].map((c) => c.join(' '));
  if (premiere.length >= 3 && /d[ée]signation/i.test(premiere[0]) && /coefficient/i.test(premiere[1] ?? '')) return { nature: 'actes', entete: true, ap: premiere.length > 3 };
  const larges = lignes.filter((l) => l.length >= 3);
  if (larges.length && larges.length === lignes.length) {
    const acp = larges.filter((l) => /^\d{4}$/.test(l[0].join('')) && NOMBRE.test(l[l.length - 1].join(''))).length;
    if (acp >= 1 && acp * 2 >= larges.length) return { nature: 'acp', entete: false };
    const cotees = larges.filter((l) => l[1].length && l[1].every((x) => NOMBRE.test(x)) && l[2].length && l[2].every((x) => /^[A-Z]{1,4}(\s+ou\s+[A-Z]{1,4})*$/.test(x))).length;
    if (cotees * 10 >= larges.length * 6) return { nature: 'actes', entete: false, ap: larges[0].length > 3 };
  }
  return null;
}

const lettresDe = (texte) => Array.from(new Set(texte.split(/\s+ou\s+|\s*\/\s*|\s*,\s*|\s+et\s+/).map((x) => x.trim()).filter((x) => /^[A-Z]{1,5}$/.test(x)))).join(' ');

/**
 * Lit le document et rend les lignes des tableaux d'actes, le plan et quelques comptes.
 * @param {Buffer|string} source contenu ou chemin du fichier .docx
 */
export function lireNgap(source) {
  let fichiers;
  try {
    fichiers = lireZip(source);
  } catch (erreur) {
    throw new Error(`ce fichier n'est pas un document .docx lisible (${erreur.message}) ; un fichier .doc s'enregistre au format .docx depuis Word, menu Fichier, Enregistrer sous`);
  }
  const documentXml = fichiers.get('word/document.xml');
  if (!documentXml) throw new Error('word/document.xml absent : ce fichier n\'est pas un document Word .docx');
  const styles = lireStyles(fichiers.get('word/styles.xml')?.toString('utf8'));
  const corps = enfant(analyserXml(documentXml.toString('utf8')), 'w:body');
  if (!corps) throw new Error('corps du document introuvable');

  const contexte = { partie: null, titre: null, sous_titre: null, chapitre: null, section: null, article: null, rubrique: null, modifie_par: null };
  const actes = []; const plan = [];
  const comptes = { paragraphes: 0, tableaux: 0, tableauxActes: 0, tableauxNonConvertis: 0, actes: 0, regroupements: 0, notes: 0 };
  let dernierPlan = null;

  const monter = (niveau, texte) => {
    const rang = NIVEAUX.indexOf(niveau);
    contexte[niveau] = texte;
    for (const n of NIVEAUX.slice(rang + 1)) contexte[n] = null;
    contexte.modifie_par = null;
    dernierPlan = { ordre: plan.length + 1, niveau, texte, abroge: /abrog/i.test(texte) ? 'oui' : '', modifie_par: null };
    plan.push(dernierPlan);
  };
  const noter = (niveau, texte) => {
    if (niveau === 'partie_libelle') {
      if (contexte.partie && !contexte.partie.includes(texte)) {
        contexte.partie = `${contexte.partie} : ${texte}`;
        const p = plan.findLast((x) => x.niveau === 'partie');
        if (p) p.texte = contexte.partie;
      } else if (!contexte.partie) monter('partie', texte);
    } else if (niveau === 'modification') {
      contexte.modifie_par = contexte.modifie_par ? `${contexte.modifie_par} ${texte}` : texte;
      if (dernierPlan) dernierPlan.modifie_par = contexte.modifie_par;
    } else monter(niveau, texte);
  };

  for (const bloc of blocs(corps)) {
    if (bloc.nom === 'w:p') {
      comptes.paragraphes++;
      const texte = texteDe(bloc);
      const niveau = niveauDe(texte, styleDe(bloc, styles));
      if (niveau) noter(niveau, texte);
      continue;
    }
    comptes.tableaux++;
    const lignes = enfants(bloc, 'w:tr').map(cellules);
    // Les séparateurs de parties sont des tableaux d'une cellule.
    if (lignes.length === 1 && lignes[0].length === 1) {
      const texte = lignes[0][0].join(' ');
      if (niveauDe(texte, 'Normal') === 'partie') { monter('partie', texte); continue; }
    }
    const nature = natureTableau(lignes);
    if (!nature) { comptes.tableauxNonConvertis++; continue; }
    comptes.tableauxActes++;
    let regroupement = null;
    lignes.forEach((ligne, k) => {
      if (nature.entete && k === 0) return;
      const texteCellule = (i) => (ligne[i] ?? []).join(' / ');
      const base = { ordre: actes.length + 1, ...contexte, tableau: comptes.tableauxActes, ligne: k + 1, type: 'acte', regroupement: null, code: null, designation: null, coefficient: null, coefficient_nombre: null, lettre_cle: null, lettres: null, accord_prealable: null };
      if (nature.nature === 'acp') {
        const coefficient = texteCellule(ligne.length - 1);
        Object.assign(base, { code: texteCellule(0) || null, designation: texteCellule(1) || null, coefficient: coefficient || null, coefficient_nombre: NOMBRE.test(coefficient) ? coefficient.replace(',', '.') : null, lettre_cle: ligne.length > 3 ? texteCellule(2) || null : null });
        base.lettres = base.lettre_cle ? lettresDe(base.lettre_cle) || null : null;
        if (!base.designation && !base.coefficient) return;
        base.type = base.coefficient ? 'acte' : 'note';
      } else {
        const designation = texteCellule(0); const coefficient = texteCellule(1); const lettre = texteCellule(2);
        if (!designation && !coefficient && !lettre) return;
        base.designation = designation || null;
        if (!coefficient && !lettre) {
          base.type = /:\s*$/.test(designation) ? 'regroupement' : 'note';
          if (base.type === 'regroupement') regroupement = designation;
        } else {
          const unique = (ligne[1] ?? []).length === 1 && NOMBRE.test(ligne[1][0]);
          Object.assign(base, { coefficient: coefficient || null, coefficient_nombre: unique ? ligne[1][0].replace(',', '.') : null, lettre_cle: lettre || null, lettres: lettresDe(lettre) || null, accord_prealable: nature.ap && /\bAP\b/.test(texteCellule(3)) ? 'oui' : null });
          if (/^[-\u2013\u2022]/.test(designation)) base.regroupement = regroupement;
          else regroupement = null;
        }
      }
      comptes[base.type === 'acte' ? 'actes' : base.type === 'regroupement' ? 'regroupements' : 'notes']++;
      actes.push(base);
    });
  }
  return { actes, plan, comptes };
}

/** Convertit le document Word de la NGAP en `ngap-actes.csv`, `ngap-plan.csv` et `ngap-resume.json`. */
export async function exporterNgap(fichier, { sortie = 'data/ngap', journal = () => {} } = {}) {
  if (/\.doc$/i.test(fichier)) throw new Error('le format .doc (Word 97-2003) n\'est pas lu : ouvrez le fichier dans Word et enregistrez-le au format .docx');
  const { actes, plan, comptes } = lireNgap(fichier);
  if (!comptes.tableauxActes) throw new Error('aucun tableau d\'actes reconnu dans ce document : est-ce bien la NGAP de l\'Assurance Maladie ?');
  mkdirSync(sortie, { recursive: true });
  const csvActes = new EcrivainCsv(join(sortie, 'ngap-actes.csv'), COLONNES_ACTES);
  for (const a of actes) await csvActes.ecrire(a);
  const csvPlan = new EcrivainCsv(join(sortie, 'ngap-plan.csv'), COLONNES_PLAN);
  for (const p of plan) await csvPlan.ecrire(p);
  await Promise.all([csvActes.fermer(), csvPlan.fermer()]);
  const resume = {
    source: basename(fichier),
    libelle: 'Nomenclature générale des actes professionnels (NGAP), document Word de l\'Assurance Maladie',
    converti: new Date().toISOString(),
    ...comptes,
    lignesPlan: plan.length,
    fichiers: ['ngap-actes.csv', 'ngap-plan.csv'],
  };
  writeFileSync(join(sortie, 'ngap-resume.json'), JSON.stringify(resume, null, 2) + '\n');
  journal(`${comptes.actes} actes cotés, ${comptes.regroupements} regroupements et ${comptes.notes} notes dans ${comptes.tableauxActes} tableaux ; ${comptes.tableauxNonConvertis} autres tableaux laissés de côté ; plan de ${plan.length} lignes`);
  return resume;
}
