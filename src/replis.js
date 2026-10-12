// Adresses de repli embarquées, utilisées quand une page de téléchargement ne répond plus.
// Tenues dans replis.json pour que la commande `replis --ecrire` puisse les mettre à jour.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FICHIER_REPLIS = fileURLToPath(new URL('./replis.json', import.meta.url));

export const lireReplis = (fichier = FICHIER_REPLIS) => JSON.parse(readFileSync(fichier, 'utf8'));

export const REPLIS = lireReplis();

export function ecrireReplis(replis, fichier = FICHIER_REPLIS) {
  writeFileSync(fichier, `${JSON.stringify(replis, null, 2)}\n`);
}
