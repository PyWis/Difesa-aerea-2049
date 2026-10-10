'use strict';
/* Minacce speciali: minaccia dell'apocalisse, bombardieri e basi di lancio; missioni spaziali ONU */
const gameDate = min => new Date(START_MS + min * 60000);
// mese di gioco N: aprile 1, maggio 2, giugno 3…
const gameMonthN = d => (d.getUTCFullYear() - gameDate(0).getUTCFullYear()) * 12 + d.getUTCMonth() - CFG.apoc.firstMonthIdx;
const nextDayOfMonth = (min, day) => {   // prossima data (a mezzanotte) con quel giorno del mese, dopo `min`
  const d = gameDate(min);
  let y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (d.getUTCDate() >= day) m++;
  return Date.UTC(y, m, day);
};
const fmtDate = ms => { const d = new Date(ms); return `${d.getUTCDate()} ${MESI[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const goalAlive = g => g.kind === 'main' || S.extra.some(b => b.kind === g.kind && dist(b.site, g) < 1);

// eventi del calendario, a mezzanotte
function monthlyEvents(d) {
  if (d.getUTCDate() === CFG.launch.day) newLaunchBase('monthly');
  if (d.getUTCDate() === CFG.apoc.day) spawnApocalypse(d);
}

// ---------- Minaccia dell'apocalisse ----------
function spawnApocalypse(d) {
  const N = gameMonthN(d), goal = choice(activeBases());
  let pos = null;
  for (let i = 0; i < 200 && !pos; i++) { const q = randomPoint(); if (dist(q, goal) >= CFG.apoc.minKm) pos = q; }
  if (!pos) pos = travel(goal, Math.random() * 360, CFG.apoc.minKm).pos;
  const fixed = Math.max(0, N - CFG.apoc.fixedOffset);
  const th = newThreat(pos, { apoc: true, state: 'apoc', goal, speed: CFG.apoc.speed, fixedKills: fixed, fkills: 0, month: N });
  th.bearing = bearingTo(th, goal);
  const km = Math.round(dist(th, goal));
  addLog(`MINACCIA DELL'APOCALISSE ${th.id} a ${fmtCoord(th)}: diretta su ${goal.name}${goal.kind === 'main' ? ' (la tua base principale)' : ''}, ${km} km a ${CFG.apoc.speed} km/h (arrivo tra ${fmtDur(km / CFG.apoc.speed * 60)}).${fixed ? ` I primi ${fixed} caccia uccisi hanno il ${Math.round(CFG.apoc.fixedLoss * 100)}% fisso di sconfitta.` : ''}`, 'bad');
  alertThreat(th);
}
// probabilità di vittoria di un caccia: fissa (bassa) per i primi caccia uccisi dalla minaccia dell'apocalisse
const fighterWin = (f, th) => th.apoc && th.fkills < th.fixedKills ? 1 - CFG.apoc.fixedLoss : winCh(f);
// il caccia ucciso diventa 3 minacce
function apocKill(th, f) {
  th.fkills++;
  const born = Array.from({ length: CFG.apoc.split }, () => newThreat({ lat: th.lat, lon: th.lon }));
  addLog(`${th.id} ha ucciso ${f.id}, che si trasforma in ${born.length} minacce: ${born.map(b => b.id).join(', ')}!`, 'bad');
  alertThreat(born[0], false);
}
function apocDefeated(th) {
  S.apocDone++;
  S.fx.calmUntil = S.t + CFG.apoc.calmDays * DAY;
  addLog(`Minaccia dell'apocalisse sconfitta: +${CFG.apoc.medals} medaglie e nessuna nuova minaccia per ${CFG.apoc.calmDays === 1 ? '1 giorno' : CFG.apoc.calmDays + ' giorni'}.`, 'good');
  addMedal(CFG.apoc.medals);
}
// minaccia dell'apocalisse e bombardieri volano dritti sul bersaglio
function raiderStep(th, dt) {
  if (!goalAlive(th.goal)) {
    th.goal = choice(activeBases()); th.course = (th.course || 0) + 1;
    addLog(`${th.id}: il bersaglio non esiste più, nuova rotta su ${th.goal.name}.`, 'bad');
  }
  const km = (th.apoc ? th.speed : thSpeed()) * dt / 60, g = th.goal;
  th.bearing = bearingTo(th, g);
  if (dist(th, g) <= km) {
    th.lat = g.lat; th.lon = g.lon;
    if (th.apoc) apocArrive(th); else raidHit(th);
    return;
  }
  trail(th);
  const mv = travel(th, th.bearing, km);
  th.lat = mv.pos.lat; th.lon = mv.pos.lon; th.bearing = mv.bearing;
}
function apocArrive(th) {
  if (th.goal.kind === 'main') {
    gameOver('Minaccia dell\'apocalisse', `la minaccia dell'apocalisse ha raggiunto ${th.goal.name}, la base principale, e l'ha cancellata.`);
    return;
  }
  const lost = S.extra.map(b => b.site.name);
  S.extra = [];
  th.speed = CFG.apoc.speedAfter; th.goal = activeBases()[0]; th.course = (th.course || 0) + 1;
  addLog(`${th.id} ha distrutto tutte le basi secondarie (${lost.join(', ')}) e si dirige verso ${th.goal.name} a ${CFG.apoc.speedAfter} km/h, ${Math.round(dist(th, th.goal))} km!`, 'bad');
  panelDirty = true;
}

