'use strict';
/* Caserma: piloti, accademia, gradi, bonus degli equipaggi */
let NAMES = {};
const FALLBACK_NAMES = { nomi: ['Alex', 'Sam', 'Robin', 'Kim', 'Jo', 'Chris', 'Dana', 'Max', 'Noa', 'Luca'], cognomi: ['Rossi', 'Smith', 'Silva', 'Novak', 'Kim', 'Haddad', 'Okafor', 'Tanaka', 'Garcia', 'Ivanov'] };
async function loadNames() {
  try {
    const res = await fetch('nomi.json');
    if (res.ok) NAMES = (await res.json()).nazionalita || {};
  } catch (e) { /* senza nomi.json si usa la tabella di riserva */ }
}
const choice = a => a[Math.floor(Math.random() * a.length)];

// ---------- Gradi e ruoli ----------
const PR = () => CFG.pilots.ranks;
const pilotById = id => (id ? S.pilots.find(x => x.id === id) : null);
const pilotRank = pl => PR()[pl.rank];
const pilotTitle = pl => `${pilotRank(pl).short} ${pl.nome} ${pl.cognome}`;
const inAcademy = pl => pl.academyUntil != null;
const crewOf = p => p.crew || (p.crew = { first: null, second: null });
const crewPilots = p => (p.crew ? [p.crew.first, p.crew.second].map(pilotById).filter(Boolean) : []);
const planeOfPilot = id => S.planes.find(p => p.crew && (p.crew.first === id || p.crew.second === id));
const slotMin = (p, slot) => CFG.pilots.slotMinRank[p.type][slot];
const isAdmiral = pl => !!pilotRank(pl).noFly;   // l'Ammiraglio di Volo non partecipa ai voli
const canSlot = (pl, p, slot) => !inAcademy(pl) && !isAdmiral(pl) && pl.rank >= slotMin(p, slot);
const pilotsWhere = pred => S.pilots.filter(pl => !inAcademy(pl) && pred(pl));
// piloti in servizio senza assegnazione a un aereo (gli ammiragli non volano mai)
const freePilotsOf = pred => pilotsWhere(pl => !isAdmiral(pl) && !planeOfPilot(pl.id) && pred(pl));
// un aereo può decollare solo con entrambi i piloti (se crewRequired)
const crewReady = p => !CFG.pilots.crewRequired || !!(p.crew && pilotById(p.crew.first) && pilotById(p.crew.second));
const SLOT_NAME = { first: '1° pilota', second: '2° pilota' };
// bonus alla probabilità di vittoria: si sommano i bonus di tutti i piloti a bordo
const crewWin = p => crewPilots(p).reduce((s, pl) => s + (pilotRank(pl).win || 0), 0);
// bombardieri e tattici: +km/h se a bordo c'è almeno un pilota di grado alto
const crewStrikeSpeed = p => (isStrike(p) ? Math.max(0, ...crewPilots(p).map(pl => pilotRank(pl).strikeSpeed || 0)) : 0);
// pattuglia comandata (1° pilota del capo pattuglia) da un Capitano di Volo: velocità +25% a tutti i membri
function patrolSpeedMult(p) {
  const pat = p.patrolId && S.patrols.find(x => x.id === p.patrolId);
  const lead = pat && findPlane(pat.leader), cmd = lead && lead.crew && pilotById(lead.crew.first);
  return cmd && pilotRank(cmd).captain ? 1 + CFG.pilots.patrolCaptainSpeed : 1;
}

