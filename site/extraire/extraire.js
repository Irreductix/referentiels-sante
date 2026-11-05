// Extraction d'établissements FINESS selon des critères (territoire, catégorie, secteur, GHT, activités de soins)
// et export Excel, CSV ou GeoJSON : tout se calcule dans le navigateur. Testé avec Node dans tests/extraire.test.js.
(function (global) {
  'use strict';

  const SOINS = {
    med: 'médecine', chir: 'chirurgie', obs: 'obstétrique', urg: 'urgences', crit: 'soins critiques', psy: 'psychiatrie',
    smr: 'soins médicaux et de réadaptation', sld: 'soins de longue durée', cancer: 'traitement du cancer', dial: 'dialyse', had: 'hospitalisation à domicile',
  };
  const DOMAINES = { SAN: 'sanitaire', SOC: 'social et médico-social' };
  const ROLES = { S: 'support', M: 'membre' };

  function lireCsv(texte) {
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
          if (c === 59 || c === 10 || c === 13) break;
          j += 1;
        }
        champ = texte.slice(i, j);
        i = j;
      }
      ligne.push(champ);
      if (i < n && texte.charCodeAt(i) === 59) {
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

  function normaliserTexte(v) {
    return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }
  const trierTexte = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  function lireIndex(texte) {
    const lignes = lireCsv(texte).filter((l) => !(l.length === 1 && l[0] === ''));
    const entete = lignes.shift() || [];
    const pos = {};
    entete.forEach((c, i) => { pos[c] = i; });
    for (const c of ['finess_et', 'finess_ej', 'nom_court', 'categorie', 'departement', 'secteur', 'soins', 'ght_nom']) {
      if (pos[c] === undefined) throw new Error('index inattendu : colonne ' + c + ' absente');
    }
    const g = (l, c) => (pos[c] === undefined ? '' : (l[pos[c]] || ''));
    const departements = new Map(); const categories = new Map(); const ghts = new Map();
    const etablissements = lignes.map((l) => {
      const e = {
        finessEt: g(l, 'finess_et'), finessEj: g(l, 'finess_ej'), nom: g(l, 'nom_long') || g(l, 'nom_court'), nomCourt: g(l, 'nom_court'), siret: g(l, 'siret'),
        categorie: g(l, 'categorie'), categorieLibelle: g(l, 'categorie_libelle'), domaine: g(l, 'domaine'), secteur: g(l, 'secteur'),
        adresse: g(l, 'adresse'), codePostal: g(l, 'code_postal'), commune: g(l, 'commune_acheminement'), codeCommune: g(l, 'code_commune_insee'),
        departement: g(l, 'departement'), departementLibelle: g(l, 'departement_libelle'), latitude: g(l, 'latitude'), longitude: g(l, 'longitude'),
        telephone: g(l, 'telephone'), entite: g(l, 'ej_denomination'), statutJuridique: g(l, 'ej_statut_juridique_libelle'),
        ghtNom: g(l, 'ght_nom'), ghtRole: g(l, 'ght_role'), soins: g(l, 'soins') ? g(l, 'soins').split(' ') : [],
      };
      e.norm = normaliserTexte(e.nom + ' ' + e.nomCourt + ' ' + e.entite);
      e.normCommune = normaliserTexte(e.commune);
      if (e.departement) {
        if (!departements.has(e.departement)) departements.set(e.departement, { code: e.departement, libelle: e.departementLibelle, n: 0 });
        departements.get(e.departement).n += 1;
      }
      if (e.categorie) {
        if (!categories.has(e.categorie)) categories.set(e.categorie, { code: e.categorie, libelle: e.categorieLibelle, domaine: e.domaine, n: 0 });
        categories.get(e.categorie).n += 1;
      }
      if (e.ghtNom) ghts.set(e.ghtNom, (ghts.get(e.ghtNom) || 0) + 1);
      return e;
    });
    return {
      etablissements, nombre: etablissements.length,
      departements: Array.from(departements.values()).sort((a, b) => trierTexte(a.code.padStart(3, '0'), b.code.padStart(3, '0'))),
      categories: Array.from(categories.values()).sort((a, b) => trierTexte(normaliserTexte(a.libelle), normaliserTexte(b.libelle))),
      ghts: Array.from(ghts.entries()).map(([nom, n]) => ({ nom, n })).sort((a, b) => trierTexte(normaliserTexte(a.nom), normaliserTexte(b.nom))),
    };
  }

  // Critères : departement, lieu (commune ou début de code postal), domaine, categories[], secteurs[], soins[] (toutes exigées),
  // ght, support (entités support de GHT seulement), texte (mots du nom ou de l'entité). Un critère vide ne filtre pas.
  function filtrer(index, criteres) {
    const c = criteres || {};
    const lieu = String(c.lieu || '').trim();
    const lieuChiffres = /^\d{2,5}$/.test(lieu.replace(/\s/g, '')) ? lieu.replace(/\s/g, '') : '';
    const motsLieu = lieuChiffres ? [] : normaliserTexte(lieu).split(' ').filter(Boolean);
    const mots = normaliserTexte(c.texte).split(' ').filter(Boolean);
    const categories = c.categories && c.categories.length ? new Set(c.categories) : null;
    const secteurs = c.secteurs && c.secteurs.length ? new Set(c.secteurs) : null;
    const soins = c.soins && c.soins.length ? c.soins : null;
    const resultat = index.etablissements.filter((e) => {
      if (c.departement && e.departement !== c.departement) return false;
      if (lieuChiffres && !e.codePostal.startsWith(lieuChiffres) && !e.codeCommune.startsWith(lieuChiffres)) return false;
      for (const m of motsLieu) if (e.normCommune.indexOf(m) < 0) return false;
      if (c.domaine && e.domaine !== c.domaine) return false;
      if (categories && !categories.has(e.categorie)) return false;
      if (secteurs && !secteurs.has(e.secteur)) return false;
      if (soins) for (const s of soins) if (!e.soins.includes(s)) return false;
      if (c.ght && e.ghtNom !== c.ght) return false;
      if (c.support && e.ghtRole !== 'S') return false;
      for (const m of mots) if (e.norm.indexOf(m) < 0) return false;
      return true;
    });
    resultat.sort((a, b) => trierTexte(a.departement.padStart(3, '0'), b.departement.padStart(3, '0')) || trierTexte(a.normCommune, b.normCommune) || trierTexte(a.norm, b.norm));
    return resultat;
  }

  // Une ligne par entité juridique : ses établissements retenus, ses communes, les activités de soins de l'ensemble.
  function regrouper(etablissements) {
    const parEntite = new Map();
    for (const e of etablissements) {
      if (!parEntite.has(e.finessEj)) parEntite.set(e.finessEj, { finessEj: e.finessEj, entite: e.entite, statutJuridique: e.statutJuridique, secteur: e.secteur, ghtNom: e.ghtNom, ghtRole: e.ghtRole, departement: e.departement, nb: 0, communes: [], soins: new Set() });
      const x = parEntite.get(e.finessEj);
      x.nb += 1;
      if (e.commune && !x.communes.includes(e.commune)) x.communes.push(e.commune);
      for (const s of e.soins) x.soins.add(s);
    }
    return Array.from(parEntite.values()).map((x) => Object.assign(x, { soins: Object.keys(SOINS).filter((s) => x.soins.has(s)) }))
      .sort((a, b) => trierTexte(a.departement.padStart(3, '0'), b.departement.padStart(3, '0')) || trierTexte(normaliserTexte(a.entite), normaliserTexte(b.entite)));
  }

  const libellesSoins = (soins) => soins.map((s) => SOINS[s] || s).join(', ');
  const COLONNES = {
    etablissements: [
      ['FINESS ET', (e) => e.finessEt], ['FINESS EJ', (e) => e.finessEj], ['Nom', (e) => e.nom], ['Catégorie', (e) => e.categorie],
      ['Libellé de catégorie', (e) => e.categorieLibelle], ['Domaine', (e) => DOMAINES[e.domaine] || e.domaine], ['Secteur', (e) => e.secteur],
      ['Adresse', (e) => e.adresse], ['Code postal', (e) => e.codePostal], ['Commune', (e) => e.commune], ['Code commune INSEE', (e) => e.codeCommune],
      ['Département', (e) => e.departement], ['Téléphone', (e) => e.telephone], ['SIRET', (e) => e.siret], ['Entité juridique', (e) => e.entite],
      ['Statut juridique', (e) => e.statutJuridique], ['GHT', (e) => e.ghtNom], ['Rôle dans le GHT', (e) => ROLES[e.ghtRole] || ''],
      ['Activités de soins', (e) => libellesSoins(e.soins)], ['Latitude', (e) => e.latitude, 'nombre'], ['Longitude', (e) => e.longitude, 'nombre'],
    ],
    entites: [
      ['FINESS EJ', (x) => x.finessEj], ['Entité juridique', (x) => x.entite], ['Statut juridique', (x) => x.statutJuridique], ['Secteur', (x) => x.secteur],
      ['Département', (x) => x.departement], ['GHT', (x) => x.ghtNom], ['Rôle dans le GHT', (x) => ROLES[x.ghtRole] || ''],
      ['Établissements retenus', (x) => String(x.nb), 'nombre'], ['Communes', (x) => x.communes.join(', ')], ['Activités de soins', (x) => libellesSoins(x.soins)],
    ],
  };

  // Tableau prêt à exporter : titres, types (« nombre » ou texte) et lignes de chaînes.
  function tableau(lignes, mode) {
    const colonnes = COLONNES[mode === 'entites' ? 'entites' : 'etablissements'];
    return { colonnes: colonnes.map((c) => c[0]), types: colonnes.map((c) => c[2] || 'texte'), lignes: lignes.map((l) => colonnes.map((c) => { const v = c[1](l); return v == null ? '' : String(v); })) };
  }

  const champCsv = (v) => (/[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  function versCsv(table) {
    return '﻿' + [table.colonnes].concat(table.lignes).map((l) => l.map(champCsv).join(';')).join('\r\n') + '\r\n';
  }

  function versGeoJson(etablissements) {
    const features = [];
    for (const e of etablissements) {
      if (e.latitude === '' || e.longitude === '') continue;
      features.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: [Number(e.longitude), Number(e.latitude)] },
        properties: { finess_et: e.finessEt, finess_ej: e.finessEj, nom: e.nom, categorie: e.categorie, categorie_libelle: e.categorieLibelle, secteur: e.secteur, adresse: e.adresse, code_postal: e.codePostal, commune: e.commune, departement: e.departement, entite_juridique: e.entite, ght: e.ghtNom, ght_role: e.ghtRole, soins: e.soins.join(' ') },
      });
    }
    return JSON.stringify({ type: 'FeatureCollection', features });
  }

  // Classeur Excel minimal : une feuille, cellules en texte (les numéros FINESS et SIRET gardent leurs zéros), en-tête figé et filtrable.
  const xml = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function nomColonne(i) {
    let s = ''; let n = i + 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function feuilleXml(table) {
    const nb = table.lignes.length + 1;
    const lettres = table.colonnes.map((_, i) => nomColonne(i));
    const largeurs = table.colonnes.map((titre, i) => {
      let max = titre.length;
      for (let k = 0; k < Math.min(table.lignes.length, 200); k += 1) max = Math.max(max, table.lignes[k][i].length);
      return Math.min(60, Math.max(8, max + 2));
    });
    const morceaux = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
      '<cols>' + largeurs.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>', '<sheetData>'];
    morceaux.push('<row r="1">' + table.colonnes.map((t, i) => '<c r="' + lettres[i] + '1" t="inlineStr" s="1"><is><t>' + xml(t) + '</t></is></c>').join('') + '</row>');
    for (let k = 0; k < table.lignes.length; k += 1) {
      const r = k + 2; const l = table.lignes[k]; let ligne = '<row r="' + r + '">';
      for (let i = 0; i < l.length; i += 1) {
        const v = l[i];
        if (v === '') continue;
        if (table.types[i] === 'nombre' && /^-?\d+(\.\d+)?$/.test(v)) ligne += '<c r="' + lettres[i] + r + '"><v>' + v + '</v></c>';
        else ligne += '<c r="' + lettres[i] + r + '" t="inlineStr"><is><t xml:space="preserve">' + xml(v) + '</t></is></c>';
      }
      morceaux.push(ligne + '</row>');
    }
    morceaux.push('</sheetData>', '<autoFilter ref="A1:' + lettres[lettres.length - 1] + nb + '"/>', '</worksheet>');
    return morceaux.join('');
  }
  const ENTETE_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  function fichiersXlsx(table, nomFeuille) {
    return [
      ['[Content_Types].xml', ENTETE_XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', ENTETE_XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', ENTETE_XML + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xml(nomFeuille).replace(/"/g, '&quot;') + '" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', ENTETE_XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', ENTETE_XML + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'],
      ['xl/worksheets/sheet1.xml', feuilleXml(table)],
    ];
  }

  let tableCrc = null;
  function crc32(octets) {
    if (!tableCrc) {
      tableCrc = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tableCrc[n] = c >>> 0; }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < octets.length; i += 1) crc = tableCrc[(crc ^ octets[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  async function compresser(octets) {
    if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined' || typeof Blob === 'undefined') return null;
    const flux = new Blob([octets]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }
  // Archive ZIP : compression « deflate » si le navigateur la fournit, stockage simple sinon.
  async function archiverZip(fichiers) {
    const encodeur = new TextEncoder();
    const morceaux = []; const centraux = []; let position = 0;
    for (const [nom, contenu] of fichiers) {
      const brut = typeof contenu === 'string' ? encodeur.encode(contenu) : contenu;
      const compresse = await compresser(brut);
      const donnees = compresse && compresse.length < brut.length ? compresse : brut;
      const methode = donnees === brut ? 0 : 8;
      const nomOctets = encodeur.encode(nom);
      const somme = crc32(brut);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, methode, true);
      local.setUint16(10, 0, true); local.setUint16(12, 0x5c21, true); local.setUint32(14, somme, true); local.setUint32(18, donnees.length, true);
      local.setUint32(22, brut.length, true); local.setUint16(26, nomOctets.length, true); local.setUint16(28, 0, true);
      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true); central.setUint16(8, 0x0800, true);
      central.setUint16(10, methode, true); central.setUint16(12, 0, true); central.setUint16(14, 0x5c21, true); central.setUint32(16, somme, true);
      central.setUint32(20, donnees.length, true); central.setUint32(24, brut.length, true); central.setUint16(28, nomOctets.length, true);
      central.setUint32(42, position, true);
      morceaux.push(new Uint8Array(local.buffer), nomOctets, donnees);
      centraux.push(new Uint8Array(central.buffer), nomOctets);
      position += 30 + nomOctets.length + donnees.length;
    }
    const tailleCentral = centraux.reduce((n, m) => n + m.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentral, true); fin.setUint32(16, position, true);
    const tout = morceaux.concat(centraux, [new Uint8Array(fin.buffer)]);
    const resultat = new Uint8Array(tout.reduce((n, m) => n + m.length, 0));
    let o = 0;
    for (const m of tout) { resultat.set(m, o); o += m.length; }
    return resultat;
  }
  function versXlsx(table, nomFeuille) {
    return archiverZip(fichiersXlsx(table, nomFeuille || 'Etablissements'));
  }

  global.Extraire = { SOINS, DOMAINES, ROLES, lireCsv, normaliserTexte, lireIndex, filtrer, regrouper, tableau, versCsv, versGeoJson, versXlsx, feuilleXml, archiverZip, crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
