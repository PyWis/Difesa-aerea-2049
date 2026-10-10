'use strict';
/* Fine partita: vittoria, sconfitta, cancellazione del salvataggio e classifica */
function scoreEntry(victory, esito) {
  const p = S.profile || {};
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    nome: p.nome || 'Anonimo', cognome: p.cognome || '', stato: p.stato || '',
    medaglie: S.medals, giorni: Math.round(S.t / DAY * 100) / 100, vittoria: victory,
    esito, grado: RANKS[rankIdx(S.medals)].name, minacce: S.kills, crediti: Math.floor(S.credits),
    ammiragli: S.pilots.filter(isAdmiral).length, // punteggio extra
    data: new Date().toISOString(),
  };
}
// chiude la partita: il salvataggio viene cancellato e il risultato entra in classifica
function finishGame(victory, esito, html) {
  if (S.over) return;
  S.over = true; S.speed = 0;
  deleteSave();
  const ref = S, entry = scoreEntry(victory, esito);
  openModal(`${html}
    <button class="btn" data-action="restart">Nuova partita</button>
    <div id="endBoard"><p class="note">Registrazione in classifica…</p></div>`, true);
  submitScore(entry).then(r => {
    const el = document.getElementById('endBoard');
    if (S === ref && el) el.innerHTML = boardHtml(r.board, entry.id, r.saved);
  });
}
const admiralText = () => { const n = S.pilots.filter(isAdmiral).length; return n ? ` Ammiragli di Volo (punteggio extra): ${n}.` : ''; };
const whoText = () => S.profile ? `${esc(S.profile.nome)} ${esc(S.profile.cognome)} (${esc(S.profile.stato)})` : 'Comandante';
function victory() {
  finishGame(true, 'Generale Planetario', `<h2>Generale Planetario!</h2>
    <p>${whoText()}, hai raggiunto ${MEDALS_GOAL} medaglie: il cielo del pianeta è al sicuro e il comando ti conferisce il grado supremo.</p>
    <p>Data: ${fmtClock(S.t)}. Giorni di servizio: ${(S.t / DAY).toFixed(1)}. Minacce eliminate: ${S.kills}. Addestramenti completati: ${S.trainDone}. Crediti: ${Math.floor(S.credits)}.${admiralText()}</p>`);
}
function gameOver(title, text) {
  finishGame(false, title, `<h2>${title}</h2>
    <p>${whoText()}: ${text}</p>
    <p>Fine del servizio: ${fmtClock(S.t)}. Minacce eliminate: ${S.kills}. Punti medaglia: ${S.medals}. Giorni di servizio: ${(S.t / DAY).toFixed(1)}.${admiralText()}</p>
    <p class="note">Il salvataggio è stato cancellato.</p>`);
}