// ---------- Nuovi piloti ----------
let natWeights = null;
// la nazionalità è casuale in proporzione al peso dello stato in mondo.csv (numero di righe)
function pickNation() {
  if (!natWeights) {
    const m = {};
    for (const r of worldRows) m[r.Stato] = (m[r.Stato] || 0) + 1;
    natWeights = Object.entries(m);
  }
  let x = Math.random() * natWeights.reduce((s, [, w]) => s + w, 0);
  for (const [n, w] of natWeights) if ((x -= w) < 0) return n;
  return natWeights[0][0];
}
function newPilot(rank, naz = pickNation()) {
  const t = NAMES[naz] || FALLBACK_NAMES;
  let nome, cognome, tries = 0;
  do { nome = choice(t.nomi); cognome = choice(t.cognomi); } while (S.pilots.some(x => x.nome === nome && x.cognome === cognome) && ++tries < 12);
  const days = PR()[rank].academyDays;
  const pl = { id: 'PL' + (++S.ids.PL), nome, cognome, naz, rank, since: S.t, missions: 0, total: 0, academyUntil: days ? S.t + days * DAY : null };
  S.pilots.push(pl);
  return pl;
}
function initPilots() {
  const c = CFG.pilots;
  for (let i = 0; i < c.startSergeants; i++) newPilot(2);
  for (let i = 0; i < c.startMarshals; i++) newPilot(5);
  for (let i = 0; i < c.startLieutenants; i++) newPilot(6);
  addLog(`Caserma: ${c.startSergeants} Sergenti, ${c.startMarshals} Marescialli e ${c.startLieutenants} Luogotenenti di Volo attendono l'assegnazione: senza 1° e 2° pilota nessun aereo decolla (tasto C).`, 'good');
}
function arriveCadets() {
  for (let i = 0; i < CFG.pilots.cadetsPerDay; i++) {
    const rank = S.t < S.fx.cadetsUntil ? 1 : 0; // Missione tattica Cadetti: arrivano già cadetti scelti
    const pl = newPilot(rank);
    addLog(`Caserma: arriva il ${rank ? 'cadetto scelto' : 'cadetto'} ${pl.nome} ${pl.cognome} (${pl.naz}), ${PR()[rank].academyDays} giorni di accademia.`);
  }
  if (typeof refreshBarracks === 'function') refreshBarracks();
}

// ---------- Promozioni ----------
const isLastRank = pl => !!pilotRank(pl).final;
const promoReady = pl => { const r = pilotRank(pl); return !isLastRank(pl) && pl.missions >= (r.missions || 0) && S.t - pl.since >= (r.days || 0) * DAY; };
function promote(pl) {
  pl.rank++; pl.since = S.t; pl.missions = 0;
  const r = pilotRank(pl);
  pl.academyUntil = r.academyDays ? S.t + r.academyDays * DAY : null;
  if (pl.rank === 2 && S.t < S.fx.cadetMissionsUntil) pl.missions = CFG.art.cadetMissions; // Missione tattica Cadetti
  addLog(`Caserma: ${pl.nome} ${pl.cognome} (${pl.naz}) ${r.academyDays ? `è ora ${r.name}` : `è promosso a ${r.name}`}${pl.missions ? ` con ${pl.missions} missioni già effettuate` : ''}.`, pl.rank >= 2 ? 'good' : '');
}
// missioni extra (artefatti, premi): contano come quelle di volo
function giveMission(pl, n) {
  pl.missions += n; pl.total += n;
  if (promoReady(pl)) promote(pl);
}
// ogni giorno, per ogni 5 piloti liberi dello stesso grado, uno a caso riceve una missione premio (fino alla promozione)
function awardFreeMissions() {
  const g = CFG.freeMissionGroup, byRank = {};
  for (const pl of freePilotsOf(pl => !isLastRank(pl))) (byRank[pl.rank] ||= []).push(pl);
  for (const list of Object.values(byRank)) {
    const n = Math.floor(list.length / g);
    if (!n) continue;
    const lucky = shuffle(list).slice(0, n);
    for (const pl of lucky) {
      addLog(`Caserma: missione premio a ${pilotTitle(pl)} (${list.length} ${pilotRank(pl).name} senza assegnazione).`, 'good');
      giveMission(pl, 1);
    }
  }
}
// a ogni passo: fine dell'accademia e promozioni per giorni di servizio
function tickPilots() {
  for (const pl of S.pilots) {
    if (inAcademy(pl)) { if (S.t >= pl.academyUntil) promote(pl); }
    else if (promoReady(pl)) promote(pl);
  }
}
// una missione conta quando l'aereo atterra alla base con il pilota a bordo
function pilotsLand(p) {
  for (const pl of crewPilots(p)) {
    pl.missions++; pl.total++;
    if (promoReady(pl)) promote(pl);
  }
}
// l'aereo perso porta con sé l'equipaggio
function loseCrew(p) {
  const lost = crewPilots(p);
  if (!CFG.pilots.deathOnLoss || !lost.length) return;
  p.crew.first = p.crew.second = null;
  S.pilots = S.pilots.filter(x => !lost.includes(x));
  S.pilotsLost = (S.pilotsLost || 0) + lost.length;
  addLog(`Caduti con ${p.id}: ${lost.map(pilotTitle).join(', ')}.`, 'bad');
}
