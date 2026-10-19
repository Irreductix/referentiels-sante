import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

vm.runInThisContext(readFileSync(new URL('../site/nomenclatures/nomenclatures.js', import.meta.url), 'utf8'));
const N = globalThis.Nomenclatures;

// Extraits au format des fichiers du convertisseur (colonnes réelles, lignes réduites).
const CCAM_ACTES = [
  'code;libelle_court;libelle_long;type;type_libelle;chapitre_numero;chapitre_libelle;chapitre_chemin;code_menu;remboursement;remboursement_libelle;frais_deplacement;frais_deplacement_libelle;entente_prealable;sexe;date_creation;date_effet;date_fin;date_arrete;date_jo;date_modification;nb_activites;activites;regroupement;regroupement_libelle;tarif_base;icr;classant;version',
  'JJFA005;ovariectomie bilat. laparo;Ovariectomie bilatérale, par laparotomie;0;Acte isole;08.04.03.02;Exérèse de l\'ovaire;APPAREIL URINAIRE ET GÉNITAL > Exérèse de l\'ovaire;41;1;Acte remboursable;N;Interdit les frais de deplacement;N;2;2005-03-01;2026-01-01;;2024-06-20;2024-06-21;2025-12-08;2;1|4;ADC;Actes de chirurgie;172.58;275;Y;08400',
  'AANL001;irrad. encéph. stéréotaxiq;Irradiation encéphalique en conditions stéréotaxiques avec cadre effractif, en dose unique;0;Acte isole;17.04.02.04;Techniques spéciales;ACTES SANS PRÉCISION TOPOGRAPHIQUE > Techniques spéciales;1559;2;Acte non remboursable;A;Autorise les frais de deplacement;N;0;2005-03-01;2010-05-01;2010-05-01;2010-02-11;2010-04-04;2010-04-13;1;1;ATM;Acte technique medical;0;289;;08400',
  'BFGA004;extraction cristallin phaco;Extraction extracapsulaire du cristallin par phakoémulsification, avec implantation de cristallin artificiel dans la chambre postérieure de l\'oeil;0;Acte isole;02.02.04.01;Extraction du cristallin;OEIL > Extraction du cristallin;1;1;Acte remboursable;N;Interdit les frais de deplacement;O;0;2005-03-01;2023-04-01;;2023-03-10;2023-03-20;2025-12-08;2;1|4;ADC;Actes de chirurgie;271.7;236;Y;08400',
].join('\n') + '\n';
const CCAM_PHASES = [
  'code_phase;code_activite;code_acte;activite;phase;phase_libelle;tarif_base;supplement;coefficient;nb_seances;age_min;age_max;unite_oeuvre;paiement;paiement_libelle;icr;classant;date_modification',
  'JJFA00510;JJFA0051;JJFA005;1;0;Phase par defaut;172.58;0;0;0;0;0;5.3;;;275;Y;2025-12-08',
  'JJFA00540;JJFA0054;JJFA005;4;0;Phase par defaut;104.76;0;0;0;0;0;5.3;;;78;Y;2025-12-08',
].join('\n') + '\n';
const NABM_FICHE = [
  'code_nabm;nom_court;nom_long;date_debut;date_fin;rmo1;rmo2;rmo3;rmo4;rmo5;arbo1;arbo2;arbo3;arbo4;arbo5;place;comment1;comment2;comment3;comment4;comment5;comment6;comment7;comment8;comment9;comment10',
  '552;GLUCOSE;GLUCOSE (GLYCEMIE);1990-01-01;;;;;;;0;0;0;0;0;1;;;;;;;;;;',
  '9927;COMPLEMENT A LA COTATION MINIMALE DE VALEUR B 17(SANG);COMPLEMENT A LA COTATION MINIMALE DE VALEUR B 17;2019-09-02;2024-09-10;;;;;;0;0;0;0;0;32;;;;;;;;;;',
].join('\n') + '\n';
const NABM_HISTO = [
  'code_nabm;date_effet;entente;cond_remb;max_factu;code_regle;max_regle;indication;reserve;init_bio;examen;lc1;coef1;lc2;coef2;lc3;coef3;lc4;coef4;lc5;coef5;spec1;spec2;spec3;spec4;spec5;spec6;spec7;spec8;spec9;spec10',
  '552;2009-02-08;;;1;;0;;;;1;B;500;;0;;0;;0;;0;30;39;40;0;0;0;0;0;0;0',
  '552;2000-01-01;1;;1;;0;;;;1;B;700;;0;;0;;0;;0;30;39;40;0;0;0;0;0;0;0',
  '9927;2019-09-19;;;1;;0;;;;;B;1700;;0;;0;;0;;0;30;39;40;0;0;0;0;0;0;0',
].join('\n') + '\n';
const LPP_FICHE = [
  'code_tips;nom_court;rmo1;rmo2;rmo3;rmo4;rmo5;date_fin;age_max;type_prest;indication;arbo1;arbo2;arbo3;arbo4;arbo5;arbo6;arbo7;arbo8;arbo9;arbo10;place;prothese;old_code',
  '1393295;PANSEMENT EN FIBRES DE CMC, >OU= 120 CM2 ET < 156 CM2, BOITE DE 16;;;;;;;0;A;O;1;3;1;7;6;0;0;0;0;0;41;;',
  '1128104;OXYGENOTHERAPIE A COURT TERME, OCT 3.00;;;;;;;0;S;O;1;1;1;2;5;2;0;0;0;0;1;;101D01.121',
  '1301347;PANSEMENTS HYDROCELLULAIRES, > OU = 200 CM2 ET < 225 CM2, BOITE DE 16;;;;;;2016-09-01;0;A;O;1;3;1;7;6;0;0;0;0;0;5;;',
  '9446476;CODE LPP HOMONYME D\'UNE UCD;;;;;;;0;A;O;1;1;1;1;1;0;0;0;0;0;1;;',
].join('\n') + '\n';
const LPP_HISTO = [
  'code_tips;debutvalid;finhisto;nat_prest;entente;arrete;jo;pudevis;tarif;majo_dom1;majo_dom2;majo_dom3;majo_dom4;qte_max;mt_max;pureglemen;pecp01;pecp02;pecp03;majo_dom5;majo_dom6',
  '1393295;2023-07-15;;RJT;N;2023-06-29;2023-06-29;0;42.16;1.3;1.15;1.15;1.351;0;0;42.16;00;00;00;1.4;1.36',
  '1393295;2020-01-01;2023-07-14;RJT;N;2019-12-01;2019-12-02;0;45;1.3;1.15;1.15;1.351;0;0;45;00;00;00;1.4;1.36',
  '1128104;2023-07-07;;AAR;O;2023-07-03;2023-07-06;0;44.46;1.3;1.15;1.2;1.2;0;0;44.46;00;00;00;1.4;1.36',
].join('\n') + '\n';
const UCD_TOTAL = [
  'code_ucd;liste;nom_court;dt_dinscri;dt_finscri;motif_fin;labo_exp;dt_sourdoc;dt_apprix;prix_ht;prix_ttc;t_facture;marge_ttc;dt_aptaux;taux;dt_dcousup;dt_fcousup;dt_apmajo;majo_971;majo_972;majo_973;majo_974;dt_dlprive;dt_flprive;dt_dlpubli;dt_flpubli;nom_long1;nom_long2;etat;cod_forme;forme;cod_cforme;cpmtforme;ddd;d_administ;par_voie;cod_atc;classe_atc;cod_ephmra;cla_ephmra;rh;ph;pih;sp;ps',
  '9446476;S;GAMUNEX 100MG/ML SOL INJ FL 200ML GAMUNEX 100MG/ML SOL INJ FL 200ML;2019-12-25;;;GRIFOLS FRANCE;2024-12-05;2024-11-01;1305;1332.41;;;;;;;2019-12-25;1.16;1.16;1.16;1.16;2019-12-25;;2019-12-25;;GAMUNEX 100MG/ML SOL INJ FL 200ML GAMUNEX 100MG/ML SOL INJ FL 200ML;;D;48;SOLUTION;296;SOLUTION POUR PERFUSION;;;;J06BA02;IMMUNOGLOBULINES HUMAINES POLYVALENTES;J06C;IMMUNOGLOBULINES;N;O;N;N;N',
  '9446476;R;GAMUNEX 100MG/ML SOL INJ FL 200ML GAMUNEX 100MG/ML SOL INJ FL 200ML;2019-12-25;;;GRIFOLS FRANCE;2024-12-05;2024-11-01;1305;1332.41;N;22;2019-12-25;100;;;2019-12-25;1.16;1.16;1.16;1.16;;;;;GAMUNEX 100MG/ML SOL INJ FL 200ML GAMUNEX 100MG/ML SOL INJ FL 200ML;;D;48;SOLUTION;296;SOLUTION POUR PERFUSION;;;;J06BA02;IMMUNOGLOBULINES HUMAINES POLYVALENTES;J06C;IMMUNOGLOBULINES;N;O;N;N;N',
  '9437951;R;BALCOGA 20 MG CPR;2018-10-31;2025-07-04;RADIATION;SANDOZ;2025-07-04;2021-04-01;1.294;1.32;N;22;2018-10-31;100;;;2018-10-31;1.16;1.16;1.16;1.16;;;;;BALCOGA 20 MG CPR;;S;1;COMPRIME;;;;;;L01XE01;IMATINIB;L01H;INHIBITEURS;N;O;N;N;N',
].join('\n') + '\n';
const UCD_PRIX = [
  'code_ucd;liste;design;condit;dt_appli;prix_ht;prix_ttc;t_facture;dt_source',
  '9446476;R;GAMUNEX 100MG/ML SOL INJ FL 200ML;GAMUNEX;2024-11-01;1305;1332.41;N;2024-10-29',
  '9446476;R;GAMUNEX 100MG/ML SOL INJ FL 200ML;GAMUNEX;2021-10-01;1100;1123.1;N;2020-12-29',
].join('\n') + '\n';

