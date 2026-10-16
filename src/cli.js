#!/usr/bin/env node
/**
 * Ligne de commande : télécharge les sources publiques et produit des CSV et
 * JSON propres dans un dossier de sortie.
 */

import { parseArgs } from 'node:util';

import { telechargerFlux } from './finess/sources.js';
import { chargerLibelles, libellesVides } from './finess/libelles.js';
import { convertirStructures, convertirActivites } from './finess/convertir.js';
import { exporterTables, TABLES } from './nos/index.js';
import { exporterTarifs, ARCHIVES } from './ghs/index.js';
import { exporterCcam, convertirTableDbf } from './ccam/index.js';
import { exporterCim10, EDITIONS } from './cim10/index.js';
import { exporterBdpm } from './bdpm/index.js';
import { exporterTableCnam, SOURCES } from './cnam/index.js';
import { exporterCommunes } from './communes/index.js';
import { verifierTout, formaterRapport } from './verifier/index.js';
import { actualiserReplis, formaterReplis } from './verifier/replis.js';
import { extraireZip } from './commun/zip.js';

const AIDE = `referentiels-sante : référentiels publics de la santé en CSV propres, et en JSON pour FINESS+, NOS, CIM-10 et GHS

Usage
  referentiels-sante finess    [--activites] [--structures <fichier>] [--fichier-activites <fichier>]
                               [--mensuel] [--sans-libelles] [--sans-jsonl] [--sans-historique]
  referentiels-sante nos       [TABLE ...]     (défaut : les tables utilisées pour FINESS)
  referentiels-sante ghs       [--annee 2026 | --source <zip ou URL>]
  referentiels-sante ccam      [--brut] [--date AAAA-MM-JJ] [--dossier-dbf <dossier>]
  referentiels-sante cim10     [--edition 2025 | --source <zip ou xml>]
  referentiels-sante bdpm      [FICHIER ...]   (défaut : les dix fichiers pris en charge : specialites, presentations, compositions…)
  referentiels-sante nabm | lpp | ucd          tables de codage de l'Assurance Maladie
  referentiels-sante communes  [--annee 2026]  code officiel géographique de l'INSEE : communes, arrondissements, outre-mer
  referentiels-sante dbf       <fichier.dbf | archive.zip> [--encodage cp850|latin1|utf8]
  referentiels-sante verifier  [SOURCE ...]    contrôle que pages et fichiers sources répondent (code de sortie 1 sinon)
  referentiels-sante replis    [--ecrire]      compare les versions de repli aux pages ; --ecrire met src/replis.json à jour

Options communes
  --sortie <dossier>   dossier de sortie (défaut : data/<commande>)
  --cache <dossier>    cache des téléchargements (défaut : .cache)
  --forcer             retélécharger même si le fichier est déjà en cache
  --silencieux         ne rien afficher sauf les erreurs

Exemples
  referentiels-sante finess                     flux quotidien structures : établissements, entités juridiques, groupements
  referentiels-sante finess --activites         idem plus le flux activités (autorisations, capacités)
  referentiels-sante nos TRE_R66-CategorieEtablissement
  referentiels-sante ghs --annee 2026
  referentiels-sante ccam                       actes, activités, phases, tarifs par grille, chapitres, notes
  referentiels-sante ccam --date 2025-06-30     la CCAM telle qu'en vigueur à cette date
  referentiels-sante cim10 --edition 2025       codes CIM-10 FR à usage PMSI avec hiérarchie et rubriques
  referentiels-sante bdpm specialites presentations
  referentiels-sante communes                   codes et libellés des communes, pour lire les codes commune de FINESS
  referentiels-sante dbf LPP_fiche_tot901.dbf   n'importe quelle table DBF vers CSV
`;

const options = {
  sortie: { type: 'string' },
  cache: { type: 'string', default: '.cache' },
  forcer: { type: 'boolean', default: false },
  silencieux: { type: 'boolean', default: false },
  activites: { type: 'boolean', default: false },
  structures: { type: 'string' },
  'fichier-activites': { type: 'string' },
  mensuel: { type: 'boolean', default: false },
  'sans-libelles': { type: 'boolean', default: false },
  'sans-jsonl': { type: 'boolean', default: false },
  'sans-historique': { type: 'boolean', default: false },
  annee: { type: 'string' },
  source: { type: 'string' },
  edition: { type: 'string' },
  date: { type: 'string' },
  brut: { type: 'boolean', default: false },
  'dossier-dbf': { type: 'string' },
  encodage: { type: 'string', default: 'cp850' },
  ecrire: { type: 'boolean', default: false },
  aide: { type: 'boolean', short: 'h', default: false },
};

