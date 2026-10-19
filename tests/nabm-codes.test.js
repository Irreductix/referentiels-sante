import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { construireDbf } from './_dbf.js';
import { convertirTableDbf } from '../src/ccam/index.js';
import { FORMATS } from '../src/cnam/index.js';

test('tables NABM : le code numérique de la source sort sur quatre chiffres', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'nabm-'));
  try {
    const champs = [{ nom: 'CODE_NABM', type: 'N', longueur: 4 }, { nom: 'NOM_COURT', type: 'C', longueur: 12 }, { nom: 'PLACE', type: 'N', longueur: 3 }];
    writeFileSync(join(dossier, 'NABM_FICHE_TOT105.dbf'), construireDbf(champs, [{ CODE_NABM: 552, NOM_COURT: 'GLUCOSE', PLACE: 1 }, { CODE_NABM: 9927, NOM_COURT: 'COMPLEMENT', PLACE: 32 }]));
    writeFileSync(join(dossier, 'NABM_INCOMP_TOT105.dbf'), construireDbf([{ nom: 'CODE1', type: 'N', longueur: 4 }, { nom: 'CODE2', type: 'N', longueur: 4 }], [{ CODE1: 13, CODE2: 26 }]));
    const sortie = join(dossier, 'sortie');
    await convertirTableDbf(join(dossier, 'NABM_FICHE_TOT105.dbf'), sortie, { formater: FORMATS.nabm });
    await convertirTableDbf(join(dossier, 'NABM_INCOMP_TOT105.dbf'), sortie, { formater: FORMATS.nabm });
    const fiche = readFileSync(join(sortie, 'nabm_fiche_tot105.csv'), 'utf8').replace(/^﻿/, '').split('\n');
    assert.equal(fiche[0], 'code_nabm;nom_court;place');
    assert.equal(fiche[1], '0552;GLUCOSE;1', 'le code est complété, les autres nombres restent tels quels');
    assert.equal(fiche[2], '9927;COMPLEMENT;32');
    const incomp = readFileSync(join(sortie, 'nabm_incomp_tot105.csv'), 'utf8').replace(/^﻿/, '').split('\n');
    assert.equal(incomp[1], '0013;0026');
    assert.equal(FORMATS.lpp, undefined, 'les codes LPP et UCD, déjà sur sept chiffres, ne sont pas touchés');
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
