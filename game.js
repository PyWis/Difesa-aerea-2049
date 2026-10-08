/* Difesa Aerea 2049 — logica di gioco */
(() => {
'use strict';

// ---------- Parametri (modificabili) ----------
const CFG = {
  startCredits: 2500,
  startRep: 90,             // reputazione iniziale (%)
  // livelli selezionabili per gli aerei di supporto (aerei attivi)
  reconLevels: [0, 1, 2, 5, 10, 20],
  reconRep: { 0: 0, 1: 1, 2: 2, 5: 3, 10: 4, 20: 5 }, // reputazione recuperata ogni giorno
  tankerLevels: [0, 1, 2, 5, 10, 20],
  tankerRepLoss: { 5: 2, 10: 3, 20: 4 },  // reputazione persa ogni giorno con questi rifornitori attivi
  // moltiplicatore del recupero di reputazione in base al livello attuale: sotto 50 triplo, da 50 a 90 doppio
  repRecovery: [{ below: 50, mult: 3 }, { below: 90, mult: 2 }],
  supportLockMin: 1440,     // dopo una modifica, ricognitori o rifornitori restano bloccati 24 ore
  medalChancePerPoint: 0.25, // probabilità di medaglia per ogni punto di reputazione oltre il 100% (max 1 al giorno)
  repLossCooldown: 50,      // reputazione persa quando una minaccia completa l'attacco a una base
  reconPerDay: 50,          // crediti / giorno di gioco
  tankerPerDay: 20,         // crediti / giorno di gioco
  reconSignalDays: 3,       // media di giorni di volo tra due segnalazioni (evento casuale)
  threatSpeed: 1000,        // km/h
  threatTurnChance: 0.03,   // probabilità di cambio direzione ogni ora
  upgradeStep: 100,         // km/h guadagnati per ogni giorno di potenziamento
  baseAutonomyH: 8, tankerBonusH: 4, // ore di autonomia in più per ogni rifornitore attivo
  winChance: 0.8,
  interceptRadiusKm: 15,
  killReward: 1000,         // ricompensa per minaccia eliminata
  rebuildCost: 500,         // ricostruzione dopo un bombardamento
  tacticalReward: 2000,     // premio dell'aereo tattico
  attackAfterH: 12,         // ore di volo prima che una minaccia possa attaccare
  attackChance: 0.10,       // probabilità oraria di attacco dopo attackAfterH
  cooldownMinDays: 3, cooldownMaxDays: 7,
  huntRangeKm: 1000,        // distanza entro cui una minaccia può puntare un bombardiere/tattico
  huntChance: 0.25,         // probabilità oraria che lo faccia
  strikeDefense: 0.2,       // probabilità che un bombardiere/tattico senza scorta abbatta chi lo attacca
  escortRangeKm: 1000,      // la scorta ingaggia minacce entro questa distanza dall'aereo scortato
  slotCost: { fighter: 5000, bomber: 10000 },  // posto aggiuntivo acquistabile
  slotMax: { fighter: 15, bomber: 5 },
  tacticalBonusAtBombers: 5, // con 5 bombardieri si sblocca il secondo aereo tattico
  killsForUpgrade: 3,       // abbattimenti di un caccia per un potenziamento istantaneo
  winsForUpgrade: 5,        // missioni vinte da bombardiere/tattico per un potenziamento istantaneo
  gear: {                   // dotazioni dei caccia: una sola per volta, si consumano all'uso
    shield:  { label: 'Difesa jet',      cost: 500 },
    missile: { label: 'Missile fotonico', cost: 500, rangeKm: 200, chance: 0.5 },
    sonic:   { label: 'Motore sonico',   cost: 500, durationMin: 1440 },
  },
  lossPenalty: { fighter: 1000, bomber: 2000, tactical: 3000 }, // penale per aereo abbattuto
  repairMin: 1440,          // bombardiere/tattico abbattuto: di nuovo disponibile dopo 1 giorno
  emergencyAmount: 2500,    // prestito fornitori di emergenza, automatico se i crediti vanno sotto zero
  emergencyInstallment: 800, emergencyInstallments: 4,
  loanAmount: 500,          // prestito ONU
  loanInstallment: 200,     // rata pagata a ogni mezzanotte
  loanInstallments: 3,      // numero di rate
  loanMax: 2, loanWindowDays: 7, // massimo 2 prestiti in 7 giorni
  sites: 10, minContinents: 4,
  turboSpeed: 3600,         // 1 ora di gioco al secondo
  turboMaxMin: 300,         // si disattiva da sola dopo 5 ore di gioco
  leadRecalcMin: 15,        // ricalcolo del punto d'incontro (minuti di gioco)
};
const R_EARTH = 6371;
// Ora 0 di gioco = 21 marzo 2049, 12:00
const START_MS = Date.UTC(2049, 2, 21, 12, 0, 0);
const DAY = 1440;

// ---------- Utilità geografiche ----------
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
function dist(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}
function bearingTo(a, b) {
  const p1 = rad(a.lat), p2 = rad(b.lat), dl = rad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
// muove un punto di km lungo il cerchio massimo; restituisce nuova posizione e direzione finale
function travel(p, brg, km) {
  const d = km / R_EARTH, t = rad(brg), p1 = rad(p.lat), l1 = rad(p.lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  const np = { lat: deg(p2), lon: ((deg(l2) + 540) % 360) - 180 };
  const back = bearingTo(np, p);
  return { pos: np, bearing: (back + 180) % 360 };
}
const randomPoint = () => ({ lat: deg(Math.asin(2 * Math.random() - 1)), lon: Math.random() * 360 - 180 });

// ---------- Tempo ----------
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const pad = n => String(n).padStart(2, '0');
function fmtClock(min, withSec) {
  const d = new Date(START_MS + min * 60000);
  let s = `${d.getUTCDate()} ${MESI[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (withSec) s += ':' + pad(d.getUTCSeconds());
  return s;
}
function fmtShort(min) {
  const d = new Date(START_MS + min * 60000);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function fmtDur(min) {
  min = Math.max(0, Math.round(min));
  const g = Math.floor(min / DAY), h = Math.floor((min % DAY) / 60), m = min % 60;
  if (g) return `${g}g ${h}h`;
  if (h) return `${h}h ${pad(m)}m`;
  return `${m}m`;
}
// minuti trascorsi dall'inizio del giorno solare corrente (il gioco parte alle 12:00)
const dayIndex = min => Math.floor((min + 720) / DAY);
const minutesToMidnight = min => DAY - ((min + 720) % DAY);

// ---------- CSV ----------
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const head = lines.shift().split(',');
  return lines.map(l => {
    const c = l.split(','); const o = {};
    head.forEach((h, i) => o[h.trim()] = (c[i] || '').trim());
    return o;
  }).filter(o => !isNaN(parseFloat(o.Lat_citta)));
}
async function loadWorld() {
  if (window.MONDO_CSV_EMBEDDED) return parseCSV(window.MONDO_CSV_EMBEDDED);
  const res = await fetch('mondo.csv');
  if (!res.ok) throw new Error('mondo.csv non trovato');
  return parseCSV(await res.text());
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function pickSites(rows) {
  const byCont = {};
  rows.forEach(r => (byCont[r.Continente] ||= []).push(r));
  const conts = shuffle(Object.keys(byCont)).slice(0, CFG.minContinents);
  const chosen = conts.map(c => byCont[c][Math.floor(Math.random() * byCont[c].length)]);
  const rest = shuffle(rows.filter(r => !chosen.includes(r)));
  while (chosen.length < CFG.sites && rest.length) chosen.push(rest.pop());
  return shuffle(chosen).map(r => ({
    name: r.Citta_riferimento, zone: r.Zona, state: r.Stato, cont: r.Continente,
    lat: parseFloat(r.Lat_citta), lon: parseFloat(r.Lon_citta),
  }));
}


// ---------- Tipi di aereo da combattimento ----------
const TYPES = {
  fighter:  { label: 'Caccia',        prefix: 'C', max: 8, base: 1000, top: 2000, perHour: 5,  color: 'fighter' },
  bomber:   { label: 'Bombardiere',   prefix: 'B', max: 3, base: 300,  top: 700,  perHour: 10, color: 'bomber' },
  tactical: { label: 'Aereo tattico', prefix: 'A', max: 1, base: 300,  top: 700,  perHour: 15, color: 'tactical' },
};
const isStrike = p => p.type === 'bomber' || p.type === 'tactical';
const AIR_STATES = ['flight', 'escort', 'rtb'];
const isAir = p => AIR_STATES.includes(p.state);

// ---------- Stato ----------
let S, worldRows = [], BASES = [];
function newGame() {
  S = {
    credits: CFG.startCredits, rep: CFG.startRep, t: 0, speed: 0, base: null,
    sites: pickSites(worldRows),
    support: { recon: 0, tanker: 0, signals: 0, lock: { recon: 0, tanker: 0 } }, planes: [], threats: [], log: [], loans: [], emergency: [],
    ids: { R: 0, C: 0, B: 0, A: 0, T: 0, M: 0, L: 0, E: 0 },
    selectedThreat: null, hoverSite: null, over: false, prevSpeed: 900, turboLeft: 0,
    kills: 0, medals: 0, slots: { fighter: TYPES.fighter.max, bomber: TYPES.bomber.max },
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
  if (S.credits < 0 && !S.over) gameOver('Bancarotta', `I crediti sono finiti${why ? ' (' + why.toLowerCase() + ')' : ''}: il prestito di emergenza è ancora da restituire e non è possibile chiedere altri prestiti ONU.`);
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
const planesOf = type => S.planes.filter(p => p.type === type);
function maxOf(type) {
  if (type === 'tactical') return TYPES.tactical.max + (planesOf('bomber').length >= CFG.tacticalBonusAtBombers ? 1 : 0);
  return S.slots[type];
}
// velocità effettiva: motore sonico ×2, caccia salvato dalla difesa jet ×0,5
const spd = p => p.speed * (S.t < (p.sonicUntil || 0) ? 2 : 1) * (p.damaged ? 0.5 : 1);
const repMult = rep => (CFG.repRecovery.find(r => rep < r.below) || { mult: 1 }).mult;
const findPlane = id => S.planes.find(p => p.id === id);
const findThreat = id => S.threats.find(t => t.id === id);

// ---------- Azioni ----------
const A = {
  pickBase(i) {
    const s = S.sites[i];
    S.base = s;
    S.speed = 60;
    addLog(`Base operativa stabilita a ${s.name} (${s.state}, ${s.cont}).`, 'good');
    renderPanel(true);
  },
  speed(v) {
    if (!S.base || S.over) return;
    v = +v;
    if (v === CFG.turboSpeed) {
      if (S.speed !== CFG.turboSpeed) S.prevSpeed = S.speed || 900;
      S.turboLeft = CFG.turboMaxMin;
    }
    S.speed = v; panelDirty = true;
  },
  setMode(id, mode) {
    const f = findPlane(id); if (!f) return;
    f.mode = mode; f.aim = null;
  },
  buy(type) {
    const T = TYPES[type];
    if (!T || planesOf(type).length >= maxOf(type)) return;
    const id = T.prefix + (++S.ids[T.prefix]);
    S.planes.push({ id, type, state: 'base', mode: 'lead', aim: null, speed: T.base, lat: S.base.lat, lon: S.base.lon,
      target: null, escort: null, engaged: null, flightMin: 0, upgradeMin: 0, heading: 0, wins: 0, bonus: 0 });
    addLog(`${T.label} ${id} in hangar (${T.base} km/h).`);
  },
  // imposta quanti aerei di supporto sono attivi; i conti si fanno qui
  setLevel(kind, n) {
    n = +n;
    const perDay = kind === 'recon' ? CFG.reconPerDay : CFG.tankerPerDay;
    const levels = kind === 'recon' ? CFG.reconLevels : CFG.tankerLevels;
    const cur = S.support[kind];
    if (!levels.includes(n) || n === cur) return;
    if (S.t < S.support.lock[kind]) { addLog(`${kind === 'recon' ? 'Ricognitori' : 'Rifornitori'} bloccati: potrai modificarli tra ${fmtDur(S.support.lock[kind] - S.t)}.`, 'bad'); return; }
    const frac = minutesToMidnight(S.t) / DAY;
    const delta = (n - cur) * perDay * frac;
    const label = kind === 'recon' ? 'Ricognitori' : 'Rifornitori';
    if (delta > 0 && S.credits < delta) { addLog(`Crediti insufficienti per portare i ${label.toLowerCase()} a ${n}: servono ${delta.toFixed(1)} crediti.`, 'bad'); return; }
    S.support[kind] = n;
    S.support.lock[kind] = S.t + CFG.supportLockMin;
    if (delta > 0) { spend(delta); addLog(`${label} attivi: ${cur} → ${n}. Pagati ${delta.toFixed(1)} crediti fino a mezzanotte.`); }
    else { S.credits -= delta; addLog(`${label} attivi: ${cur} → ${n}. Rimborsati ${(-delta).toFixed(1)} crediti non usati.`); }
  },
  buySlot(type) {
    const cost = CFG.slotCost[type];
    if (!cost || S.slots[type] >= CFG.slotMax[type]) return;
    if (S.credits < cost) { addLog(`Servono ${cost} crediti per un posto ${type === 'fighter' ? 'caccia' : 'bombardiere'} in più.`, 'bad'); return; }
    spend(cost); S.slots[type]++;
    addLog(`Acquistato un posto ${type === 'fighter' ? 'caccia' : 'bombardiere'} in più per ${cost} crediti: ora ${S.slots[type]}.`, 'good');
  },
  // caccia contro una minaccia in volo
  intercept(threatId, planeId) {
    const th = findThreat(threatId); if (!th || th.state === 'cooldown') return;
    const f = planeId ? findPlane(planeId) : readyOf('fighter')[0];
    if (!f || f.type !== 'fighter' || f.state !== 'base') { addLog('Nessun caccia pronto alla base (quelli in potenziamento non possono decollare).', 'bad'); return; }
    launch(f);
    f.state = 'flight'; f.target = th.id;
    addLog(`${f.id} decolla verso ${th.id} (${spd(f)} km/h, ${f.mode === 'lead' ? "rotta al punto d'incontro" : 'inseguimento diretto'}, autonomia ${autonomyH().toFixed(1)} h).`);
  },
  // bombardiere o tattico contro una minaccia che sta attaccando una base
  strike(threatId, who) {
    const th = findThreat(threatId); if (!th || th.state !== 'cooldown') return;
    const p = TYPES[who] ? readyOf(who)[0] : findPlane(who);
    if (!p || !isStrike(p) || p.state !== 'base') { addLog('Nessun aereo d\'attacco disponibile alla base: devono rientrare prima di una nuova missione.', 'bad'); return; }
    launch(p);
    p.state = 'flight'; p.target = th.id;
    const eta = dist(p, th) / p.speed * 60;
    addLog(`${p.id} decolla verso ${th.attack.name} per colpire ${th.id}: arrivo tra ${fmtDur(eta)}.`);
    if (eta > th.cooldownUntil - S.t) addLog(`Attenzione: ${th.id} ripartirà prima che ${p.id} arrivi.`, 'bad');
  },
  escort(fighterId, leaderId) {
    const f = findPlane(fighterId), l = findPlane(leaderId);
    if (!f || f.type !== 'fighter' || f.damaged || !l || !isStrike(l) || !isAir(l)) return;
    if (f.state === 'upgrading' || f.state === 'repair') return;
    if (f.state === 'base') launch(f);
    f.state = 'escort'; f.escort = l.id; f.engaged = null; f.target = null; f.aim = null;
    addLog(`${f.id} scorta ${l.id}: attaccherà le minacce entro ${CFG.escortRangeKm} km.`);
  },
  retarget(planeId, threatId) {
    const p = findPlane(planeId), th = findThreat(threatId);
    if (!p || p.state !== 'rtb' || !th || isStrike(p) || p.damaged) return;
    if (isStrike(p) !== (th.state === 'cooldown')) return;
    p.state = 'flight'; p.target = threatId; p.aim = null;
    addLog(`${p.id} interrompe il rientro e punta su ${threatId}.`);
  },
  recall(id) {
    const p = findPlane(id);
    if (p && (p.state === 'flight' || p.state === 'escort')) { goHome(p); addLog(`${id} rientra alla base.`); }
  },
  buyGear(id, kind) {
    const p = findPlane(id), g = CFG.gear[kind];
    if (!p || p.type !== 'fighter' || !g || isAir(p)) return;
    if (p.gear) { addLog(`${id} ha già una dotazione (${CFG.gear[p.gear].label}): se ne può avere una sola per volta.`, 'bad'); return; }
    if (S.credits < g.cost) { addLog(`Servono ${g.cost} crediti per ${g.label}.`, 'bad'); return; }
    spend(g.cost); p.gear = kind;
    addLog(`${id} equipaggiato con ${g.label} (${g.cost} crediti).`);
  },
  upgrade(id) {
    const p = findPlane(id);
    if (!p || p.state !== 'base' || p.speed >= TYPES[p.type].top) return;
    p.state = 'upgrading'; p.upgradeMin = 0;
    addLog(`${id}: potenziamento avviato (+${CFG.upgradeStep} km/h in 24 ore).`);
  },
  cancelUpgrade(id) {
    const p = findPlane(id);
    if (p && p.state === 'upgrading') { p.state = 'base'; p.upgradeMin = 0; addLog(`${id}: potenziamento annullato.`); }
  },
  selectThreat(id) { S.selectedThreat = S.selectedThreat === id ? null : id; panelDirty = true; },
  restart() { newGame(); },
  loan() { takeLoan(false); },
};
const readyOf = type => planesOf(type).filter(p => p.state === 'base').sort((a, b) => b.speed - a.speed);
function launch(p) {
  p.flightMin = 0; p.upgradeMin = 0; p.aim = null; p.engaged = null; p.escort = null; p.target = null;
  p.autH = autonomyH(); // autonomia del volo: può solo crescere se si aggiungono rifornitori
  if (p.gear === 'sonic') {
    p.gear = null; p.sonicUntil = S.t + CFG.gear.sonic.durationMin;
    addLog(`${p.id} decolla con il motore sonico: velocità raddoppiata per ${fmtDur(CFG.gear.sonic.durationMin)}.`, 'good');
  }
  p.lat = S.base.lat; p.lon = S.base.lon;
}
function goHome(p) { p.state = 'rtb'; p.target = null; p.escort = null; p.engaged = null; p.aim = null; }
function removePlane(p, msg) {
  S.planes = S.planes.filter(x => x !== p);
  if (msg) addLog(msg, 'bad');
  detach(p);
}
// abbattimento in combattimento: penale; il caccia è perso, bombardiere e tattico tornano dopo 1 giorno
function shotDown(p, msg) {
  const pen = CFG.lossPenalty[p.type];
  if (p.type === 'fighter' && p.gear === 'shield') {
    p.gear = null; p.damaged = true;
    detach(p); goHome(p);
    addLog(`${msg} La difesa jet lo salva: rientra alla base a velocità dimezzata e non è impiegabile fino all'arrivo.`, 'good');
    return;
  }
  if (p.type === 'fighter') removePlane(p, `${msg} Penale ${pen} crediti.`);
  else {
    p.state = 'repair'; p.repairUntil = S.t + CFG.repairMin;
    p.lat = S.base.lat; p.lon = S.base.lon; p.target = null; p.escort = null; p.engaged = null; p.aim = null; p.flightMin = 0;
    addLog(`${msg} Penale ${pen} crediti, tornerà disponibile tra ${fmtDur(CFG.repairMin)}.`, 'bad');
    detach(p);
  }
  spend(pen, 'Penale per aereo abbattuto');
}
function detach(p) {
  for (const e of S.planes) if (e.state === 'escort' && e.escort === p.id) { goHome(e); addLog(`${e.id}: nessuno da scortare, rientro.`); }
  for (const th of S.threats) if (th.state === 'hunting' && th.prey === p.id) { th.state = 'flight'; th.prey = null; }
}
function killThreat(th, msg, reward = CFG.killReward) {
  removeThreat(th.id); S.kills++;
  S.credits += reward;
  addLog(`${msg} +${reward} crediti.`, 'good');
}

// ---------- Simulazione ----------
const activeTankers = () => S.support.tanker;
// autonomia dei caccia: base + ore per ogni rifornitore attivo (bombardieri e tattici sono illimitati)
const autonomyH = () => CFG.baseAutonomyH + activeTankers() * CFG.tankerBonusH;

function step(dt) {
  const t0 = S.t, t1 = S.t + dt;
  S.t = t1;

  // mezzanotte: pagamenti anticipati e reputazione
  if (dayIndex(t1) > dayIndex(t0)) {
    const billed = S.support.recon + S.support.tanker > 0;
    for (const [kind, perDay, levels, label] of [['recon', CFG.reconPerDay, CFG.reconLevels, 'Ricognitori'], ['tanker', CFG.tankerPerDay, CFG.tankerLevels, 'Rifornitori']]) {
      const n = S.support[kind];
      if (!n) continue;
      let pay = n;
      if (S.credits < n * perDay) {
        pay = Math.max(...levels.filter(l => l * perDay <= Math.max(0, S.credits)));
        addLog(`${label}: crediti insufficienti per ${n} aerei, ridotti a ${pay}.`, 'bad');
        S.support[kind] = pay;
      }
      if (pay) spend(pay * perDay);
    }
    for (const l of S.loans.filter(l => l.left > 0)) {
      l.left--;
      addLog(`Rata del prestito ONU ${l.id}: −${CFG.loanInstallment} crediti${l.left ? `, ne restano ${l.left}` : ', prestito estinto'}.`);
      spend(CFG.loanInstallment, 'Rata prestito ONU');
      if (S.over) return;
    }
    for (const l of S.emergency.filter(l => l.left > 0)) {
      l.left--;
      addLog(`Rata del prestito di emergenza ${l.id}: −${CFG.emergencyInstallment} crediti${l.left ? `, ne restano ${l.left}` : ', prestito estinto'}.`);
      spend(CFG.emergencyInstallment, 'Rata prestito di emergenza');
      if (S.over) return;
    }
    const before = S.rep;
    const baseGain = CFG.reconRep[S.support.recon] || 0, loss = CFG.tankerRepLoss[S.support.tanker] || 0;
    const mult = repMult(before), gain = baseGain * mult;
    const extra = Math.max(0, before + gain - loss - 100); // punti che andrebbero oltre il 100%
    changeRep(gain - loss);
    if (S.over) return;
    addLog(`Mezzanotte: reputazione ${Math.round(before)}% → ${Math.round(S.rep)}% (+${gain} ricognizione${mult > 1 && baseGain ? `, recupero ×${mult}` : ''}${loss ? `, −${loss} rifornitori` : ''})${billed ? ', addebitati i costi giornalieri' : ''}.`);
    if (extra > 0) {
      const chance = Math.min(1, extra * CFG.medalChancePerPoint);
      if (Math.random() < chance) { S.medals++; addLog(`${extra} ${extra === 1 ? 'punto' : 'punti'} di reputazione extra: medaglia ottenuta (probabilità ${Math.round(chance * 100)}%, totale ${S.medals}).`, 'good'); }
      else addLog(`${extra} ${extra === 1 ? 'punto' : 'punti'} di reputazione extra: nessuna medaglia oggi (probabilità ${Math.round(chance * 100)}%).`);
    }
  }

  // ricognitori: segnalazione casuale, in media una ogni N giorni di volo
  const pSignal = 1 - Math.exp(-dt / (CFG.reconSignalDays * DAY));
  for (let i = 0; i < S.support.recon; i++) {
    if (Math.random() < pSignal) { S.support.signals++; spawnThreat('La ricognizione'); }
  }

  // minacce
  const hourCrossed = Math.floor(t1 / 60) > Math.floor(t0 / 60);
  const km = CFG.threatSpeed * dt / 60;
  for (const th of [...S.threats]) {
    if (!S.threats.includes(th)) continue;
    if (th.state === 'cooldown') {
      if (S.t >= th.cooldownUntil) {
        th.state = 'flight'; th.flightStart = S.t; th.bearing = Math.random() * 360; th.course = (th.course || 0) + 1;
        addLog(`${th.id} ha completato l'attacco a ${th.attack.name} e riparte: reputazione −${CFG.repLossCooldown}%.`, 'bad');
        th.attack = null;
        changeRep(-CFG.repLossCooldown);
        if (S.over) return;
      }
      continue;
    }
    if (hourCrossed && (th.state === 'flight' || th.state === 'inbound')) {
      const prey = S.planes.filter(p => isStrike(p) && isAir(p) && dist(p, th) <= CFG.huntRangeKm).sort((a, b) => dist(a, th) - dist(b, th))[0];
      if (prey && Math.random() < CFG.huntChance) {
        th.state = 'hunting'; th.prey = prey.id; th.attack = null; th.course = (th.course || 0) + 1;
        addLog(`${th.id} ha avvistato ${prey.id} a ${Math.round(dist(prey, th))} km e gli va incontro!`, 'bad');
      } else if (th.state === 'flight' && S.t - th.flightStart >= CFG.attackAfterH * 60 && Math.random() < CFG.attackChance) {
        // qualsiasi base del mondo, purché non sia già occupata o presa di mira da un'altra minaccia
        const taken = new Set(S.threats.filter(o => o.attack).map(o => o.attack.key));
        const free = BASES.map((b, i) => i).filter(i => !taken.has(i));
        if (free.length) {
          const key = free[Math.floor(Math.random() * free.length)], tgt = BASES[key];
          const own = dist(tgt, S.base) < 1;
          th.state = 'inbound'; th.attack = { key, name: own ? `${tgt.name} (la tua base)` : tgt.name, lat: tgt.lat, lon: tgt.lon };
          th.course = (th.course || 0) + 1;
          // al giocatore appare come un normale cambio di rotta
          addLog(`${th.id} ha cambiato direzione (rotta ${Math.round(bearingTo(th, tgt))}°).`);
        }
      } else if (th.state === 'flight' && Math.random() < CFG.threatTurnChance) {
        th.bearing = Math.random() * 360; th.course = (th.course || 0) + 1;
        addLog(`${th.id} ha cambiato direzione (rotta ${Math.round(th.bearing)}°).`);
      }
    }
    if (th.state === 'hunting') {
      const prey = findPlane(th.prey);
      if (!prey || !isAir(prey)) { th.state = 'flight'; th.prey = null; addLog(`${th.id} ha perso il suo bersaglio.`); }
      else {
        th.bearing = bearingTo(th, prey);
        if (dist(th, prey) <= km + CFG.interceptRadiusKm) { ambush(th, prey); continue; }
      }
    }
    if (th.state === 'inbound') {
      th.bearing = bearingTo(th, th.attack);
      if (dist(th, th.attack) <= km) {
        th.lat = th.attack.lat; th.lon = th.attack.lon; th.state = 'cooldown';
        const days = CFG.cooldownMinDays + Math.random() * (CFG.cooldownMaxDays - CFG.cooldownMinDays);
        th.cooldownUntil = S.t + days * DAY;
        addLog(`${th.id} attacca ${th.attack.name}! Resterà lì ${fmtDur(days * DAY)}: solo bombardieri e aereo tattico possono colpirla.`, 'bad');
        for (const f of S.planes) if (f.type === 'fighter' && f.state === 'flight' && f.target === th.id) { goHome(f); addLog(`${f.id}: ${th.id} è a terra, i caccia non possono colpirla. Rientro.`); }
        continue;
      }
    }
    const mv = travel(th, th.bearing, km);
    th.lat = mv.pos.lat; th.lon = mv.pos.lon; th.bearing = mv.bearing;
  }

  // aerei
  const flying = S.planes.filter(isAir);
  const hourly = flying.reduce((s, p) => s + TYPES[p.type].perHour, 0);
  if (hourly) spend(hourly * dt / 60, 'Costi di volo');
  const autNow = autonomyH();
  for (const p of [...S.planes]) {
    if (!S.planes.includes(p)) continue;
    const T = TYPES[p.type];
    if (p.state === 'upgrading') {
      p.upgradeMin += dt;
      if (p.upgradeMin >= DAY) {
        p.speed = Math.min(T.top, p.speed + CFG.upgradeStep);
        p.state = 'base'; p.upgradeMin = 0;
        addLog(`${p.id} potenziato: ora vola a ${p.speed} km/h.`, 'good');
      }
      continue;
    }
    if (p.state === 'repair') {
      if (S.t >= p.repairUntil) { p.state = 'base'; addLog(`${p.id} è di nuovo disponibile alla base.`, 'good'); applyBonus(p); }
      continue;
    }
    if (p.state === 'base') continue;
    p.flightMin += dt;
    const pkm = spd(p) * dt / 60;
    const home = dist(p, S.base);
    if (!isStrike(p)) p.autH = Math.max(p.autH || 0, autNow); // ridurre i rifornitori non toglie autonomia a chi è in volo
    const remaining = isStrike(p) || p.damaged ? Infinity : p.autH * 60 - p.flightMin;
    if (remaining <= 0) { removePlane(p, `${p.id} ha esaurito il carburante ed è andato perduto.`); continue; }
    if (!isStrike(p) && p.state !== 'rtb' && remaining <= (home / spd(p)) * 60 * 1.05 + 5) {
      goHome(p); addLog(`${p.id}: carburante al limite, rientro automatico.`, 'bad');
    }

    if (p.state === 'flight' && p.type === 'fighter') {
      const th = findThreat(p.target);
      if (!th || th.state === 'cooldown') { goHome(p); addLog(`${p.id}: obiettivo non più colpibile, rientro.`); }
      else { chase(p, th, pkm, remaining); continue; }
    }
    if (p.state === 'flight' && isStrike(p)) {
      const th = findThreat(p.target);
      if (!th || th.state !== 'cooldown') { goHome(p); addLog(`${p.id}: ${p.target} ha lasciato la base, rientro.`); }
      else if (dist(p, th) <= pkm + CFG.interceptRadiusKm) {
        p.lat = th.lat; p.lon = th.lon;
        const where = th.attack.name;
        if (p.type === 'bomber') {
          killThreat(th, `${p.id} ha bombardato ${where} distruggendo ${th.id}.`);
          earnWin(p);
          spend(CFG.rebuildCost, 'Ricostruzione');
          addLog(`Ricostruzione di ${where.replace(' (la tua base)', '')}: −${CFG.rebuildCost} crediti.`, 'bad');
        } else {
          killThreat(th, `${p.id} ha raggiunto ${where} e ha eliminato ${th.id} senza danni.`, CFG.tacticalReward);
          earnWin(p);
        }
        goHome(p);
        continue;
      } else { moveTo(p, th, pkm); continue; }
    }
    if (p.state === 'escort') {
      const leader = findPlane(p.escort);
      if (!leader || !isAir(leader)) { addLog(`${p.id}: ${p.escort} non è più in volo, la scorta rientra.`); goHome(p); }
      else {
        let th = p.engaged && findThreat(p.engaged);
        if (th && (th.state === 'cooldown' || dist(th, leader) > CFG.escortRangeKm * 1.5)) {
          if (th.state !== 'cooldown') addLog(`${p.id}: ${th.id} troppo lontana da ${leader.id}, torna in scorta.`);
          th = null;
        }
        if (!th) {
          p.engaged = null;
          th = S.threats.filter(t => t.state !== 'cooldown' && dist(t, leader) <= CFG.escortRangeKm).sort((a, b) => dist(a, leader) - dist(b, leader))[0];
          if (th) { p.engaged = th.id; p.aim = null; addLog(`${p.id} lascia ${leader.id} per ingaggiare ${th.id}.`); }
        }
        if (th) { chase(p, th, pkm, remaining); continue; }
        if (dist(p, leader) <= pkm) { p.lat = leader.lat; p.lon = leader.lon; p.heading = leader.heading; }
        else moveTo(p, leader, pkm);
        continue;
      }
    }
    // rientro
    if (home <= pkm) {
      p.state = 'base'; p.lat = S.base.lat; p.lon = S.base.lon; p.flightMin = 0;
      addLog(`${p.id} è rientrato alla base${p.damaged ? ' ed è di nuovo impiegabile' : ''}.`);
      p.damaged = false;
      applyBonus(p);
    } else moveTo(p, S.base, pkm);
  }
}
// potenziamenti istantanei guadagnati in missione, applicati all'atterraggio
function earnWin(p) {
  p.wins = (p.wins || 0) + 1;
  const need = p.type === 'fighter' ? CFG.killsForUpgrade : CFG.winsForUpgrade;
  if (p.wins % need === 0) {
    p.bonus = (p.bonus || 0) + 1;
    addLog(`${p.id} ha raggiunto ${p.wins} ${p.type === 'fighter' ? 'abbattimenti' : 'missioni vinte'}: potenziamento istantaneo al rientro.`, 'good');
  }
}
function applyBonus(p) {
  if (!p.bonus) return;
  const T = TYPES[p.type];
  const before = p.speed;
  p.speed = Math.min(T.top, p.speed + CFG.upgradeStep * p.bonus);
  p.bonus = 0;
  if (p.speed > before) addLog(`${p.id} potenziato all'istante: ${before} → ${p.speed} km/h.`, 'good');
}
function moveTo(p, target, km) {
  const mv = travel(p, bearingTo(p, target), km);
  p.lat = mv.pos.lat; p.lon = mv.pos.lon; p.heading = mv.bearing;
}
// un caccia insegue o va al punto d'incontro; al contatto combatte
function chase(f, th, km, remaining) {
  const d = dist(f, th);
  if (f.gear === 'missile' && d <= CFG.gear.missile.rangeKm) {
    f.gear = null;
    if (Math.random() < CFG.gear.missile.chance) {
      killThreat(th, `${f.id} lancia il missile fotonico a ${Math.round(d)} km e distrugge ${th.id}!`);
      earnWin(f);
      if (f.state === 'escort') { f.engaged = null; f.aim = null; } else goHome(f);
      return;
    }
    addLog(`${f.id} lancia il missile fotonico contro ${th.id}: mancato. L'inseguimento continua.`);
  }
  if (d <= km + CFG.interceptRadiusKm) {
    f.lat = th.lat; f.lon = th.lon;
    if (Math.random() < CFG.winChance) {
      killThreat(th, `${f.id} ha abbattuto ${th.id}!`);
      earnWin(f);
      if (f.state === 'escort') { f.engaged = null; f.aim = null; addLog(`${f.id} torna a scortare ${f.escort}.`); }
      else goHome(f);
    } else shotDown(f, `${f.id} è stato abbattuto da ${th.id}.`);
    return;
  }
  let aim = th;
  if (f.mode === 'lead' && d > km * 3) {
    if (!f.aim || f.aim.target !== th.id || f.aim.course !== (th.course || 0) || S.t - f.aim.at >= CFG.leadRecalcMin
        || (f.aim.pos && dist(f, f.aim.pos) <= km)) {
      const sol = solveIntercept(f, th, Math.min(remaining, 3 * DAY));
      f.aim = { pos: sol && sol.pos, eta: sol ? sol.t : 0, target: th.id, course: th.course || 0, at: S.t };
    }
    if (f.aim.pos) aim = f.aim.pos;
  }
  moveTo(f, aim, km);
}
// una minaccia raggiunge un bombardiere o l'aereo tattico
function ambush(th, prey) {
  const escorts = S.planes.filter(e => e.state === 'escort' && e.escort === prey.id && dist(e, prey) < 150);
  for (const e of escorts) {
    if (Math.random() < CFG.winChance) { killThreat(th, `${e.id} difende ${prey.id} e abbatte ${th.id}!`); earnWin(e); return; }
    shotDown(e, `${e.id} è stato abbattuto da ${th.id} mentre difendeva ${prey.id}.`);
  }
  if (Math.random() < CFG.strikeDefense) { killThreat(th, `${prey.id} si è difeso da solo e ha abbattuto ${th.id}!`); return; }
  shotDown(prey, `${prey.id} è stato abbattuto da ${th.id}.`);
  th.state = 'flight'; th.prey = null;
}
// primo punto lungo la rotta attuale della minaccia che il caccia può raggiungere prima di lei
function solveIntercept(f, th, maxMin) {
  const v = CFG.threatSpeed / 60, u = spd(f) / 60;
  const stop = th.state === 'inbound' ? dist(th, th.attack) : Infinity;
  const at = t => travel(th, th.bearing, Math.min(v * t, stop)).pos;
  const g = t => dist(f, at(t)) - u * t;
  if (g(0) <= 0) return { pos: { lat: th.lat, lon: th.lon }, t: 0 };
  let prev = 0;
  for (let t = 10; t <= maxMin; t += 10) {
    if (g(t) <= 0) {
      let lo = prev, hi = t;
      for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (g(m) <= 0) hi = m; else lo = m; }
      return { pos: at(hi), t: hi };
    }
    prev = t;
  }
  return null;
}
function spawnThreat(by) {
  const p = randomPoint();
  const th = { id: 'M' + (++S.ids.M), lat: p.lat, lon: p.lon, bearing: Math.random() * 360, born: S.t, flightStart: S.t, state: 'flight', attack: null, prey: null };
  S.threats.push(th);
  addLog(`${by} segnala la minaccia ${th.id} a ${fmtCoord(th)}, ${Math.round(dist(th, S.base))} km dalla base.`, 'bad');
  if (S.speed !== 1) { S.speed = 1; S.turboLeft = 0; addLog('Nuova minaccia: velocità portata a tempo reale.'); }
  S.selectedThreat = th.id;
}
function removeThreat(id) {
  S.threats = S.threats.filter(x => x.id !== id);
  if (S.selectedThreat === id) S.selectedThreat = null;
  for (const p of S.planes) if (p.engaged === id) { p.engaged = null; p.aim = null; }
}
const fmtCoord = p => `${Math.abs(p.lat).toFixed(1)}°${p.lat >= 0 ? 'N' : 'S'} ${Math.abs(p.lon).toFixed(1)}°${p.lon >= 0 ? 'E' : 'O'}`;

function gameOver(title, text) {
  S.over = true; S.speed = 0;
  openModal(`<h2>${title}</h2>
    <p>${text}</p>
    <p>Fine del servizio: ${fmtClock(S.t)}. Minacce eliminate: ${S.kills}. Punti medaglia: ${S.medals}. Giorni di servizio: ${(S.t / DAY).toFixed(1)}.</p>
    <button class="btn" data-action="restart">Nuova partita</button>`);
}

// ---------- Mappa ----------
const canvas = document.getElementById('map'), ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
let W = 0, H = 0, colors = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['ocean', 'land', 'coast', 'grid', 'ink', 'ink-soft', 'base', 'threat', 'fighter', 'bomber', 'tactical', 'panel']) colors[k] = cs.getPropertyValue('--' + k).trim();
}
function resize() {
  const wrap = canvas.parentElement;
  const cssW = wrap.clientWidth - parseFloat(getComputedStyle(wrap).paddingLeft) * 2;
  W = cssW; H = cssW / 2;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  readColors();
}
// anelli con longitudine resa continua (niente linee che attraversano la mappa all'antimeridiano)
const LAND_RINGS = LAND.map(ring => {
  const pts = []; let prev = null, shift = 0;
  for (const [lo, la] of ring) {
    if (prev !== null) { const d = lo + shift - prev; if (d > 180) shift -= 360; else if (d < -180) shift += 360; }
    prev = lo + shift; pts.push([prev, la]);
  }
  const lons = pts.map(p => p[0]), mn = Math.min(...lons), mx = Math.max(...lons);
  const offsets = [0];
  if (mx - mn < 359) { if (mn < -180) offsets.push(360); if (mx > 180) offsets.push(-360); }
  else return { pts: ring, offsets };
  return { pts, offsets };
});
const px = p => [(p.lon + 180) / 360 * W, (90 - p.lat) / 180 * H];


