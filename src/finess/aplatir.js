/**
 * Aplatissement des objets FINESS+ (PMEJ, EGE, groupements) en lignes
 * tabulaires. Fonctions pures, sans entrée-sortie.
 *
 * Vocabulaire FINESS+ :
 *   PMEJ  personne morale / entité juridique (numéro FINESS EJ)
 *   EGE   entité géographique d'exercice, l'établissement (numéro FINESS ET)
 *   GCC   groupement conventionnel, sans personnalité morale (dont les GHT)
 *   GCO   groupement de coopération doté de la personnalité morale (GCS…)
 */

import { dateIso, dateHeureIso, texte } from '../commun/dates.js';

export const ETATS = { A: 'actif', I: 'inactif' };

/**
 * Décompose un code commune INSEE (COG) en département et code commune, avec
 * en plus le code département de l'ancien flux FINESS (9A à 9F en outre-mer).
 */
export function decomposerCommune(cog) {
  const c = texte(cog);
  if (!c) return { departement: null, commune: null, departementHistorique: null, communeHistorique: null };
  let departement;
  if (/^9[78]/.test(c)) departement = c.slice(0, 3);
  else departement = c.slice(0, 2).toUpperCase();
  const commune = c.slice(departement.length);
  // L'ancien flux FINESS codait l'outre-mer sur deux caractères et gardait
  // trois caractères de code commune (97101 devenait 9A + 101).
  const historiques = { 971: '9A', 972: '9B', 973: '9C', 974: '9D', 975: '9E', 976: '9F', 986: '9J' };
  return {
    departement,
    commune,
    departementHistorique: historiques[departement] ?? departement,
    communeHistorique: c.slice(2),
  };
}

/** Adresse à retenir : usage préféré s'il existe, sinon la première. */
export function choisirAdresse(adresses, usagePrefere) {
  if (!Array.isArray(adresses) || !adresses.length) return null;
  return adresses.find((a) => a?.usageAdresse === usagePrefere) ?? adresses[0];
}

/** Premier contact de rôle « 01 » (contact principal), sinon le premier. */
export function contactPrincipal(contacts) {
  if (!Array.isArray(contacts) || !contacts.length) return {};
  const c = contacts.find((x) => x?.typeContact?.roleContact === '01') ?? contacts[0];
  return {
    telephone: texte(c?.telecom?.telephone),
    telecopie: texte(c?.telecom?.telecopie),
    courriel: texte(c?.telecom?.courriel),
  };
}

function champsAdresse(adresse) {
  const a = adresse ?? {};
  const geo = a.coordonneesGeographique ?? {};
  const { departement, commune, departementHistorique, communeHistorique } = decomposerCommune(a.cogCommune);
  return {
    usage_adresse: texte(a.usageAdresse),
    numero_voie: texte(a.numeroVoie),
    type_voie: texte(a.typeVoie),
    libelle_voie: texte(a.libelleVoie),
    complement_voie: texte(a.complementVoie),
    lieu_dit: texte(a.lieuDit),
    complement_point_geographique: texte(a.complementPointGeographique),
    code_postal: texte(a.codePostal),
    commune_acheminement: texte(a.ligneAcheminement),
    code_commune_insee: texte(a.cogCommune),
    code_commune: commune,
    departement,
    departement_historique: departementHistorique,
    code_commune_historique: communeHistorique,
    adresse_ligne_4: texte(a.ligneQuatre),
    latitude: texte(geo.directionLatitude),
    longitude: texte(geo.directionLongitude),
    coordonnee_x: texte(geo.coordonneeX),
    coordonnee_y: texte(geo.coordonneeY),
    cle_ban: texte(geo.cleInInteropBAN),
    score_ban: texte(geo.scoreBAN),
  };
}

const CLES_ADRESSE = Object.keys(champsAdresse({}));

/**
 * Secteur lu dans les agrégats officiels du statut juridique (TRE_R68, TRE_R69) :
 * `1000` organismes et établissements publics, `2100` privé à but non lucratif,
 * `2200` privé à caractère commercial, `3000` personne morale de droit étranger.
 */
export function secteurDepuisAgregats(niv1, niv2) {
  if (niv1 === '1000') return 'public';
  if (niv2 === '2100') return 'privé non lucratif';
  if (niv2 === '2200') return 'privé lucratif';
  if (niv1 === '3000') return 'étranger';
  return null;
}

const TYPES_GHT = new Set(['001', '002']);

