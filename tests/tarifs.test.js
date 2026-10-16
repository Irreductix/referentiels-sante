import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

vm.runInThisContext(readFileSync(new URL('../site/tarifs/tarifs.js', import.meta.url), 'utf8'));
const T = globalThis.Tarifs;

const ENTETE = 'secteur;ghs;cmd;activite_soins;ghm;libelle;seuil_bas;seuil_haut;tarif;exb_forfait;exb_journalier;exh_journalier;date_effet';
const A = [ENTETE,
  'public;22;01;C;01C031;Craniotomies pour traumatisme, niveau 1;0;11;4100.00;0;0;120.00;2025-03-01',
  'public;23;01;C;01C032;Craniotomies pour traumatisme, niveau 2;0;19;7300.00;0;0;100.00;2025-03-01',
  'public;30;01;M;01M041;Accidents vasculaires, niveau 1;0;8;2000.00;0;0;90.00;2024-03-01',
  'public;31;01;M;01M041;Accidents vasculaires, niveau 1, bis;0;8;2100.00;0;0;90.00;2024-03-01',
  'public;99;02;C;02C021;Acte supprimé;0;5;500.00;0;0;0;2025-03-01',
  'prive;22;01;C;01C031;Craniotomies pour traumatisme, niveau 1;0;11;1800.00;0;0;270.00;2025-03-01',
].join('\n') + '\n';
const B = [ENTETE,
  'public;22;01;C;01C031;Craniotomies pour traumatisme, niveau 1;0;11;4203.57;0;0;124.33;2026-01-01',
  'public;23;01;C;01C032;Craniotomies pour traumatisme, niveau 2;0;19;7300.00;0;0;102.74;2025-03-01',
  'public;30;01;M;01M041;Accidents vasculaires, niveau 1;0;8;1950.00;0;0;90.00;2026-01-01',
  'public;31;01;M;01M041;Accidents vasculaires, niveau 1, bis;0;8;2100.00;0;0;90.00;2024-03-01',
  'public;120;03;C;03C101;Nouvel acte;0;3;800.00;0;0;0;2026-01-01',
  'prive;22;01;C;01C031;Craniotomies pour traumatisme, niveau 1;0;11;1850.00;0;0;275.00;2026-01-01',
].join('\n') + '\n';

test('lireTarifs lit un ghs.csv du convertisseur et date la campagne', () => {
  const a = T.lireTarifs(A);
  assert.equal(a.tarifs.length, 6);
  assert.equal(a.campagne, '2025');
  assert.deepEqual(a.secteurs, ['prive', 'public']);
  assert.equal(T.lireTarifs(B).campagne, '2026');
  assert.throws(() => T.lireTarifs('a;b\n1;2\n'), /colonne secteur absente/);
});

test('comparer classe chaque GHS : hausse, baisse, stable, nouveau, supprimé', () => {
  const c = T.comparer(T.lireTarifs(A), T.lireTarifs(B));
  const par = (secteur, ghs) => c.lignes.find((l) => l.secteur === secteur && l.ghs === ghs);
  assert.equal(c.campagneA, '2025');
  assert.equal(par('public', '22').statut, 'hausse');
  assert.equal(par('public', '22').ecart, 103.57);
  assert.equal(par('public', '22').pct, 2.53);
  assert.equal(par('public', '23').statut, 'stable');
  assert.equal(par('public', '30').statut, 'baisse');
  assert.equal(par('public', '99').statut, 'supprimé');
  assert.equal(par('public', '120').statut, 'nouveau');
  assert.equal(par('prive', '22').exhB, 275);
  const r = T.resumer(c, 'public');
  assert.deepEqual([r.total, r.hausse, r.baisse, r.stable, r.nouveau, r.supprime], [6, 1, 1, 2, 1, 1]);
  assert.equal(r.medianePct, 0);
  assert.equal(T.filtrer(c, { secteur: 'public', texte: 'vasculaires' }).length, 2);
  assert.equal(T.filtrer(c, { cmd: '03' }).length, 1);
});

test('lireVolumes reconnaît GHS ou GHM et volumes, avec ou sans en-tête', () => {
  const v1 = T.lireVolumes('GHS\tSéjours\n22\t120\n30\t45\n');
  assert.equal(v1.entete, true);
  assert.deepEqual(v1.colonnes, { code: 0, volume: 1 });
  assert.deepEqual(v1.lignes.map((l) => [l.ghs, l.volume]), [['22', 120], ['30', 45]]);
  const v2 = T.lireVolumes('01C031;12\n01M041;8\n');
  assert.deepEqual(v2.colonnes, { code: 0, volume: 1 });
  assert.equal(v2.lignes[0].ghm, '01C031');
  const v3 = T.lireVolumes('22\t120\n23\t45\n01C031\t10\n');
  assert.deepEqual(v3.colonnes, { code: 0, volume: 1 }, 'deux colonnes de nombres : la première est le code');
  assert.deepEqual(v3.lignes.map((l) => l.ghs || l.ghm), ['22', '23', '01C031']);
  const v4 = T.lireVolumes('Nombre de séjours;Code GHM\n12;01C031\n');
  assert.deepEqual(v4.colonnes, { code: 1, volume: 0 }, "l'en-tête fait foi, quel que soit l'ordre");
});

test("impact chiffre l'écart pour des volumes, et signale les GHM ambigus", () => {
  const c = T.comparer(T.lireTarifs(A), T.lireTarifs(B));
  const r = T.impact(c, T.lireVolumes('GHS\tSéjours\n22\t100\n23\t10\n99\t3\n'), 'public');
  assert.equal(r.totalA, 483000);
  assert.equal(r.totalB, 493357);
  assert.equal(r.delta, 10357);
  assert.equal(r.pct, 2.14);
  assert.equal(r.sejours, 110);
  assert.equal(r.nonChiffres, 1, 'le GHS supprimé ne peut pas être chiffré');
  assert.equal(r.lignes[0].ghs, '22', 'trié par écart absolu');
  const g = T.impact(c, T.lireVolumes('01M041;8\n01C032;2\n'), 'public');
  assert.match(g.lignes.find((l) => l.code === '01M041').note, /2 GHS pour ce GHM/);
  assert.equal(g.lignes.find((l) => l.code === '01C032').montantB, 14600);
  const csv = T.rapportImpactCsv(c, g);
  assert.ok(csv.indexOf('tarif_2025;tarif_2026') > 0);
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(T.rapportCsv(c).split('\r\n')[0].indexOf('ecart_pct') > 0);
});
