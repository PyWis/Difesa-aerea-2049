'use strict';
/* Salvataggio locale: uno snapshot a ogni mezzanotte di gioco, cancellato quando la partita finisce */
const SAVE_KEY = 'difesa-aerea-2049.save', SAVE_VERSION = 1;
function saveGame() {
  if (!S || !S.base || S.over) return false;
  try {
    const snap = JSON.parse(JSON.stringify(S));
    Object.assign(snap, { speed: 0, prevSpeed: 60, turboLeft: 0, pending: null, askBankrupt: false, hoverSite: null, autosave: false });
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, savedAt: new Date().toISOString(), state: snap }));
    return true;
  } catch (e) { return false; }
}
function autosave() {
  addLog('Mezzanotte: partita salvata.');
  saveGame();
}
function readSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    return d && d.v === SAVE_VERSION && d.state && d.state.base && d.state.profile && !d.state.over ? d : null;
  } catch (e) { return null; }
}
function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage non disponibile */ }
}
function loadSave(d) {
  S = d.state;
  const same = (a, b) => a.name === b.name && Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6;
  // gli addestramenti puntano a oggetti di BASES: ricollega i riferimenti persi con il JSON
  for (const tr of S.trainings) tr.base = BASES.find(b => same(b, tr.base)) || tr.base;
  if (!S.threats.some(t => t.id === S.selectedThreat)) S.selectedThreat = null;
  if (!S.pilots) { S.pilots = []; S.pilotsLost = 0; S.ids.PL = 0; initPilots(); A.autoCrew(); } // salvataggi precedenti alla caserma
  closeModal();
  addLog('Partita ripresa dall\'ultimo salvataggio (in pausa).', 'good');
  renderPanel(true);
}
