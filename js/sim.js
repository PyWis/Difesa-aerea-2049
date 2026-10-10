'use strict';
/* Simulazione: avanzamento del tempo, minacce e combattimento */
// ---------- Simulazione ----------
const activeTankers = () => S.support.tanker;
// autonomia dei caccia: base + ore per ogni rifornitore attivo (bombardieri e tattici sono illimitati)
const autonomyH = () => CFG.baseAutonomyH + activeTankers() * CFG.tankerBonusH;

function step(dt) {
  const t0 = S.t, t1 = S.t + dt;
  S.t = t1;
  checkDebt('Debito persistente');
  if (S.over) return;

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
    if (S.decl) { declPay(); if (S.over) return; }
    const before = S.rep;
    const baseGain = CFG.reconRep[S.support.recon] || 0, loss = CFG.tankerRepLoss[S.support.tanker] || 0;
    const mult = repMult(before), gain = baseGain * mult;
    const extra = Math.max(0, before + gain - loss - 100); // punti che andrebbero oltre il 100%
    changeRep(gain - loss);
    if (S.over) return;
    addLog(`Mezzanotte: reputazione ${Math.round(before)}% → ${Math.round(S.rep)}% (+${gain} ricognizione${mult > 1 && baseGain ? `, recupero ×${mult}` : ''}${loss ? `, −${loss} rifornitori` : ''})${billed ? ', addebitati i costi giornalieri' : ''}.`);
    if (extra > 0) {
      const chance = Math.min(1, extra * CFG.medalChancePerPoint);
      if (Math.random() < chance) { addLog(`${extra} ${extra === 1 ? 'punto' : 'punti'} di reputazione extra: medaglia ottenuta (probabilità ${Math.round(chance * 100)}%, totale ${S.medals + 1}).`, 'good'); addMedal(1); }
      else addLog(`${extra} ${extra === 1 ? 'punto' : 'punti'} di reputazione extra: nessuna medaglia oggi (probabilità ${Math.round(chance * 100)}%).`);
    }
    if (extraOf('major') && S.rep >= 100) {
      addLog(`Base maggiore: reputazione al 100%, medaglia del giorno (totale ${S.medals + 1}).`, 'good');
      addMedal(1);
      if (S.over) return;
    }
    arriveCadets();
    S.autosave = true; // il ciclo principale salva la partita a fine passo
  }

  tickPilots();

  // effetti degli artefatti
  const fx = S.fx;
  if (fx.recallUntil && t1 >= fx.recallUntil) {
    fx.recallUntil = 0;
    for (const th of S.threats) if (th.recalled) { th.recalled = false; th.course = (th.course || 0) + 1; }
    addLog('Richiamo terminato: le minacce riprendono a muoversi liberamente.');
  }
  if (fx.pilotUntil && t1 >= fx.pilotUntil) { addLog(`Addestramento piloti terminato${fx.pilotLeft ? ` (${fx.pilotLeft} bonus non usati persi)` : ''}.`); fx.pilotUntil = 0; fx.pilotLeft = 0; }
  if (fx.techUntil && t1 >= fx.techUntil) { fx.techUntil = 0; addLog('Addestramento tecnico terminato: velocità normale.'); }
  if (fx.flight) {
    if (t1 >= fx.flight.until) { fx.flight = null; addLog('Addestramento volo terminato.'); }
    else while (fx.flight && t1 >= fx.flight.next) { spawnTrainingThreat(); fx.flight.next += CFG.art.flightEveryH * 60; }
  }
  if (fx.monumentUntil && t1 >= fx.monumentUntil) {
    fx.monumentUntil = 0;
    addLog(`Il Monumento Minaccia Ignota si disattiva: reputazione −${CFG.art.monumentDown}%.`, 'bad');
    changeRep(-CFG.art.monumentDown);
    if (S.over) return;
  }

  for (const b of [...S.ops.boosts]) if (t1 >= b.until) { S.ops.boosts = S.ops.boosts.filter(x => x !== b); addLog(`${b.label}: i ${b.n} ricognitori aggiuntivi tornano alla base.`); }
  for (const r of [...fx.repLater]) if (t1 >= r.at) {
    fx.repLater = fx.repLater.filter(x => x !== r);
    changeRep(r.rep);
    addLog(`${r.why}: reputazione +${r.rep}%.`, 'good');
  }

  // ricognitori: segnalazione casuale, in media una ogni N giorni di volo
  const pSignal = 1 - Math.exp(-dt / (CFG.reconSignalDays * DAY));
  const nRecon = S.support.recon + S.ops.boosts.reduce((a, b) => a + b.n, 0);
  for (let i = 0; i < nRecon; i++) {
    if (Math.random() < pSignal) { S.support.signals++; spawnThreat('La ricognizione'); }
  }

  // missione di addestramento: compare a caso (in media una a settimana), scade dopo 10 giorni
  for (const tr of [...S.trainings]) if (S.t >= tr.until) {
    addLog(`L'addestramento a ${tr.base.name} è scaduto senza essere svolto.`, 'bad');
    S.trainings = S.trainings.filter(x => x !== tr); panelDirty = true;
  }
  if (!S.trainings.length && Math.random() < 1 - Math.exp(-dt / (CFG.trainingEveryDays * DAY))) {
    const tr = addTraining(CFG.trainingWindowDays);
    if (tr) addLog(`Missione di addestramento a ${tr.base.name} (${tr.base.state}): invia un aereo tattico entro ${CFG.trainingWindowDays} giorni, premio ${CFG.trainingMedals} medaglia.`, 'good');
  }

  // minacce
  const hourCrossed = Math.floor(t1 / 60) > Math.floor(t0 / 60);
  const kmBase = thSpeed() * dt / 60;
  const recall = S.t < S.fx.recallUntil;
  for (const th of [...S.threats]) {
    if (!S.threats.includes(th)) continue;
    if (th.training) {
      if (S.t >= th.expires) { removeThreat(th.id); addLog(`Il bersaglio d'addestramento ${th.id} si è dissolto.`); }
      continue;
    }
    if (recall && th.state === 'inbound') { th.state = 'flight'; th.attack = null; th.course = (th.course || 0) + 1; }
    if (th.rush && th.state !== 'inbound') th.rush = false;
    const km = kmBase * (th.rush ? CFG.ops.tactical.speedMult : 1);
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
      } else if (!recall && th.state === 'flight' && S.t - th.flightStart >= CFG.attackAfterH * 60 && Math.random() < atkCh()) {
        // qualsiasi base del mondo, purché non sia già occupata o presa di mira da un'altra minaccia
        const taken = new Set(S.threats.filter(o => o.attack).map(o => o.attack.key));
        const free = BASES.map((b, i) => i).filter(i => !taken.has(i));
        if (free.length) {
          const key = free[Math.floor(Math.random() * free.length)], tgt = BASES[key];
          const own = isOwnBase(tgt);
          th.state = 'inbound'; th.attack = { key, name: own ? `${tgt.name} (la tua base)` : tgt.name, lat: tgt.lat, lon: tgt.lon };
          th.course = (th.course || 0) + 1;
          // al giocatore appare come un normale cambio di rotta
          addLog(`${th.id} ha cambiato direzione (rotta ${Math.round(bearingTo(th, tgt))}°).`);
        }
      } else if (!recall && th.state === 'flight' && Math.random() < CFG.threatTurnChance) {
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
        th.lat = th.attack.lat; th.lon = th.attack.lon; th.state = 'cooldown'; th.rush = false;
        const days = CFG.cooldownMinDays + Math.random() * (CFG.cooldownMaxDays - CFG.cooldownMinDays);
        th.cooldownUntil = S.t + days * DAY;
        addLog(`${th.id} attacca ${th.attack.name}! Resterà lì ${fmtDur(days * DAY)}: solo bombardieri e aereo tattico possono colpirla.`, 'bad');
        for (const f of S.planes) if (f.type === 'fighter' && f.state === 'flight' && f.target === th.id) { goHome(f); addLog(`${f.id}: ${th.id} è a terra, i caccia non possono colpirla. Rientro.`); }
        continue;
      }
    }
    if (recall && th.state === 'flight') {
      if (!th.recalled) { th.recalled = true; th.course = (th.course || 0) + 1; }
      th.bearing = bearingTo(th, S.fx.recallBase);
      if (dist(th, S.fx.recallBase) <= km) { th.lat = S.fx.recallBase.lat; th.lon = S.fx.recallBase.lon; continue; }
    }
    trail(th);
    const mv = travel(th, th.bearing, km);
    th.lat = mv.pos.lat; th.lon = mv.pos.lon; th.bearing = mv.bearing;
  }

  // missili ad antimateria
  const mkm = CFG.art.missileSpeed * dt / 60;
  for (const m of [...S.missiles]) {
    if (S.t >= m.until) { S.missiles = S.missiles.filter(x => x !== m); addLog(`Il missile ${m.id} ha esaurito il tempo di volo.`); continue; }
    let th = m.target && findThreat(m.target);
    if (!th || th.state === 'cooldown' || th.training) {
      th = airThreats().sort((a, b) => dist(m, a) - dist(m, b))[0]; m.target = th ? th.id : null;
    }
    if (!th) continue;
    if (dist(m, th) <= mkm + CFG.art.missileRadiusKm) {
      m.lat = th.lat; m.lon = th.lon;
      killThreat(th, `Il missile ${m.id} ha distrutto ${th.id}.`);
      m.until = S.t + (m.until - S.t) / 2; m.target = null;
      addLog(`${m.id}: tempo di volo dimezzato, restano ${fmtDur(m.until - S.t)}.`);
    } else { trail(m); moveTo(m, th, mkm); }
  }

  // aerei
  const flying = S.planes.filter(isAir);
  const hourly = flying.reduce((s, p) => s + TYPES[p.type].perHour, 0);
  if (hourly) spend(hourly * dt / 60, 'Costi di volo');
  const autNow = autonomyH();
  validatePatrols();
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
      if (S.t >= p.repairUntil) { p.state = 'base'; p.hold = false; addLog(`${p.id} è di nuovo disponibile alla base.`, 'good'); applyBonus(p); }
      continue;
    }
    if (p.state === 'base') continue;
    p.flightMin += dt;
    trail(p);
    const pkm = spd(p) * dt / 60;
    const home = dist(p, S.base);
    if (!isStrike(p)) p.autH = Math.max(p.autH || 0, autNow); // ridurre i rifornitori non toglie autonomia a chi è in volo
    const remaining = isStrike(p) || p.damaged ? Infinity : p.autH * 60 - p.flightMin;
    if (remaining <= 0) { removePlane(p, `${p.id} ha esaurito il carburante ed è andato perduto.`); continue; }
    if (!isStrike(p) && p.state !== 'rtb' && remaining <= (home / spd(p)) * 60 * 1.05 + 5) {
      goHome(p); addLog(`${p.id}: carburante al limite, rientro automatico.`, 'bad');
    }

    if (p.state === 'flight' && p.mission === 'train') {
      const tr = S.trainings.find(x => x.id === p.trainId);
      if (!tr) { goHome(p); addLog(`${p.id}: addestramento non più disponibile, rientro.`); }
      else if (dist(p, tr.base) <= pkm + CFG.interceptRadiusKm) {
        p.lat = tr.base.lat; p.lon = tr.base.lon;
        addLog(`${p.id} ha completato l'addestramento a ${tr.base.name}: +${CFG.trainingMedals} medaglia.`, 'good');
        S.trainings = S.trainings.filter(x => x !== tr); S.trainDone++;
        goHome(p);
        addMedal(CFG.trainingMedals);
        if (S.over) return;
        continue;
      } else { moveTo(p, tr.base, pkm); continue; }
    }
    const pat = patrolOf(p);
    if (pat && p.state === 'flight' && pat.leader !== p.id) {
      const ld = findPlane(pat.leader);
      if (p.joined || dist(p, ld) <= pkm) { p.lat = ld.lat; p.lon = ld.lon; p.heading = ld.heading; p.joined = true; p.joining = false; }
      else { p.joining = true; moveTo(p, ld, pkm); }
      continue;
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
          killThreat(th, `${p.id} ha bombardato ${where} distruggendo ${th.id}.`, undefined, CFG.researchBomb);
          earnWin(p);
          spend(CFG.rebuildCost, 'Ricostruzione');
          addLog(`Ricostruzione di ${where.replace(' (la tua base)', '')}: −${CFG.rebuildCost} crediti.`, 'bad');
        } else {
          killThreat(th, `${p.id} ha raggiunto ${where} e ha eliminato ${th.id} senza danni.`, CFG.tacticalReward, CFG.researchTactical);
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
      p.damaged = false; p.fast = false;
      applyBonus(p);
      pilotsLand(p);
      if (p.type === 'fighter' && fighterRecon()) { holdFighter(p); addLog(`${p.id}: usato come ricognitore, resta fermo alla base per ${CFG.ops.fighters.holdH} ore.`); }
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
// scia di posizioni (per il disegno): un punto ogni 200 km, massimo 24
function trail(o) {
  const t = o.trail || (o.trail = []), l = t[t.length - 1];
  if (!l || dist(l, o) > 200) { t.push({ lat: o.lat, lon: o.lon }); if (t.length > 24) t.shift(); }
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
    const pat = patrolOf(f);
    if (pat && pat.leader === f.id && patrolUnited(pat)) {
      killThreat(th, `La pattuglia ${pat.id} (${pat.members.join(', ')}) ha abbattuto ${th.id} con successo certo!`);
      earnWin(f);
      const ms = pat.members.map(findPlane).filter(Boolean);
      dissolvePatrol(pat);
      for (const m of ms) { goHome(m); m.fast = true; m.lat = th.lat; m.lon = th.lon; }
      addLog(`${ms.map(m => m.id).join(', ')} rientrano a velocità ×${CFG.patrolReturnSpeed}, ma non possono intercettare altro fino all'atterraggio.`, 'good');
      return;
    }
    if (th.training || Math.random() < winCh(f)) {
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
    if (Math.random() < winCh(e)) { killThreat(th, `${e.id} difende ${prey.id} e abbatte ${th.id}!`); earnWin(e); return; }
    shotDown(e, `${e.id} è stato abbattuto da ${th.id} mentre difendeva ${prey.id}.`);
  }
  if (Math.random() < Math.min(CFG.pilots.maxWin, CFG.strikeDefense + crewWin(prey))) { killThreat(th, `${prey.id} si è difeso da solo e ha abbattuto ${th.id}!`); return; }
  shotDown(prey, `${prey.id} è stato abbattuto da ${th.id}.`);
  th.state = 'flight'; th.prey = null;
}
// primo punto lungo la rotta attuale della minaccia che il caccia può raggiungere prima di lei
function solveIntercept(f, th, maxMin) {
  const v = th.training ? 0 : thSpeed() * (th.rush ? CFG.ops.tactical.speedMult : 1) / 60, u = spd(f) / 60;
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
  const th = { trail: [], id: 'M' + (++S.ids.M), lat: p.lat, lon: p.lon, bearing: Math.random() * 360, born: S.t, flightStart: S.t, state: 'flight', attack: null, prey: null };
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
