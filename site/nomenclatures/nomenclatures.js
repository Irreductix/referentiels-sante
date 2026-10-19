// Nomenclatures de l'Assurance Maladie (CCAM, NABM, LPP, UCD) : recherche d'un code et contrôle d'une liste
// de codes à une date, à partir des fichiers convertis sur le poste par referentiels-sante. Ces fichiers ne
// peuvent pas être rediffusés : tout se calcule dans le navigateur. Testé avec Node dans tests/nomenclatures.test.js.
(function (global) {
  'use strict';

  const VIDE = /^[\s ]*(?:[-‐-―−]+|n[ée]ant|n\/?a|nc|sans objet)?[\s ]*$/i;
  const estVide = (v) => VIDE.test(String(v == null ? '' : v));

  function lireCsv(texte, separateur) {
    const sep = separateur.charCodeAt(0);
    const n = texte.length;
    let i = texte.charCodeAt(0) === 0xfeff ? 1 : 0;
    const lignes = [];
    let ligne = [];
    while (i < n) {
      let champ;
      if (texte.charCodeAt(i) === 34) {
        let j = i + 1;
        champ = '';
        for (;;) {
          const k = texte.indexOf('"', j);
          if (k < 0) { champ += texte.slice(j); i = n; break; }
          champ += texte.slice(j, k);
          if (texte.charCodeAt(k + 1) === 34) { champ += '"'; j = k + 2; continue; }
          i = k + 1;
          break;
        }
      } else {
        let j = i;
        while (j < n) {
          const c = texte.charCodeAt(j);
          if (c === sep || c === 10 || c === 13) break;
          j += 1;
        }
        champ = texte.slice(i, j);
        i = j;
      }
      ligne.push(champ);
      if (i < n && texte.charCodeAt(i) === sep) {
        i += 1;
        if (i >= n) { ligne.push(''); lignes.push(ligne); ligne = []; }
        continue;
      }
      if (i < n && texte.charCodeAt(i) === 13) i += 1;
      if (i >= n || texte.charCodeAt(i) === 10) { lignes.push(ligne); ligne = []; i += 1; continue; }
      i += 1;
    }
    if (ligne.length) lignes.push(ligne);
    return lignes;
  }
  const ligneVide = (l) => !l.some((v) => String(v == null ? '' : v).trim() !== '');

  function detecterSeparateur(texte) {
    const tete = texte.slice(0, 5000).replace(/"(?:[^"]|"")*"/g, '');
    const compter = (c) => tete.split(c).length - 1;
    const tab = compter('\t'); const pv = compter(';'); const virg = compter(',');
    if (tab > 0 && tab >= pv && tab >= virg) return '\t';
    return pv >= virg ? ';' : ',';
  }

  function normaliserTexte(v) {
    return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  // Clé d'un code à 13 chiffres (EAN-13) : somme pondérée 1, 3, 1, 3… des douze premiers chiffres.
  function cleEan13Valide(c) {
    if (!/^\d{13}$/.test(c || '')) return null;
    let somme = 0;
    for (let i = 0; i < 12; i += 1) somme += Number(c[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (somme % 10)) % 10 === Number(c[12]);
  }

  // Une date lue dans une liste : ISO, française (31/12/2026, 31.12.26), ou AAAAMMJJ. Vide si illisible.
  function lireDate(v) {
    const s = String(v == null ? '' : v).trim();
    let m; let a; let mo; let j;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s))) { a = m[1]; mo = m[2]; j = m[3]; }
    else if ((m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:\s.*)?$/.exec(s))) { a = m[3]; mo = m[2]; j = m[1]; }
    else if ((m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})$/.exec(s))) { a = (Number(m[3]) < 50 ? '20' : '19') + m[3]; mo = m[2]; j = m[1]; }
    else if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) { a = m[1]; mo = m[2]; j = m[3]; }
    else return '';
    mo = mo.padStart(2, '0'); j = j.padStart(2, '0');
    if (Number(mo) < 1 || Number(mo) > 12 || Number(j) < 1 || Number(j) > 31 || Number(a) < 1900) return '';
    return a + '-' + mo + '-' + j;
  }
  const dateFr = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : iso || ''; };
  const montant = (v) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' €';
  const positif = (v) => (v !== '' && v != null && Number(v) > 0 ? v : '');

  // Un code nettoyé. CCAM : quatre lettres et trois chiffres, suivis ou non de l'activité et de la phase
  // (JJFA005, JJFA00510, « JJFA005 1 0 »). NABM : quatre chiffres (un zéro de tête perdu par Excel est rétabli).
  // Sept chiffres : LPP ou UCD, départagés par la recherche. Treize chiffres : UCD13 (34008…) ou CIP13 (34009…).
  function lireCode(v) {
    const brut = String(v == null ? '' : v);
    if (estVide(brut)) return { type: '', valeur: '' };
    const n = brut.toUpperCase().replace(/[\s .]/g, '');
    let m;
    if ((m = /^([A-Z]{4}\d{3})(?:[-_/]?(\d)(?:[-_/]?(\d))?)?$/.exec(n))) return { type: 'ccam', valeur: m[1], activite: m[2] || '', phase: m[3] || '' };
    if (/^\d{13}$/.test(n)) {
      if (n.startsWith('34008')) return { type: 'ucd13', valeur: n.slice(5, 12), ucd13: n };
      if (n.startsWith('34009')) return { type: 'cip13', valeur: n };
      return { type: 'illisible', valeur: n };
    }
    if (/^\d{7}$/.test(n)) return { type: 'sept', valeur: n };
    if (/^\d{1,4}$/.test(n)) return { type: 'nabm', valeur: n.padStart(4, '0'), complete: n.length < 4 };
    return { type: 'illisible', valeur: n };
  }

  // Les fichiers du convertisseur que la page sait lire, reconnus à leurs colonnes.
  const FICHIERS = {
    'ccam.actes': { nomenclature: 'ccam', nom: 'CCAM, actes', requis: ['code', 'libelle_long', 'date_fin', 'tarif_base', 'activites'], exemple: 'ccam-actes.csv' },
    'ccam.phases': { nomenclature: 'ccam', nom: 'CCAM, phases', requis: ['code_phase', 'code_acte', 'activite', 'phase', 'tarif_base'], exemple: 'ccam-phases.csv' },
    'nabm.fiche': { nomenclature: 'nabm', nom: 'NABM, actes', requis: ['code_nabm', 'nom_court', 'nom_long'], exemple: 'nabm_fiche_tot105.csv' },
    'nabm.histo': { nomenclature: 'nabm', nom: 'NABM, cotations', requis: ['code_nabm', 'date_effet', 'lc1', 'coef1'], exemple: 'nabm_histo_tot105.csv' },
    'lpp.fiche': { nomenclature: 'lpp', nom: 'LPP, codes', requis: ['code_tips', 'nom_court', 'date_fin'], exemple: 'lpp_fiche_tot906.csv' },
    'lpp.histo': { nomenclature: 'lpp', nom: 'LPP, tarifs', requis: ['code_tips', 'debutvalid', 'tarif'], exemple: 'lpp_histo_tot906.csv' },
    'ucd.total': { nomenclature: 'ucd', nom: 'UCD', requis: ['code_ucd', 'liste', 'nom_court', 'dt_dinscri', 'etat'], exemple: 'ucd_total_00807_20261016.csv' },
    'ucd.prix': { nomenclature: 'ucd', nom: 'UCD, historique des prix', requis: ['code_ucd', 'liste', 'dt_appli', 'prix_ht'], exemple: 'ucd_histo_prix_00807_20261016.csv' },
  };
  const NOMENCLATURES = { ccam: 'CCAM', nabm: 'NABM', lpp: 'LPP', ucd: 'UCD' };
  const AUTRES_FICHIERS = /^(ccam-|nabm_|lpp_|ucd_|retro_)/i;

  // Reconnaît un fichier à sa première ligne et à son nom. Le fichier ucd_maj (mises à jour du mois) a les
  // colonnes d'ucd_total : il est écarté au nom, pour ne pas remplacer la table complète.
  function reconnaitreFichier(debut, nomFichier) {
    const nom = String(nomFichier || '');
    const premiere = lireCsv(String(debut || '').split(/\r?\n/)[0] + '\n', ';')[0] || [];
    const colonnes = new Set(premiere.map((c) => c.trim()));
    if (/^ucd_maj/i.test(nom)) return { type: 'ignore', message: 'mises à jour du mois, remplacées par la table complète ucd_total' };
    for (const [type, f] of Object.entries(FICHIERS)) {
      if (f.requis.every((c) => colonnes.has(c))) return { type, nomenclature: f.nomenclature, nom: f.nom };
    }
    if (AUTRES_FICHIERS.test(nom)) return { type: 'ignore', message: 'fichier du convertisseur que cette page n\'utilise pas' };
    return { type: 'inconnu', message: 'colonnes non reconnues : attendu un fichier produit par les commandes ccam, nabm, lpp ou ucd' };
  }

  function versionDepuisNom(nomFichier, lignes, type) {
    const nom = String(nomFichier || '');
    let m;
    if (type.startsWith('ccam')) return (lignes[0] && lignes[0].version) || '';
    if ((m = /_(\d{5})_(\d{8})/.exec(nom))) return m[1] + ' du ' + m[2].slice(6, 8) + '/' + m[2].slice(4, 6) + '/' + m[2].slice(0, 4);
    if ((m = /tot(\d+)/i.exec(nom))) return m[1];
    return '';
  }

  // Lit un fichier converti : objets nommés par l'en-tête, type reconnu, version.
  function lireFichier(texte, nomFichier) {
    const r = reconnaitreFichier(texte.slice(0, 20000), nomFichier);
    if (r.type === 'ignore' || r.type === 'inconnu') return { type: r.type, nomFichier, message: r.message, lignes: [] };
    const brut = lireCsv(texte, ';').filter((l) => !ligneVide(l));
    const entete = (brut.shift() || []).map((c) => c.trim());
    const lignes = brut.map((l) => { const o = {}; entete.forEach((c, i) => { o[c] = l[i] == null ? '' : l[i]; }); return o; });
    return { type: r.type, nomenclature: r.nomenclature, nom: r.nom, nomFichier, lignes, version: versionDepuisNom(nomFichier, lignes, r.type) };
  }

  const trierParDateDesc = (cle) => (a, b) => (a[cle] < b[cle] ? 1 : a[cle] > b[cle] ? -1 : 0);
  // Certains libellés UCD sont écrits deux fois à la suite dans la source : on n'en garde qu'un.
  const dedoubler = (s) => { const t = String(s || '').trim(); const n = t.length; if (n % 2 === 1 && t.slice(0, (n - 1) / 2) === t.slice((n + 1) / 2) && t.charAt((n - 1) / 2) === ' ') return t.slice(0, (n - 1) / 2); return t; };
  const grouper = (lignes, cle) => { const m = new Map(); for (const l of lignes) { const k = l[cle]; if (!m.has(k)) m.set(k, []); m.get(k).push(l); } return m; };

  // Assemble les fichiers lus en une base interrogeable. Le dernier fichier d'un même type remplace le précédent.
  function construire(fichiers) {
    const parType = {};
    for (const f of fichiers) if (FICHIERS[f.type]) parType[f.type] = f;
    const base = { ccam: null, nabm: null, lpp: null, ucd: null, fichiers: Object.values(parType).map((f) => ({ type: f.type, nom: f.nom, nomFichier: f.nomFichier, version: f.version, lignes: f.lignes.length })) };
    if (parType['ccam.actes']) {
      const actes = new Map();
      for (const l of parType['ccam.actes'].lignes) {
        actes.set(l.code, {
          code: l.code, libelleCourt: l.libelle_court, libelle: l.libelle_long, chapitre: l.chapitre_chemin, remboursement: l.remboursement, rembLibelle: l.remboursement_libelle,
          entente: l.entente_prealable === 'O', dateCreation: l.date_creation, dateEffet: l.date_effet, dateFin: l.date_fin, activites: String(l.activites || '').split('|').filter(Boolean),
          regroupement: l.regroupement, regroupementLibelle: l.regroupement_libelle, tarif: l.tarif_base, icr: l.icr, classant: l.classant === 'Y', type: l.type_libelle,
          norm: normaliserTexte(l.code + ' ' + l.libelle_long + ' ' + l.libelle_court),
        });
      }
      const phases = parType['ccam.phases'] ? grouper(parType['ccam.phases'].lignes.map((l) => ({ code: l.code_acte, activite: l.activite, phase: l.phase, libelle: l.phase_libelle, tarif: l.tarif_base, icr: l.icr, classant: l.classant === 'Y' })), 'code') : null;
      base.ccam = { version: parType['ccam.actes'].version, actes, phases, nombre: actes.size };
    }
    if (parType['nabm.fiche']) {
      const actes = new Map();
      // Le code NABM est numérique dans la source : « 552 » pour l'acte 0552. On le rétablit sur quatre chiffres.
      const codeNabm = (v) => (/^\d{1,3}$/.test(v) ? v.padStart(4, '0') : v);
      for (const l of parType['nabm.fiche'].lignes) { const code = codeNabm(l.code_nabm); actes.set(code, { code, libelleCourt: l.nom_court, libelle: l.nom_long || l.nom_court, dateDebut: l.date_debut, dateFin: l.date_fin, norm: normaliserTexte(code + ' ' + l.nom_long + ' ' + l.nom_court) }); }
      let histo = null;
      if (parType['nabm.histo']) {
        histo = grouper(parType['nabm.histo'].lignes.map((l) => {
          const cotations = [];
          for (let i = 1; i <= 5; i += 1) if (l['lc' + i]) cotations.push({ lettre: l['lc' + i], coefficient: Number(l['coef' + i] || 0) / 100 });
          return { code: codeNabm(l.code_nabm), dateEffet: l.date_effet, entente: l.entente === '1' || l.entente === 'O', cotations };
        }), 'code');
        for (const v of histo.values()) v.sort(trierParDateDesc('dateEffet'));
      }
      base.nabm = { version: parType['nabm.fiche'].version, actes, histo, nombre: actes.size };
    }
    if (parType['lpp.fiche']) {
      const codes = new Map();
      for (const l of parType['lpp.fiche'].lignes) codes.set(l.code_tips, { code: l.code_tips, libelle: l.nom_court, dateFin: l.date_fin, ageMax: Number(l.age_max || 0), indication: l.indication, ancienCode: l.old_code, norm: normaliserTexte(l.code_tips + ' ' + l.nom_court) });
      let histo = null;
      if (parType['lpp.histo']) {
        histo = grouper(parType['lpp.histo'].lignes.map((l) => ({ code: l.code_tips, debut: l.debutvalid, fin: l.finhisto, nature: l.nat_prest, entente: l.entente === 'O', arrete: l.arrete, jo: l.jo, tarif: l.tarif, prixLimite: l.pureglemen, surDevis: l.pudevis === '1' || l.pudevis === 'O', qteMax: Number(l.qte_max || 0), montantMax: l.mt_max })), 'code');
        for (const v of histo.values()) v.sort(trierParDateDesc('debut'));
      }
      base.lpp = { version: parType['lpp.fiche'].version, codes, histo, nombre: codes.size };
    }
    if (parType['ucd.total']) {
      const codes = grouper(parType['ucd.total'].lignes.map((l) => ({
        code: l.code_ucd, liste: l.liste, libelleCourt: dedoubler(l.nom_court), libelle: dedoubler(((l.nom_long1 || '') + ' ' + (l.nom_long2 || '')).trim()) || dedoubler(l.nom_court), dateDebut: l.dt_dinscri, dateFin: l.dt_finscri, motifFin: l.motif_fin,
        laboratoire: l.labo_exp, datePrix: l.dt_apprix, prixHt: l.prix_ht, prixTtc: l.prix_ttc, prixLibre: l.t_facture === 'O', taux: l.taux, etat: l.etat, forme: l.forme, atc: l.cod_atc, atcLibelle: l.classe_atc,
        hospitalier: l.rh === 'O', prescriptionHospitaliere: l.ph === 'O', prescriptionInitialeHospitaliere: l.pih === 'O',
        norm: normaliserTexte(l.code_ucd + ' ' + l.nom_court + ' ' + (l.nom_long1 || '') + ' ' + (l.labo_exp || '') + ' ' + (l.cod_atc || '')),
      })), 'code');
      let prix = null;
      if (parType['ucd.prix']) {
        prix = grouper(parType['ucd.prix'].lignes.map((l) => ({ code: l.code_ucd, liste: l.liste, date: l.dt_appli, prixHt: l.prix_ht, prixTtc: l.prix_ttc, prixLibre: l.t_facture === 'O' })), 'code');
        for (const v of prix.values()) v.sort(trierParDateDesc('date'));
      }
      base.ucd = { version: parType['ucd.total'].version, codes, prix, nombre: codes.size };
    }
    return base;
  }

  const LISTES_UCD = { R: 'rétrocession', M: 'en sus MCO', S: 'en sus SMR' };
  const ETATS_UCD = { D: 'disponible', NC: 'non commercialisé', S: 'supprimé du marché' };
  const nouvelleFiche = (nomenclature, code) => ({ nomenclature, code, libelle: '', detail: '', debut: '', fin: '', statut: 'en vigueur', gravite: 0, tarif: '', unite: '', precisions: [], pistes: [] });
  const enVigueur = (f, date, debut, fin, motFerme, motAvenir) => {
    if (fin && date > fin) { f.statut = motFerme + ' le ' + dateFr(fin); f.gravite = 3; }
    else if (debut && date < debut) { f.statut = motAvenir + ' le ' + dateFr(debut); f.gravite = 2; }
  };

  function evaluerCcam(ccam, code, date, activite, phase) {
    const a = ccam.actes.get(code);
    if (!a) return null;
    const f = nouvelleFiche('ccam', code);
    f.libelle = a.libelle; f.detail = a.chapitre; f.debut = a.dateCreation; f.fin = a.dateFin;
    enVigueur(f, date, a.dateCreation, a.dateFin, 'fermé', 'créé');
    if (a.remboursement === '2') { f.precisions.push('acte non remboursable'); f.gravite = Math.max(f.gravite, 2); }
    else if (a.remboursement === '3') { f.precisions.push('remboursable ou non suivant circonstances'); f.gravite = Math.max(f.gravite, 1); }
    if (a.entente) { f.precisions.push('entente préalable'); f.gravite = Math.max(f.gravite, 1); }
    f.tarif = positif(a.tarif); f.unite = f.tarif ? '€' : '';
    if (activite) {
      if (!a.activites.includes(activite)) { f.statut = 'activité ' + activite + ' inexistante pour cet acte (activités : ' + a.activites.join(', ') + ')'; f.gravite = 3; f.tarif = ''; f.unite = ''; }
      else if (ccam.phases) {
        const candidates = (ccam.phases.get(code) || []).filter((x) => x.activite === activite);
        const p = candidates.find((x) => x.phase === (phase || '0')) || (phase ? null : candidates[0] || null);
        if (!p) { f.statut = 'phase ' + phase + ' inexistante pour l\'activité ' + activite; f.gravite = 3; f.tarif = ''; f.unite = ''; }
        else { f.tarif = positif(p.tarif); f.unite = f.tarif ? '€' : ''; f.precisions.push('activité ' + activite + (phase ? ', phase ' + phase : '') + (p.icr ? ', ICR ' + p.icr : '')); }
      } else if (activite !== '1' || (phase && phase !== '0')) { f.tarif = ''; f.unite = ''; f.pistes.push('tarif de l\'activité ' + activite + (phase ? ' phase ' + phase : '') + ' : chargez ccam-phases.csv'); }
      else f.precisions.push('activité 1');
    } else if (a.activites.length > 1) f.precisions.push('activités ' + a.activites.join(', ') + ' ; tarif de l\'activité 1');
    if (a.regroupementLibelle) f.precisions.push(a.regroupement + ', ' + a.regroupementLibelle.toLowerCase());
    if (a.classant) f.precisions.push('classant');
    if (a.icr && !activite) f.precisions.push('ICR ' + a.icr);
    return f;
  }

  function evaluerNabm(nabm, code, date) {
    const a = nabm.actes.get(code);
    if (!a) return null;
    const f = nouvelleFiche('nabm', code);
    f.libelle = a.libelle; f.debut = a.dateDebut; f.fin = a.dateFin;
    enVigueur(f, date, a.dateDebut, a.dateFin, 'fermé', 'créé');
    if (nabm.histo) {
      const versions = nabm.histo.get(code) || [];
      const v = versions.find((x) => x.dateEffet <= date) || null;
      if (v) {
        if (v.cotations.length) { f.tarif = String(v.cotations[0].coefficient); f.unite = v.cotations[0].lettre; }
        if (v.cotations.length > 1) f.precisions.push('autres cotations : ' + v.cotations.slice(1).map((c) => c.lettre + ' ' + c.coefficient).join(', '));
        if (v.entente) { f.precisions.push('entente préalable'); f.gravite = Math.max(f.gravite, 1); }
        f.precisions.push('cotation en vigueur depuis le ' + dateFr(v.dateEffet));
      } else if (versions.length) { f.precisions.push('aucune cotation connue à cette date (première le ' + dateFr(versions[versions.length - 1].dateEffet) + ')'); f.gravite = Math.max(f.gravite, 2); }
    } else f.pistes.push('cotation : chargez nabm_histo');
    return f;
  }

  function evaluerLpp(lpp, code, date) {
    const c = lpp.codes.get(code);
    if (!c) return null;
    const f = nouvelleFiche('lpp', code);
    f.libelle = c.libelle; f.fin = c.dateFin;
    enVigueur(f, date, '', c.dateFin, 'fermé', '');
    if (lpp.histo) {
      const versions = lpp.histo.get(code) || [];
      f.debut = versions.length ? versions[versions.length - 1].debut : '';
      const v = versions.find((x) => x.debut <= date && (!x.fin || date <= x.fin)) || null;
      if (v) {
        f.tarif = v.tarif; f.unite = '€';
        if (v.prixLimite && v.prixLimite !== v.tarif && Number(v.prixLimite) > 0) f.precisions.push('prix limite de vente ' + montant(v.prixLimite));
        if (v.entente) { f.precisions.push('entente préalable'); f.gravite = Math.max(f.gravite, 1); }
        if (v.qteMax > 0) f.precisions.push('quantité maximale ' + v.qteMax);
        if (v.nature) f.precisions.push('nature de prestation ' + v.nature);
        f.precisions.push('tarif en vigueur depuis le ' + dateFr(v.debut) + (v.fin ? ' jusqu\'au ' + dateFr(v.fin) : ''));
      } else if (f.gravite < 3) {
        if (versions.length && date < f.debut) { f.statut = 'tarifé à partir du ' + dateFr(f.debut); f.gravite = 2; }
        else { f.precisions.push('aucun tarif en vigueur à cette date'); f.gravite = Math.max(f.gravite, 2); }
      }
    } else f.pistes.push('tarif : chargez lpp_histo');
    if (c.ageMax > 0) f.precisions.push('âge maximal ' + c.ageMax + ' ans');
    if (c.ancienCode) f.precisions.push('ancien code ' + c.ancienCode);
    return f;
  }

  function evaluerUcd(ucd, code, date) {
    const lignes = ucd.codes.get(code);
    if (!lignes) return null;
    const f = nouvelleFiche('ucd', code);
    const l0 = lignes[0];
    f.libelle = l0.libelle; f.detail = [l0.laboratoire, l0.forme ? l0.forme.toLowerCase() : '', l0.atc ? 'ATC ' + l0.atc : ''].filter(Boolean).join(', ');
    f.debut = lignes.map((l) => l.dateDebut).filter(Boolean).sort()[0] || '';
    const fins = lignes.map((l) => l.dateFin);
    f.fin = fins.some((x) => !x) ? '' : fins.sort().slice(-1)[0];
    const ordre = { R: 0, M: 1, S: 2 };
    const valides = lignes.filter((l) => (!l.dateDebut || l.dateDebut <= date) && (!l.dateFin || date <= l.dateFin)).sort((a, b) => (ordre[a.liste] ?? 9) - (ordre[b.liste] ?? 9));
    if (valides.length) f.precisions.push('liste ' + valides.map((l) => LISTES_UCD[l.liste] || l.liste).join(', '));
    else if (f.debut && date < f.debut) { f.statut = 'inscrit le ' + dateFr(f.debut); f.gravite = 2; }
    else { const derniere = lignes.slice().sort((a, b) => (a.dateFin < b.dateFin ? 1 : -1))[0]; f.statut = (derniere.motifFin === 'RADIATION' ? 'radié' : 'fin d\'inscription') + ' le ' + dateFr(derniere.dateFin) + ' (' + lignes.map((l) => LISTES_UCD[l.liste] || l.liste).join(', ') + ')'; f.gravite = 3; }
    if (l0.etat && l0.etat !== 'D') { f.precisions.push(ETATS_UCD[l0.etat] || 'état ' + l0.etat); f.gravite = Math.max(f.gravite, 2); }
    const source = valides.length ? valides : lignes;
    let prixHt = ''; let prixTtc = ''; let datePrix = ''; let prixLibre = false;
    if (ucd.prix) {
      const v = (ucd.prix.get(code) || []).find((x) => x.date <= date && source.some((l) => l.liste === x.liste)) || (ucd.prix.get(code) || []).find((x) => x.date <= date) || null;
      if (v) { prixHt = v.prixHt; prixTtc = v.prixTtc; datePrix = v.date; prixLibre = v.prixLibre; }
    } else { const l = source.find((x) => x.prixTtc) || l0; prixHt = l.prixHt; prixTtc = l.prixTtc; datePrix = l.datePrix; prixLibre = l.prixLibre; }
    if (prixTtc) { f.tarif = prixTtc; f.unite = '€ TTC'; f.precisions.push('prix HT ' + montant(prixHt) + (datePrix ? ', depuis le ' + dateFr(datePrix) : '')); }
    else if (prixLibre || source.some((l) => l.prixLibre)) { f.precisions.push('prix libre (top sur facture)'); f.gravite = Math.max(f.gravite, 1); }
    const retro = source.find((l) => l.liste === 'R');
    if (retro && retro.taux) f.precisions.push('taux ' + retro.taux + ' %');
    if (l0.hospitalier) f.precisions.push('réservé à l\'usage hospitalier');
    else if (l0.prescriptionHospitaliere) f.precisions.push('prescription hospitalière');
    else if (l0.prescriptionInitialeHospitaliere) f.precisions.push('prescription initiale hospitalière');
    return f;
  }

  function evaluer(base, nomenclature, code, date, options) {
    const o = options || {};
    if (nomenclature === 'ccam') return base.ccam ? evaluerCcam(base.ccam, code, date, o.activite || '', o.phase || '') : null;
    if (nomenclature === 'nabm') return base.nabm ? evaluerNabm(base.nabm, code, date) : null;
    if (nomenclature === 'lpp') return base.lpp ? evaluerLpp(base.lpp, code, date) : null;
    if (nomenclature === 'ucd') return base.ucd ? evaluerUcd(base.ucd, code, date) : null;
    return null;
  }

  const entrees = (base, n) => (n === 'ccam' ? base.ccam.actes : n === 'nabm' ? base.nabm.actes : n === 'lpp' ? base.lpp.codes : base.ucd.codes);
  const normDe = (n, v) => (n === 'ucd' ? v[0].norm : v.norm);

  // Recherche : un début de code, ou des mots du libellé (chaque mot doit apparaître, les débuts de mot comptent double).
  function chercher(base, requete, date, options) {
    const o = options || {};
    const limite = o.max || 50;
    const q = String(requete || '').trim();
    if (q.length < 2) return [];
    const cibles = ['ccam', 'nabm', 'lpp', 'ucd'].filter((n) => base[n] && (!o.nomenclature || o.nomenclature === n));
    const compact = q.toUpperCase().replace(/[\s .]/g, '');
    const parCode = /^[A-Z]{1,4}\d{0,5}$/.test(compact) || /^\d{2,13}$/.test(compact);
    const scores = [];
    for (const n of cibles) {
      if (parCode) {
        if (/^[A-Z]/.test(compact) && n !== 'ccam') continue;
        if (/^\d/.test(compact) && n === 'ccam') continue;
        const prefixe = /^\d{13}$/.test(compact) && compact.startsWith('34008') ? compact.slice(5, 12) : compact;
        for (const code of entrees(base, n).keys()) {
          if (code.startsWith(prefixe)) scores.push({ n, code, score: code === prefixe ? 3 : 1 });
        }
      } else {
        const mots = normaliserTexte(q).split(' ').filter(Boolean);
        if (!mots.length) return [];
        for (const [code, v] of entrees(base, n)) {
          const norm = normDe(n, v);
          let score = 0;
          for (const m of mots) {
            const i = norm.indexOf(m);
            if (i < 0) { score = -1; break; }
            score += i === 0 || norm.charAt(i - 1) === ' ' ? 2 : 1;
          }
          if (score >= 0) scores.push({ n, code, score });
        }
      }
    }
    scores.sort((a, b) => b.score - a.score || a.n.localeCompare(b.n) || a.code.localeCompare(b.code));
    const resultats = [];
    for (const s of scores) {
      const f = evaluer(base, s.n, s.code, date);
      if (f) { f.score = s.score; resultats.push(f); }
      if (resultats.length >= limite) break;
    }
    return resultats;
  }

  const estCelluleEntete = (v, motif) => { const t = normaliserTexte(v); return t.length > 0 && t.length <= 30 && motif.test(t); };

  function reconnaitreEntete(l) {
    const col = {};
    // « Date de l'acte » est une date, « Libellé de l'acte » un libellé : ces deux motifs passent avant celui des codes.
    l.forEach((v, i) => {
      if (col.date === undefined && estCelluleEntete(v, /\bDATE|\bJOUR\b/)) col.date = i;
      else if (col.nom === undefined && estCelluleEntete(v, /\bNOM\b|LIBELLE|DESIGNATION|INTITULE|PRODUIT|PRESTATION|SPECIALITE/)) col.nom = i;
      else if (col.code === undefined && estCelluleEntete(v, /\bCODE|\bACTE\b|\bCCAM\b|\bNABM\b|\bLPP\b|\bUCD\b|\bTIPS\b|NOMENCLATURE/)) col.code = i;
    });
    return col.code !== undefined ? col : null;
  }
  const codeLisible = (v) => { const t = lireCode(v).type; return t !== '' && t !== 'illisible'; };

  // Liste collée : une colonne de codes (CCAM, NABM, LPP, UCD, même mélangés), une date et un libellé facultatifs.
  function lireListe(texte) {
    const sep = detecterSeparateur(texte);
    const lignes = lireCsv(texte, sep);
    if (!lignes.some((l) => !ligneVide(l))) return { lignes: [], numeros: [], colonnes: {}, entete: false, ligneEntete: 0 };
    const largeur = Math.max.apply(null, lignes.map((l) => l.length));
    let indexEntete = -1; let parEntete = null;
    for (let i = 0; i < Math.min(lignes.length, 60); i += 1) {
      const col = reconnaitreEntete(lignes[i]);
      if (col) { indexEntete = i; parEntete = col; break; }
    }
    const entete = indexEntete >= 0;
    const donnees = []; const numeros = [];
    const remplies = (l) => l.filter((v) => String(v == null ? '' : v).trim() !== '').length;
    lignes.forEach((l, i) => {
      if (i <= indexEntete || ligneVide(l)) return;
      if (entete && reconnaitreEntete(l)) return;
      if (entete && remplies(l) === 1 && !(parEntete && codeLisible(l[parEntete.code]))) return;
      donnees.push(l); numeros.push(i + 1);
    });
    const colonnes = {};
    if (parEntete) Object.assign(colonnes, parEntete);
    const meilleure = (critere, exclues) => {
      let best = -1; let val = 0;
      for (let c = 0; c < largeur; c += 1) {
        if (exclues.includes(c)) continue;
        let n = 0;
        for (const l of donnees.slice(0, 300)) n += critere(String(l[c] == null ? '' : l[c]));
        if (n > val) { val = n; best = c; }
      }
      return best;
    };
    if (colonnes.code === undefined) { const c = meilleure((v) => (codeLisible(v) ? 1 : 0), []); if (c >= 0) colonnes.code = c; }
    if (colonnes.date === undefined) {
      const c = meilleure((v) => (lireDate(v) ? 1 : 0), [colonnes.code]);
      // Une colonne de dates ne compte que si la plupart des lignes en ont une.
      if (c >= 0 && donnees.slice(0, 300).filter((l) => lireDate(l[c])).length * 2 > Math.min(donnees.length, 300)) colonnes.date = c;
    }
    if (colonnes.nom === undefined) { const c = meilleure((v) => (/[A-Za-z]{3}/.test(v) && !codeLisible(v) ? v.length : 0), [colonnes.code, colonnes.date].filter((x) => x !== undefined)); if (c >= 0) colonnes.nom = c; }
    return { lignes: donnees, numeros, colonnes, entete, ligneEntete: entete ? indexEntete + 1 : 0 };
  }

  const FORMATS = { ccam: 'quatre lettres et trois chiffres', nabm: 'quatre chiffres', lpp: 'sept chiffres', ucd: 'sept chiffres, ou treize commençant par 34008' };
  const accepte = (nomenclature, type) => (nomenclature === 'ccam' ? type === 'ccam' : nomenclature === 'nabm' ? type === 'nabm' : nomenclature === 'lpp' ? type === 'sept' : type === 'sept' || type === 'ucd13');

  // Contrôle d'une liste à la date de référence (ou à la date de chaque ligne). options.nomenclature force la nomenclature.
  function controler(base, liste, options) {
    const o = options || {};
    const dateRef = lireDate(o.date) || new Date().toISOString().slice(0, 10);
    const forcee = o.nomenclature && NOMENCLATURES[o.nomenclature] ? o.nomenclature : '';
    const chargees = ['ccam', 'nabm', 'lpp', 'ucd'].filter((n) => base[n]);
    const col = liste.colonnes;
    const cellule = (l, i) => (i === undefined ? '' : String(l[i] == null ? '' : l[i]));
    const resultats = [];
    liste.lignes.forEach((l, k) => {
      const code = lireCode(cellule(l, col.code));
      const r = { ligne: liste.numeros[k] || k + 1, nom: cellule(l, col.nom).trim(), saisi: cellule(l, col.code).trim(), code: code.valeur, type: code.type, nomenclature: '', date: dateRef, resultat: '', gravite: 0, libelle: '', detail: '', debut: '', fin: '', statut: '', tarif: '', unite: '', precisions: [], pistes: [] };
      if (col.date !== undefined) {
        const d = lireDate(cellule(l, col.date));
        if (d) r.date = d;
        else if (cellule(l, col.date).trim()) r.pistes.push('date illisible (' + cellule(l, col.date).trim() + ') : date de référence utilisée');
      }
      if (code.complete) r.pistes.push('code complété à quatre chiffres : ' + code.valeur);
      if (code.type === 'ucd13' && cleEan13Valide(code.ucd13) === false) { r.pistes.push('clé de contrôle du code à 13 chiffres invalide : faute de frappe probable'); r.gravite = 2; }
      if (!code.type) { r.resultat = 'pas de code'; r.gravite = 1; resultats.push(r); return; }
      if (code.type === 'cip13') { r.resultat = 'code CIP d\'une présentation, pas un UCD'; r.gravite = 2; r.pistes.push('à contrôler sur la page Médicaments'); resultats.push(r); return; }
      if (code.type === 'illisible') { r.resultat = 'code illisible'; r.gravite = 3; resultats.push(r); return; }
      let candidates = forcee ? [forcee] : ['ccam', 'nabm', 'lpp', 'ucd'].filter((n) => accepte(n, code.type));
      if (forcee && !accepte(forcee, code.type)) { r.resultat = 'format inattendu pour la ' + NOMENCLATURES[forcee] + ' (' + FORMATS[forcee] + ')'; r.gravite = 3; resultats.push(r); return; }
      const absentes = candidates.filter((n) => !base[n]);
      candidates = candidates.filter((n) => base[n]);
      if (!candidates.length) { r.resultat = absentes.map((n) => NOMENCLATURES[n]).join(' et ') + ' non chargée' + (absentes.length > 1 ? 's' : ''); r.gravite = 1; resultats.push(r); return; }
      const fiches = candidates.map((n) => evaluer(base, n, code.valeur, r.date, code)).filter(Boolean);
      if (!fiches.length) {
        r.resultat = 'code inconnu (' + candidates.map((n) => NOMENCLATURES[n] + (base[n].version ? ' ' + base[n].version : '')).join(', ') + ')';
        r.gravite = 3;
        if (absentes.length) r.pistes.push('non cherché dans : ' + absentes.map((n) => NOMENCLATURES[n]).join(', ') + ' (non chargée)');
        resultats.push(r); return;
      }
      const f = fiches[0];
      r.nomenclature = f.nomenclature; r.libelle = f.libelle; r.detail = f.detail; r.debut = f.debut; r.fin = f.fin; r.statut = f.statut; r.tarif = f.tarif; r.unite = f.unite;
      r.precisions = f.precisions; r.pistes = r.pistes.concat(f.pistes); r.gravite = Math.max(r.gravite, f.gravite);
      r.resultat = f.gravite >= 3 && f.statut !== 'en vigueur' ? f.statut : 'code trouvé';
      if (fiches.length > 1) { r.resultat = 'code présent dans ' + fiches.map((x) => NOMENCLATURES[x.nomenclature]).join(' et '); r.gravite = Math.max(r.gravite, 1); r.pistes.push(fiches.slice(1).map((x) => NOMENCLATURES[x.nomenclature] + ' : ' + x.libelle).join(' ; ') + ' ; choisissez la nomenclature pour trancher'); }
      if (r.nom && f.libelle) {
        const premier = normaliserTexte(r.nom).split(' ').find((m) => m.length >= 4);
        if (premier && normaliserTexte(f.libelle + ' ' + f.detail).indexOf(premier) < 0) { r.pistes.push('le libellé de la liste ne ressemble pas à celui de la nomenclature : vérifiez le code'); r.gravite = Math.max(r.gravite, 1); }
      }
      resultats.push(r);
    });
    resultats.sort((a, b) => b.gravite - a.gravite || a.ligne - b.ligne);
    const comptes = { lignes: resultats.length, ecarts: resultats.filter((r) => r.gravite >= 2).length, aVerifier: resultats.filter((r) => r.gravite === 1).length, conformes: resultats.filter((r) => r.gravite === 0).length };
    return { resultats, comptes, date: dateRef, chargees };
  }

  const champCsv = (v) => { const s = v == null ? '' : String(v); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  function rapportCsv(resultat) {
    const colonnes = ['ligne', 'libelle_liste', 'code_saisi', 'code', 'nomenclature', 'date', 'resultat', 'libelle', 'detail', 'debut', 'fin', 'tarif', 'unite', 'precisions', 'pistes'];
    const lignes = [colonnes.join(';')];
    for (const r of resultat.resultats) lignes.push([r.ligne, r.nom, r.saisi, r.code, NOMENCLATURES[r.nomenclature] || '', r.date, r.resultat, r.libelle, r.detail, r.debut, r.fin, r.tarif, r.unite, r.precisions.join(' ; '), r.pistes.join(' ; ')].map(champCsv).join(';'));
    return '﻿' + lignes.join('\r\n') + '\r\n';
  }

  global.Nomenclatures = { FICHIERS, NOMENCLATURES, lireCsv, detecterSeparateur, normaliserTexte, cleEan13Valide, lireDate, lireCode, reconnaitreFichier, lireFichier, construire, evaluer, chercher, lireListe, controler, rapportCsv };
})(typeof window !== 'undefined' ? window : globalThis);
