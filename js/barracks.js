'use strict';
/* Finestra Caserma: equipaggi, piloti, accademia (il tempo si ferma mentre è aperta) */
let barracksOpen = false;
const planeLabel = p => `${p.id} · ${TYPES[p.type].label}`;
const planesByType = () => [...planesOf('fighter'), ...planesOf('bomber'), ...planesOf('tactical')];

// può assegnare pl a (p, slot)? ritorna '' se sì, altrimenti il motivo
function assignBlock(pl, p, slot) {
  if (isAir(p)) return `${p.id} è in volo`;
  if (!canSlot(pl, p, slot)) return `${pilotRank(pl).name} non può essere ${SLOT_NAME[slot]} su ${TYPES[p.type].label.toLowerCase()}`;
  const cur = planeOfPilot(pl.id);
  if (cur && cur !== p && isAir(cur)) return `${pl.nome} ${pl.cognome} è in volo su ${cur.id}`;
  return '';
}
function setSlot(p, slot, pilotId) {
  const c = crewOf(p);
  if (!pilotId) { c[slot] = null; return; }
  const cur = planeOfPilot(pilotId);
  if (cur) { const cc = crewOf(cur); if (cc.first === pilotId) cc.first = null; if (cc.second === pilotId) cc.second = null; }
  c[slot] = pilotId;
}
Object.assign(A, {
  assign(planeId, slot, pilotId) {
    const p = findPlane(planeId);
    if (!p || !SLOT_NAME[slot]) return;
    if (isAir(p)) { addLog(`${p.id} è in volo: l'equipaggio si cambia a terra.`, 'bad'); return; }
    if (!pilotId) { setSlot(p, slot, null); return; }
    const pl = pilotById(pilotId); if (!pl) return;
    const why = assignBlock(pl, p, slot);
    if (why) { addLog(`Assegnazione non valida: ${why}.`, 'bad'); return; }
    setSlot(p, slot, pilotId);
    addLog(`${pilotTitle(pl)} assegnato a ${p.id} come ${SLOT_NAME[slot]}.`);
  },
  // riempie i posti vuoti: prima i più restrittivi, sempre col pilota libero di grado più alto
  autoCrew() {
    const slots = [];
    for (const p of planesByType()) if (!isAir(p)) for (const slot of ['first', 'second']) if (!crewOf(p)[slot]) slots.push({ p, slot, min: slotMin(p, slot) });
    slots.sort((a, b) => b.min - a.min);
    let n = 0;
    for (const { p, slot } of slots) {
      // meglio il pilota con più bonus; a parità il grado più basso, per tenere liberi i più rari
      const val = pl => (pilotRank(pl).win || 0) + (isStrike(p) ? (pilotRank(pl).strikeSpeed || 0) / 2000 : 0);
      const free = S.pilots.filter(pl => !planeOfPilot(pl.id) && canSlot(pl, p, slot)).sort((a, b) => val(b) - val(a) || a.rank - b.rank || b.missions - a.missions);
      if (free[0]) { setSlot(p, slot, free[0].id); n++; }
    }
    addLog(n ? `Caserma: ${n} posti assegnati in automatico.` : 'Caserma: nessun posto assegnabile (piloti liberi insufficienti o di grado troppo basso).');
    refreshBarracks();
  },
  barracks() {
    if (!S || !S.base || S.over || S.pending || S.askBankrupt || modal.classList.contains('open')) return;
    const resume = S.speed;
    S.speed = 0;
    barracksOpen = true;
    openModal(barracksHtml(), false, () => {
      barracksOpen = false;
      if (!S.over && !S.askBankrupt && S.speed === 0) S.speed = resume;
    }, true);
  },
  closeBarracks() { closeModal(); },
});