const tout = () => N.construire([
  N.lireFichier(CCAM_ACTES, 'ccam-actes.csv'), N.lireFichier(CCAM_PHASES, 'ccam-phases.csv'),
  N.lireFichier(NABM_FICHE, 'nabm_fiche_tot105.csv'), N.lireFichier(NABM_HISTO, 'nabm_histo_tot105.csv'),
  N.lireFichier(LPP_FICHE, 'lpp_fiche_tot906.csv'), N.lireFichier(LPP_HISTO, 'lpp_histo_tot906.csv'),
  N.lireFichier(UCD_TOTAL, 'ucd_total_00807_20261016.csv'), N.lireFichier(UCD_PRIX, 'ucd_histo_prix_00807_20261016.csv'),
]);

test('lireCode : CCAM avec activité et phase, NABM complété, sept et treize chiffres, dates', () => {
  assert.deepEqual(N.lireCode('jjfa005'), { type: 'ccam', valeur: 'JJFA005', activite: '', phase: '' });
  assert.deepEqual(N.lireCode('JJFA00540'), { type: 'ccam', valeur: 'JJFA005', activite: '4', phase: '0' });
  assert.deepEqual(N.lireCode('JJFA005 1 0'), { type: 'ccam', valeur: 'JJFA005', activite: '1', phase: '0' });
  assert.deepEqual(N.lireCode('552'), { type: 'nabm', valeur: '0552', complete: true });
  assert.deepEqual(N.lireCode('1393295'), { type: 'sept', valeur: '1393295' });
  assert.deepEqual(N.lireCode('3400894464761'), { type: 'ucd13', valeur: '9446476', ucd13: '3400894464761' });
  assert.equal(N.lireCode('3400949497294').type, 'cip13');
  assert.equal(N.lireCode('abc').type, 'illisible');
  assert.equal(N.cleEan13Valide('3400894464761'), true);
  assert.equal(N.cleEan13Valide('3400894464762'), false);
  assert.equal(N.lireDate('15/03/2026'), '2026-03-15');
  assert.equal(N.lireDate('2026-03-15T10:00'), '2026-03-15');
  assert.equal(N.lireDate('20260315'), '2026-03-15');
  assert.equal(N.lireDate('31/02/2026'), '2026-02-31', 'le jour n\'est pas contrôlé au-delà de 31');
  assert.equal(N.lireDate('Ovariectomie'), '');
});

