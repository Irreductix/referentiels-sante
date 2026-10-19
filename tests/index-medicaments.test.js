import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COLONNES_INDEX, construireIndex } from '../.github/scripts/index-medicaments.mjs';

const specialites = 'cis;denomination;forme_pharmaceutique;voies_administration;statut_amm;type_procedure_amm;etat_commercialisation;date_amm;statut_bdm;numero_autorisation_europeenne;titulaires;surveillance_renforcee\n'
  + '60002283;DOLIPRANE 1000 mg, comprimé;comprimé;orale;Autorisation active;Procédure nationale;Commercialisée;1996-05-07;;;SANOFI AVENTIS FRANCE;Non\n';
const presentations = 'cis;cip7;libelle_presentation;statut_administratif;etat_commercialisation;date_declaration_commercialisation;cip13;agrement_collectivites;taux_remboursement;prix_medicament;prix_public;honoraires_dispensation;indications_remboursement\n'
  + '60002283;4949729;plaquette(s) PVC PVDC aluminium de 30 comprimé(s);Présentation active;Déclaration de commercialisation;2011-03-16;3400949497294;oui;100%;24.34;25.36;1.02;\n'
  + '99999999;1234567;boîte;Présentation active;Déclaration de commercialisation;2020-01-01;3400912345678;non;;;;;\n';
const generiques = 'identifiant_groupe;libelle_groupe;cis;type_generique;numero_tri\n1;PARACETAMOL 1000 mg - DOLIPRANE 1000 mg, comprimé;60002283;0;1\n';
const disponibilite = 'cis;cip13;code_statut;libelle_statut;date_debut;date_maj;lien_ansm\n60002283;3400949497294;2;Tension d\'approvisionnement;2026-01-05;2026-02-01;https://ansm.sante.fr/x\n';

test("construireIndex joint présentations, spécialités, génériques et disponibilité", () => {
  const index = construireIndex({ specialites, presentations, generiques, disponibilite });
  const [entete, l1, l2, vide] = index.split('\n');
  assert.equal(entete, COLONNES_INDEX.join(';'));
  assert.equal(l1, "3400949497294;4949729;60002283;DOLIPRANE 1000 mg, comprimé;comprimé;plaquette(s) PVC PVDC aluminium de 30 comprimé(s);SANOFI AVENTIS FRANCE;Autorisation active;Commercialisée;Présentation active;Déclaration de commercialisation;2011-03-16;oui;100%;24.34;25.36;1.02;PARACETAMOL 1000 mg - DOLIPRANE 1000 mg, comprimé;princeps;Tension d'approvisionnement");
  assert.ok(l2.startsWith('3400912345678;1234567;99999999;;;boîte;;;;Présentation active'), 'une présentation sans spécialité connue garde ses champs vides');
  assert.equal(vide, '');
  assert.ok(construireIndex({ specialites, presentations }).split('\n').length === 4, 'génériques et disponibilité facultatifs');
});