/** Membres (entités juridiques) d'un GCC s'il s'agit d'un groupement hospitalier de territoire, sinon rien. */
export function membresGht(gcc) {
  if (!TYPES_GHT.has(texte(gcc.typeGcc))) return [];
  const membres = Array.isArray(gcc.pmejDuGcc) ? gcc.pmejDuGcc : [];
  return membres.map((m) => ({ id_pmej: texte(m.pmSmsseId), ght_id: texte(gcc.gccId), ght_nom: texte(gcc.nomGcc), ght_role: texte(m.typeRoleEntiteGroupe) }));
}

/** Rattache les membres d'un GHT dans `contexte.ghtParPmej`, pour les lignes des entités et des établissements. */
export function rattacherGht(contexte, gcc) {
  if (!contexte.ghtParPmej) contexte.ghtParPmej = new Map();
  for (const m of membresGht(gcc)) contexte.ghtParPmej.set(m.id_pmej, m);
  return contexte;
}

function colonnesGht(contexte, idPmej) {
  const g = contexte?.ghtParPmej?.get(idPmej);
  return { ght_id: g?.ght_id ?? null, ght_nom: g?.ght_nom ?? null, ght_role: g?.ght_role ?? null };
}

export const COLONNES_ENTITE_JURIDIQUE = [
  'finess_ej', 'id_pmej', 'denomination', 'denomination_longue', 'complement_adresse', 'siren', 'code_ape',
  'statut_juridique', 'statut_juridique_libelle',
  'statut_juridique_agregat_niv1', 'statut_juridique_agregat_niv1_libelle',
  'statut_juridique_agregat_niv2', 'statut_juridique_agregat_niv2_libelle',
  'type_personne_morale', 'fonction_publique', 'type_groupe_gco',
  'etat', 'etat_libelle', 'date_creation', 'date_fermeture',
  ...CLES_ADRESSE, 'departement_libelle',
  'telephone', 'telecopie', 'courriel',
  'nb_etablissements', 'nb_etablissements_actifs', 'date_derniere_maj',
  'secteur', 'ght_id', 'ght_nom', 'ght_role',
];

export function ligneEntiteJuridique(pmej, L, contexte = {}) {
  const info = pmej.informationsGeneralesPMEJ ?? {};
  const adresse = champsAdresse(choisirAdresse(pmej.adresse, '02'));
  const contact = contactPrincipal(pmej.contact);
  const statut = texte(info.statutJuridique);
  const agregats = L.statutVersAgregat.get(statut) ?? {};
  const eges = pmej.ege ?? [];
  return {
    finess_ej: texte(info.numFinessPm),
    id_pmej: texte(info.pmSmsseId),
    denomination: texte(info.denominationPm),
    denomination_longue: texte(info.denominationLonguePmSmsse),
    complement_adresse: texte(info.complementAdressePmSmsse),
    siren: texte(info.siren),
    code_ape: texte(info.codeApe),
    statut_juridique: statut,
    statut_juridique_libelle: L.statutJuridique.get(statut) ?? null,
    statut_juridique_agregat_niv1: agregats.niv1 ?? null,
    statut_juridique_agregat_niv1_libelle: L.agregatStatut1.get(agregats.niv1) ?? null,
    statut_juridique_agregat_niv2: agregats.niv2 ?? null,
    statut_juridique_agregat_niv2_libelle: L.agregatStatut2.get(agregats.niv2) ?? null,
    type_personne_morale: texte(info.typePersonneMorale),
    fonction_publique: texte(info.fonctionPublique),
    type_groupe_gco: texte(info.typeGroupeGco),
    etat: texte(pmej.etatObjet),
    etat_libelle: ETATS[pmej.etatObjet] ?? null,
    date_creation: dateIso(info.dateCreation),
    date_fermeture: dateIso(info.dateFermeture),
    ...adresse,
    departement_libelle: libelleDepartement(L, adresse.departement),
    ...contact,
    nb_etablissements: eges.length,
    nb_etablissements_actifs: eges.filter((e) => e.etatObjet === 'A').length,
    date_derniere_maj: dateHeureIso(pmej.dateDerniereMaj),
    secteur: secteurDepuisAgregats(agregats.niv1 ?? null, agregats.niv2 ?? null),
    ...colonnesGht(contexte, texte(info.pmSmsseId)),
  };
}