function draw(now) {
  ctx.fillStyle = colors.ocean; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let lon = -150; lon < 180; lon += 30) { const x = (lon + 180) / 360 * W; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let lat = -60; lat <= 60; lat += 30) { const y = (90 - lat) / 180 * H; ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.fillStyle = colors.land; ctx.strokeStyle = colors.coast; ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const ring of LAND_RINGS) {
    for (const off of ring.offsets) {
      ring.pts.forEach(([lo, la], i) => { const x = (lo + off + 180) / 360 * W, y = (90 - la) / 180 * H; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }
  }
  ctx.fill('evenodd'); ctx.stroke();

  const pulse = (Math.sin(now / 300) + 1) / 2;

  if (!S.base) {
    S.sites.forEach((s, i) => {
      const [x, y] = px(s);
      const hot = S.hoverSite === i;
      ctx.beginPath(); ctx.arc(x, y, hot ? 9 : 6, 0, Math.PI * 2);
      ctx.fillStyle = colors.base; ctx.globalAlpha = hot ? 1 : 0.85; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(x, y, 12 + pulse * 6, 0, Math.PI * 2);
      ctx.strokeStyle = colors.base; ctx.globalAlpha = 0.5 * (1 - pulse); ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = colors.ink; ctx.font = '600 12px Barlow, system-ui, sans-serif';
      ctx.fillText(s.name, x + 10, y - 8);
    });
    return;
  }

  const [bx, by] = px(S.base);
  ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = colors.base; ctx.fillRect(-6, -6, 12, 12); ctx.restore();
  ctx.fillStyle = colors.ink; ctx.font = '600 12px Barlow, system-ui, sans-serif'; ctx.fillText(S.base.name, bx + 11, by + 4);

  const line = (a, b, color, dash, alpha = 0.6, w = 1) => {
    if (Math.abs(a.lon - b.lon) > 180) return;
    const [x1, y1] = px(a), [x2, y2] = px(b);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.setLineDash(dash); ctx.lineWidth = w; ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  };

  // rotte degli aerei
  for (const p of S.planes) {
    if (!isAir(p)) continue;
    const c = colors[TYPES[p.type].color];
    if (p.state === 'rtb') { line(p, S.base, c, [4, 4], 0.45); continue; }
    if (p.state === 'escort') {
      const l = findPlane(p.escort);
      const th = p.engaged && findThreat(p.engaged);
      if (th) line(p, th, c, [4, 4]);
      else if (l && dist(p, l) > 30) line(p, l, c, [], 0.5);
      continue;
    }
    const th = findThreat(p.target);
    if (!th) continue;
    let tgt = th;
    if (p.type === 'fighter' && p.mode === 'lead' && p.aim && p.aim.pos) {
      tgt = p.aim.pos;
      const [ax, ay] = px(tgt);
      ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(ax - 5, ay - 5); ctx.lineTo(ax + 5, ay + 5); ctx.moveTo(ax + 5, ay - 5); ctx.lineTo(ax - 5, ay + 5); ctx.stroke();
    }
    line(p, tgt, c, isStrike(p) ? [8, 4] : [4, 4], 0.7);
  }

  // minacce
  for (const th of S.threats) {
    const [x, y] = px(th);
    const sel = S.selectedThreat === th.id;
    ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    if (th.state === 'cooldown') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(pulse * 0.3);
      ctx.strokeStyle = colors.threat; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); }
      ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(x, y, sel ? 18 : 16, 0, Math.PI * 2); ctx.setLineDash(sel ? [] : [2, 3]); ctx.strokeStyle = colors.threat; ctx.lineWidth = sel ? 2 : 1; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = colors.threat;
      ctx.fillText(`${th.id} attacca ${th.attack.name.replace(' (la tua base)', '')}`, x + 20, y - 4);
      ctx.fillStyle = colors['ink-soft'];
      ctx.fillText(`riparte tra ${fmtDur(th.cooldownUntil - S.t)}`, x + 20, y + 10);
      continue;
    }
    if (th.state === 'hunting') { const prey = findPlane(th.prey); if (prey) line(th, prey, colors.threat, [2, 3], 0.9, 1.5); }
    ctx.beginPath(); ctx.arc(x, y, 10 + pulse * 8, 0, Math.PI * 2);
    ctx.strokeStyle = colors.threat; ctx.globalAlpha = 0.45 * (1 - pulse); ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
    drawArrow(x, y, th.bearing, colors.threat, sel ? 9 : 7);
    if (sel) { ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.strokeStyle = colors.threat; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.fillStyle = colors.threat; ctx.fillText(th.id, x + 10, y - 8);
  }

  // aerei
  for (const p of S.planes) {
    if (!isAir(p)) continue;
    const [x, y] = px(p);
    const c = colors[TYPES[p.type].color];
    if (p.type === 'fighter') drawArrow(x, y, p.heading || 0, c, 7);
    else drawBomber(x, y, p.heading || 0, c, p.type === 'tactical');
    // scorta agganciata: scostata di qualche pixel
    ctx.fillStyle = c; ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    const off = p.state === 'escort' && !p.engaged ? 12 : 0;
    ctx.fillText(p.id, x + 10, y + 12 + off);
  }
}
function drawBomber(x, y, brg, color, tactical) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rad(brg));
  ctx.beginPath();
  if (tactical) { ctx.moveTo(0, -10); ctx.lineTo(7, 4); ctx.lineTo(0, 8); ctx.lineTo(-7, 4); }
  else { ctx.moveTo(0, -9); ctx.lineTo(2, -2); ctx.lineTo(10, 3); ctx.lineTo(2, 3); ctx.lineTo(3, 8); ctx.lineTo(-3, 8); ctx.lineTo(-2, 3); ctx.lineTo(-10, 3); ctx.lineTo(-2, -2); }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore();
}
function drawArrow(x, y, brg, color, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rad(brg));
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.8); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.7, s * 0.8); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.restore();
}
function hit(e) {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const near = (p, rr = 12) => { const [a, b] = px(p); return Math.hypot(a - x, b - y) < rr; };
  return { x, y, near };
}
const THREAT_STATE = th => ({
  flight: 'In volo', inbound: 'In volo', hunting: `Va incontro a ${th.prey}`,
  cooldown: `Attacca ${th.attack && th.attack.name}`,
}[th.state]);
canvas.addEventListener('mousemove', e => {
  const { x, y, near } = hit(e);
  let html = '';
  if (!S.base) {
    const i = S.sites.findIndex(s => near(s));
    if (S.hoverSite !== i) { S.hoverSite = i < 0 ? null : i; panelDirty = true; }
    if (i >= 0) { const s = S.sites[i]; html = `<b>${s.name}</b><br>${s.zone}, ${s.state}<br>${s.cont}`; }
  } else {
    const th = S.threats.find(t => near(t));
    const p = S.planes.find(f => isAir(f) && near(f));
    if (th) html = `<b>${th.id}</b> ${THREAT_STATE(th)}<br>${fmtCoord(th)}, ${Math.round(dist(th, S.base))} km dalla base<br>Clic per selezionare`;
    else if (p) html = `<b>${p.id}</b> ${TYPES[p.type].label}, ${p.speed} km/h<br>${planeStateText(p)}`;
    else if (near(S.base)) html = `<b>Base: ${S.base.name}</b><br>${S.base.state}, ${S.base.cont}`;
  }
  if (html) {
    tooltip.innerHTML = html; tooltip.style.display = 'block';
    const left = Math.min(x + 28, canvas.clientWidth - 200);
    tooltip.style.left = left + 'px'; tooltip.style.top = (y + 28) + 'px';
  } else tooltip.style.display = 'none';
});
canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; if (!S.base) { S.hoverSite = null; panelDirty = true; } });
canvas.addEventListener('click', e => {
  const { near } = hit(e);
  if (!S.base) { const i = S.sites.findIndex(s => near(s, 14)); if (i >= 0) A.pickBase(i); return; }
  const th = S.threats.find(t => near(t, 16));
  if (th) A.selectThreat(th.id);
});

