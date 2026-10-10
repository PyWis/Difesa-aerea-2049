'use strict';
/* Stato di gioco, economia, prestiti e debito */
// ---------- Stato ----------
let S, worldRows = [], BASES = [];
const thSpeed = () => CFG.threatSpeed * (1 + CFG.diffSpeed * rankIdx(S.medals));
// probabilità di vincere uno scontro; con un aereo p si sommano i bonus dei suoi piloti
const winCh = p => Math.min(CFG.pilots.maxWin, Math.max(CFG.winMin, CFG.winChance - CFG.diffWin * rankIdx(S.medals)) + (p ? crewWin(p) : 0));
const atkCh = () => CFG.attackChance + CFG.diffAttack * rankIdx(S.medals);
// effetti temporanei (anche per i salvataggi precedenti, a cui mancano i campi nuovi)
const newFx = () => ({ recallUntil: 0, recallBase: null, pilotUntil: 0, pilotLeft: 0, techUntil: 0, flight: null, monumentUntil: 0, repLater: [],
  calmUntil: 0, cadetsUntil: 0, cadetMissionsUntil: 0, space: [] });
function newGame() {
  S = {
    credits: CFG.startCredits, rep: CFG.startRep, t: 0, speed: 0, base: null,
    sites: pickSites(worldRows),
    support: { recon: 0, tanker: 0, signals: 0, lock: { recon: 0, tanker: 0 } }, planes: [], threats: [], log: [], loans: [], emergency: [],
    ids: { P: 0, R: 0, C: 0, B: 0, A: 0, T: 0, M: 0, L: 0, E: 0, K: 0, D: 0, PL: 0, X: 0 }, pilots: [], pilotsLost: 0, trainings: [], trainDone: 0,
    decl: null, askBankrupt: false, debtSince: null, debtAlerted: false, autosave: false, profile: null,
    extra: [], research: 0, artAt: {}, missiles: [], pending: null,
    fx: newFx(), launch: [], pilotsSpace: 0, apocDone: 0,
    ops: { at: {}, boosts: [] },
    selectedThreat: null, hoverSite: null, over: false, prevSpeed: 900, turboLeft: 0,
    barracks: { seats: CFG.pilots.barracks.start, admSeats: 0 },
    patrols: [], kills: 0, medals: 0, slots: { fighter: TYPES.fighter.max, bomber: TYPES.bomber.max },
  };
  closeModal();
  addLog('Scegli una base operativa tra le 10 località proposte.');
  renderPanel(true);
}
function addLog(msg, kind = '') {
  S.log.unshift({ t: S.t, msg, kind });
  if (S.log.length > 80) S.log.pop();
  panelDirty = true;
}
function spend(amount, why) {
  S.credits -= amount;
  if (S.credits < 0 && !S.over) {
    if (!S.emergency.some(l => l.left > 0)) takeEmergency();
    else if (canLoan()) takeLoan(true);
  }
  checkDebt(why);
}
// Debito: la bancarotta scatta oltre −debt.limit crediti oppure dopo debt.hours ore consecutive in negativo.
// Appena si va in negativo compare un avviso (una volta per ogni periodo in rosso).
const debtLeftMin = () => S.debtSince == null ? 0 : Math.max(0, CFG.debt.hours * 60 - (S.t - S.debtSince));
function checkDebt(why) {
  if (S.over) return;
  if (S.credits >= 0) { S.debtSince = null; S.debtAlerted = false; return; }
  if (S.credits < -CFG.debt.limit) { bankrupt(why, `Il debito ha superato i ${CFG.debt.limit} crediti`); return; }
  if (S.debtSince == null) S.debtSince = S.t;
  else if (debtLeftMin() <= 0) { bankrupt(why, `Sei rimasto in negativo per ${CFG.debt.hours} ore`); return; }
  if (!S.debtAlerted) { S.debtAlerted = true; offerDeclaration(why); }
}
function bankrupt(why, detail) {
  gameOver('Bancarotta', `${detail || 'I crediti sono finiti'}${why ? ' (' + why.toLowerCase() + ')' : ''}: fornitori e Nazioni Unite chiudono i rubinetti.`);
}
// ---------- Dichiarazione di emergenza ----------
// ogni versamento: +perDay crediti e −repPerDay di reputazione; la prima subito, le altre a mezzanotte
const declStep = () => CFG.declaration.repPerDay;
const canDeclare = () => !S.decl && !S.over && S.credits < CFG.declaration.maxCredits;
function offerDeclaration(why) {
  if (S.askBankrupt) return;
  S.askBankrupt = true; S.resumeSpeedB = S.speed; S.speed = 0; S.bankruptWhy = why;
  const d = CFG.declaration, dc = CFG.debt;
  openModal(`<h2>Crediti in negativo</h2>
    <p>Il saldo è sceso a <b>${Math.floor(S.credits)}</b> crediti${why ? ` (${esc(why.toLowerCase())})` : ''}. Hai già usato i prestiti automatici disponibili.</p>
    <p class="warn-text">Bancarotta se il debito supera ${dc.limit} crediti oppure se resti in negativo per ${dc.hours} ore di gioco. Il saldo torna positivo con le ricompense.</p>
    ${canDeclare() ? `<p class="note">Dichiarazione di emergenza: ${d.perDay} crediti al giorno per ${d.days} giorni (il primo subito), al costo del ${d.repPerDay}% di reputazione a ogni versamento.</p>` : ''}
    ${canDeclare() ? '<button class="btn" data-action="declare">Dichiara l\'emergenza</button>' : ''}
    <button class="btn ghost" data-action="continueDebt">Continua</button>
    <button class="btn ghost" data-action="acceptBankrupt">Accetta la bancarotta</button>`);
}
// ---------- Prestiti ONU ----------
const recentLoans = () => S.loans.filter(l => S.t - l.takenAt < CFG.loanWindowDays * DAY);
const canLoan = () => recentLoans().length < CFG.loanMax;
const nextLoanIn = () => { const r = recentLoans(); return r.length < CFG.loanMax ? 0 : Math.min(...r.map(l => l.takenAt)) + CFG.loanWindowDays * DAY - S.t; };
function takeEmergency() {
  const l = { id: 'E' + (++S.ids.E), takenAt: S.t, left: CFG.emergencyInstallments };
  S.emergency.push(l);
  S.credits += CFG.emergencyAmount;
  addLog(`Crediti in negativo: attivato il prestito fornitori di emergenza ${l.id} di ${CFG.emergencyAmount} crediti. Rimborso: ${CFG.emergencyInstallments} rate da ${CFG.emergencyInstallment} a mezzanotte.`, 'bad');
}
function takeLoan(auto) {
  if (!canLoan()) return;
  const l = { id: 'L' + (++S.ids.L), takenAt: S.t, left: CFG.loanInstallments };
  S.loans.push(l);
  S.credits += CFG.loanAmount;
  addLog(`${auto ? 'Crediti esauriti: attivato in automatico il' : 'Ottenuto il'} prestito ONU ${l.id} di ${CFG.loanAmount} crediti. Rimborso: ${CFG.loanInstallments} rate da ${CFG.loanInstallment} a mezzanotte.`, auto ? 'bad' : '');
}
function changeRep(delta) {
  S.rep = Math.max(0, Math.min(100, S.rep + delta));
  if (S.rep <= 0 && !S.over) gameOver('Reputazione azzerata', 'Troppe basi sono state attaccate senza risposta: il comando ti ha sollevato dall\'incarico.');
}
function addMedal(n) {
  const before = rankIdx(S.medals);
  S.medals += n;
  const after = rankIdx(S.medals);
  if (after > before) addLog(`Promozione! Nuovo grado: ${RANKS[after].name} (${S.medals} medaglie). Le minacce diventano più pericolose.`, 'good');
  if (S.medals >= MEDALS_GOAL && !S.over) victory();
}
function declPay() {
  const d = CFG.declaration;
  S.decl.left--;
  S.credits += d.perDay;
  addLog(`Emergenza: +${d.perDay} crediti, reputazione −${declStep()}%${S.decl.left ? `, ancora ${S.decl.left} ${S.decl.left === 1 ? 'versamento' : 'versamenti'}` : ', emergenza conclusa'}.`);
  if (!S.decl.left) S.decl = null;
  changeRep(-declStep());
}
// basi attive: operativa e secondarie (bersagli della minaccia dell'apocalisse e dei bombardieri)
const activeBases = () => [{ kind: 'main', name: S.base.name, lat: S.base.lat, lon: S.base.lon },
  ...S.extra.map(b => ({ kind: b.kind, name: b.site.name, lat: b.site.lat, lon: b.site.lon }))];
