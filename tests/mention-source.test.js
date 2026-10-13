import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ecrireMention, mentionBdpm, mentionFiness } from '../.github/scripts/mention-source.mjs';
import { dossierTemp } from './_util.js';

const structures = {
  source: '.cache/finess/finess-structures-mensuel-202609.json.gz',
  generatedAt: '2026-10-01T02:07:19.019914580Z',
  converti: '2026-10-02T10:49:11.836Z',
};
const activites = { ...structures, source: '.cache/finess/finess-activites-mensuel-202609.json.gz', generatedAt: '2026-10-01T02:18:43Z' };

test('la mention FINESS cite le producteur, la licence et la date de chaque instantané', () => {
  const texte = mentionFiness({ structures, activites, version: '1.2.3' });
  assert.match(texte, /Agence du Numérique en Santé/);
  assert.match(texte, /Licence Ouverte 2\.0/);
  assert.match(texte, /finess-structures-mensuel-202609\.json\.gz, produit par l'ANS le 2026-10-01/);
  assert.match(texte, /finess-activites-mensuel-202609\.json\.gz, produit par l'ANS le 2026-10-01/);
  assert.match(texte, /Conversion : 2026-10-02/);
  assert.match(texte, /referentiels-sante 1\.2\.3/);
  assert.doesNotMatch(texte, /\.cache/, 'pas de chemin local du serveur de publication');
  assert.ok(texte.endsWith('\r\n'), 'fins de ligne Windows, pour le Bloc-notes');
});

test('la mention BDPM cite les producteurs, la licence et la date de téléchargement', () => {
  const resume = { source: 'https://base-donnees-publique.medicaments.gouv.fr/telechargement', converti: '2026-10-13T08:00:00.000Z' };
  const texte = mentionBdpm({ resume, version: '1.2.3' });
  assert.match(texte, /ANSM, HAS, UNCAM/);
  assert.match(texte, /Licence Ouverte/);
  assert.match(texte, /base-donnees-publique\.medicaments\.gouv\.fr\/telechargement/);
  assert.match(texte, /téléchargées à la source le 2026-10-13/);
});

test('ecrireMention lit les résumés du dossier et refuse un dossier incomplet', () => {
  const dossier = dossierTemp();
  writeFileSync(join(dossier, 'structures-resume.json'), JSON.stringify(structures));
  const contenu = readFileSync(ecrireMention('finess', dossier, '1.2.3'), 'utf8');
  assert.match(contenu, /Instantané des structures/);
  assert.doesNotMatch(contenu, /Instantané des activités/);
  assert.throws(() => ecrireMention('bdpm', dossier, '1.2.3'), /bdpm-resume\.json absent/);
  assert.throws(() => ecrireMention('ccam', dossier, '1.2.3'), /type inconnu/);
});
