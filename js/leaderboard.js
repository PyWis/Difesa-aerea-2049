'use strict';
/* Classifica dei 10 migliori: classifica.json (via server.py) con copia locale di riserva */
const BOARD_SIZE = 10, BOARD_KEY = 'difesa-aerea-2049.classifica';
// più medaglie vince; a parità chi è durato di più; tra le partite vinte chi ha vinto in meno giorni
const compareScores = (a, b) => b.medaglie - a.medaglie || (a.vittoria && b.vittoria ? a.giorni - b.giorni : b.giorni - a.giorni);
const rankScores = list => [...list].sort(compareScores).slice(0, BOARD_SIZE);
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const n = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : 0));
  return {
    id: clip(e.id, 40), nome: clip(e.nome, 24), cognome: clip(e.cognome, 24), stato: clip(e.stato, 40),
    medaglie: Math.round(n(e.medaglie, 0, MEDALS_GOAL)), giorni: Math.round(n(e.giorni, 0, 1e5) * 100) / 100,
    vittoria: e.vittoria === true, esito: clip(e.esito, 40), grado: clip(e.grado, 30),
    ammiragli: Math.round(n(e.ammiragli, 0, 1e4)),
    minacce: Math.round(n(e.minacce, 0, 1e6)), crediti: Math.round(n(e.crediti, -1e9, 1e9)), data: clip(e.data, 40),
  };
}
const cleanList = l => (Array.isArray(l) ? l : []).map(cleanEntry).filter(e => e && e.id);
function readLocalBoard() {
  try { return cleanList(JSON.parse(localStorage.getItem(BOARD_KEY))); } catch (e) { return []; }
}
function mergeBoards(...lists) {
  const seen = new Map();
  for (const e of lists.flat()) seen.set(e.id, e);
  return rankScores([...seen.values()]);
}
let lastBoard = [];
async function loadBoard() {
  let remote = [];
  try {
    const res = await fetch('classifica.json', { cache: 'no-store' });
    if (res.ok) remote = cleanList((await res.json()).classifica);
  } catch (e) { /* file non raggiungibile: resta la copia locale */ }
  return (lastBoard = mergeBoards(remote, readLocalBoard()));
}
// salva il risultato: sul server se c'è (scrive classifica.json), altrimenti nel browser
async function submitScore(entry) {
  entry = cleanEntry(entry);
  try {
    const res = await fetch('api/classifica', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    if (res.ok) return { board: (lastBoard = cleanList((await res.json()).classifica)), saved: 'server' };
  } catch (e) { /* server statico o file:// */ }
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(mergeBoards(readLocalBoard(), [entry]))); } catch (e) { /* ignora */ }
  return { board: await loadBoard(), saved: 'local' };
}
function boardHtml(board, highlightId, saved) {
  const rows = board.map((e, i) => `<tr class="${e.id === highlightId ? 'me' : ''}">
      <td>${i + 1}</td>
      <td>${esc(e.nome)} ${esc(e.cognome)}<br><span class="note">${esc(e.stato)} · ${esc(e.grado)}${e.vittoria ? ' · vittoria' : ''}${e.ammiragli ? ` · ${e.ammiragli} ${e.ammiragli === 1 ? 'ammiraglio' : 'ammiragli'}` : ''}</span></td>
      <td>${e.medaglie}</td><td>${e.giorni.toFixed(1)}</td></tr>`).join('');
  const mine = highlightId && !board.some(e => e.id === highlightId) ? '<p class="note">Il tuo risultato non è entrato nella top 10.</p>' : '';
  return `<h3>Classifica · migliori ${BOARD_SIZE}</h3>
    ${rows ? `<table class="board"><thead><tr><th>#</th><th>Comandante</th><th>Medaglie</th><th>Giorni</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="note">Nessun risultato registrato.</p>'}
    ${mine}
    <p class="note">Ordine: più medaglie; a parità, chi è durato di più; tra chi ha vinto, chi ha vinto in meno giorni.${saved === 'local' ? ' Server non disponibile: risultato salvato solo in questo browser (avvia <code>python3 server.py</code> per scrivere classifica.json).' : ''}</p>
    ${rows ? '<button class="btn ghost" data-action="downloadBoard">Scarica classifica.json</button>' : ''}`;
}
function downloadBoard() {
  const blob = new Blob([JSON.stringify({ versione: 1, aggiornato: new Date().toISOString(), classifica: lastBoard }, null, 2) + '\n'], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'classifica.json' });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