test('reconnaitreFichier et construire : les huit fichiers sont reconnus à leurs colonnes, ucd_maj et les autres écartés', () => {
  assert.equal(N.reconnaitreFichier(CCAM_ACTES, 'ccam-actes.csv').type, 'ccam.actes');
  assert.equal(N.reconnaitreFichier(UCD_TOTAL, 'ucd_maj_00807_20261016.csv').type, 'ignore');
  assert.equal(N.reconnaitreFichier('code_phase;code_acte;note\nX;Y;Z\n', 'ccam-notes.csv').type, 'ignore');
  assert.equal(N.reconnaitreFichier('a;b;c\n1;2;3\n', 'liste.csv').type, 'inconnu');
  const base = tout();
  assert.equal(base.ccam.version, '08400');
  assert.equal(base.ccam.nombre, 3);
  assert.equal(base.nabm.version, '105');
  assert.ok(base.nabm.actes.has('0552'), 'le code NABM numérique est rétabli sur quatre chiffres');
  assert.equal(base.lpp.version, '906');
  assert.equal(base.ucd.version, '00807 du 16/10/2026');
  assert.equal(base.ucd.codes.get('9446476')[0].libelle, 'GAMUNEX 100MG/ML SOL INJ FL 200ML', 'le libellé écrit deux fois est dédoublé');
  assert.equal(base.fichiers.length, 8);
});