export const COLONNES_ETABLISSEMENT = [
  'finess_et', 'finess_ej', 'id_ege', 'id_pmej', 'nom_court', 'nom_long', 'complement_denomination', 'siret',
  'categorie', 'categorie_libelle', 'domaine',
  'categorie_agregat_niv1', 'categorie_agregat_niv1_libelle',
  'categorie_agregat_niv2', 'categorie_agregat_niv2_libelle',
  'categorie_agregat_niv3', 'categorie_agregat_niv3_libelle',
  'mode_fixation_tarifaire', 'mode_fixation_tarifaire_libelle',
  'espic', 'espic_libelle', 'type_budget',
  'etat', 'etat_libelle', 'date_ouverture', 'date_premiere_autorisation', 'date_fermeture',
  ...CLES_ADRESSE, 'departement_libelle', 'nb_adresses',
  'telephone', 'telecopie', 'courriel',
  'numero_education_nationale', 'numero_reference_externe',
  'ege_porteuse_id', 'ege_porteuse_finess', 'nb_ege_rattachees',
  'ej_denomination', 'ej_statut_juridique', 'ej_statut_juridique_libelle', 'ej_code_ape',
  'date_derniere_maj',
  'ej_statut_juridique_agregat_niv1', 'ej_statut_juridique_agregat_niv1_libelle',
  'ej_statut_juridique_agregat_niv2', 'ej_statut_juridique_agregat_niv2_libelle',
  'secteur', 'ght_id', 'ght_nom', 'ght_role',
];

function premier(tableau) {
  return Array.isArray(tableau) && tableau.length ? texte(tableau[0]) : null;
}

export function lignesEtablissements(pmej, L, contexte = {}) {
  const infoEj = pmej.informationsGeneralesPMEJ ?? {};
  const eges = pmej.ege ?? [];
  const finessParEgeId = new Map(eges.map((e) => [e.informationsGeneralesEGE?.egeId, e.informationsGeneralesEGE?.numFinessEge]));
  const statutEj = texte(infoEj.statutJuridique);
  const agregatsEj = L.statutVersAgregat.get(statutEj) ?? {};
  const colonnesEj = {
    ej_statut_juridique_agregat_niv1: agregatsEj.niv1 ?? null,
    ej_statut_juridique_agregat_niv1_libelle: L.agregatStatut1.get(agregatsEj.niv1) ?? null,
    ej_statut_juridique_agregat_niv2: agregatsEj.niv2 ?? null,
    ej_statut_juridique_agregat_niv2_libelle: L.agregatStatut2.get(agregatsEj.niv2) ?? null,
    secteur: secteurDepuisAgregats(agregatsEj.niv1 ?? null, agregatsEj.niv2 ?? null),
    ...colonnesGht(contexte, texte(infoEj.pmSmsseId)),
  };

  return eges.map((ege) => {
    const info = ege.informationsGeneralesEGE ?? {};
    const categorie = texte(ege.categorieentiteGeographiqueExercice);
    const agregats = L.categorieVersAgregat.get(categorie) ?? {};
    const mft = texte(ege.modefixationtarifaire);
    const espic = premier(info.espic);
    const adresse = champsAdresse(choisirAdresse(ege.adresse, '03'));
    const contact = contactPrincipal(ege.contact);
    const roles = Array.isArray(ege.roleEge) ? ege.roleEge : [];
    const commePorteuse = roles.filter((r) => r.idEgePorteuse === info.egeId && r.idEgeNonPorteuse !== info.egeId);
    const commeNonPorteuse = roles.find((r) => r.idEgeNonPorteuse === info.egeId && r.idEgePorteuse !== info.egeId);
    const porteuseId = commeNonPorteuse ? texte(commeNonPorteuse.idEgePorteuse) : null;

    return {
      finess_et: texte(info.numFinessEge),
      finess_ej: texte(infoEj.numFinessPm),
      id_ege: texte(info.egeId),
      id_pmej: texte(infoEj.pmSmsseId),
      nom_court: texte(info.nomEgeCourt),
      nom_long: texte(info.nomEgeLong),
      complement_denomination: texte(info.complementDenominationEg),
      siret: texte(info.siret),
      categorie,
      categorie_libelle: L.categorie.get(categorie) ?? null,
      domaine: agregats.domaine ?? null,
      categorie_agregat_niv1: agregats.niv1 ?? null,
      categorie_agregat_niv1_libelle: L.agregatCategorie1.get(agregats.niv1) ?? null,
      categorie_agregat_niv2: agregats.niv2 ?? null,
      categorie_agregat_niv2_libelle: L.agregatCategorie2.get(agregats.niv2) ?? null,
      categorie_agregat_niv3: agregats.niv3 ?? null,
      categorie_agregat_niv3_libelle: L.agregatCategorie3.get(agregats.niv3) ?? null,
      mode_fixation_tarifaire: mft,
      mode_fixation_tarifaire_libelle: L.mft.get(mft) ?? null,
      espic,
      espic_libelle: L.espic.get(espic) ?? null,
      type_budget: Array.isArray(ege.typeBudget) ? ege.typeBudget.filter(Boolean).join('|') || null : null,
      etat: texte(ege.etatObjet),
      etat_libelle: ETATS[ege.etatObjet] ?? null,
      date_ouverture: dateIso(info.dateOuverture),
      date_premiere_autorisation: dateIso(info.datePremiereAutorisation),
      date_fermeture: dateIso(info.dateFermeture),
      ...adresse,
      departement_libelle: libelleDepartement(L, adresse.departement),
      nb_adresses: Array.isArray(ege.adresse) ? ege.adresse.length : 0,
      ...contact,
      numero_education_nationale: texte(info.numeroEducationNationale),
      numero_reference_externe: texte(info.numeroReferenceExterne),
      ege_porteuse_id: porteuseId,
      ege_porteuse_finess: porteuseId ? finessParEgeId.get(porteuseId) ?? null : null,
      nb_ege_rattachees: commePorteuse.length,
      ej_denomination: texte(infoEj.denominationPm),
      ej_statut_juridique: statutEj,
      ej_statut_juridique_libelle: L.statutJuridique.get(statutEj) ?? null,
      ej_code_ape: texte(infoEj.codeApe),
      date_derniere_maj: dateHeureIso(ege.dateDerniereMaj),
      ...colonnesEj,
    };
  });
}