function rankRoles(i) {
  if (PR()[i].noFly) return 'non partecipa ai voli · punteggio extra';
  const lab = { fighter: 'caccia', bomber: 'bombardieri', tactical: 'tattici' }, m = CFG.pilots.slotMinRank;
  const f = slot => { const l = Object.keys(m).filter(t => i >= m[t][slot]).map(t => lab[t]); return l.length === 3 ? 'tutti i mezzi' : l.join(', '); };
  const sec = f('second'), fst = f('first');
  return [sec && `2° pilota su ${sec}`, fst && `comanda ${fst}`].filter(Boolean).join(' · ') || 'in addestramento';
}
function rankBonus(r) {
  return [r.win && `+${Math.round(r.win * 100)}% negli scontri`, r.strikeSpeed && `+${r.strikeSpeed} km/h su bombardieri e tattici`, r.captain && `pattuglia comandata: +${Math.round(CFG.pilots.patrolCaptainSpeed * 100)}% velocità a tutti`].filter(Boolean).join(', ');
}
function promoText(r) {
  if (r.academyDays) return `${r.academyDays} giorni in accademia`;
  return [r.days && `${r.days} giorni`, r.missions && `${r.missions} missioni`].filter(Boolean).join(' e ') + ' nel grado';
}
function pilotProgress(pl) {
  if (inAcademy(pl)) return `Accademia: ancora ${fmtDur(pl.academyUntil - S.t)}`;
  if (isAdmiral(pl)) return 'Punteggio extra · non partecipa ai voli';
  if (isLastRank(pl)) return `Grado massimo · ${pl.total} missioni`;
  const r = pilotRank(pl), next = PR()[pl.rank + 1];
  const parts = [r.missions && `missioni ${Math.min(pl.missions, r.missions)}/${r.missions}`, r.days && `giorni ${Math.min((S.t - pl.since) / DAY, r.days).toFixed(1)}/${r.days}`].filter(Boolean);
  return `→ ${next.name}: ${parts.join(', ')}`;
}
function crewOptions(p, slot) {
  const cur = crewOf(p)[slot];
  const list = S.pilots.filter(pl => canSlot(pl, p, slot)).sort((a, b) => b.rank - a.rank || a.cognome.localeCompare(b.cognome));
  return `<option value="">— nessuno —</option>` + list.map(pl => {
    const other = planeOfPilot(pl.id), busy = other && other.id !== p.id;
    const air = busy && isAir(other);
    return `<option value="${pl.id}" ${pl.id === cur ? 'selected' : ''} ${air ? 'disabled' : ''}>${esc(pilotTitle(pl))} (${esc(pl.naz)})${busy ? ` · su ${other.id}${air ? ' in volo' : ''}` : ''}</option>`;
  }).join('');
}
function barracksHtml() {
  const ready = S.pilots.filter(pl => !inAcademy(pl)), cadets = S.pilots.filter(inAcademy);
  const free = freePilotsOf(() => true).length, admirals = ready.filter(isAdmiral).length;
  const nx = nextSeat(), bc = barCfg(), as = S.barracks.admSeats, fmt = n => n.toLocaleString('it-IT');
  const seatsBox = `<div class="buyrow"><p class="note"><b>Posti: ${seatsUsed()}/${S.barracks.seats}</b>${barracksFull() ? ' · caserma al completo: i cadetti non arrivano' : ''} · posti Ammiragli di Volo: ${Math.min(admirals, as)}/${as} (max ${bc.admiralSeats}).</p>
      ${nx ? `<button class="btn ghost" data-action="buySeat" ${S.credits < nx.cost ? 'disabled' : ''}>Acquista un posto (${fmt(nx.cost)} crediti, fino a ${bc.tiers.find(t => S.barracks.seats < t.upTo).upTo})</button>` : '<span class="note">Posti ordinari al massimo.</span>'}
      ${as < bc.admiralSeats ? `<button class="btn ghost" data-action="buyAdmiralSeat" ${S.credits < bc.admiralCost ? 'disabled' : ''}>Posto da Ammiraglio di Volo (${fmt(bc.admiralCost)} crediti)</button>` : ''}</div>`;
  const crewRows = planesByType().map(p => {
    const air = isAir(p), bonus = [crewWin(p) && `+${Math.round(crewWin(p) * 100)}% scontri`, crewStrikeSpeed(p) && `+${crewStrikeSpeed(p)} km/h`].filter(Boolean).join(' · ');
    const sel = slot => `<label>${SLOT_NAME[slot]} <span class="note">(da ${PR()[slotMin(p, slot)].name})</span>
        <select data-crew="${p.id}|${slot}" ${air ? 'disabled' : ''}>${crewOptions(p, slot)}</select></label>`;
    return `<div class="crewrow ${air ? 'air' : ''}"><div class="crewhead"><b>${planeLabel(p)}</b> <span class="note">${p.speed} km/h${air ? ' · in volo, equipaggio bloccato' : ''}${bonus ? ` · ${bonus}` : ''}</span></div>
      <div class="crewsel">${sel('first')}${sel('second')}</div></div>`;
  }).join('') || '<p class="empty">Nessun aereo in hangar.</p>';
  const rows = [...ready.sort((a, b) => b.rank - a.rank || b.missions - a.missions || a.cognome.localeCompare(b.cognome)), ...cadets.sort((a, b) => a.academyUntil - b.academyUntil)].map(pl => {
    const p = planeOfPilot(pl.id), slot = p && (p.crew.first === pl.id ? 'first' : 'second');
    return `<tr class="${inAcademy(pl) ? 'cadet' : ''}"><td><b>${esc(pilotTitle(pl))}</b><br><span class="note">${esc(pl.naz)} · ${pilotRank(pl).name}</span></td>
      <td>${esc(pilotProgress(pl))}</td><td>${inAcademy(pl) ? '—' : p ? `${p.id} (${SLOT_NAME[slot]})` : isAdmiral(pl) ? 'non vola' : 'libero'}</td></tr>`;
  }).join('');
  const ranksHelp = PR().map((r, i) => `<tr><td><b>${r.name}</b></td><td>${rankRoles(i)}${rankBonus(r) ? `<br>${rankBonus(r)}` : ''}</td><td>${r.final ? (r.noFly ? 'si ottiene con la Missione venusiana ONU' : 'grado massimo in volo') : promoText(r)}</td></tr>`).join('');
  return `<h2>Caserma</h2>
    <p class="note">${ready.length} piloti in servizio (${free} liberi), ${cadets.length} in accademia, ${S.pilotsLost || 0} caduti${S.pilotsSpace ? `, ${S.pilotsSpace} in missione spaziale` : ''}${admirals ? `. Ammiragli di Volo (punteggio extra): ${admirals}` : ''}. ${barracksFull() ? 'Caserma al completo: nessun cadetto in arrivo' : `Un nuovo cadetto arriva a mezzanotte (tra ${fmtDur(minutesToMidnight(S.t))})`}. Il tempo è fermo finché la finestra è aperta.</p>
    ${seatsBox}
    <h3>Equipaggi</h3>
    <p class="note">Un aereo decolla solo con 1° e 2° pilota assegnati. I bonus dei piloti a bordo si sommano${CFG.pilots.deathOnLoss ? '. Se l\'aereo va perso, l\'equipaggio cade con lui' : ''}. L'equipaggio si cambia solo a terra.</p>
    <div class="crew">${crewRows}</div>
    <button class="btn ghost" data-action="autoCrew">Assegna automaticamente i posti vuoti</button>
    <h3>Piloti</h3>
    <div class="tablewrap"><table class="board roster"><thead><tr><th>Pilota</th><th>Avanzamento</th><th>Assegnazione</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="note">Nessun pilota.</td></tr>'}</tbody></table></div>
    <details class="help"><summary>Gradi, ruoli e promozioni</summary><div class="tablewrap"><table class="board"><thead><tr><th>Grado</th><th>Ruolo e bonus</th><th>Promozione</th></tr></thead><tbody>${ranksHelp}</tbody></table></div></details>
    <button class="btn" data-action="closeBarracks">Chiudi</button>`;
}
// ridisegna la finestra (se aperta) mantenendo lo scroll
function refreshBarracks() {
  if (!barracksOpen || !modal.classList.contains('open')) return;
  const card = document.getElementById('modalCard'), top = card.scrollTop, open = card.querySelector('details.help')?.open;
  card.innerHTML = barracksHtml();
  const d = card.querySelector('details.help'); if (d && open) d.open = true;
  card.scrollTop = top;
}
document.addEventListener('change', e => {
  const s = e.target.closest && e.target.closest('select[data-crew]');
  if (!s || !S) return;
  const [planeId, slot] = s.dataset.crew.split('|');
  A.assign(planeId, slot, s.value);
  refreshBarracks(); panelDirty = true; renderPanel();
});
