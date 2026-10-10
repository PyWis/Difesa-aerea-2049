'use strict';
/* Operazioni speciali, artefatti e addestramenti */
// ---------- Operazioni speciali (Logistica) ----------
function addBoost(label, n, days, kind) {
  S.ops.boosts.push({ label, n, kind, until: S.t + days * DAY });
}
// caccia usati come ricognitori: quando atterrano restano fermi alla base
const fighterRecon = () => S.ops.boosts.some(b => b.kind === 'fighters');
function holdFighter(p) {
  p.state = 'repair'; p.hold = true; p.repairUntil = S.t + CFG.ops.fighters.holdH * 60;
}
const tacticalPool = () => airThreats().filter(t => !t.raid && t.state !== 'raid');
const returning = () => planesOf('fighter').filter(p => p.state === 'rtb' && !p.recov).sort((a, b) => dist(a, S.base) - dist(b, S.base));
const tacticalAir = () => planesOf('tactical').filter(isAir);
// bersagli per una missione tattica: basi sotto attacco (le più vicine) e addestramenti
const tacticalTargets = () => [...S.threats.filter(t => t.state === 'cooldown').map(t => ({ th: t, pos: t })), ...S.trainings.map(tr => ({ tr, pos: tr.base }))];
const OPS = [
  { id: 'recover', desc: o => `Rientro ×${o.mult} per i ${o.n} caccia in rientro più vicini alla base (di pattuglia, normali o danneggiati). Non possono avere nuove missioni finché non atterrano.`,
    can: () => returning().length ? '' : 'Nessun caccia in rientro',
    run(o) {
      const pick = returning().slice(0, o.n);
      for (const p of pick) p.recov = o.mult;
      addLog(`${o.label}: ${pick.map(p => p.id).join(', ')} rientrano a velocità ×${o.mult}.`, 'good');
    } },
  { id: 'recoverAll', desc: o => `Rientro ×${o.mult} per tutti i caccia in rientro. ${Math.round(o.chance * 100)}% di probabilità, per ciascuno, di richiamare anche i caccia in missione. Non possono avere nuove missioni finché non atterrano.`,
    can: () => planesOf('fighter').some(p => isAir(p) && !p.recov) ? '' : 'Nessun caccia in volo',
    run(o) {
      const done = [], recalled = [];
      for (const p of planesOf('fighter').filter(isAir)) {
        if (p.state !== 'rtb') { if (Math.random() >= o.chance) continue; goHome(p); recalled.push(p.id); }
        p.recov = o.mult; done.push(p.id);
      }
      addLog(`${o.label}: ${done.length} caccia rientrano a velocità ×${o.mult}${recalled.length ? ` (richiamati dalla missione: ${recalled.join(', ')})` : ''}.`, 'good');
    } },
  { id: 'autoTac', desc: o => `Porta i rifornitori a 0, bloccati per ${o.tankerLockH} ore, e assegna una nuova missione tattica agli aerei tattici in volo, anche se stanno rientrando. Una volta ogni ${o.cooldownDays} giorni.`,
    can: () => !tacticalAir().length ? 'Nessun aereo tattico in volo' : !tacticalTargets().length ? 'Nessuna missione tattica disponibile' : '',
    run(o) {
      const used = new Set();
      const assigned = [];
      for (const p of tacticalAir()) {
        const t = tacticalTargets().filter(x => !used.has(x.th || x.tr)).sort((a, b) => dist(p, a.pos) - dist(p, b.pos))[0];
        if (!t) break;
        used.add(t.th || t.tr);
        p.state = 'flight'; p.fast = false; p.recov = 0; p.escort = null; p.engaged = null; p.aim = null;
        if (t.th) { p.mission = null; p.target = t.th.id; assigned.push(`${p.id} → ${t.th.attack.name}`); }
        else { p.mission = 'train'; p.trainId = t.tr.id; p.target = null; assigned.push(`${p.id} → addestramento a ${t.tr.base.name}`); }
      }
      const n = S.support.tanker;
      if (n) {
        const refund = n * CFG.tankerPerDay * minutesToMidnight(S.t) / DAY;
        S.credits += refund; S.support.tanker = 0;
      }
      S.support.lock.tanker = S.t + o.tankerLockH * 60;
      addLog(`${o.label}: ${assigned.join('; ')}. Rifornitori ${n} → 0, bloccati per ${o.tankerLockH} ore.`, 'good');
    } },
  { id: 'onu', desc: o => `Attiva +${o.n} ricognitori per ${o.days} giorni. Vale +${o.repBonus}% di reputazione e ${o.medals} medaglia. Massimo 1 ogni ${o.cooldownDays} giorni.`,
    run(o) {
      addBoost(o.label, o.n, o.days);
      addLog(`${o.label}: +${o.n} ricognitori per ${o.days} giorni. Reputazione +${o.repBonus}%, +${o.medals} medaglia.`, 'good');
      changeRep(o.repBonus); addMedal(o.medals);
    } },
  { id: 'coalition', desc: o => `Attiva +${o.n} ricognitori per ${o.days} giorno. Vale +${o.repBonus}% di reputazione e ${o.medals} medaglia. Massimo 1 ogni ${o.cooldownDays} giorni.`,
    run(o) {
      addBoost(o.label, o.n, o.days);
      addLog(`${o.label}: +${o.n} ricognitori per ${o.days} giorno. Reputazione +${o.repBonus}%, +${o.medals} medaglia.`, 'good');
      changeRep(o.repBonus); addMedal(o.medals);
    } },
  { id: 'fighters', desc: o => `I caccia vengono usati come ricognitori: +${o.n} ricognitori per ${o.days} giorno. I caccia alla base e quelli che atterrano durante l'operazione restano fermi ${o.holdH} ore. Gratis, massimo 1 al giorno.`,
    run(o) {
      addBoost(o.label, o.n, o.days, 'fighters');
      const held = planesOf('fighter').filter(f => f.state === 'base');
      held.forEach(holdFighter);
      addLog(`${o.label}: +${o.n} ricognitori per ${o.days} giorno. ${held.length ? `${held.map(f => f.id).join(', ')} fermi alla base per ${o.holdH} ore; ` : ''}i caccia che atterrano durante l'operazione restano fermi ${o.holdH} ore.`, 'good');
    } },
  { id: 'tactical', desc: o => `Una minaccia in volo a caso atterra alla base più vicina viaggiando a velocità ×${o.speedMult}: reputazione ${o.repNow}% subito, +${o.repLater}% dopo ${o.laterDays} giorno. Una alla volta.`,
    can: () => S.t < S.fx.recallUntil ? 'Richiamo attivo' : !tacticalPool().length ? 'Nessuna minaccia in volo' : S.fx.repLater.some(r => r.tactical) ? 'Operazione già in corso' : '',
    run(o) {
      const pool = tacticalPool();
      const th = pool[Math.floor(Math.random() * pool.length)];
      const taken = new Set(S.threats.filter(x => x.attack).map(x => x.attack.key));
      const key = BASES.map((b, i) => i).filter(i => !taken.has(i)).sort((a, b) => dist(th, BASES[a]) - dist(th, BASES[b]))[0];
      if (key === undefined) return;
      const tgt = BASES[key];
      th.state = 'inbound'; th.prey = null; th.rush = true; th.course = (th.course || 0) + 1;
      th.attack = { key, name: isOwnBase(tgt) ? `${tgt.name} (la tua base)` : tgt.name, lat: tgt.lat, lon: tgt.lon };
      S.fx.repLater.push({ at: S.t + o.laterDays * DAY, rep: o.repLater, why: 'Mappa Tattica', tactical: true });
      addLog(`Mappa Tattica: ${th.id} è diretta a velocità ×${o.speedMult} su ${th.attack.name} (${Math.round(dist(th, tgt))} km). Reputazione ${o.repNow}% subito, +${o.repLater}% tra ${o.laterDays} giorno.`, 'bad');
      changeRep(o.repNow);
    } },
];
function opState(def) {
  const o = CFG.ops[def.id], at = S.ops.at[def.id];
  const cd = at == null || !o.cooldownDays ? 0 : at + o.cooldownDays * DAY - S.t;
  let why = '';
  if (cd > 0) why = `Disponibile tra ${fmtDur(cd)}`;
  else if (S.credits < o.cost) why = `Servono ${o.cost} crediti`;
  else if (def.can) why = def.can();
  return { why, cd, o };
}
function activateOp(id) {
  const def = OPS.find(d => d.id === id);
  if (!def || S.over || S.pending || S.askBankrupt) return;
  const st = opState(def);
  if (st.why) { addLog(`${st.o.label}: ${st.why.toLowerCase()}.`, 'bad'); return; }
  if (st.o.cost) { spend(st.o.cost, st.o.label); if (S.over) return; }
  S.ops.at[id] = S.t;
  def.run(st.o);
}