/**
 * Format de l'ancienne extraction Etalab « etalab_cs1100502 » (section
 * structureet, 32 champs, séparateur « ; », sans en-tête), pour les chaînes de
 * traitement qui lisaient l'ancien flux. Voir docs/FINESS.md pour les écarts.
 */
export const COLONNES_HISTORIQUE = [
  'section', 'nofinesset', 'nofinessej', 'rs', 'rslongue', 'complrs', 'compldistrib', 'numvoie', 'typvoie', 'voie',
  'compvoie', 'lieuditbp', 'commune', 'departement', 'libdepartement', 'ligneacheminement', 'telephone', 'telecopie',
  'categetab', 'libcategetab', 'categagretab', 'libcategagretab', 'siret', 'codeape', 'codemft', 'libmft',
  'codesph', 'libsph', 'dateouv', 'dateautor', 'datemaj', 'numuai',
];

/** « Côte-d'Or » devient « COTE D'OR », comme dans l'ancien flux. */
export function majusculesSansAccents(s) {
  if (s === null || s === undefined) return null;
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/-/g, ' ').toUpperCase();
}

/**
 * Libellé de département sans le numéro que certaines entrées de TRE_G09
 * ajoutent entre parenthèses (« Rhône (69) » devient « Rhône »).
 */
export function libelleDepartement(L, code) {
  const l = code == null ? null : L.departement.get(code) ?? null;
  return l ? l.replace(/\s*\([0-9][0-9AB][0-9]?\)\s*$/, '') : null;
}

/** Libellé long s'il existe, sinon libellé adapté. */
const long = (L, cle, code) => (code == null ? null : L[`${cle}Long`]?.get(code) ?? L[cle]?.get(code) ?? null);

