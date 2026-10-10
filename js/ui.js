'use strict';
/* Scorciatoie da tastiera, aiuto e finestre modali */
// ---------- Scorciatoie da tastiera ----------
const SPEED_KEYS = { 1: 0, 2: 1, 3: 60, 4: 120, 5: 300, 6: 900, 7: CFG.turboSpeed };
function helpModal() {
  openModal(`<h2>Scorciatoie e gradi</h2>
    <p><kbd>Spazio</kbd> pausa / riprendi · <kbd>1</kbd>-<kbd>7</kbd> velocità (pausa, tempo reale, 1, 2, 5, 15 min/s, 1 ora/s)<br>
    <kbd>T</kbd> minaccia successiva · <kbd>Esc</kbd> deseleziona · <kbd>I</kbd> intercetta la minaccia selezionata col caccia più veloce<br>
    <kbd>B</kbd> bombardiere / <kbd>A</kbd> aereo tattico contro la minaccia selezionata a terra · <kbd>C</kbd> caserma · <kbd>?</kbd> questo aiuto</p>
    <p>${RANKS.map(r => `<b>${r.name}</b> ${r.at}`).join(' · ')}</p>
    <button class="btn" data-action="closeModal">Chiudi</button>`);
}
document.addEventListener('keydown', e => {
  if (!S || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key;
  if (modal.classList.contains('open')) { if (k === 'Escape' && !modalLocked) closeModal(); return; }
  if (k === '?' || k === 'h' || k === 'H') { helpModal(); return; }
  if (!S.base || S.over || S.pending) return;
  let handled = true;
  if (k === ' ') {
    if (e.target.closest && e.target.closest('button')) return; // lo spazio attiva il pulsante col focus
    if (S.speed > 0) { S.prevSpeed = S.speed; A.speed(0); } else A.speed(S.prevSpeed > 0 && S.prevSpeed !== CFG.turboSpeed ? S.prevSpeed : 60);
  } else if (SPEED_KEYS[k] !== undefined) A.speed(SPEED_KEYS[k]);
  else if (k === 'Escape') { S.selectedThreat = null; }
  else if (k === 'c' || k === 'C') A.barracks();
  else if (k === 't' || k === 'T') {
    const ids = S.threats.map(t => t.id);
    if (ids.length) S.selectedThreat = ids[(ids.indexOf(S.selectedThreat) + 1) % ids.length];
  } else if (k === 'i' || k === 'I') {
    const th = S.selectedThreat && findThreat(S.selectedThreat);
    if (th && th.state !== 'cooldown') A.intercept(th.id);
  } else if (k === 'b' || k === 'B' || k === 'a' || k === 'A') {
    const th = S.selectedThreat && findThreat(S.selectedThreat);
    if (th && th.state === 'cooldown') A.strike(th.id, k.toLowerCase() === 'b' ? 'bomber' : 'tactical');
  } else handled = false;
  if (handled) { e.preventDefault(); panelDirty = true; renderPanel(); }
});

// ---------- Modale ----------
const modal = document.getElementById('modal');
// locked: la finestra non si chiude con Esc (profilo, fine partita, avviso di debito)
let modalLocked = false, modalBack = null, modalOnClose = null;
// wide: finestra larga (caserma); onClose: chiamata solo alla chiusura vera, non quando un'altra finestra la sostituisce
function openModal(html, locked = false, onClose = null, wide = false) {
  const card = document.getElementById('modalCard');
  card.innerHTML = html; card.classList.toggle('wide', wide);
  modalLocked = locked; modalOnClose = onClose; modal.classList.add('open');
}
function closeModal() {
  const cb = modalOnClose;
  modal.classList.remove('open'); modalLocked = false; modalBack = null; modalOnClose = null;
  if (cb) cb();
}

// ---------- Avvio: menu, profilo del comandante, classifica ----------
const PROFILE_KEY = 'difesa-aerea-2049.profilo';
const worldStates = () => [...new Set(worldRows.map(r => r.Stato))].sort((a, b) => a.localeCompare(b, 'it'));
function readProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch (e) { return {}; }
}
function openProfileForm(error = '') {
  const last = readProfile();
  openModal(`<h2>Identificazione del comandante</h2>
    <p class="note">Il tuo nome comparirà in classifica. Scegli lo stato che rappresenti.</p>
    <form id="profileForm" autocomplete="off">
      <label>Nome<input id="pf-nome" maxlength="24" required value="${esc(last.nome || '')}"></label>
      <label>Cognome<input id="pf-cognome" maxlength="24" required value="${esc(last.cognome || '')}"></label>
      <label>Stato<select id="pf-stato" required>${worldStates().map(st => `<option value="${esc(st)}" ${st === last.stato ? 'selected' : ''}>${esc(st)}</option>`).join('')}</select></label>
      <p class="warn-text" id="pf-err">${esc(error)}</p>
      <button class="btn" type="submit">Assumi il comando</button>
    </form>`, true);
  const f = document.getElementById('pf-nome'); if (f) f.focus();
}
function showStartMenu(save) {
  const st = save.state, p = st.profile;
  openModal(`<h2>Difesa Aerea 2049</h2>
    <p>Un XCOM hardcore dedicato alla logistica: pochi aerei, crediti contati, nessuna rete di sicurezza. Ogni decisione ha un costo, e il pianeta non perdona.</p>
    <p class="note">Ultima partita: <b>${esc(p.nome)} ${esc(p.cognome)}</b> (${esc(p.stato)}), ${fmtClock(st.t)}, ${st.medals} medaglie, salvata il ${esc(new Date(save.savedAt).toLocaleString('it-IT'))}.</p>
    <button class="btn" data-action="continueGame">Continua l'ultima partita</button>
    <button class="btn ghost" data-action="newGame">Nuova partita</button>
    <button class="btn ghost" data-action="board">Classifica</button>`, true);
}
Object.assign(A, {
  continueGame() { const d = readSave(); if (d) loadSave(d); else A.newGame(); },
  startGame() {
    const nome = document.getElementById('pf-nome').value.trim(), cognome = document.getElementById('pf-cognome').value.trim();
    const stato = document.getElementById('pf-stato').value;
    if (!nome || !cognome) { document.getElementById('pf-err').textContent = 'Inserisci nome e cognome.'; return; }
    if (!worldStates().includes(stato)) { document.getElementById('pf-err').textContent = 'Scegli uno stato dell\'elenco.'; return; }
    S.profile = { nome, cognome, stato };
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(S.profile)); } catch (e) { /* ignora */ }
    closeModal();
    addLog(`Comandante ${nome} ${cognome} (${stato}) assume il comando.`, 'good');
    renderPanel(true);
  },
  async board() {
    const open = modal.classList.contains('open');
    if (open && !modalBack) modalBack = { html: document.getElementById('modalCard').innerHTML, locked: modalLocked };
    const back = modalBack;
    openModal('<h2>Classifica</h2><p class="note">Caricamento…</p>', back ? back.locked : false);
    modalBack = back;
    const list = await loadBoard();
    if (!document.getElementById('modalCard').textContent.includes('Caricamento')) return;
    openModal(`<h2>Classifica</h2>${boardHtml(list, null, '')}<button class="btn" data-action="boardBack">${back ? 'Indietro' : 'Chiudi'}</button>`, back ? back.locked : false);
    modalBack = back;
  },
  boardBack() { const b = modalBack; modalBack = null; if (b) openModal(b.html, b.locked); else closeModal(); },
  downloadBoard() { downloadBoard(); },
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'profileForm') return;
  e.preventDefault(); A.startGame(); panelDirty = true; renderPanel();
});
