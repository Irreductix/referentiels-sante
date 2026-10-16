/**
 * Libellés des codes FINESS+, chargés depuis les nomenclatures NOS de l'ANS.
 * Le flux FINESS+ ne transporte que des codes ; on y joint ici les libellés
 * officiels (catégorie d'établissement, statut juridique, ESPIC, mode de
 * fixation tarifaire, département…) et les agrégats.
 */

import { chargerTable, chargerAssociation, indexLibelles } from '../nos/index.js';
import { dateIso } from '../commun/dates.js';

const TABLES_STRUCTURES = {
  categorie: 'TRE_R66-CategorieEtablissement',
  agregatCategorie1: 'TRE_R63-AgregatCategorieEtablissementNiv1',
  agregatCategorie2: 'TRE_R64-AgregatCategorieEtablissementNiv2',
  agregatCategorie3: 'TRE_R65-AgregatCategorieEtablissement',
  statutJuridique: 'TRE_R72-FinessStatutJuridique',
  agregatStatut1: 'TRE_R68-FinessAgregatStatutJuridiqueNiv1',
  agregatStatut2: 'TRE_R69-FinessAgregatStatutJuridiqueNiv2',
  espic: 'TRE_R73-ESPIC',
  mft: 'TRE_R74-ModeFixationTarifaire',
  departement: 'TRE_G09-DepartementOM',
};

/**
 * Tables du flux activités. Les tables « smsse regulee » (r4xx) et « amm »
 * (r38x) sont celles du référentiel FINESS+ ; R274 porte les activités de
 * soins (codes 01 à 88 et A0 à T8, communs aux natures AMF, AASA et ASR).
 */
const TABLES_ACTIVITES = {
  natureActivite: 'TRE_r374-nature-activite-smsse-regulee',
  activiteSanitaire: 'TRE_R274-ActiviteSanitaireRegulee',
  modalite: 'TRE_r405-modalite-activite-smsse-regulee',
  forme: 'TRE_r406-forme-activite-smsse-regulee',
  modeFonctionnement: 'TRE_r404-mode-fonctionnement-activite-smsse-regulee',
  public: 'TRE_r403-public-activite-smsse-regulee',
  activiteSanitaireDiverse: 'JDV_j240-activite-sanitaire-diverse-regulee-finess',
  activiteSociale: 'TRE_r401-activite-sociale-regulee',
  activiteEnseignement: 'TRE_r402-activite-enseignement-regulee',
  activiteAmm: 'TRE_r381-activite-amm',
  modaliteAmm: 'TRE_r382-modalite-act-de-soin-amm',
  mentionAmm: 'TRE_r383-mention-act-de-soin-amm',
  pratiqueAmm: 'TRE_r384-pratique-therapeutique-specifique-act-de-soin-amm',
  declarationAmm: 'TRE_r385-declaration-act-de-soin-amm',
  typeActiviteSmsse: 'TRE_r392-type-act-smsse-regulee',
  eml: 'TRE_R272-EquipementMaterielLourd',
};

/**
 * Jeu de libellés vide : tout reste en codes (mode hors ligne, tests).
 * Chaque table donne deux index : `<cle>` (libellé adapté) et `<cle>Long`
 * (libellé long, celui qu'utilisait l'ancien flux FINESS).
 */
export function libellesVides() {
  const l = {};
  for (const cle of [...Object.keys(TABLES_STRUCTURES), ...Object.keys(TABLES_ACTIVITES)]) {
    l[cle] = new Map();
    l[`${cle}Long`] = new Map();
  }
  l.categorieVersAgregat = new Map();
  l.statutVersAgregat = new Map();
  l.tablesChargees = [];
  l.tablesEnEchec = [];
  l.datesTables = {};
  return l;
}

/**
 * Charge toutes les tables nécessaires. Une table injoignable ne bloque pas :
 * ses libellés restent vides et son nom est consigné dans `tablesEnEchec`.
 */
export async function chargerLibelles({ cache, forcer, journal = () => {}, activites = false } = {}) {
  const l = libellesVides();
  const tables = { ...TABLES_STRUCTURES, ...(activites ? TABLES_ACTIVITES : {}) };

  for (const [cle, nom] of Object.entries(tables)) {
    try {
      const table = await chargerTable(nom, { cache, forcer, journal });
      l[cle] = indexLibelles(table);
      l[`${cle}Long`] = indexLibelles(table, 'libelleLong');
      l.tablesChargees.push(nom);
      l.datesTables[nom] = table.dateMaj ?? null;
    } catch (erreur) {
      journal(`table ${nom} indisponible : ${erreur.message}`);
      l.tablesEnEchec.push(nom);
    }
  }

  try {
    const ass = await chargerAssociation('ASS_X10-AgregatCategorieEtablissement', { cache, forcer, journal });
    const [c1, c2, c3, cCat, cDom] = ass.colonnes;
    for (const ligne of ass.lignes) {
      l.categorieVersAgregat.set(ligne[cCat], { niv1: ligne[c1], niv2: ligne[c2], niv3: ligne[c3], domaine: ligne[cDom] ?? null });
    }
    l.tablesChargees.push('ASS_X10-AgregatCategorieEtablissement');
    l.datesTables['ASS_X10-AgregatCategorieEtablissement'] = dateIso(ass.descripteur['Date MàJ']);
  } catch (erreur) {
    journal(`association catégorie/agrégat indisponible : ${erreur.message}`);
    l.tablesEnEchec.push('ASS_X10-AgregatCategorieEtablissement');
  }

  try {
    const ass = await chargerAssociation('ASS_X11-FinessAgregatStatutJuridique', { cache, forcer, journal });
    const [c1, c2, c3, cStatut] = ass.colonnes;
    for (const ligne of ass.lignes) {
      l.statutVersAgregat.set(ligne[cStatut], { niv1: ligne[c1], niv2: ligne[c2], niv3: ligne[c3] });
    }
    l.tablesChargees.push('ASS_X11-FinessAgregatStatutJuridique');
    l.datesTables['ASS_X11-FinessAgregatStatutJuridique'] = dateIso(ass.descripteur['Date MàJ']);
  } catch (erreur) {
    journal(`association statut/agrégat indisponible : ${erreur.message}`);
    l.tablesEnEchec.push('ASS_X11-FinessAgregatStatutJuridique');
  }

  return l;
}
