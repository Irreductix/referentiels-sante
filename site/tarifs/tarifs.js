// Comparaison des tarifs GHS entre deux campagnes, et impact sur des volumes de séjours :
// tout se calcule dans le navigateur, à partir des fichiers ghs.csv produits par le convertisseur.
// Testé avec Node dans tests/tarifs.test.js.
(function (global) {
  'use strict';

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
    return lignes.filter((l) => l.some((v) => String(v).trim() !== ''));
  }

  function detecterSeparateur(texte) {
    const tete = texte.slice(0, 5000).replace(/"(?:[^"]|"")*"/g, '');
    const compter = (c) => tete.split(c).length - 1;
    const tab = compter('\t');
    const pv = compter(';');
    const virg = compter(',');
    if (tab > 0 && tab >= pv && tab >= virg) return '\t';
    return pv >= virg ? ';' : ',';
  }

  const nombre = (v) => {
    let s = String(v == null ? '' : v).replace(/\s/g, '');
    if (s === '') return null;
    const i = s.lastIndexOf(',');
    if (i >= 0) s = s.slice(0, i).replace(/,/g, '') + '.' + s.slice(i + 1);
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const arrondir = (n) => Math.round(n * 100) / 100;

  // ghs.csv du convertisseur : secteur;ghs;cmd;activite_soins;ghm;libelle;seuil_bas;seuil_haut;tarif;exb_forfait;exb_journalier;exh_journalier;date_effet
  function lireTarifs(texte) {
    const lignes = lireCsv(texte, ';');
    const entete = lignes.shift() || [];
    const pos = {};
    entete.forEach((c, i) => { pos[c.trim()] = i; });
    for (const c of ['secteur', 'ghs', 'ghm', 'libelle', 'tarif', 'date_effet']) {
      if (pos[c] === undefined) throw new Error('ce fichier n\'est pas un ghs.csv du convertisseur : colonne ' + c + ' absente');
    }
    const tarifs = lignes.map((l) => ({
      secteur: l[pos.secteur] || '', ghs: l[pos.ghs] || '', cmd: l[pos.cmd] || '', ghm: l[pos.ghm] || '', libelle: l[pos.libelle] || '',
      seuilBas: nombre(l[pos.seuil_bas]), seuilHaut: nombre(l[pos.seuil_haut]), tarif: nombre(l[pos.tarif]),
      exbForfait: nombre(l[pos.exb_forfait]), exbJournalier: nombre(l[pos.exb_journalier]), exh: nombre(l[pos.exh_journalier]),
      dateEffet: l[pos.date_effet] || '',
    })).filter((t) => t.ghs && t.secteur);
    const dates = tarifs.map((t) => t.dateEffet).filter(Boolean).sort();
    const derniere = dates.length ? dates[dates.length - 1] : '';
    return { tarifs, campagne: derniere.slice(0, 4), dateMax: derniere, secteurs: Array.from(new Set(tarifs.map((t) => t.secteur))).sort() };
  }

  const cle = (t) => t.secteur + '|' + t.ghs;

  // Compare deux campagnes GHS par GHS, pour chaque secteur.
  function comparer(ancien, nouveau) {
    const parCle = new Map();
    for (const t of ancien.tarifs) parCle.set(cle(t), { a: t });
    for (const t of nouveau.tarifs) {
      const e = parCle.get(cle(t));
      if (e) e.b = t; else parCle.set(cle(t), { b: t });
    }
    const lignes = [];
    for (const e of parCle.values()) {
      const t = e.b || e.a;
      const tarifA = e.a ? e.a.tarif : null;
      const tarifB = e.b ? e.b.tarif : null;
      let statut;
      if (!e.a) statut = 'nouveau';
      else if (!e.b) statut = 'supprimé';
      else if (tarifA === null || tarifB === null) statut = 'incomplet';
      else if (tarifB > tarifA) statut = 'hausse';
      else if (tarifB < tarifA) statut = 'baisse';
      else statut = 'stable';
      const ecart = tarifA !== null && tarifB !== null ? arrondir(tarifB - tarifA) : null;
      const pct = ecart !== null && tarifA ? arrondir((tarifB - tarifA) / tarifA * 100) : null;
      lignes.push({
        secteur: t.secteur, ghs: t.ghs, cmd: t.cmd, ghm: t.ghm, libelle: t.libelle, statut,
        tarifA, tarifB, ecart, pct,
        seuilBasA: e.a ? e.a.seuilBas : null, seuilBasB: e.b ? e.b.seuilBas : null,
        seuilHautA: e.a ? e.a.seuilHaut : null, seuilHautB: e.b ? e.b.seuilHaut : null,
        exhA: e.a ? e.a.exh : null, exhB: e.b ? e.b.exh : null,
        dateA: e.a ? e.a.dateEffet : '', dateB: e.b ? e.b.dateEffet : '',
      });
    }
    lignes.sort((x, y) => x.secteur.localeCompare(y.secteur) || Number(x.ghs) - Number(y.ghs));
    return { lignes, campagneA: ancien.campagne, campagneB: nouveau.campagne };
  }

  function mediane(valeurs) {
    if (!valeurs.length) return null;
    const v = valeurs.slice().sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);
    return arrondir(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
  }

  function resumer(comparaison, secteur) {
    const lignes = comparaison.lignes.filter((l) => !secteur || l.secteur === secteur);
    const compte = (s) => lignes.filter((l) => l.statut === s).length;
    const pcts = lignes.filter((l) => l.pct !== null).map((l) => l.pct);
    return {
      total: lignes.length, hausse: compte('hausse'), baisse: compte('baisse'), stable: compte('stable'),
      nouveau: compte('nouveau'), supprime: compte('supprimé'),
      medianePct: mediane(pcts), moyennePct: pcts.length ? arrondir(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    };
  }

  function filtrer(comparaison, { secteur, texte, cmd, statut } = {}) {
    const q = String(texte || '').trim().toUpperCase();
    return comparaison.lignes.filter((l) => (!secteur || l.secteur === secteur)
      && (!cmd || l.cmd === cmd)
      && (!statut || l.statut === statut)
      && (!q || l.ghs === q || l.ghm.toUpperCase().indexOf(q) >= 0 || l.libelle.toUpperCase().indexOf(q) >= 0));
  }

  // Volumes collés : une colonne de codes (numéros de GHS ou codes GHM, même mélangés) et une
  // colonne de nombres de séjours. L'en-tête les nomme quand il existe ; sinon la première colonne
  // de codes est le code, la colonne de nombres suivante est le volume.
  function lireVolumes(texte) {
    const sep = detecterSeparateur(texte);
    const lignes = lireCsv(texte, sep);
    if (!lignes.length) return { lignes: [], colonnes: {}, entete: false };
    const estGhm = (v) => /^\d{2}[A-Z]\d{2}[A-Z0-9]$/i.test(String(v).trim());
    const estCode = (v) => estGhm(v) || /^\d{1,5}$/.test(String(v).trim());
    const largeur = Math.max.apply(null, lignes.map((l) => l.length));
    const premiere = lignes[0].map((v) => String(v == null ? '' : v));
    const entete = premiere.some((v) => /ghs|ghm|code|volume|s[ée]jour|nombre|effectif|\bnb\b/i.test(v));
    const colonnes = {};
    if (entete) {
      premiere.forEach((v, i) => {
        if (colonnes.code === undefined && /ghs|ghm|code/i.test(v)) colonnes.code = i;
        else if (colonnes.volume === undefined && /volume|s[ée]jour|nombre|effectif|\bnb\b/i.test(v)) colonnes.volume = i;
      });
    }
    const donneesBrutes = entete ? lignes.slice(1) : lignes;
    const compte = (test) => {
      const r = [];
      for (let c = 0; c < largeur; c += 1) {
        let n = 0;
        for (const l of donneesBrutes.slice(0, 300)) { const v = String(l[c] == null ? '' : l[c]).trim(); if (v && test(v)) n += 1; }
        r.push(n);
      }
      return r;
    };
    const codes = compte(estCode);
    const nombres = compte((v) => nombre(v) !== null);
    if (colonnes.code === undefined) {
      let best = -1;
      codes.forEach((n, c) => { if (n > 0 && c !== colonnes.volume && (best < 0 || n > codes[best])) best = c; });
      if (best >= 0) colonnes.code = best;
    }
    if (colonnes.volume === undefined) {
      let best = -1;
      nombres.forEach((n, c) => { if (n > 0 && c !== colonnes.code && c > (colonnes.code === undefined ? -1 : colonnes.code) && best < 0) best = c; });
      if (best < 0) nombres.forEach((n, c) => { if (n > 0 && c !== colonnes.code && best < 0) best = c; });
      if (best >= 0) colonnes.volume = best;
    }
    const donnees = donneesBrutes.map((l, k) => {
      const code = colonnes.code !== undefined ? String(l[colonnes.code] == null ? '' : l[colonnes.code]).trim() : '';
      return {
        ligne: k + 1 + (entete ? 1 : 0), code,
        ghs: /^\d{1,5}$/.test(code) ? code : '',
        ghm: estGhm(code) ? code.toUpperCase() : '',
        volume: colonnes.volume !== undefined ? nombre(l[colonnes.volume]) : null,
      };
    });
    return { lignes: donnees, colonnes, entete };
  }

  // Impact des nouveaux tarifs sur des volumes : par ligne et au total, pour un secteur.
  function impact(comparaison, volumes, secteur) {
    const parGhs = new Map();
    const parGhm = new Map();
    for (const l of comparaison.lignes) {
      if (l.secteur !== secteur) continue;
      parGhs.set(l.ghs, l);
      if (!parGhm.has(l.ghm)) parGhm.set(l.ghm, []);
      parGhm.get(l.ghm).push(l);
    }
    const lignes = [];
    let totalA = 0; let totalB = 0; let sejours = 0; let nonChiffres = 0;
    for (const v of volumes.lignes) {
      let t = null; let note = '';
      if (v.ghs && parGhs.has(v.ghs)) t = parGhs.get(v.ghs);
      else if (v.ghm && parGhm.has(v.ghm)) {
        const c = parGhm.get(v.ghm);
        if (c.length === 1) t = c[0];
        else note = c.length + ' GHS pour ce GHM (' + c.map((x) => x.ghs).join(', ') + ') : indiquez le numéro de GHS';
      } else note = v.ghs || v.ghm ? 'inconnu dans les fichiers chargés' : 'ligne sans code';
      if (t && (t.tarifA === null || t.tarifB === null)) { note = 'tarif absent d\'une des deux campagnes'; t = null; }
      if (!t || v.volume === null) {
        if (!note) note = 'volume illisible';
        nonChiffres += 1;
        lignes.push({ ligne: v.ligne, code: v.ghs || v.ghm, ghs: t ? t.ghs : '', ghm: t ? t.ghm : '', libelle: t ? t.libelle : '', volume: v.volume, tarifA: t ? t.tarifA : null, tarifB: t ? t.tarifB : null, montantA: null, montantB: null, delta: null, note });
        continue;
      }
      const montantA = arrondir(t.tarifA * v.volume);
      const montantB = arrondir(t.tarifB * v.volume);
      totalA += montantA; totalB += montantB; sejours += v.volume;
      lignes.push({ ligne: v.ligne, code: v.ghs || v.ghm, ghs: t.ghs, ghm: t.ghm, libelle: t.libelle, volume: v.volume, tarifA: t.tarifA, tarifB: t.tarifB, montantA, montantB, delta: arrondir(montantB - montantA), note: '' });
    }
    lignes.sort((x, y) => Math.abs(y.delta || 0) - Math.abs(x.delta || 0) || x.ligne - y.ligne);
    return { lignes, totalA: arrondir(totalA), totalB: arrondir(totalB), delta: arrondir(totalB - totalA), pct: totalA ? arrondir((totalB - totalA) / totalA * 100) : null, sejours, nonChiffres };
  }

  const champCsv = (v) => {
    const s = v == null ? '' : String(v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const fr = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

  function rapportCsv(comparaison, lignes) {
    const a = comparaison.campagneA; const b = comparaison.campagneB;
    const colonnes = ['secteur', 'ghs', 'cmd', 'ghm', 'libelle', 'statut', 'tarif_' + a, 'tarif_' + b, 'ecart_euros', 'ecart_pct', 'seuil_bas_' + a, 'seuil_bas_' + b, 'seuil_haut_' + a, 'seuil_haut_' + b, 'exh_' + a, 'exh_' + b, 'date_effet_' + a, 'date_effet_' + b];
    const sortie = [colonnes.join(';')];
    for (const l of lignes || comparaison.lignes) {
      sortie.push([l.secteur, l.ghs, l.cmd, l.ghm, l.libelle, l.statut, fr(l.tarifA), fr(l.tarifB), fr(l.ecart), fr(l.pct), fr(l.seuilBasA), fr(l.seuilBasB), fr(l.seuilHautA), fr(l.seuilHautB), fr(l.exhA), fr(l.exhB), l.dateA, l.dateB].map(champCsv).join(';'));
    }
    return '﻿' + sortie.join('\r\n') + '\r\n';
  }

  function rapportImpactCsv(comparaison, resultat) {
    const a = comparaison.campagneA; const b = comparaison.campagneB;
    const sortie = [['ligne', 'code', 'ghs', 'ghm', 'libelle', 'volume', 'tarif_' + a, 'tarif_' + b, 'montant_' + a, 'montant_' + b, 'ecart', 'note'].join(';')];
    for (const l of resultat.lignes) sortie.push([l.ligne, l.code, l.ghs, l.ghm, l.libelle, fr(l.volume), fr(l.tarifA), fr(l.tarifB), fr(l.montantA), fr(l.montantB), fr(l.delta), l.note].map(champCsv).join(';'));
    sortie.push(['total', '', '', '', '', fr(resultat.sejours), '', '', fr(resultat.totalA), fr(resultat.totalB), fr(resultat.delta), resultat.nonChiffres ? resultat.nonChiffres + ' ligne(s) non chiffrée(s)' : ''].map(champCsv).join(';'));
    return '﻿' + sortie.join('\r\n') + '\r\n';
  }

  global.Tarifs = { lireCsv, detecterSeparateur, nombre, lireTarifs, comparer, resumer, filtrer, lireVolumes, impact, rapportCsv, rapportImpactCsv };
})(typeof window !== 'undefined' ? window : globalThis);
