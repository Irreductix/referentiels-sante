// Compare les replis embarqués aux pages des sources ; avec `ecrire`, met src/replis.json à jour.
// Une nouvelle version n'est retenue que si tous ses fichiers répondent.

import { REPLIS, FICHIER_REPLIS, ecrireReplis } from '../replis.js';
import { SOURCES, trouverFichiers } from '../cnam/index.js';
import { trouverArchives } from '../ccam/index.js';
import { trouverArchive } from '../ghs/index.js';
import { sonder, estDonnee } from './index.js';

const nomFichier = (url) => decodeURIComponent(String(url).split('/').pop());

export async function actualiserReplis({ ecrire = false, fichier = FICHIER_REPLIS, replis = structuredClone(REPLIS), journal = () => {}, lecteurs = {} } = {}) {
  const lire = { cnam: trouverFichiers, ccam: trouverArchives, ghs: trouverArchive, sonder, ...lecteurs };
  const changements = [];
  const ecartees = [];

  const proposer = async (source, avant, apres, urls, appliquer) => {
    for (const url of urls) {
      const s = await lire.sonder(url);
      if (!estDonnee(s)) {
        ecartees.push({ source, avant, apres, motif: `${nomFichier(url)} ne répond pas (${s.statut ?? s.erreur})` });
        return;
      }
    }
    appliquer();
    changements.push({ source, avant, apres });
  };
  const essayer = async (source, fn) => {
    try {
      await fn();
    } catch (e) {
      ecartees.push({ source, motif: e.message });
    }
  };

  for (const nom of Object.keys(SOURCES)) {
    await essayer(nom, async () => {
      const t = await lire.cnam(nom, { journal });
      const connue = replis.cnam[nom];
      if (t.repli || t.version === connue?.version) return;
      await proposer(nom, connue?.version ?? 'aucune', t.version, t.fichiers.map((f) => f.url), () => {
        replis.cnam[nom] = { version: t.version, fichiers: t.fichiers.map(({ nom: n, url }) => ({ nom: n, url })) };
      });
    });
  }

  await essayer('ccam', async () => {
    const c = await lire.ccam({ journal });
    if (c.repli || c.version === replis.ccam.version) return;
    await proposer('ccam', replis.ccam.version, c.version, c.archives, () => {
      replis.ccam = { version: c.version, archives: c.archives };
    });
  });

  // Les campagnes connues, plus la suivante : une nouvelle campagne n'est retenue que si son archive porte son année.
  const annees = Object.keys(replis.ghs).map(Number);
  for (const annee of [...annees, Math.max(...annees) + 1]) {
    await essayer(`ghs ${annee}`, async () => {
      const g = await lire.ghs(annee, { journal });
      const connue = replis.ghs[annee];
      if (g.repli || !g.url || g.url === connue) return;
      if (!connue && !nomFichier(g.url).includes(`ghs_web_${annee}`)) return;
      await proposer(`ghs ${annee}`, connue ? nomFichier(connue) : 'aucune', nomFichier(g.url), [g.url], () => {
        replis.ghs[annee] = g.url;
      });
    });
  }

  if (ecrire && changements.length) ecrireReplis(replis, fichier);
  return { changements, ecartees, replis, ecrit: ecrire && changements.length > 0 };
}

export function formaterReplis({ changements, ecartees, ecrit }) {
  const lignes = [];
  if (!changements.length) lignes.push('Versions de repli à jour.');
  else {
    lignes.push(`${changements.length} version(s) de repli à mettre à jour :`);
    for (const c of changements) lignes.push(`  ${c.source} : ${c.avant} remplacée par ${c.apres}`);
    lignes.push(ecrit ? 'src/replis.json mis à jour.' : 'Relancer avec --ecrire pour mettre à jour src/replis.json.');
  }
  if (ecartees.length) {
    lignes.push('Écartées :');
    for (const e of ecartees) lignes.push(`  ${e.source}${e.apres ? ` ${e.apres}` : ''} : ${e.motif}`);
  }
  return lignes.join('\n');
}