async function principal(argv) {
  const { values, positionals } = parseArgs({ args: argv, options, allowPositionals: true });
  const [commande, ...reste] = positionals;
  if (values.aide || !commande || commande === 'aide') { process.stdout.write(AIDE); return 0; }
  const journal = values.silencieux ? () => {} : (m) => process.stderr.write(`${m}\n`);
  const commun = { cache: values.cache, forcer: values.forcer, journal };

  if (commande === 'finess') {
    const sortie = values.sortie ?? 'data/finess';
    const periodicite = values.mensuel ? 'mensuel' : 'journalier';
    const libelles = values['sans-libelles']
      ? libellesVides()
      : await chargerLibelles({ ...commun, activites: values.activites });
    const entree = values.structures ?? await telechargerFlux('structures', { ...commun, periodicite });
    journal(`conversion des structures : ${entree}`);
    const resume = await convertirStructures({ entree, sortie, libelles, jsonl: !values['sans-jsonl'], historique: !values['sans-historique'], journal });
    journal(`${resume.entitesJuridiques} entités juridiques, ${resume.etablissements} établissements, ${resume.gcc} groupements conventionnels, ${resume.gco} groupements de coopération en ${resume.dureeSecondes} s`);
    if (values.activites) {
      const entreeActivites = values['fichier-activites'] ?? await telechargerFlux('activites', { ...commun, periodicite });
      journal(`conversion des activités : ${entreeActivites}`);
      const r = await convertirActivites({ entree: entreeActivites, sortie, libelles, jsonl: !values['sans-jsonl'], journal });
      journal(`${r.activitesAutorisees} activités autorisées, ${r.activitesExercees} activités exercées en ${r.dureeSecondes} s`);
    }
    journal(`fichiers écrits dans ${sortie}`);
    return 0;
  }

  if (commande === 'nos') {
    const noms = reste.length ? reste : Object.values(TABLES);
    const resume = await exporterTables(noms, { ...commun, sortie: values.sortie ?? 'data/nos' });
    for (const r of resume) journal(`${r.table} : ${r.concepts} concepts (mise à jour ${r.dateMaj ?? 'inconnue'})`);
    return 0;
  }

  if (commande === 'ghs') {
    const annee = values.annee ? Number(values.annee) : (values.source ? undefined : Math.max(...Object.keys(ARCHIVES).map(Number)));
    const resume = await exporterTarifs({ ...commun, annee, source: values.source, sortie: values.sortie ?? 'data/ghs' });
    journal(`${resume.ghs} lignes GHS, ${resume.ght} GHT, ${resume.supplements} suppléments (dates d'effet : ${resume.datesEffet.join(', ')})`);
    return 0;
  }

  if (commande === 'communes') {
    const annee = values.annee ? Number(values.annee) : undefined;
    const resume = await exporterCommunes({ ...commun, annee, sortie: values.sortie ?? 'data/communes' });
    journal(`${resume.communes} communes, ${resume.arrondissements} arrondissements municipaux, ${resume.deleguees} communes déléguées ou associées, ${resume.outremer} communes des collectivités d'outre-mer (code officiel géographique ${resume.annee})`);
    return 0;
  }

  if (commande === 'ccam') {
    const resume = await exporterCcam({ ...commun, sortie: values.sortie ?? 'data/ccam', brut: values.brut, dateReference: values.date ?? null, dossierDbf: values['dossier-dbf'] });
    journal(`CCAM ${resume.version ?? ''}${resume.dateReference ? ` au ${resume.dateReference}` : ''} : ${resume.actes} actes, ${resume.activites} activités, ${resume.phases} phases, ${resume.tarifsGrilles} prix par grille, ${resume.notes} notes en ${resume.dureeSecondes} s`);
    return 0;
  }

  if (commande === 'verifier') {
    const rapport = await verifierTout({ sources: reste, journal });
    process.stdout.write(formaterRapport(rapport) + '\n');
    return rapport.ok ? 0 : 1;
  }

  if (commande === 'replis') {
    const bilan = await actualiserReplis({ ecrire: values.ecrire, journal });
    process.stdout.write(formaterReplis(bilan) + '\n');
    return 0;
  }

  if (commande === 'cim10') {
    const edition = values.edition ? Number(values.edition) : (values.source ? undefined : Math.max(...Object.keys(EDITIONS).map(Number)));
    const resume = await exporterCim10({ ...commun, edition, source: values.source, sortie: values.sortie ?? 'data/cim10' });
    journal(`${resume.version ?? 'CIM-10'} : ${resume.codes} codes (${Object.entries(resume.parNiveau).map(([k, v]) => `${v} ${k}`).join(', ')})`);
    return 0;
  }

  if (commande === 'bdpm') {
    const resume = await exporterBdpm({ ...commun, fichiers: reste, sortie: values.sortie ?? 'data/bdpm' });
    journal(`${Object.keys(resume.fichiers).length} fichiers convertis dans ${values.sortie ?? 'data/bdpm'}`);
    return 0;
  }

  if (commande in SOURCES) {
    const resume = await exporterTableCnam(commande, { ...commun, sortie: values.sortie, encodage: values.encodage });
    journal(`${resume.libelle} version ${resume.version} : ${resume.tables.length} table(s), ${resume.tables.reduce((n, t) => n + t.lignes, 0)} lignes`);
    return 0;
  }

  if (commande === 'dbf') {
    if (!reste.length) { process.stderr.write('indiquez un fichier .dbf ou une archive .zip\n'); return 2; }
    const sortie = values.sortie ?? 'data/dbf';
    for (const fichier of reste) {
      const dbfs = /\.zip$/i.test(fichier)
        ? await extraireZip(fichier, `${values.cache}/dbf`, { filtre: (n) => /\.dbf$/i.test(n) })
        : [fichier];
      for (const d of dbfs) await convertirTableDbf(d, sortie, { encodage: values.encodage, journal });
    }
    return 0;
  }

  process.stderr.write(`commande inconnue : ${commande}\n\n${AIDE}`);
  return 2;
}

// On fixe le code de sortie sans forcer l'arrêt : un arrêt brutal pendant qu'un
// téléchargement se ferme provoque une assertion de libuv sous Windows.
principal(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (erreur) => { process.stderr.write(`erreur : ${erreur.message}\n`); process.exitCode = 1; },
);