// ---------- Basi di lancio e minacce bombardiere ----------
function pickLaunchSite() {
  const free = BASES.filter(b => !isOwnBase(b) && !S.launch.some(l => dist(l.site, b) < 1));
  const ok = free.filter(b => { const d = dist(b, S.base); return d >= CFG.launch.minKm && d <= CFG.launch.maxKm; });
  const b = choice(ok.length ? ok : free);
  return { name: b.name, state: b.state, lat: b.lat, lon: b.lon };
}
function newLaunchBase(kind) {
  const old = S.launch.find(l => l.kind === kind && kind === 'monthly');
  if (old) { S.launch = S.launch.filter(l => l !== old); addLog(`${old.site.name} non è più una base di lancio.`); }
  const lb = { id: 'X' + (++S.ids.X), kind, site: pickLaunchSite(), next: S.t + CFG.launch.everyH * 60 };
  S.launch.push(lb);
  addLog(kind === 'monthly'
    ? `${lb.site.name} (${lb.site.state}) diventa Base di lancio delle minacce ${lb.id}: ogni ${CFG.launch.everyH} ore lancia una minaccia bombardiera contro una delle tue basi. Serve un bombardiere per distruggerla (${Math.round(dist(S.base, lb.site))} km dalla base).`
    : `Cielo libero: ${lb.site.name} (${lb.site.state}) diventa Base di lancio delle minacce extra ${lb.id} e lancia una minaccia ogni ${CFG.launch.everyH} ore. Distruggerla con un bombardiere vale una minaccia eliminata (${Math.round(dist(S.base, lb.site))} km dalla base).`, 'bad');
  panelDirty = true;
}
// se non ci sono minacce in cielo, dal grado Tenente in su nasce una base di lancio extra (una alla volta)
function checkExtraLaunch() {
  if (calm() || rankIdx(S.medals) < CFG.launch.extraMinRank || skyThreats().length || S.launch.some(l => l.kind === 'extra')) return;
  newLaunchBase('extra');
}
function launchTick() {
  for (const lb of S.launch) {
    while (S.t >= lb.next) {
      lb.next += CFG.launch.everyH * 60;
      if (calm()) continue;
      if (lb.kind === 'monthly') launchRaider(lb); else launchExtra(lb);
    }
  }
}
function launchRaider(lb) {
  const goal = choice(activeBases());
  const th = newThreat(lb.site, { state: 'raid', raid: true, goal, from: lb.id });
  th.bearing = bearingTo(th, goal);
  const km = Math.round(dist(th, goal));
  addLog(`${lb.site.name} lancia la minaccia bombardiera ${th.id} contro ${goal.name}${goal.kind === 'main' ? ' (la tua base principale)' : ''}: ${km} km, arrivo tra ${fmtDur(km / thSpeed() * 60)}.`, 'bad');
  alertThreat(th);
}
function launchExtra(lb) {
  const th = newThreat(lb.site);
  addLog(`La base di lancio extra ${lb.site.name} lancia la minaccia ${th.id}, ${Math.round(dist(th, S.base))} km dalla base.`, 'bad');
  alertThreat(th);
}
function raidHit(th) {
  const g = th.goal;
  if (g.kind === 'main') {
    gameOver('Base principale distrutta', `la minaccia bombardiera ${th.id}, lanciata da ${th.from}, ha colpito e distrutto ${g.name}, la base principale.`);
    return;
  }
  S.extra = S.extra.filter(b => b.kind !== g.kind);
  addLog(`${th.id} ha colpito e distrutto ${CFG.bases.find(d => d.kind === g.kind).label} (${g.name}). Ora viaggia normalmente.`, 'bad');
  th.state = 'flight'; th.raid = false; th.goal = null; th.flightStart = S.t; th.bearing = Math.random() * 360; th.course = (th.course || 0) + 1;
  panelDirty = true;
}
// un bombardiere ha raggiunto la base di lancio
function bombLaunchBase(p, lb) {
  S.launch = S.launch.filter(x => x !== lb);
  const rg = addResearch(CFG.researchBomb);
  if (lb.kind === 'monthly') {
    changeRep(CFG.launch.rep);
    addLog(`${p.id} ha bombardiato e distrutto la base di lancio ${lb.site.name}: reputazione +${CFG.launch.rep}%.${rg ? ` Ricerca +${rg}%.` : ''}`, 'good');
  } else {
    S.kills++; S.credits += CFG.killReward;
    addLog(`${p.id} ha bombardiato e distrutto la base di lancio extra ${lb.site.name}: una minaccia eliminata, +${CFG.killReward} crediti.${rg ? ` Ricerca +${rg}%.` : ''}`, 'good');
  }
  earnWin(p);
}
Object.assign(A, {
  // bombardiere contro una base di lancio
  raid(lbId, planeId) {
    const lb = S.launch.find(x => x.id === lbId); if (!lb) return;
    const p = planeId ? findPlane(planeId) : readyOf('bomber')[0];
    if (!p || p.type !== 'bomber' || p.state !== 'base') { addLog('Nessun bombardiere pronto alla base: serve un bombardiere con 1° e 2° pilota.', 'bad'); return; }
    if (!crewReady(p)) { addLog(`${p.id} non può decollare: servono 1° e 2° pilota (Caserma).`, 'bad'); return; }
    launch(p);
    p.state = 'flight'; p.mission = 'raid'; p.raidId = lb.id;
    addLog(`${p.id} decolla per bombardare la base di lancio ${lb.site.name}: arrivo tra ${fmtDur(dist(p, lb.site) / spd(p) * 60)}.`);
  },
});