// periodo senza nuove minacce dopo aver sconfitto la minaccia dell'apocalisse
const calm = () => S.t < S.fx.calmUntil;
const planesOf = type => S.planes.filter(p => p.type === type);
// ---------- Basi secondarie e ricerca ----------
// prossima base secondaria acquistabile: la prima non posseduta, in ordine (anche se una è stata distrutta)
const nextBaseDef = () => CFG.bases.find(d => !extraOf(d.kind));
const extraOf = kind => S.extra.find(b => b.kind === kind);
const isOwnBase = b => dist(b, S.base) < 1 || S.extra.some(x => dist(b, x.site) < 1);
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function addResearch(n) {
  if (!extraOf('research') || n <= 0) return 0;
  S.research += n;
  return n;
}
const researchCharges = () => Math.floor(S.research / CFG.artifactResearch + 1e-9);
function maxOf(type) {
  if (type === 'tactical') return TYPES.tactical.max + (planesOf('bomber').length >= CFG.tacticalBonusAtBombers ? 1 : 0);
  return S.slots[type];
}
// velocità effettiva: motore sonico ×2, caccia salvato dalla difesa jet ×0,5, equipaggio e capitano di pattuglia
const techOn = () => S.t < S.fx.techUntil;
const spd = p => (p.speed + (techOn() ? CFG.art.techBonus : 0) + crewStrikeSpeed(p)) * (S.t < (p.sonicUntil || 0) ? 2 : 1) * (p.damaged ? 0.5 : 1) * (p.joining ? CFG.patrolJoinSpeed : 1) * (p.fast ? CFG.patrolReturnSpeed : 1) * (p.recov || 1) * patrolSpeedMult(p);
const repMult = rep => (CFG.repRecovery.find(r => rep < r.below) || { mult: 1 }).mult;
const findPlane = id => S.planes.find(p => p.id === id);
const findThreat = id => S.threats.find(t => t.id === id);

