'use strict';
/* Flotta: decollo, pattuglie, abbattimenti */
const readyOf = type => planesOf(type).filter(p => p.state === 'base' && crewReady(p)).sort((a, b) => b.speed - a.speed);
function launch(p) {
  p.trail = []; p.mission = null;
  p.fast = false; p.joining = false; p.joined = false; p.patrolId = null;
  p.flightMin = 0; p.upgradeMin = 0; p.aim = null; p.engaged = null; p.escort = null; p.target = null;
  p.autH = autonomyH(); // autonomia del volo: può solo crescere se si aggiungono rifornitori
  if (p.gear === 'sonic') {
    p.gear = null; p.sonicUntil = S.t + CFG.gear.sonic.durationMin;
    addLog(`${p.id} decolla con il motore sonico: velocità raddoppiata per ${fmtDur(CFG.gear.sonic.durationMin)}.`, 'good');
  }
  p.lat = S.base.lat; p.lon = S.base.lon;
}
const chasersOf = th => S.planes.filter(f => f.type === 'fighter' && f.state === 'flight' && f.target === th.id && !f.mission && !f.patrolId && !f.damaged);
const patrolOf = p => p.patrolId && S.patrols.find(x => x.id === p.patrolId);
function dissolvePatrol(pat, why) {
  S.patrols = S.patrols.filter(x => x !== pat);
  for (const id of pat.members) { const f = findPlane(id); if (f) { f.patrolId = null; f.joining = false; f.joined = false; } }
  if (why) addLog(`Pattuglia ${pat.id} sciolta: ${why}.`, 'bad');
}
function validatePatrols() {
  for (const pat of [...S.patrols]) {
    const th = findThreat(pat.target), ms = pat.members.map(findPlane);
    if (!th || th.state === 'cooldown') dissolvePatrol(pat, 'obiettivo non più colpibile');
    else if (ms.some(f => !f || f.state !== 'flight' || f.target !== pat.target)) dissolvePatrol(pat, 'un caccia non è più in missione');
  }
}
const patrolUnited = pat => pat.members.every(id => (findPlane(id) || {}).joined);
function goHome(p) { p.state = 'rtb'; p.mission = null; p.target = null; p.escort = null; p.engaged = null; p.aim = null; }
function removePlane(p, msg) {
  S.planes = S.planes.filter(x => x !== p);
  if (msg) addLog(msg, 'bad');
  loseCrew(p);
  detach(p);
}
// abbattimento in combattimento: penale; il caccia è perso, bombardiere e tattico tornano dopo 1 giorno
function shotDown(p, msg) {
  const pen = CFG.lossPenalty[p.type];
  if (p.type === 'fighter' && p.gear === 'shield') {
    p.gear = null; p.damaged = true;
    detach(p); goHome(p);
    addLog(`${msg} La difesa jet lo salva: rientra alla base a velocità dimezzata e non è impiegabile fino all'arrivo.`, 'good');
    return false;
  }
  if (p.type === 'fighter') removePlane(p, `${msg} Penale ${pen} crediti.`);
  else {
    p.mission = null; p.state = 'repair'; p.repairUntil = S.t + CFG.repairMin;
    p.lat = S.base.lat; p.lon = S.base.lon; p.target = null; p.escort = null; p.engaged = null; p.aim = null; p.flightMin = 0;
    addLog(`${msg} Penale ${pen} crediti, tornerà disponibile tra ${fmtDur(CFG.repairMin)}.`, 'bad');
    loseCrew(p);
    detach(p);
  }
  spend(pen, 'Penale per aereo abbattuto');
  return p.type === 'fighter'; // true se il caccia è stato ucciso
}
function detach(p) {
  for (const e of S.planes) if (e.state === 'escort' && e.escort === p.id) { goHome(e); addLog(`${e.id}: nessuno da scortare, rientro.`); }
  for (const th of S.threats) if (th.state === 'hunting' && th.prey === p.id) { th.state = 'flight'; th.prey = null; }
}
// groundResearch: % di ricerca se la minaccia era a terra; in volo la ricerca è casuale (1-10%)
function killThreat(th, msg, reward = CFG.killReward, groundResearch = 0) {
  removeThreat(th.id);
  if (th.training) { addLog(`${msg} (bersaglio d'addestramento).`, 'good'); return; }
  const air = th.state !== 'cooldown';
  S.kills++;
  S.credits += reward;
  const rg = addResearch(air ? randInt(CFG.researchKill[0], CFG.researchKill[1]) : groundResearch);
  addLog(`${msg} +${reward} crediti.${rg ? ` Ricerca +${rg}% (totale ${Math.round(S.research)}%).` : ''}`, 'good');
  if (th.apoc) apocDefeated(th);
}
// minacce in cielo (tutte) e quelle colpibili da missili e operazioni speciali (non la minaccia dell'apocalisse)
const skyThreats = () => S.threats.filter(t => t.state !== 'cooldown' && !t.training);
const airThreats = () => skyThreats().filter(t => !t.apoc);