test('chercher : par début de code et par mots, à une date', () => {
  const base = tout();
  assert.deepEqual(N.chercher(base, 'JJFA', '2026-03-15').map((f) => f.code), ['JJFA005']);
  const cristallin = N.chercher(base, 'cristallin phako', '2026-03-15');
  assert.equal(cristallin.length, 1);
  assert.equal(cristallin[0].tarif, '271.7');
  assert.ok(cristallin[0].precisions.includes('entente préalable'));
  assert.deepEqual(N.chercher(base, '9446476', '2026-03-15').map((f) => f.nomenclature), ['lpp', 'ucd']);
  assert.deepEqual(N.chercher(base, '9446476', '2026-03-15', { nomenclature: 'ucd' }).map((f) => f.nomenclature), ['ucd']);
  const glucose = N.chercher(base, 'glucose', '2005-01-01')[0];
  assert.equal(glucose.code, '0552');
  assert.equal(glucose.tarif + ' ' + glucose.unite, '7 B', 'cotation en vigueur en 2005');
  assert.ok(glucose.precisions.includes('entente préalable'));
  assert.equal(N.chercher(base, 'pansement hydrocellulaire', '2026-03-15')[0].statut, 'fermé le 01/09/2016');
});

test('controler : CCAM (activité, fermeture, non remboursable), NABM, LPP et UCD à la date de chaque ligne', () => {
  const base = tout();
  const liste = N.lireListe([
    'Acte;Date de l\'acte;Libellé de l\'acte',
    'JJFA005;15/03/2026;Ovariectomie',
    'JJFA00540;15/03/2026;Ovariectomie, anesthésie',
    'JJFA005 2 0;15/03/2026;Ovariectomie',
    'AANL001;15/03/2026;Irradiation',
    'AANL001;01/02/2009;Irradiation',
    '552;15/03/2026;Glucose',
    '9927;15/03/2026;Complément',
    '1393295;15/03/2026;Pansement CMC',
    '1393295;01/06/2021;Pansement CMC',
    '1128104;01/01/2020;Oxygénothérapie',
    '3400894464761;15/03/2026;Gamunex',
    '3400894464762;15/03/2026;Gamunex',
    '9437951;15/03/2026;Balcoga',
    '9446476;15/03/2026;Gamunex',
    '3400949497294;15/03/2026;Doliprane',
    'ZZZZ999;;Inconnu',
    'abc;15/03/2026;Illisible',
  ].join('\n'));
  assert.deepEqual(liste.colonnes, { date: 1, nom: 2, code: 0 });
  const r = N.controler(base, liste, { date: '2026-10-19' });
  const par = (ligne) => r.resultats.find((x) => x.ligne === ligne);
  assert.equal(par(2).gravite, 0);
  assert.equal(par(2).tarif + ' ' + par(2).unite, '172.58 €');
  assert.equal(par(3).tarif, '104.76', 'tarif de l\'activité 4 lu dans les phases');
  assert.match(par(4).resultat, /activité 2 inexistante.*activités : 1, 4/);
  assert.equal(par(4).gravite, 3);
  assert.equal(par(5).resultat, 'fermé le 01/05/2010');
  assert.equal(par(6).statut, 'en vigueur');
  assert.equal(par(6).gravite, 2, 'acte non remboursable');
  assert.equal(par(7).code, '0552');
  assert.equal(par(7).tarif + ' ' + par(7).unite, '5 B');
  assert.equal(par(7).gravite, 0);
  assert.equal(par(8).resultat, 'fermé le 10/09/2024');
  assert.equal(par(9).tarif, '42.16');
  assert.equal(par(10).tarif, '45', 'version tarifaire de 2021');
  assert.equal(par(11).statut, 'tarifé à partir du 07/07/2023');
  assert.equal(par(11).gravite, 2);
  assert.equal(par(12).nomenclature, 'ucd');
  assert.equal(par(12).tarif + ' ' + par(12).unite, '1332.41 € TTC');
  assert.ok(par(12).precisions.some((p) => /liste rétrocession, en sus SMR/.test(p)));
  assert.equal(par(12).gravite, 0);
  assert.ok(par(13).pistes.some((p) => /clé de contrôle/.test(p)));
  assert.equal(par(13).gravite, 2);
  assert.match(par(14).resultat, /radié le 04\/07\/2025/);
  assert.ok(par(14).precisions.includes('supprimé du marché'));
  assert.match(par(15).resultat, /présent dans LPP et UCD/);
  assert.ok(par(15).gravite >= 1);
  assert.ok(par(15).pistes.some((p) => /UCD : GAMUNEX/.test(p)), 'l\'homonyme est donné en piste');
  assert.match(par(16).resultat, /CIP d'une présentation/);
  assert.match(par(17).resultat, /code inconnu \(CCAM 08400\)/);
  assert.equal(par(17).date, '2026-10-19', 'sans date sur la ligne, la date de référence');
  assert.equal(par(18).resultat, 'code illisible');
  assert.equal(r.comptes.lignes, 17);
  const csv = N.rapportCsv(r);
  assert.ok(csv.startsWith('﻿ligne;libelle_liste;code_saisi;code;nomenclature;date;'));
  assert.equal(csv.split('\r\n').length, 19);
});

test('controler : nomenclature forcée, nomenclature non chargée, liste sans en-tête', () => {
  const base = N.construire([N.lireFichier(LPP_FICHE, 'lpp_fiche_tot906.csv')]);
  const r = N.controler(base, N.lireListe('9446476\n1393295\n0552\nJJFA005\n'), { date: '2026-03-15', nomenclature: 'lpp' });
  const par = (ligne) => r.resultats.find((x) => x.ligne === ligne);
  assert.equal(par(1).nomenclature, 'lpp', 'forcée en LPP, l\'homonyme UCD n\'est pas cherché');
  assert.ok(par(1).pistes.some((p) => /lpp_histo/.test(p)), 'sans historique, pas de tarif mais une piste');
  assert.match(par(3).resultat, /format inattendu pour la LPP/);
  const r2 = N.controler(base, N.lireListe('0552\nJJFA005\n'), { date: '2026-03-15' });
  assert.equal(r2.resultats.find((x) => x.ligne === 1).resultat, 'NABM non chargée');
  assert.equal(r2.resultats.find((x) => x.ligne === 2).resultat, 'CCAM non chargée');
  assert.equal(r2.comptes.aVerifier, 2);
});
