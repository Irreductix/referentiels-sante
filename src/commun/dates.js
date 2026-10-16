/**
 * Normalisation des dates et des nombres rencontrés dans les sources.
 * Toutes les dates sortent au format ISO 8601 (AAAA-MM-JJ) ; les nombres
 * français à virgule deviennent des nombres JavaScript.
 */

/**
 * Accepte : AAAA-MM-JJ, AAAA-MM-JJ HH:mm:ss, AAAA-MM-JJTHH:mm:ss…, JJ/MM/AAAA,
 * AAAAMMJJ, AAAAMMJJHHmmss. Renvoie null pour vide ou non reconnu.
 */
export function dateIso(valeur) {
  if (valeur === null || valeur === undefined) return null;
  const s = String(valeur).trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})(\d{2})(\d{2})(\d{6})?$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Idem mais conserve l'heure si elle est présente : AAAA-MM-JJTHH:mm:ss. */
export function dateHeureIso(valeur) {
  if (valeur === null || valeur === undefined) return null;
  const s = String(valeur).trim();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(s);
  if (m) return `${m[1]}T${m[2]}`;
  return dateIso(s);
}

/** « 1 800,57 », « 1,466,29 » (milliers à la virgule) ou « 1800.57 » vers un nombre ; vide vers null. */
export function nombreFr(valeur) {
  if (valeur === null || valeur === undefined) return null;
  let s = String(valeur).replace(/\s/g, '');
  if (s === '') return null;
  const i = s.lastIndexOf(',');
  if (i >= 0) s = `${s.slice(0, i).replace(/,/g, '')}.${s.slice(i + 1)}`;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Chaîne vide ou blanche vers null, sinon chaîne nettoyée. */
export function texte(valeur) {
  if (valeur === null || valeur === undefined) return null;
  const s = String(valeur).trim();
  return s === '' ? null : s;
}