export function ligneHistorique(et, L) {
  // L'ancien flux écrivait la commune d'acheminement en majuscules, sans accents ni apostrophes.
  const commune = majusculesSansAccents(et.commune_acheminement)?.replace(/'/g, ' ') ?? null;
  const ligneAcheminement = [et.code_postal, commune].filter(Boolean).join(' ') || null;
  return {
    section: 'structureet',
    nofinesset: et.finess_et,
    nofinessej: et.finess_ej,
    rs: et.nom_court,
    rslongue: et.nom_long,
    complrs: et.complement_denomination,
    compldistrib: et.complement_point_geographique,
    numvoie: et.numero_voie,
    typvoie: et.type_voie,
    voie: et.libelle_voie,
    compvoie: et.complement_voie,
    lieuditbp: et.lieu_dit,
    commune: et.code_commune_historique,
    departement: et.departement_historique,
    libdepartement: majusculesSansAccents(libelleDepartement(L, et.departement))?.replace(/'/g, ' ') ?? null,
    ligneacheminement: ligneAcheminement,
    telephone: et.telephone,
    telecopie: et.telecopie,
    categetab: et.categorie,
    libcategetab: long(L, 'categorie', et.categorie),
    categagretab: et.categorie_agregat_niv3,
    libcategagretab: long(L, 'agregatCategorie3', et.categorie_agregat_niv3),
    siret: et.siret,
    // L'ancien flux portait un code APE propre à l'établissement, absent de
    // FINESS+ : on laisse le champ vide plutôt que d'y mettre celui de l'entité
    // juridique (disponible dans etablissements.csv, colonne ej_code_ape).
    codeape: null,
    codemft: et.mode_fixation_tarifaire,
    libmft: long(L, 'mft', et.mode_fixation_tarifaire),
    codesph: et.espic,
    libsph: long(L, 'espic', et.espic),
    dateouv: et.date_ouverture,
    dateautor: et.date_premiere_autorisation,
    datemaj: et.date_derniere_maj ? et.date_derniere_maj.slice(0, 10) : null,
    numuai: et.numero_education_nationale,
  };
}

export const COLONNES_GCC = [
  'id_gcc', 'nom', 'type_gcc', 'identifiant_externe', 'etat', 'etat_libelle',
  'nb_membres_ej', 'nb_membres_et', 'date_derniere_maj',
];

export const COLONNES_GCO = [
  'finess_ej', 'id_pmej', 'denomination', 'type_gco', 'nb_membres_ej', 'nb_membres_et',
];

export const COLONNES_MEMBRES = [
  'groupement_type', 'groupement_id', 'groupement_nom', 'membre_type', 'membre_id', 'membre_finess', 'membre_denomination', 'role',
];

/** Lignes d'un GCC et de ses membres, résolus via les index construits au fil du flux. */
export function lignesGcc(gcc, index) {
  const membresEj = Array.isArray(gcc.pmejDuGcc) ? gcc.pmejDuGcc : [];
  const membresEt = Array.isArray(gcc.egeDuGcc) ? gcc.egeDuGcc : [];
  const groupement = {
    id_gcc: texte(gcc.gccId),
    nom: texte(gcc.nomGcc),
    type_gcc: texte(gcc.typeGcc),
    identifiant_externe: texte(gcc.gccIdentifiantExterne),
    etat: texte(gcc.etatObjet),
    etat_libelle: ETATS[gcc.etatObjet] ?? null,
    nb_membres_ej: membresEj.length,
    nb_membres_et: membresEt.length,
    date_derniere_maj: dateHeureIso(gcc.dateDerniereMaj),
  };
  const membres = [
    ...membresEj.map((m) => membre('GCC', groupement.id_gcc, groupement.nom, 'EJ', m.pmSmsseId, m.typeRoleEntiteGroupe, index.pmej)),
    ...membresEt.map((m) => membre('GCC', groupement.id_gcc, groupement.nom, 'ET', m.egeId, m.typeRoleEntiteGroupe, index.ege)),
  ];
  return { groupement, membres };
}

export function lignesGco(gco, index) {
  const membresEj = Array.isArray(gco.pmejDuGco) ? gco.pmejDuGco : [];
  const membresEt = Array.isArray(gco.egeDuGco) ? gco.egeDuGco : [];
  const porteur = index.pmej.get(texte(gco.pmSmsseId)) ?? {};
  const groupement = {
    finess_ej: porteur.finess ?? null,
    id_pmej: texte(gco.pmSmsseId),
    denomination: porteur.denomination ?? null,
    type_gco: texte(gco.typeGco),
    nb_membres_ej: membresEj.length,
    nb_membres_et: membresEt.length,
  };
  const membres = [
    ...membresEj.map((m) => membre('GCO', groupement.id_pmej, groupement.denomination, 'EJ', m.pmSmsseId, m.typeRoleEntiteGroupe, index.pmej)),
    ...membresEt.map((m) => membre('GCO', groupement.id_pmej, groupement.denomination, 'ET', m.egeId, m.typeRoleEntiteGroupe, index.ege)),
  ];
  return { groupement, membres };
}

function membre(groupementType, groupementId, groupementNom, membreType, id, role, indexParId) {
  const cible = indexParId.get(texte(id)) ?? {};
  return {
    groupement_type: groupementType,
    groupement_id: groupementId,
    groupement_nom: groupementNom,
    membre_type: membreType,
    membre_id: texte(id),
    membre_finess: cible.finess ?? null,
    membre_denomination: cible.denomination ?? null,
    role: texte(role),
  };
}