// ---------- Pannello ----------
const panel = document.getElementById('panel');
let panelDirty = true;
let pointerDown = false;
panel.addEventListener('pointerdown', () => pointerDown = true);
window.addEventListener('pointerup', () => setTimeout(() => pointerDown = false, 0));
function renderPanel(force) {
  renderTop();
  if (!force && (!panelDirty || pointerDown)) return;
  panelDirty = false;
  renderPanelBody();
}
function renderTop() {
  document.getElementById('clock').textContent = fmtClock(S.t, S.speed === 1);
  const cr = document.getElementById('credits');
  cr.innerHTML = `${Math.floor(S.credits)}<small>crediti</small>`;
  cr.classList.toggle('low', S.credits < 150);
  const rep = document.getElementById('rep');
  const r = Math.round(S.rep);
  rep.innerHTML = `<span>Reputazione ${r}%<em class="medals" title="Punti medaglia">${S.medals} ${S.medals === 1 ? 'medaglia' : 'medaglie'}</em></span><div class="repbar"><i style="width:${r}%"></i></div>`;
  rep.classList.toggle('low', r <= 50);
  document.querySelectorAll('#speeds button').forEach(b => {
    b.setAttribute('aria-pressed', String(+b.dataset.speed === S.speed));
    if (+b.dataset.speed === CFG.turboSpeed) b.textContent = S.speed === CFG.turboSpeed ? `1 ora/s (${Math.ceil(S.turboLeft / 60)}h)` : '1 ora/s';
    b.disabled = !S.base || S.over;
  });
}
function renderLog() {
  document.getElementById('logbox').innerHTML = `<h2>Registro</h2>
    <ul class="log">${S.log.map(l => `<li class="${l.kind}"><time>${fmtShort(l.t)}</time><span>${l.msg}</span></li>`).join('')}</ul>`;
}
function planeStateText(p) {
  if (p.state === 'base') return 'Pronto alla base';
  if (p.state === 'repair') return 'Abbattuto, in ripristino';
  if (p.state === 'upgrading') return `Potenziamento ${Math.floor(p.upgradeMin / DAY * 100)}%`;
  if (p.state === 'rtb') return p.damaged ? 'Danneggiato, rientro a metà velocità' : 'In rientro';
  if (p.state === 'escort') return p.engaged ? `Scorta ${p.escort}, ingaggia ${p.engaged}` : `Scorta ${p.escort}`;
  const th = findThreat(p.target);
  if (isStrike(p)) return th ? `Verso ${th.attack ? th.attack.name.replace(' (la tua base)', '') : th.id}, ${Math.round(dist(p, th))} km` : 'In volo';
  return `Verso ${p.target}, ${Math.round(dist(p, th || p))} km`;
}
function winsText(p) {
  const fighter = p.type === 'fighter', need = fighter ? CFG.killsForUpgrade : CFG.winsForUpgrade;
  const w = p.wins || 0;
  const next = p.speed >= TYPES[p.type].top ? 'velocità massima' : `${need - (w % need)} al prossimo potenziamento gratuito`;
  return `${w} ${fighter ? (w === 1 ? 'abbattimento' : 'abbattimenti') : (w === 1 ? 'missione vinta' : 'missioni vinte')}, ${next}${p.bonus ? ' (in attesa del rientro)' : ''}`;
}
function gearRow(p) {
  if (p.type !== 'fighter') return '';
  const sonicLeft = (p.sonicUntil || 0) - S.t;
  const tags = [];
  if (p.gear) tags.push(`<span class="gear on">${CFG.gear[p.gear].label}</span>`);
  if (sonicLeft > 0 && isAir(p)) tags.push(`<span class="gear on">Motore sonico attivo, ${fmtDur(sonicLeft)}</span>`);
  if (!p.gear && !isAir(p)) {
    for (const [k, g] of Object.entries(CFG.gear))
      tags.push(`<button class="gear" data-action="buyGear" data-a="${p.id}" data-b="${k}" ${S.credits < g.cost ? 'disabled' : ''}>${g.label} ${g.cost}</button>`);
  }
  return tags.length ? `<div class="gearrow">${tags.join('')}</div>` : '';
}
function planeCard(p, aut) {
  const T = TYPES[p.type];
  let extra = '', actions = '';
  const sel = S.selectedThreat && findThreat(S.selectedThreat);
  const hunted = S.threats.filter(t => t.state === 'hunting' && t.prey === p.id).map(t => t.id);
  if (p.state === 'repair') {
    const done = 1 - (p.repairUntil - S.t) / CFG.repairMin;
    extra = `<div class="bar warn"><i style="width:${done * 100}%"></i></div><span class="note">Di nuovo disponibile tra ${fmtDur(p.repairUntil - S.t)}</span>`;
  } else if (p.state === 'base' || p.state === 'upgrading') {
    if (p.state === 'base' && p.speed < T.top) actions += `<button class="btn ghost" data-action="upgrade" data-a="${p.id}">Potenzia</button>`;
    if (p.state === 'upgrading') {
      extra = `<div class="bar"><i style="width:${p.upgradeMin / DAY * 100}%"></i></div><span class="note">Non impiegabile fino alla fine del potenziamento (${fmtDur(DAY - p.upgradeMin)}).</span>`;
    } else if (p.type === 'fighter') {
      if (sel && sel.state !== 'cooldown') actions += `<button class="btn danger" data-action="intercept" data-a="${sel.id}" data-b="${p.id}">Decolla verso ${sel.id}</button>`;
      for (const l of S.planes.filter(l => isStrike(l) && isAir(l)))
        actions += `<button class="btn" data-action="escort" data-a="${p.id}" data-b="${l.id}">Scorta ${l.id}</button>`;
    } else if (sel && sel.state === 'cooldown') {
      const eta = dist(S.base, sel) / p.speed * 60;
      actions += `<button class="btn danger" data-action="strike" data-a="${sel.id}" data-b="${p.id}">Colpisci ${sel.id} (${fmtDur(eta)})</button>`;
    }
  } else {
    const pa = p.autH || aut;
    const left = pa * 60 - p.flightMin;
    const frac = Math.max(0, left / (pa * 60));
    if (p.type === 'fighter' && p.mode === 'lead' && (p.state === 'flight' || (p.state === 'escort' && p.engaged)))
      extra += `<span class="note">${p.aim && p.aim.pos ? `Incontro previsto tra ${fmtDur(p.aim.eta - (S.t - p.aim.at))}` : 'Inseguimento diretto'}</span>`;
    if (isStrike(p) && p.state === 'flight') {
      const th = findThreat(p.target);
      if (th) {
        const eta = dist(p, th) / p.speed * 60, cd = th.cooldownUntil - S.t;
        extra += `<span class="note ${eta > cd ? 'warn-text' : ''}">Arrivo tra ${fmtDur(eta)}, ${th.id} riparte tra ${fmtDur(cd)}</span>`;
      }
    }
    if (hunted.length) extra += `<span class="note warn-text">Inseguito da ${hunted.join(', ')}</span>`;
    if (isStrike(p)) {
      const esc = S.planes.filter(e => e.state === 'escort' && e.escort === p.id).map(e => e.id);
      extra += `<span class="note">${esc.length ? `Scortato da ${esc.join(', ')}` : 'Senza scorta'}</span>`;
    }
    if (isStrike(p)) {
      if (p.state === 'rtb') extra += `<span class="note">Deve rientrare alla base prima di una nuova missione: arrivo tra ${fmtDur(dist(p, S.base) / p.speed * 60)}.</span>`;
    } else extra += `<div class="bar ${frac < 0.25 ? 'warn' : ''}"><i style="width:${frac * 100}%"></i></div><span class="note">Autonomia residua ${fmtDur(left)}</span>`;
    if (p.state === 'flight' || p.state === 'escort') actions = `<button class="btn ghost" data-action="recall" data-a="${p.id}">Richiama</button>`;
    else {
      const opts = isStrike(p) || p.damaged ? [] : S.threats.filter(t => t.state !== 'cooldown').sort((a, b) => dist(p, a) - dist(p, b)).slice(0, 4);
      if (opts.length) extra += `<div class="retarget"><span class="note">Nuovo obiettivo:</span>${opts.map(t =>
        `<button class="btn danger" data-action="retarget" data-a="${p.id}" data-b="${t.id}">${t.id}, ${Math.round(dist(p, t))} km</button>`).join('')}</div>`;
      if (p.type === 'fighter' && !p.damaged) for (const l of S.planes.filter(l => isStrike(l) && isAir(l)))
        actions += `<button class="btn" data-action="escort" data-a="${p.id}" data-b="${l.id}">Scorta ${l.id}</button>`;
    }
  }
  const mode = p.type !== 'fighter' ? '' : `<div class="modes" role="group" aria-label="Rotta di ${p.id}">
      <button data-action="setMode" data-a="${p.id}" data-b="pursuit" aria-pressed="${p.mode === 'pursuit'}">Inseguimento</button>
      <button data-action="setMode" data-a="${p.id}" data-b="lead" aria-pressed="${p.mode === 'lead'}">Punto d'incontro</button>
    </div>`;
  return `<div class="plane ${p.state} t-${p.type}">
    <div class="plane-head"><span class="tag">${p.id}</span>
      <span class="state">${planeStateText(p)}</span><span class="speed">${spd(p) !== p.speed && isAir(p) ? `${Math.round(spd(p))} km/h${p.damaged ? '' : ' (sonico)'}` : `${p.speed} km/h`}</span></div>
    ${gearRow(p)}
    <span class="note">${winsText(p)}</span>
    ${extra}
    <div class="plane-foot">${mode}<div class="actions">${actions}</div></div>
  </div>`;
}
function loanBlock() {
  const open = S.loans.filter(l => l.left > 0);
  const emOpen = S.emergency.filter(l => l.left > 0);
  const avail = CFG.loanMax - recentLoans().length;
  const debt = open.reduce((s, l) => s + l.left * CFG.loanInstallment, 0);
  return `<section class="block loan">
    <h2>Prestito ONU <span class="count">${avail} di ${CFG.loanMax} disponibili</span></h2>
    <button class="btn ${S.credits < 300 ? '' : 'ghost'}" data-action="loan" ${avail ? '' : 'disabled'}>Chiedi ${CFG.loanAmount} crediti</button>
    <p class="note">Rimborso in ${CFG.loanInstallments} rate da ${CFG.loanInstallment} a mezzanotte, massimo ${CFG.loanMax} prestiti ogni ${CFG.loanWindowDays} giorni. Se i crediti vanno in negativo si attiva da solo un prestito fornitori di emergenza di ${CFG.emergencyAmount} crediti (${CFG.emergencyInstallments} rate da ${CFG.emergencyInstallment}), che non conta tra i prestiti ONU; se ne è già aperto uno, si usa un prestito ONU disponibile.
    ${emOpen.length ? `<br><b>Emergenza: debito residuo ${emOpen.reduce((s, l) => s + l.left * CFG.emergencyInstallment, 0)} crediti</b> (${emOpen.map(l => `${l.id}: ${l.left} ${l.left === 1 ? 'rata' : 'rate'}`).join(', ')}).` : ''}
    ${open.length ? `<br><b>Debito residuo ${debt} crediti</b> (${open.map(l => `${l.id}: ${l.left} ${l.left === 1 ? 'rata' : 'rate'}`).join(', ')}).` : ''}
    ${avail ? '' : `<br>Prossimo prestito disponibile tra ${fmtDur(nextLoanIn())}.`}</p>
  </section>`;
}
function renderPanelBody() {
  if (!S.base) {
    renderLog();
    const conts = new Set(S.sites.map(s => s.cont)).size;
    panel.innerHTML = `<section class="block">
      <h2>Scegli la base operativa</h2>
      <p class="note">Hai ${CFG.startCredits} crediti e ${CFG.startRep}% di reputazione. Il tempo partirà da 21 marzo 2049, 12:00 appena scegli. Località proposte in ${conts} continenti.</p>
    </section><section class="block"><ul class="sites">${S.sites.map((s, i) => `
      <li class="${S.hoverSite === i ? 'hover' : ''}" data-hover="${i}">
        <div><div class="name">${s.name}</div><div class="meta">${s.zone}, ${s.state}, ${s.cont}</div></div>
        <button class="btn" data-action="pickBase" data-a="${i}">Stabilisci qui</button>
      </li>`).join('')}</ul></section>`;
    return;
  }

  const aut = autonomyH();
  const supportBlock = (kind, label, levels, perDay, note) => {
    const n = S.support[kind];
    const lockLeft = S.support.lock[kind] - S.t;
    return `<div class="support">
      <div class="support-head"><span class="support-name">${label} attivi</span><span class="note">${n * perDay} crediti al giorno</span></div>
      <div class="levels" role="group" aria-label="${label} attivi">${levels.map(l =>
        `<button data-action="setLevel" data-a="${kind}" data-b="${l}" aria-pressed="${l === n}" ${lockLeft > 0 && l !== n ? 'disabled' : ''}>${l}</button>`).join('')}</div>
      ${lockLeft > 0 ? `<p class="note warn-text">Bloccati: modificabili tra ${fmtDur(lockLeft)}.</p>` : ''}
      <p class="note">${note}</p>
    </div>`;
  };

  const fighters = planesOf('fighter'), strikers = S.planes.filter(isStrike);
  const readyF = readyOf('fighter').length, readyB = readyOf('bomber').length, readyA = readyOf('tactical').length;
  const order = { hunting: 0, cooldown: 1, inbound: 2, flight: 2 };
  const threatRows = [...S.threats].sort((a, b) => order[a.state] - order[b.state] || dist(a, S.base) - dist(b, S.base)).map(th => {
    const chasers = S.planes.filter(f => (f.target === th.id && f.state === 'flight') || f.engaged === th.id).map(f => f.id);
    const sel = S.selectedThreat === th.id;
    const selBtn = `<button class="btn ghost" data-action="selectThreat" data-a="${th.id}" aria-pressed="${sel}">${sel ? 'Deseleziona' : 'Seleziona'}</button>`;
    if (th.state === 'cooldown') return `<div class="row attacking ${sel ? 'selected' : ''}"><span class="tag" style="--tag:var(--threat)">${th.id}</span>
      <div class="info"><span class="state">Attacca ${th.attack.name}</span><br>Riparte tra ${fmtDur(th.cooldownUntil - S.t)}, poi −${CFG.repLossCooldown}% reputazione. Colpibile solo da bombardiere o tattico.${chasers.length ? `<br>In arrivo: ${chasers.join(', ')}` : ''}</div>
      <div class="actions">${selBtn}
        <button class="btn danger" data-action="strike" data-a="${th.id}" data-b="bomber" ${readyB ? '' : 'disabled'}>Bombarda</button>
        <button class="btn danger" data-action="strike" data-a="${th.id}" data-b="tactical" ${readyA ? '' : 'disabled'}>Tattico</button>
      </div></div>`;
    let status;
    if (th.state === 'hunting') status = `<b class="warn-text">Va incontro a ${th.prey}, ${Math.round(dist(th, findPlane(th.prey) || th))} km</b>`;
    else status = S.t - th.flightStart < CFG.attackAfterH * 60 ? `Può attaccare tra ${fmtDur(CFG.attackAfterH * 60 - (S.t - th.flightStart))}` : 'Può attaccare in qualsiasi momento';
    return `<div class="row ${sel ? 'selected' : ''}"><span class="tag" style="--tag:var(--threat)">${th.id}</span>
      <div class="info"><span class="state">${Math.round(dist(th, S.base))} km dalla base</span><br>${fmtCoord(th)}, rotta ${Math.round(th.bearing)}°<br>${status}${chasers.length ? `<br>Inseguita da ${chasers.join(', ')}` : ''}</div>
      <div class="actions">${selBtn}
        <button class="btn danger" data-action="intercept" data-a="${th.id}" ${readyF ? '' : 'disabled'}>Intercetta</button>
      </div></div>`;
  }).join('') || '<p class="empty">Nessuna minaccia segnalata. Attiva i ricognitori per scoprirne.</p>';

  panel.innerHTML = `
  <section class="block">
    <h2>Base: ${S.base.name}</h2>
    <p class="note">${S.base.zone}, ${S.base.state}, ${S.base.cont}. Minacce eliminate: ${S.kills}. Punti medaglia: ${S.medals} (al massimo 1 al giorno: ${CFG.medalChancePerPoint * 100}% di probabilità per ogni punto di reputazione che andrebbe oltre il 100%). La reputazione si recupera con i ricognitori e cala di ${CFG.repLossCooldown}% per ogni attacco portato a termine.</p>
  </section>
  ${loanBlock()}
  <section class="block">
    <h2>Minacce <span class="count">${S.threats.length}</span></h2>
    ${threatRows}
    ${S.threats.length ? `<p class="note">In volo si colpiscono con i caccia (80% al contatto, +${CFG.killReward}). Mentre attaccano una base solo bombardiere (+${CFG.killReward}, −${CFG.rebuildCost} di ricostruzione) e aereo tattico (+${CFG.tacticalReward}) possono eliminarle.</p>` : ''}
  </section>
  <section class="block">
    <h2>Caccia <span class="count">${fighters.length}/${maxOf('fighter')}</span>
      <button class="btn ghost" data-action="buy" data-a="fighter" ${fighters.length >= maxOf('fighter') ? 'disabled' : ''}>Compra</button></h2>
    ${S.slots.fighter < CFG.slotMax.fighter ? `<div class="buyrow"><button class="btn ghost" data-action="buySlot" data-a="fighter" ${S.credits < CFG.slotCost.fighter ? 'disabled' : ''}>Sblocca un posto caccia (${CFG.slotCost.fighter} crediti, fino a ${CFG.slotMax.fighter})</button></div>` : ''}
    ${fighters.map(p => planeCard(p, aut)).join('') || '<p class="empty">Nessun caccia. Ti serve almeno un caccia per intercettare le minacce.</p>'}
    <p class="note">${TYPES.fighter.perHour} crediti per ora di volo, ${TYPES.fighter.base}-${TYPES.fighter.top} km/h. In scorta attaccano da soli le minacce entro ${CFG.escortRangeKm} km dall'aereo scortato. Un caccia abbattuto è perso e costa ${CFG.lossPenalty.fighter} crediti di penale. Dotazioni a terra, una per caccia, ${CFG.gear.shield.cost} crediti l'una e consumate all'uso: difesa jet (salva il caccia, che rientra a metà velocità), missile fotonico (a ${CFG.gear.missile.rangeKm} km, ${CFG.gear.missile.chance * 100}% di distruggere il bersaglio), motore sonico (velocità doppia per 24 h dal decollo). Ogni ${CFG.killsForUpgrade} abbattimenti un caccia ottiene un potenziamento istantaneo al rientro. Durante il potenziamento normale (24 h) non può decollare.</p>
  </section>
  <section class="block">
    <h2>Attacco al suolo <span class="count">${strikers.length}/${maxOf('bomber') + maxOf('tactical')}</span></h2>
    <div class="buyrow">
      <button class="btn ghost" data-action="buy" data-a="bomber" ${planesOf('bomber').length >= maxOf('bomber') ? 'disabled' : ''}>Compra bombardiere (${planesOf('bomber').length}/${maxOf('bomber')})</button>
      <button class="btn ghost" data-action="buy" data-a="tactical" ${planesOf('tactical').length >= maxOf('tactical') ? 'disabled' : ''}>Compra aereo tattico (${planesOf('tactical').length}/${maxOf('tactical')})</button>
      ${S.slots.bomber < CFG.slotMax.bomber ? `<button class="btn ghost" data-action="buySlot" data-a="bomber" ${S.credits < CFG.slotCost.bomber ? 'disabled' : ''}>Sblocca un posto bombardiere (${CFG.slotCost.bomber} crediti, fino a ${CFG.slotMax.bomber})</button>` : ''}
    </div>
    ${maxOf('tactical') < 2 ? `<p class="note">Con ${CFG.tacticalBonusAtBombers} bombardieri si sblocca il secondo aereo tattico.</p>` : ''}
    ${strikers.map(p => planeCard(p, aut)).join('') || '<p class="empty">Nessun aereo d\'attacco. Servono per colpire le minacce che stanno attaccando una base.</p>'}
    <p class="note">Bombardiere ${TYPES.bomber.perHour} crediti/ora, aereo tattico ${TYPES.tactical.perHour} crediti/ora; entrambi ${TYPES.bomber.base}-${TYPES.bomber.top} km/h. Autonomia illimitata, ma dopo ogni missione devono rientrare alla base prima di ripartire. Le minacce entro ${CFG.huntRangeKm} km possono andargli incontro: senza scorta hanno solo il ${CFG.strikeDefense * 100}% di cavarsela. Se abbattuti: penale ${CFG.lossPenalty.bomber} (bombardiere) o ${CFG.lossPenalty.tactical} (tattico) e un giorno di ripristino. Ogni ${CFG.winsForUpgrade} missioni vinte ottengono un potenziamento istantaneo e gratuito al rientro; durante il potenziamento normale non possono decollare.</p>
  </section>
  <section class="block">
    <h2>Supporto</h2>
    ${supportBlock('recon', 'Ricognitori', CFG.reconLevels, CFG.reconPerDay,
      `${CFG.reconPerDay} crediti al giorno ciascuno. Reputazione recuperata ogni giorno: ${CFG.reconLevels.filter(l => l).map(l => `${l} → +${CFG.reconRep[l]}`).join(', ')}, triplicata sotto il 50% di reputazione e raddoppiata tra 50% e 90%${repMult(S.rep) > 1 ? ` (ora ×${repMult(S.rep)})` : ''}. Ognuno segnala minacce a caso, in media una ogni ${CFG.reconSignalDays} giorni.${S.support.signals ? ` Segnalazioni finora: ${S.support.signals}.` : ''}`)}
    ${supportBlock('tanker', 'Rifornitori', CFG.tankerLevels, CFG.tankerPerDay,
      `${CFG.tankerPerDay} crediti al giorno ciascuno, +${CFG.tankerBonusH} h di autonomia ai caccia per ognuno. Autonomia per i prossimi decolli: ${aut.toFixed(0)} h; ridurli non toglie autonomia ai caccia già in volo. Ogni modifica blocca i livelli per 24 ore.${Object.keys(CFG.tankerRepLoss).map(k => ` Con ${k} attivi la reputazione cala di ${CFG.tankerRepLoss[k]} al giorno.`).join('')}`)}
  </section>
`;
  renderLog();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const fn = A[b.dataset.action];
  if (fn) { fn(b.dataset.a, b.dataset.b); panelDirty = true; renderPanel(); }
});
document.getElementById('speeds').addEventListener('click', e => {
  const b = e.target.closest('button[data-speed]'); if (b && !b.disabled) { A.speed(b.dataset.speed); renderPanel(); }
});
panel.addEventListener('mouseover', e => {
  const li = e.target.closest('[data-hover]');
  if (S && !S.base) S.hoverSite = li ? +li.dataset.hover : null;
});

