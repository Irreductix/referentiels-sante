// Contrôle d'une liste d'établissements contre l'index FINESS+ : tout se calcule ici,
// dans le navigateur. Aucune donnée n'est envoyée. Testé avec Node dans tests/controle.test.js.
(function (global) {
  'use strict';

  const SEPARATEURS = /[\s .]/g;
  const VIDE = /^[\s ]*(?:[-‐-―−]+|n[ée]ant|n\/?a|nc|sans objet)?[\s ]*$/i;

  function luhn(s) {
    if (!/^\d+$/.test(s || '')) return null;
    let somme = 0;
    for (let i = 0; i < s.length; i += 1) {
      let d = s.charCodeAt(s.length - 1 - i) - 48;
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      somme += d;
    }
    return somme % 10 === 0;
  }

  // Clé des numéros FINESS : Luhn sur neuf caractères, 2A comptant 21 et 2B comptant 22.
  function cleFinessValide(f) {
    if (!/^(\d{2}|2[AB])\d{7}$/.test(f || '')) return null;
    return luhn(f.replace(/^2A/, '21').replace(/^2B/, '22'));
  }

  function cleSiretValide(s) {
    if (!/^\d{14}$/.test(s || '')) return null;
    if (s.startsWith('356000000')) return luhn(s) || s.split('').reduce((a, c) => a + Number(c), 0) % 5 === 0;
    return luhn(s);
  }

  const estVide = (v) => VIDE.test(String(v == null ? '' : v));

  function normaliserFiness(v) {
    const s = String(v == null ? '' : v).replace(SEPARATEURS, '').toUpperCase();
    if (/^(\d{2}|2[AB])\d{7}$/.test(s)) return s;
    if (/^\d{8}$/.test(s)) return '0' + s;
    return null;
  }

  function lireSiret(v) {
    const brut = String(v == null ? '' : v);
    if (estVide(brut)) return { forme: 'absent', valeur: null };
    const n = brut.replace(SEPARATEURS, '');
    if (/^\d{14}$/.test(n)) return { forme: 'siret', valeur: n };
    if (/^\d{9}$/.test(n)) return { forme: 'siren', valeur: n };
    return { forme: 'mal formé', valeur: n };
  }

  function codePostal(v) {
    const s = String(v == null ? '' : v);
    const re = /(\d{2})[\s ]?(\d{3})(?!\d)/g;
    let m;
    while ((m = re.exec(s))) {
      if (m.index > 0 && /\d/.test(s[m.index - 1])) continue;
      if (/\b(BP|CS|TSA)[\s ]*$/i.test(s.slice(Math.max(0, m.index - 8), m.index))) continue;
      return m[1] + m[2];
    }
    return null;
  }

  function normaliserTexte(v) {
    return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  // Pour la recherche, « ST » et « STE » valent « SAINT » et « SAINTE », dans l'index comme dans la requête.
  const normaliserRecherche = (v) => normaliserTexte(v).replace(/\bST\b/g, 'SAINT').replace(/\bSTE\b/g, 'SAINTE');

  function normaliserCommune(v) {
    return normaliserTexte(String(v == null ? '' : v).replace(/\b(BP|CS|TSA)[\s ]*\d+/gi, ' ').replace(/\d/g, ' '))
      .replace(/\bCEDEX\b.*$/, '').replace(/\bST\b/g, 'SAINT').replace(/\bSTE\b/g, 'SAINTE').replace(/\s+/g, ' ').trim();
  }

  function distance(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i += 1) {
      d.push([i]);
      for (let j = 1; j <= b.length; j += 1) d[i].push(i === 0 ? j : 0);
    }
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  }

  // CSV ou TSV à guillemets doublés, BOM facultatif. Renvoie des tableaux de chaînes.
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
          if (k < 0) {
            champ += texte.slice(j);
            i = n;
            break;
          }
          champ += texte.slice(j, k);
          if (texte.charCodeAt(k + 1) === 34) {
            champ += '"';
            j = k + 2;
            continue;
          }
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
        if (i >= n) {
          ligne.push('');
          lignes.push(ligne);
          ligne = [];
        }
        continue;
      }
      if (i < n && texte.charCodeAt(i) === 13) i += 1;
      if (i >= n || texte.charCodeAt(i) === 10) {
        lignes.push(ligne);
        ligne = [];
        i += 1;
        continue;
      }
      i += 1;
    }
    if (ligne.length) lignes.push(ligne);
    return lignes.filter((l) => l.some((v) => String(v).trim() !== ''));
  }

  function detecterSeparateur(texte) {
    const tete = texte.slice(0, 5000);
    if (tete.indexOf('\t') >= 0) return '\t';
    const pv = (tete.match(/;/g) || []).length;
    const virg = (tete.match(/,/g) || []).length;
    return pv >= virg ? ';' : ',';
  }

  // L'index : douze colonnes, un établissement par ligne.
  function lireIndex(texte) {
    const lignes = lireCsv(texte, ';');
    const entete = lignes.shift() || [];
    const pos = {};
    entete.forEach((c, i) => { pos[c] = i; });
    for (const c of ['finess_et', 'finess_ej', 'nom_court', 'nom_long', 'siret', 'categorie_libelle', 'etat', 'date_fermeture', 'code_postal', 'commune_acheminement', 'ej_denomination']) {
      if (pos[c] === undefined) throw new Error('index inattendu : colonne ' + c + ' absente');
    }
    const parEt = new Map();
    const parEj = new Map();
    const ejNom = new Map();
    const etab = lignes.map((l) => {
      const e = {
        et: l[pos.finess_et] || '', ej: l[pos.finess_ej] || '', nomCourt: l[pos.nom_court] || '', nomLong: l[pos.nom_long] || '',
        siret: l[pos.siret] || '', categorie: l[pos.categorie_libelle] || '', etat: l[pos.etat] || '', dateFermeture: l[pos.date_fermeture] || '',
        cp: l[pos.code_postal] || '', commune: l[pos.commune_acheminement] || '', ejNom: l[pos.ej_denomination] || '',
      };
      e.norm = normaliserRecherche(e.nomCourt + ' ' + e.nomLong + ' ' + e.commune + ' ' + e.ejNom);
      parEt.set(e.et, e);
      if (!parEj.has(e.ej)) parEj.set(e.ej, []);
      parEj.get(e.ej).push(e);
      if (e.ejNom && !ejNom.has(e.ej)) ejNom.set(e.ej, e.ejNom);
      return e;
    });
    return { etab, parEt, parEj, ejNom, nombre: etab.length, actifs: etab.filter((e) => e.etat === 'A').length };
  }

  function chercher(index, requete, max) {
    const limite = max || 50;
    const q = String(requete || '').trim();
    if (q.length < 2) return [];
    const chiffres = q.replace(SEPARATEURS, '').toUpperCase();
    const resultats = [];
    if (/^(\d{2}|2[AB])?\d{2,14}$/.test(chiffres) && /\d/.test(chiffres)) {
      for (const e of index.etab) {
        if (e.et.startsWith(chiffres) || e.ej.startsWith(chiffres) || (chiffres.length >= 5 && e.siret.startsWith(chiffres))) {
          resultats.push(e);
          if (resultats.length >= limite) break;
        }
      }
      return resultats;
    }
    const mots = normaliserRecherche(q).split(' ').filter(Boolean);
    if (!mots.length) return [];
    // Un mot trouvé en début de mot compte double : « mercy » avant « commercy ».
    const scores = [];
    for (const e of index.etab) {
      let score = 0;
      for (const m of mots) {
        const i = e.norm.indexOf(m);
        if (i < 0) { score = -1; break; }
        score += i === 0 || e.norm.charAt(i - 1) === ' ' ? 2 : 1;
      }
      if (score < 0) continue;
      scores.push({ e, score });
      if (scores.length >= limite * 8) break;
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limite).map((x) => x.e);
  }

  // Détecte les colonnes d'une liste collée ou déposée : FINESS, SIRET, code postal, nom.
  function lireListe(texte) {
    const sep = detecterSeparateur(texte);
    const lignes = lireCsv(texte, sep);
    if (!lignes.length) return { lignes: [], colonnes: {}, entete: false, separateur: sep };
    const largeur = Math.max.apply(null, lignes.map((l) => l.length));
    const premiere = lignes[0].map((v) => normaliserTexte(v));
    const parEntete = {};
    premiere.forEach((v, i) => {
      if (/FINESS/.test(v) && parEntete.finess === undefined) parEntete.finess = i;
      else if (/SIRET|SIREN/.test(v) && parEntete.siret === undefined) parEntete.siret = i;
      else if (/POSTAL|COMMUNE|CP\b|VILLE/.test(v) && parEntete.cp === undefined) parEntete.cp = i;
      else if (/RAISON|NOM|LIBELLE|DENOMINATION|ETABLISSEMENT/.test(v) && parEntete.nom === undefined) parEntete.nom = i;
    });
    const entete = parEntete.finess !== undefined || parEntete.siret !== undefined;
    const donnees = entete ? lignes.slice(1) : lignes;
    const score = { finess: [], siret: [], cp: [], nom: [] };
    for (let c = 0; c < largeur; c += 1) {
      let f = 0; let s = 0; let p = 0; let t = 0;
      for (const l of donnees.slice(0, 200)) {
        const v = String(l[c] == null ? '' : l[c]);
        if (!v.trim()) continue;
        if (normaliserFiness(v)) f += 1;
        if (/^\d{14}$/.test(v.replace(SEPARATEURS, ''))) s += 1;
        if (codePostal(v) && /[A-Za-z]/.test(v)) p += 1;
        if (/[A-Za-z]{3}/.test(v) && !codePostal(v)) t += v.length;
      }
      score.finess.push(f); score.siret.push(s); score.cp.push(p); score.nom.push(t);
    }
    const meilleure = (tab, exclure) => {
      let best = -1; let val = 0;
      tab.forEach((v, i) => { if (v > val && exclure.indexOf(i) < 0) { val = v; best = i; } });
      return best < 0 ? undefined : best;
    };
    const colonnes = {};
    colonnes.finess = parEntete.finess !== undefined ? parEntete.finess : meilleure(score.finess, []);
    colonnes.siret = parEntete.siret !== undefined ? parEntete.siret : meilleure(score.siret, [colonnes.finess]);
    colonnes.cp = parEntete.cp !== undefined ? parEntete.cp : meilleure(score.cp, [colonnes.finess, colonnes.siret]);
    colonnes.nom = parEntete.nom !== undefined ? parEntete.nom : meilleure(score.nom, [colonnes.finess, colonnes.siret, colonnes.cp]);
    return { lignes: donnees, colonnes, entete, separateur: sep };
  }

  function voisins(num, index) {
    const r = [];
    const examiner = (x) => {
      if (x.length !== num.length || x === num) return;
      const pos = [];
      for (let i = 0; i < x.length && pos.length <= 2; i += 1) if (x[i] !== num[i]) pos.push(i);
      if (pos.length === 1) r.push(x);
      else if (pos.length === 2 && pos[1] === pos[0] + 1 && x[pos[0]] === num[pos[1]] && x[pos[1]] === num[pos[0]]) r.push(x);
    };
    for (const e of index.etab) examiner(e.et);
    for (const ej of index.parEj.keys()) examiner(ej);
    return r;
  }

  function verdictSiret(s, siretFiness) {
    const f = siretFiness || null;
    if (s.forme === 'absent') return f ? ['non renseigné dans la liste, présent dans FINESS', 1] : ['non renseigné des deux côtés', 0];
    if (s.forme === 'mal formé') {
      if (!/^\d+$/.test(s.valeur)) return ['illisible dans la liste', 3];
      const pres = f && distance(s.valeur, f) <= 1 ? ', à un chiffre près du SIRET de FINESS' : '';
      return ['mal formé dans la liste (' + s.valeur.length + ' chiffres)' + pres, 3];
    }
    if (s.forme === 'siren') {
      if (!f) return ['SIREN seul dans la liste, rien dans FINESS', 1];
      return f.slice(0, 9) === s.valeur ? ['SIREN seul dans la liste, cohérent avec FINESS', 0] : ['SIREN seul dans la liste, différent de FINESS', 2];
    }
    if (!f) return ['présent dans la liste, absent de FINESS : FINESS à compléter', 2];
    if (f === s.valeur) return ['concorde', 0];
    return f.slice(0, 9) === s.valeur.slice(0, 9) ? ['différent : même SIREN, autre établissement', 3] : ['différent : autre SIREN', 3];
  }

  function controler(index, liste) {
    const col = liste.colonnes;
    const cellule = (l, i) => (i === undefined ? '' : String(l[i] == null ? '' : l[i]));
    const resultats = [];
    const numeros = new Set();
    const ejs = new Set();
    liste.lignes.forEach((l, k) => {
      const brutFiness = cellule(l, col.finess);
      const finess = normaliserFiness(brutFiness);
      const r = { ligne: k + 1 + (liste.entete ? 1 : 0), nom: cellule(l, col.nom).trim(), finess: finess || '', gravite: 0, pistes: [] };
      const et = finess ? index.parEt.get(finess) : null;
      const estEj = finess && !et && index.parEj.has(finess);
      if (estVide(brutFiness)) { r.resultat = 'pas de numéro FINESS'; r.gravite = 1; }
      else if (!finess) { r.resultat = 'numéro FINESS illisible'; r.gravite = 3; }
      else if (et) r.resultat = 'établissement trouvé';
      else if (estEj) r.resultat = "numéro d'entité juridique";
      else { r.resultat = 'inconnu de FINESS'; r.gravite = 3; }
      r.cle = finess ? (cleFinessValide(finess) ? 'valide' : 'invalide') : '';
      if (finess) numeros.add(finess);
      if (et) ejs.add(et.ej);
      if (estEj) ejs.add(finess);

      r.nomFiness = et ? (et.nomLong || et.nomCourt) : estEj ? (index.ejNom.get(finess) || '') : '';
      r.etat = et ? (et.etat === 'A' ? 'actif' : 'fermé' + (et.dateFermeture ? ' le ' + et.dateFermeture : '')) : estEj ? 'entité juridique' : '';
      if (et && et.etat !== 'A') r.gravite = Math.max(r.gravite, 3);

      const s = lireSiret(cellule(l, col.siret));
      r.siret = s.valeur || '';
      r.siretFiness = et ? et.siret : '';
      if (et) {
        const v = verdictSiret(s, et.siret);
        r.verdictSiret = v[0];
        r.gravite = Math.max(r.gravite, v[1]);
      } else if (estEj) {
        const premier = index.parEj.get(finess)[0];
        const siren = premier && premier.siret ? premier.siret.slice(0, 9) : '';
        r.siretFiness = siren ? 'SIREN ' + siren : '';
        if (s.valeur && siren) {
          const ok = s.valeur.slice(0, 9) === siren;
          r.verdictSiret = ok ? 'SIREN cohérent' : 'SIREN différent de celui des établissements FINESS';
          if (!ok) r.gravite = Math.max(r.gravite, 2);
        } else r.verdictSiret = 'non comparé';
      } else r.verdictSiret = '';
      if (s.forme === 'siret' && cleSiretValide(s.valeur) === false) r.pistes.push('clé du SIRET invalide dans la liste');

      const cpListe = codePostal(cellule(l, col.cp));
      r.cp = cpListe || '';
      r.cpFiness = et ? et.cp : '';
      if (!et) r.verdictCp = '';
      else if (!cpListe) r.verdictCp = col.cp === undefined ? '' : 'non lisible dans la liste';
      else if (!et.cp) r.verdictCp = 'absent de FINESS';
      else if (cpListe === et.cp) r.verdictCp = 'concorde';
      else {
        const c1 = normaliserCommune(cellule(l, col.cp));
        const memeCommune = c1 !== '' && c1 === normaliserCommune(et.commune);
        if (memeCommune && /\bCEDEX\b/i.test(et.commune)) { r.verdictCp = 'même commune, code CEDEX dans FINESS'; r.gravite = Math.max(r.gravite, 1); }
        else if (memeCommune) { r.verdictCp = 'même commune, autre code postal'; r.gravite = Math.max(r.gravite, 2); }
        else { r.verdictCp = 'différent (' + et.commune + ')'; r.gravite = Math.max(r.gravite, 2); }
      }
      resultats.push(r);
    });

    // Pistes : voisins pour les inconnus, origine des SIRET en écart, SIRET échangés.
    const siretVersEt = new Map();
    for (const ej of ejs) for (const e of index.parEj.get(ej) || []) if (e.siret) siretVersEt.set(e.siret, (siretVersEt.get(e.siret) || []).concat(e.et));
    const siretsListe = new Map();
    for (const r of resultats) if (r.siret) siretsListe.set(r.siret, (siretsListe.get(r.siret) || []).concat(r));
    for (const r of resultats) {
      if (r.resultat === 'inconnu de FINESS') {
        const v = voisins(r.finess, index);
        const proches = v.filter((x) => ejs.has((index.parEt.get(x) || { ej: x }).ej));
        const retenus = proches.length ? proches : v;
        const nom = (x) => (index.parEt.get(x) ? (index.parEt.get(x).nomLong || index.parEt.get(x).nomCourt) : index.ejNom.get(x) || 'entité juridique');
        if (retenus.length === 1) {
          const cible = index.parEt.get(retenus[0]);
          r.pistes.push('numéro voisin : ' + retenus[0] + ' (' + nom(retenus[0]) + ')' + (cible && r.siret && cible.siret === r.siret ? ', qui porte le même SIRET' : ''));
        } else if (retenus.length > 1) r.pistes.push('numéros voisins : ' + retenus.slice(0, 4).map((x) => x + ' (' + nom(x) + ')').join(', '));
        else r.pistes.push('aucun numéro à un chiffre près');
      }
      if (r.verdictSiret && r.verdictSiret.indexOf('différent') === 0) {
        const autres = (siretVersEt.get(r.siret) || []).filter((x) => x !== r.finess);
        const lignesAutres = (siretsListe.get(r.siretFiness) || []).filter((x) => x.finess !== r.finess);
        if (autres.length) r.pistes.push('ce SIRET est, dans FINESS, celui de ' + autres.map((x) => x + ' (' + (index.parEt.get(x).nomLong || index.parEt.get(x).nomCourt) + ')').join(', '));
        if (lignesAutres.length) r.pistes.push('le SIRET FINESS de cet établissement figure ligne ' + lignesAutres.map((x) => x.ligne).join(', ') + ' de la liste');
        if (lignesAutres.some((x) => x.siretFiness === r.siret)) r.pistes.push('SIRET intervertis entre deux lignes');
        if (!autres.length && !lignesAutres.length) r.pistes.push("SIRET inconnu des établissements FINESS de ces entités : à vérifier dans l'annuaire des entreprises");
      }
    }

    const absents = [];
    const entites = [];
    for (const ej of ejs) {
      const ets = index.parEj.get(ej) || [];
      const actifs = ets.filter((e) => e.etat === 'A');
      const manquants = actifs.filter((e) => !numeros.has(e.et));
      entites.push({ ej, nom: index.ejNom.get(ej) || '', total: ets.length, actifs: actifs.length, dansListe: ets.filter((e) => numeros.has(e.et)).length, manquants: manquants.length });
      for (const e of manquants) absents.push({ finess: e.et, nom: e.nomLong || e.nomCourt, categorie: e.categorie, siret: e.siret, cp: e.cp, commune: e.commune, ej });
    }
    resultats.sort((a, b) => b.gravite - a.gravite || a.ligne - b.ligne);
    const comptes = { lignes: resultats.length, ecarts: resultats.filter((r) => r.gravite >= 2).length, aVerifier: resultats.filter((r) => r.gravite === 1).length, conformes: resultats.filter((r) => r.gravite === 0).length, absents: absents.length };
    return { resultats, absents, entites, comptes };
  }

  const champCsv = (v) => {
    const s = v == null ? '' : String(v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  function rapportCsv(resultat) {
    const colonnes = ['ligne', 'nom_liste', 'finess', 'resultat', 'cle_finess', 'nom_finess', 'etat', 'siret_liste', 'siret_finess', 'verdict_siret', 'code_postal_liste', 'code_postal_finess', 'verdict_code_postal', 'pistes'];
    const lignes = [colonnes.join(';')];
    for (const r of resultat.resultats) {
      lignes.push([r.ligne, r.nom, r.finess, r.resultat, r.cle, r.nomFiness, r.etat, r.siret, r.siretFiness, r.verdictSiret, r.cp, r.cpFiness, r.verdictCp, r.pistes.join(' ; ')].map(champCsv).join(';'));
    }
    for (const a of resultat.absents) {
      lignes.push(['', '', a.finess, 'actif dans FINESS, absent de la liste', '', a.nom, 'actif', '', a.siret, '', '', a.cp, '', a.categorie + ' (entité ' + a.ej + ')'].map(champCsv).join(';'));
    }
    return '﻿' + lignes.join('\r\n') + '\r\n';
  }

  global.Controle = { luhn, cleFinessValide, cleSiretValide, normaliserFiness, lireSiret, codePostal, normaliserTexte, normaliserCommune, lireCsv, detecterSeparateur, lireIndex, chercher, lireListe, voisins, controler, rapportCsv };
})(typeof window !== 'undefined' ? window : globalThis);
