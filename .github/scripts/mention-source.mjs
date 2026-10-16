// Écrit MENTION-SOURCE.txt à côté des fichiers convertis avant leur publication :
// la Licence Ouverte demande de citer la source et la date de dernière mise à jour.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPOT = 'https://github.com/Irreductix/referentiels-sante';
const FIN = '\r\n';

function jour(iso) {
  return iso ? String(iso).slice(0, 10) : 'inconnue';
}

// Les résumés depuis la 0.3.5 donnent la date de mise à jour de chaque table NOS utilisée.
function lignesTablesNos(structures, activites) {
  const dates = { ...(structures.tablesLibellesDates ?? {}), ...(activites?.tablesLibellesDates ?? {}) };
  const noms = Object.keys(dates).sort();
  if (!noms.length) return ['  tables utilisées listées dans structures-resume.json'];
  return ['  tables utilisées, avec leur date de mise à jour :', ...noms.map((n) => `    ${n} : ${dates[n] ?? 'date non lue'}`)];
}

export function mentionFiness({ structures, activites, version }) {
  const lignes = [
    `Fichiers FINESS+ convertis en CSV et JSON par referentiels-sante ${version}`,
    '',
    'Source : Agence du Numérique en Santé (ANS), flux FINESS+ publié sur data.gouv.fr',
    '  FINESS - Structures : https://www.data.gouv.fr/datasets/finess-structures-1',
    '  FINESS - Activités : https://www.data.gouv.fr/datasets/finess-activites-1',
    'Licence : Licence Ouverte 2.0, https://www.data.gouv.fr/pages/legal/licences/etalab-2.0',
    "Libellés des codes : Nomenclatures des objets de santé (NOS) de l'ANS, https://mos.esante.gouv.fr/NOS/",
    ...lignesTablesNos(structures, activites),
    `Instantané des structures : ${basename(structures.source)}, produit par l'ANS le ${jour(structures.generatedAt)}`,
  ];
  if (activites) {
    lignes.push(`Instantané des activités : ${basename(activites.source)}, produit par l'ANS le ${jour(activites.generatedAt)}`);
  }
  lignes.push(
    `Conversion : ${jour(structures.converti)}`,
    '',
    "Ces fichiers transforment les données de l'ANS : tables mises à plat, libellés des nomenclatures",
    "NOS ajoutés, format de l'ancienne extraction reconstitué. L'ANS ne les a ni produits ni validés.",
    `Description des colonnes : ${DEPOT}/blob/main/docs/FINESS.md`,
    `Outil et signalements : ${DEPOT}`,
  );
  return lignes.join(FIN) + FIN;
}

export function mentionBdpm({ resume, version }) {
  const fichiers = Object.values(resume.fichiers ?? {}).map((f) =>
    `  ${f.fichier} (${f.source}) : ${f.miseAJour ? `mis à jour le ${f.miseAJour}` : 'date non affichée par la source'}`);
  return [
    `Base de données publique des médicaments convertie en CSV par referentiels-sante ${version}`,
    '',
    'Source : Base de données publique des médicaments (ANSM, HAS, UNCAM)',
    `  ${resume.source}`,
    '  Jeu data.gouv.fr : https://www.data.gouv.fr/datasets/base-de-donnees-publique-des-medicaments-base-officielle',
    'Licence : Licence Ouverte',
    `Dernière mise à jour de la base : ${jour(resume.miseAJour)}, date affichée sur sa page de téléchargement`,
    ...(fichiers.length ? ['Mise à jour de chaque fichier, selon la même page :', ...fichiers] : []),
    `Données téléchargées à la source le ${jour(resume.converti)}`,
    '',
    "Ces fichiers transforment les fichiers d'origine : en-têtes ajoutés, encodage UTF-8, dates au",
    'format ISO, nombres normalisés. Les producteurs de la base ne les ont ni produits ni validés.',
    `Description des colonnes : ${DEPOT}/blob/main/docs/AUTRES-REFERENTIELS.md`,
    `Outil et signalements : ${DEPOT}`,
  ].join(FIN) + FIN;
}

export function ecrireMention(type, dossier, version) {
  const lire = (nom) => {
    const chemin = join(dossier, nom);
    return existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : null;
  };
  let texte;
  if (type === 'finess') {
    const structures = lire('structures-resume.json');
    if (!structures) throw new Error(`structures-resume.json absent de ${dossier}`);
    texte = mentionFiness({ structures, activites: lire('activites-resume.json'), version });
  } else if (type === 'bdpm') {
    const resume = lire('bdpm-resume.json');
    if (!resume) throw new Error(`bdpm-resume.json absent de ${dossier}`);
    texte = mentionBdpm({ resume, version });
  } else {
    throw new Error(`type inconnu : ${type} (finess ou bdpm)`);
  }
  const chemin = join(dossier, 'MENTION-SOURCE.txt');
  writeFileSync(chemin, texte);
  return chemin;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [type, dossier] = process.argv.slice(2);
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  console.log(`${ecrireMention(type, dossier, version)} écrit`);
}