// ---------- Missioni spaziali ONU (artefatti della base ricerca) ----------
const spacePending = m => S.fx.space.find(x => x.id === m.id);
const spaceCandidates = m => freePilotsOf(pl => m.ranks.includes(pl.rank));
function spaceBlock(m) {
  if (spacePending(m)) return 'Missione in corso';
  const n = spaceCandidates(m).length;
  return n >= m.send ? '' : `Servono ${m.send} ${PR()[m.ranks[0]].name.toLowerCase()} senza assegnazione (ora ${n})`;
}
function runSpace(m) {
  if (m.sergeantMissions) for (const pl of spaceCandidates(m)) giveMission(pl, m.sergeantMissions);
  // partono i meno esperti (grado più basso, poi meno missioni)
  const sent = spaceCandidates(m).sort((a, b) => a.rank - b.rank || a.missions - b.missions).slice(0, m.send);
  S.pilots = S.pilots.filter(x => !sent.includes(x));
  S.pilotsSpace = (S.pilotsSpace || 0) + sent.length;
  S.fx.space.push({ id: m.id, at: S.t + m.days * DAY });
  addLog(`${m.name}: ${m.sergeantMissions ? `+${m.sergeantMissions} missione ai sergenti senza assegnazione. ` : ''}partono ${sent.length} piloti (${sent.map(pilotTitle).join(', ')}), tolti dal gioco. Tra ${m.days} giorni arriva un ${PR()[m.arrive].name}${m.repLoss ? ` e la reputazione cala del ${m.repLoss}%` : ''}.`, 'good');
  refreshBarracks();
}
function spaceArrivals() {
  for (const ev of [...S.fx.space]) {
    if (S.t < ev.at) continue;
    S.fx.space = S.fx.space.filter(x => x !== ev);
    const m = CFG.art.space.find(x => x.id === ev.id), pl = newPilot(m.arrive);
    addLog(`${m.name}: rientra ${pilotTitle(pl)} (${pl.naz})${isAdmiral(pl) ? ': nuovo Ammiraglio di Volo, non partecipa ai voli (punteggio extra)' : ''}${m.repLoss ? `. Reputazione −${m.repLoss}%` : ''}.`, 'good');
    refreshBarracks();
    if (m.repLoss) { changeRep(-m.repLoss); if (S.over) return; }
  }
}