// ---------- Artefatti ----------
const ARTIFACTS = [
  { id: 'research', base: 'research', name: 'Ricerca', desc: `Aumenta la ricerca del ${CFG.art.researchBoost}%.`,
    run() { S.research += CFG.art.researchBoost; addLog(`Artefatto Ricerca: +${CFG.art.researchBoost}% di ricerca (totale ${Math.round(S.research)}%).`, 'good'); } },
  { id: 'antimatter', base: 'missile', name: 'Missile ad antimateria',
    desc: `Missile a ${CFG.art.missileSpeed} km/h, ${CFG.art.missileDays} giorni di volo: attacca la minaccia in volo più vicina; a ogni abbattimento il tempo di volo residuo si dimezza e sceglie un altro bersaglio.`,
    run() {
      const site = extraOf('missile').site;
      const m = { id: 'K' + (++S.ids.K), lat: site.lat, lon: site.lon, heading: 0, until: S.t + CFG.art.missileDays * DAY, target: null, trail: [] };
      S.missiles.push(m);
      addLog(`Missile ad antimateria ${m.id} lanciato da ${site.name}: ${CFG.art.missileDays} giorni di volo.`, 'good');
    } },
  { id: 'sublunar', base: 'research', space: 0, name: CFG.art.space[0].name,
    desc: `+${CFG.art.space[0].sergeantMissions} missione a ogni sergente, sergente scelto e sergente capo senza assegnazione. ${CFG.art.space[0].send} sergenti senza assegnazione partono per la missione spaziale (tolti dal gioco); dopo ${CFG.art.space[0].days} giorni arriva un ${CFG.pilots.ranks[CFG.art.space[0].arrive].name} e la reputazione cala del ${CFG.art.space[0].repLoss}%.`,
    can: () => spaceBlock(CFG.art.space[0]), run() { runSpace(CFG.art.space[0]); } },
  { id: 'mars', base: 'research', space: 1, name: CFG.art.space[1].name,
    desc: `${CFG.art.space[1].send} marescialli di volo senza assegnazione partono per la missione spaziale (tolti dal gioco); dopo ${CFG.art.space[1].days} giorni arriva un ${CFG.pilots.ranks[CFG.art.space[1].arrive].name} e la reputazione cala dell'${CFG.art.space[1].repLoss}%.`,
    can: () => spaceBlock(CFG.art.space[1]), run() { runSpace(CFG.art.space[1]); } },
  { id: 'venus', base: 'research', space: 2, name: CFG.art.space[2].name,
    desc: `${CFG.art.space[2].send} capitani di volo senza assegnazione partono per la missione spaziale (tolti dal gioco); dopo ${CFG.art.space[2].days} giorni arriva un ${CFG.pilots.ranks[CFG.art.space[2].arrive].name}, che non partecipa ai voli ed è un punteggio extra.`,
    can: () => spaceBlock(CFG.art.space[2]), run() { runSpace(CFG.art.space[2]); } },
  { id: 'quantum', base: 'missile', name: 'Missile quantico', desc: `Abbatte istantaneamente ${CFG.art.quantumKills} minacce in volo a caso.`,
    can: () => airThreats().length ? '' : 'Nessuna minaccia in volo',
    run() {
      const pool = shuffle(airThreats()).slice(0, CFG.art.quantumKills);
      addLog(`Missile quantico: ${pool.length} ${pool.length === 1 ? 'bersaglio' : 'bersagli'}.`, 'good');
      for (const th of pool) killThreat(th, `Il missile quantico ha abbattuto ${th.id}.`);
    } },
  { id: 'recall', base: 'missile', name: 'Richiamo',
    desc: `Per ${CFG.art.recallHours} ore le minacce in volo non possono atterrare (attaccare una base) e si dirigono verso la base che ha attivato l'artefatto.`,
    run() {
      S.fx.recallUntil = S.t + CFG.art.recallHours * 60; S.fx.recallBase = extraOf('missile').site;
      addLog(`Richiamo attivo per ${CFG.art.recallHours} ore: le minacce si dirigono verso ${S.fx.recallBase.name}.`, 'good');
    } },
  { id: 'quake', base: 'missile', name: 'Terremoto', desc: `Aggiunge da ${CFG.art.quakeMinDays} a ${CFG.art.quakeMaxDays} giorni di attacco a tutte le basi attualmente attaccate: più tempo per bombardarle.`,
    can: () => S.threats.some(t => t.state === 'cooldown') ? '' : 'Nessuna base sotto attacco',
    run() {
      for (const th of S.threats.filter(t => t.state === 'cooldown')) {
        const d = CFG.art.quakeMinDays + Math.random() * (CFG.art.quakeMaxDays - CFG.art.quakeMinDays);
        th.cooldownUntil += d * DAY;
        addLog(`Terremoto a ${th.attack.name}: ${th.id} resta a terra altri ${fmtDur(d * DAY)}.`, 'good');
      }
    } },
  { id: 'pilots', base: 'training', name: 'Aggiornamento piloti',
    desc: `Per ${CFG.art.pilotDays} giorni puoi attivare ${CFG.art.pilotBonuses} bonus sui caccia (potenziamento istantaneo, dalla scheda del caccia). I bonus restano anche dopo la scadenza.`,
    run() { S.fx.pilotUntil = S.t + CFG.art.pilotDays * DAY; S.fx.pilotLeft = CFG.art.pilotBonuses; addLog(`Aggiornamento piloti: ${CFG.art.pilotBonuses} bonus disponibili per ${CFG.art.pilotDays} giorni (scheda Flotta).`, 'good'); } },
  { id: 'tech', base: 'training', name: 'Addestramento tecnico', desc: `Tutti gli aerei volano a +${CFG.art.techBonus} km/h per ${CFG.art.techDays} giorni.`,
    run() { S.fx.techUntil = S.t + CFG.art.techDays * DAY; addLog(`Addestramento tecnico: +${CFG.art.techBonus} km/h a tutti gli aerei per ${CFG.art.techDays} giorni.`, 'good'); } },
  { id: 'flight', base: 'training', name: 'Addestramento volo',
    desc: `Per ${CFG.art.flightDays} giorni compare ogni ${CFG.art.flightEveryH} ore una minaccia ferma entro ${CFG.art.flightRadiusKm} km dalla tua base operativa (dura ${CFG.art.flightLifeH} ore). I caccia vincono sempre; niente crediti.`,
    run() { S.fx.flight = { until: S.t + CFG.art.flightDays * DAY, next: S.t }; addLog(`Addestramento volo attivo per ${CFG.art.flightDays} giorni.`, 'good'); } },
  { id: 'tactical', base: 'training', name: 'Addestramento tattico', desc: `Crea un addestramento a terra di ${CFG.art.trainDays} giorni in un'altra base (aereo tattico, ${CFG.trainingMedals} medaglia).`,
    can: () => BASES.some(b => dist(b, S.base) > 500 && !S.trainings.some(t => t.base === b)) ? '' : 'Nessuna base libera',
    run() { const tr = addTraining(CFG.art.trainDays); addLog(`Addestramento tattico a ${tr.base.name} (${tr.base.state}): invia un aereo tattico entro ${CFG.art.trainDays} giorni.`, 'good'); } },
  { id: 'tacSgt', base: 'training', name: 'Missione tattica Sergenti',
    desc: `+${CFG.art.tacSergeants} missioni a ogni sergente, sergente scelto e sergente capo.`,
    can: () => pilotsWhere(pl => pl.rank >= 2 && pl.rank <= 4).length ? '' : 'Nessun sergente in servizio',
    run() { for (const pl of pilotsWhere(pl => pl.rank >= 2 && pl.rank <= 4)) giveMission(pl, CFG.art.tacSergeants); addLog(`Missione tattica Sergenti: +${CFG.art.tacSergeants} missioni a ogni sergente.`, 'good'); refreshBarracks(); } },
  { id: 'tacOff', base: 'training', name: 'Missione tattica Ufficiali',
    desc: `+${CFG.art.tacOfficers} missione a tutti i piloti in servizio (ufficiali e sergenti).`,
    can: () => pilotsWhere(pl => pl.rank >= 2 && !isLastRank(pl)).length ? '' : 'Nessun pilota promovibile',
    run() { for (const pl of pilotsWhere(pl => pl.rank >= 2 && !isLastRank(pl))) giveMission(pl, CFG.art.tacOfficers); addLog(`Missione tattica Ufficiali: +${CFG.art.tacOfficers} missione a tutti i piloti.`, 'good'); refreshBarracks(); } },
  { id: 'tacCad', base: 'training', name: 'Missione tattica Cadetti',
    desc: `Per ${CFG.art.cadetDays} giorni tutti i cadetti in uscita sono cadetti scelti. Per ${CFG.art.cadetMissionDays} giorni i cadetti che diventano sergenti hanno già ${CFG.art.cadetMissions} missioni effettuate.`,
    run() {
      S.fx.cadetsUntil = S.t + CFG.art.cadetDays * DAY; S.fx.cadetMissionsUntil = S.t + CFG.art.cadetMissionDays * DAY;
      for (const pl of S.pilots.filter(pl => pl.rank === 0)) { pl.rank = 1; pl.since = S.t; pl.academyUntil = Math.min(pl.academyUntil, S.t + PR()[1].academyDays * DAY); }
      addLog(`Missione tattica Cadetti: cadetti scelti per ${CFG.art.cadetDays} giorni; per ${CFG.art.cadetMissionDays} giorni i nuovi sergenti hanno ${CFG.art.cadetMissions} missioni già effettuate.`, 'good'); refreshBarracks();
    } },
  { id: 'monument', base: 'major', name: 'Monumento Minaccia Ignota',
    desc: `Reputazione +${CFG.art.monumentUp}% per ${CFG.art.monumentDays} giorni; alla disattivazione −${CFG.art.monumentDown}%.`,
    can: () => S.fx.monumentUntil ? 'Già attivo' : '',
    run() { changeRep(CFG.art.monumentUp); S.fx.monumentUntil = S.t + CFG.art.monumentDays * DAY; addLog(`Monumento Minaccia Ignota: reputazione +${CFG.art.monumentUp}% per ${CFG.art.monumentDays} giorni.`, 'good'); } },
];
// stato di un artefatto: motivo per cui non è attivabile ('' se lo è) e eventuale durata residua
function artifactState(a) {
  const at = S.artAt[a.id];
  const cd = at == null ? 0 : at + CFG.artifactCooldownDays * DAY - S.t;
  let why = '';
  if (cd > 0) why = `Riattivabile tra ${fmtDur(cd)}`;
  else if (researchCharges() < 1) why = `Ricerca insufficiente (${Math.round(S.research)}% su ${CFG.artifactResearch}%)`;
  else if (S.credits < CFG.artifactCost) why = `Servono ${CFG.artifactCost} crediti`;
  else if (a.can) why = a.can();
  return { why, cd };
}
function activateArtifact(id) {
  const a = ARTIFACTS.find(x => x.id === id);
  if (!a || !extraOf(a.base) || S.over || S.pending) return;
  const st = artifactState(a);
  if (st.why) { addLog(`Artefatto ${a.name}: ${st.why.toLowerCase()}.`, 'bad'); return; }
  spend(CFG.artifactCost, `Artefatto ${a.name}`);
  if (S.over) return;
  S.research -= CFG.artifactResearch;
  S.artAt[a.id] = S.t;
  addLog(`Artefatto ${a.name} attivato: −${CFG.artifactCost} crediti, −${CFG.artifactResearch}% di ricerca.`);
  a.run();
}
function addTraining(days) {
  const cand = BASES.filter(b => dist(b, S.base) > 500 && !S.trainings.some(t => t.base === b));
  if (!cand.length) return null;
  const tr = { id: 'D' + (++S.ids.D), base: cand[Math.floor(Math.random() * cand.length)], until: S.t + days * DAY };
  S.trainings.push(tr); panelDirty = true;
  return tr;
}
// minaccia ferma d'addestramento vicino alla base operativa
function spawnTrainingThreat() {
  const pos = travel(S.base, Math.random() * 360, Math.sqrt(Math.random()) * CFG.art.flightRadiusKm).pos;
  const th = { trail: [], id: 'M' + (++S.ids.M), lat: pos.lat, lon: pos.lon, bearing: 0, born: S.t, flightStart: S.t, state: 'flight', attack: null, prey: null, training: true, expires: S.t + CFG.art.flightLifeH * 60, course: 0 };
  S.threats.push(th);
  addLog(`Addestramento volo: bersaglio ${th.id} a ${fmtCoord(th)}, ${Math.round(dist(th, S.base))} km dalla base.`);
}
