// Recherche dans la base des médicaments et contrôle d'une liste de codes (CIP13, CIP7, CIS) :
// tout se calcule dans le navigateur. Testé avec Node dans tests/medicaments.test.js.
(function (global) {
  'use strict';

  const SEPARATEURS = /[\s .]/g;
  const VIDE = /^[\s ]*(?:[-‐-―−]+|n[ée]ant|n\/?a|nc|sans objet)?[\s ]*$/i;
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

  // Clé de contrôle d'un CIP13 (EAN-13) : somme pondérée 1, 3, 1, 3… des douze premiers chiffres.
  function cleCip13Valide(c) {
    if (!/^\d{13}$/.test(c || '')) return null;
    let somme = 0;
    for (let i = 0; i < 12; i += 1) somme += Number(c[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (somme % 10)) % 10 === Number(c[12]);
  }

  // Un code, nettoyé : CIP13 (13 chiffres), CIP7 (7 chiffres) ou CIS (8 chiffres).
  function lireCode(v) {
    const brut = String(v == null ? '' : v);
    if (estVide(brut)) return { type: '', valeur: '' };
    const n = brut.replace(SEPARATEURS, '');
    if (/^\d{13}$/.test(n)) return { type: 'cip13', valeur: n };
    if (/^\d{8}$/.test(n)) return { type: 'cis', valeur: n };
    if (/^\d{7}$/.test(n)) return { type: 'cip7', valeur: n };
    return { type: 'illisible', valeur: n };
  }

  function lireIndex(texte) {
    const lignes = lireCsv(texte, ';').filter((l) => !ligneVide(l));
    const entete = lignes.shift() || [];
    const pos = {};
    entete.forEach((c, i) => { pos[c] = i; });
    for (const c of ['cip13', 'cip7', 'cis', 'denomination', 'presentation', 'statut_presentation', 'etat_presentation', 'prix_medicament']) {
      if (pos[c] === undefined) throw new Error('index inattendu : colonne ' + c + ' absente');
    }
    const g = (l, c) => (pos[c] === undefined ? '' : (l[pos[c]] || ''));
    const parCip13 = new Map(); const parCip7 = new Map(); const parCis = new Map();
    const presentations = lignes.map((l) => {
      const p = {
        cip13: g(l, 'cip13'), cip7: g(l, 'cip7'), cis: g(l, 'cis'), denomination: g(l, 'denomination'), forme: g(l, 'forme'), presentation: g(l, 'presentation'),
        titulaires: g(l, 'titulaires'), statutAmm: g(l, 'statut_amm'), etatSpecialite: g(l, 'etat_specialite'), statutPresentation: g(l, 'statut_presentation'),
        etatPresentation: g(l, 'etat_presentation'), dateCommercialisation: g(l, 'date_commercialisation'), agrement: g(l, 'agrement_collectivites'),
        taux: g(l, 'taux_remboursement'), prix: g(l, 'prix_medicament'), prixPublic: g(l, 'prix_public'), honoraires: g(l, 'honoraires'),
        groupe: g(l, 'groupe_generique'), typeGenerique: g(l, 'type_generique'), disponibilite: g(l, 'disponibilite'),
      };
      p.norm = normaliserTexte(p.denomination + ' ' + p.presentation + ' ' + p.titulaires + ' ' + p.groupe);
      if (p.cip13) parCip13.set(p.cip13, p);
      if (p.cip7) parCip7.set(p.cip7, p);
      if (!parCis.has(p.cis)) parCis.set(p.cis, []);
      parCis.get(p.cis).push(p);
      return p;
    });
    return {
      presentations, parCip13, parCip7, parCis, nombre: presentations.length, specialites: parCis.size,
      commercialisees: presentations.filter((p) => /^Déclaration de commercialisation/.test(p.etatPresentation)).length,
    };
  }

  function chercher(index, requete, max) {
    const limite = max || 50;
    const q = String(requete || '').trim();
    if (q.length < 2) return [];
    const chiffres = q.replace(SEPARATEURS, '');
    const resultats = [];
    if (/^\d{3,13}$/.test(chiffres)) {
      for (const p of index.presentations) {
        if (p.cip13.startsWith(chiffres) || p.cip7.startsWith(chiffres) || p.cis.startsWith(chiffres)) {
          resultats.push(p);
          if (resultats.length >= limite) break;
        }
      }
      return resultats;
    }
    const mots = normaliserTexte(q).split(' ').filter(Boolean);
    if (!mots.length) return [];
    const scores = [];
    for (const p of index.presentations) {
      let score = 0;
      for (const m of mots) {
        const i = p.norm.indexOf(m);
        if (i < 0) { score = -1; break; }
        score += i === 0 || p.norm.charAt(i - 1) === ' ' ? 2 : 1;
      }
      if (score < 0) continue;
      if (/^Déclaration de commercialisation/.test(p.etatPresentation)) score += 1;
      scores.push({ p, score });
      if (scores.length >= limite * 8) break;
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limite).map((x) => x.p);
  }

  const estCelluleEntete = (v, motif) => { const t = normaliserTexte(v); return t.length > 0 && t.length <= 30 && motif.test(t); };

  function reconnaitreEntete(l) {
    const col = {};
    l.forEach((v, i) => {
      if (col.code === undefined && estCelluleEntete(v, /\bCIP\d*\b|\bCIS\b|\bCODE\b|\bUCD\d*\b|EAN/)) col.code = i;
      else if (col.nom === undefined && estCelluleEntete(v, /NOM|LIBELLE|DENOMINATION|SPECIALITE|PRODUIT|MEDICAMENT|DESIGNATION/)) col.nom = i;
    });
    return col.code !== undefined ? col : null;
  }

  // Liste collée : une colonne de codes (CIP13, CIP7 ou CIS, même mélangés), un nom facultatif.
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
      // Avec un en-tête, une ligne réduite à une cellule qui n'est pas un code est un titre de section.
      if (entete && remplies(l) === 1 && !(parEntete && lireCode(l[parEntete.code]).type && lireCode(l[parEntete.code]).type !== 'illisible')) return;
      donnees.push(l); numeros.push(i + 1);
    });
    const colonnes = {};
    if (parEntete) Object.assign(colonnes, parEntete);
    if (colonnes.code === undefined) {
      let best = -1; let val = 0;
      for (let c = 0; c < largeur; c += 1) {
        let n = 0;
        for (const l of donnees.slice(0, 300)) { const t = lireCode(l[c]).type; if (t && t !== 'illisible') n += 1; }
        if (n > val) { val = n; best = c; }
      }
      if (best >= 0) colonnes.code = best;
    }
    if (colonnes.nom === undefined) {
      let best = -1; let val = 0;
      for (let c = 0; c < largeur; c += 1) {
        if (c === colonnes.code) continue;
        let n = 0;
        for (const l of donnees.slice(0, 300)) { const v = String(l[c] == null ? '' : l[c]); if (/[A-Za-z]{3}/.test(v)) n += v.length; }
        if (n > val) { val = n; best = c; }
      }
      if (best >= 0) colonnes.nom = best;
    }
    return { lignes: donnees, numeros, colonnes, entete, ligneEntete: entete ? indexEntete + 1 : 0 };
  }

  function etatPresentation(p) {
    if (/abrog/i.test(p.statutPresentation)) return ['présentation abrogée', 3];
    if (/arr[êe]t/i.test(p.etatPresentation)) return ['arrêt de commercialisation' + (p.dateCommercialisation ? ' le ' + p.dateCommercialisation : ''), 3];
    if (/^Déclaration de commercialisation/.test(p.etatPresentation)) {
      if (/rupture|arr[êe]t/i.test(p.disponibilite)) return ['commercialisée, ' + p.disponibilite.toLowerCase(), 2];
      if (p.disponibilite) return ['commercialisée, ' + p.disponibilite.toLowerCase(), 1];
      if (!/^Commercialis/.test(p.etatSpecialite)) return ['présentation commercialisée mais spécialité ' + (p.etatSpecialite || 'sans état').toLowerCase(), 2];
      return ['commercialisée' + (p.dateCommercialisation ? ' depuis le ' + p.dateCommercialisation : ''), 0];
    }
    return [p.etatPresentation || 'état inconnu', 1];
  }

  function controler(index, liste) {
    const col = liste.colonnes;
    const cellule = (l, i) => (i === undefined ? '' : String(l[i] == null ? '' : l[i]));
    const resultats = [];
    liste.lignes.forEach((l, k) => {
      const code = lireCode(cellule(l, col.code));
      const r = { ligne: liste.numeros[k] || k + 1, nom: cellule(l, col.nom).trim(), code: code.valeur, type: code.type, gravite: 0, pistes: [], denomination: '', presentation: '', cip13: '', cis: '', etat: '', prix: '', taux: '', titulaires: '', groupe: '' };
      let p = null;
      if (!code.type) { r.resultat = 'pas de code'; r.gravite = 1; }
      else if (code.type === 'illisible') { r.resultat = 'code illisible'; r.gravite = 3; }
      else if (code.type === 'cip13') {
        p = index.parCip13.get(code.valeur) || null;
        r.resultat = p ? 'présentation trouvée' : 'CIP13 inconnu';
        if (!p && cleCip13Valide(code.valeur) === false) r.pistes.push('clé de contrôle du CIP13 invalide : faute de frappe probable');
        // Un CIP13 contient le CIP7 en positions 6 à 12 (3400 + 9 + CIP7 + clé).
        if (!p && index.parCip7.has(code.valeur.slice(5, 12))) { const q = index.parCip7.get(code.valeur.slice(5, 12)); r.pistes.push('les chiffres 6 à 12 correspondent au CIP7 ' + q.cip7 + ' (' + q.denomination + ', CIP13 ' + q.cip13 + ')'); }
      } else if (code.type === 'cip7') {
        p = index.parCip7.get(code.valeur) || null;
        r.resultat = p ? 'présentation trouvée' : 'CIP7 inconnu';
      } else if (code.type === 'cis') {
        const liste2 = index.parCis.get(code.valeur) || [];
        if (liste2.length) {
          r.resultat = 'spécialité trouvée (' + liste2.length + ' présentation' + (liste2.length > 1 ? 's' : '') + ')';
          r.denomination = liste2[0].denomination; r.cis = code.valeur; r.titulaires = liste2[0].titulaires; r.groupe = liste2[0].groupe;
          const actives = liste2.filter((x) => /^Déclaration de commercialisation/.test(x.etatPresentation));
          r.etat = actives.length + ' présentation' + (actives.length > 1 ? 's' : '') + ' commercialisée' + (actives.length > 1 ? 's' : '') + ' sur ' + liste2.length;
          if (!actives.length) r.gravite = 3;
          r.pistes.push('CIP13 : ' + liste2.map((x) => x.cip13 + (/^Déclaration de commercialisation/.test(x.etatPresentation) ? '' : ' (arrêtée)')).join(', '));
        } else r.resultat = 'CIS inconnu';
      }
      if (r.resultat && /inconnu|illisible/.test(r.resultat)) r.gravite = 3;
      if (p) {
        r.denomination = p.denomination; r.presentation = p.presentation; r.cip13 = p.cip13; r.cis = p.cis; r.titulaires = p.titulaires; r.groupe = p.groupe;
        const e = etatPresentation(p);
        r.etat = e[0]; r.gravite = Math.max(r.gravite, e[1]);
        r.prix = p.prix; r.taux = p.taux;
        if (p.agrement && !/^oui/i.test(p.agrement)) r.pistes.push('non agréée aux collectivités');
        if (p.typeGenerique && p.typeGenerique !== 'princeps') r.pistes.push(p.typeGenerique + (p.groupe ? ' du groupe ' + p.groupe : ''));
        if (r.nom && p.denomination && normaliserTexte(r.nom).split(' ')[0] && normaliserTexte(p.denomination).indexOf(normaliserTexte(r.nom).split(' ')[0]) < 0) {
          r.pistes.push('le nom de la liste ne ressemble pas à la dénomination : vérifiez le code'); r.gravite = Math.max(r.gravite, 2);
        }
      }
      resultats.push(r);
    });
    resultats.sort((a, b) => b.gravite - a.gravite || a.ligne - b.ligne);
    const comptes = { lignes: resultats.length, ecarts: resultats.filter((r) => r.gravite >= 2).length, aVerifier: resultats.filter((r) => r.gravite === 1).length, conformes: resultats.filter((r) => r.gravite === 0).length };
    return { resultats, comptes };
  }

  const champCsv = (v) => { const s = v == null ? '' : String(v); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  function rapportCsv(resultat) {
    const colonnes = ['ligne', 'nom_liste', 'code', 'type', 'resultat', 'denomination', 'presentation', 'cip13', 'cis', 'etat', 'prix', 'taux_remboursement', 'titulaires', 'groupe_generique', 'pistes'];
    const lignes = [colonnes.join(';')];
    for (const r of resultat.resultats) lignes.push([r.ligne, r.nom, r.code, r.type, r.resultat, r.denomination, r.presentation, r.cip13, r.cis, r.etat, r.prix, r.taux, r.titulaires, r.groupe, r.pistes.join(' ; ')].map(champCsv).join(';'));
    return '﻿' + lignes.join('\r\n') + '\r\n';
  }

  global.Medicaments = { lireCsv, detecterSeparateur, normaliserTexte, cleCip13Valide, lireCode, lireIndex, chercher, lireListe, controler, rapportCsv };
})(typeof window !== 'undefined' ? window : globalThis);