// ---------- Modale ----------
const modal = document.getElementById('modal');
function openModal(html) { document.getElementById('modalCard').innerHTML = html; modal.classList.add('open'); }
function closeModal() { modal.classList.remove('open'); }

// ---------- Ciclo principale ----------
let last = performance.now(), lastPanel = 0;
function frame(now) {
  const realDt = Math.min(2, (now - last) / 1000); last = now;
  if (S && S.base && !S.over && S.speed > 0) {
    let gameMin = realDt * S.speed / 60;
    while (gameMin > 0 && !S.over) {
      const d = Math.min(1, gameMin); step(d); gameMin -= d;
      if (S.speed === CFG.turboSpeed) {
        S.turboLeft -= d;
        if (S.turboLeft <= 0) {
          S.speed = S.prevSpeed;
          addLog('Velocità 1 ora/s disattivata dopo 5 ore di gioco.');
          break;
        }
      }
    }
    if (now - lastPanel > 250) { panelDirty = true; lastPanel = now; }
  }
  if (S) { draw(now); renderPanel(); }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => { resize(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);

(async () => {
  resize();
  try { worldRows = await loadWorld(); }
  catch (err) {
    openModal(`<h2>Dati mancanti</h2><p>Non riesco a leggere mondo.csv. Avvia il gioco da un server locale (ad esempio <code>python -m http.server</code>) oppure carica il file qui.</p>
      <input type="file" accept=".csv" id="csvPick">`);
    await new Promise(res => document.getElementById('csvPick').addEventListener('change', async e => {
      worldRows = parseCSV(await e.target.files[0].text()); res();
    }));
  }
  BASES = worldRows.map(r => ({ name: r.Citta_riferimento, state: r.Stato, lat: parseFloat(r.Lat_citta), lon: parseFloat(r.Lon_citta) }));
  newGame();
  requestAnimationFrame(frame);
})();
})();
