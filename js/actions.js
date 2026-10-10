'use strict';
/* Azioni del giocatore (pulsanti e scorciatoie) */
// ---------- Azioni ----------
const A = {
  pickBase(i) {
    const s = S.sites[i];
    S.base = s;
    S.speed = 60;
    addLog(`Base operativa stabilita a ${s.name} (${s.state}, ${s.cont}).`, 'good');
    for (let i = 0; i < CFG.startFighters; i++) A.buy('fighter');
    initPilots();
    renderPanel(true);
  },
  speed(v) {
    if (!S.base || S.over || S.pending) return;
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
      target: null, escort: null, engaged: null, flightMin: 0, upgradeMin: 0, heading: 0, wins: 0, bonus: 0, crew: { first: null, second: null } });
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
    if (!f || f.type !== 'fighter' || f.state !== 'base') { addLog('Nessun caccia pronto alla base (servono 1° e 2° pilota; quelli in potenziamento non possono decollare).', 'bad'); return; }
    if (!crewReady(f)) { addLog(`${f.id} non può decollare: servono 1° e 2° pilota (Caserma).`, 'bad'); return; }
    launch(f);
    f.state = 'flight'; f.target = th.id;
    addLog(`${f.id} decolla verso ${th.id} (${spd(f)} km/h, ${f.mode === 'lead' ? "rotta al punto d'incontro" : 'inseguimento diretto'}, autonomia ${autonomyH().toFixed(1)} h).`);
  },
  // i caccia che inseguono la stessa minaccia si uniscono in pattuglia
  patrol(threatId) {
    const th = findThreat(threatId); if (!th || th.state === 'cooldown') return;
    const c = chasersOf(th).sort((a, b) => dist(a, th) - dist(b, th));
    if (c.length < CFG.patrolSize) return;
    const m = c.slice(0, CFG.patrolSize), leader = m[0];
    const pat = { id: 'P' + (++S.ids.P), leader: leader.id, members: m.map(f => f.id), target: th.id };
    S.patrols.push(pat);
    m.forEach(f => { f.patrolId = pat.id; f.joined = f === leader; f.joining = f !== leader; f.aim = null; });
    addLog(`Pattuglia ${pat.id} su ${th.id}: ${m.slice(1).map(f => f.id).join(' e ')} raggiungono ${leader.id} a velocità ×${CFG.patrolJoinSpeed}. Al contatto, successo certo.`, 'good');
  },
  // bombardiere o tattico contro una minaccia che sta attaccando una base
  strike(threatId, who) {
    const th = findThreat(threatId); if (!th || th.state !== 'cooldown') return;
    const p = TYPES[who] ? readyOf(who)[0] : findPlane(who);
    if (!p || !isStrike(p) || p.state !== 'base') { addLog('Nessun aereo d\'attacco pronto alla base: servono 1° e 2° pilota e devono essere rientrati da una missione precedente.', 'bad'); return; }
    if (!crewReady(p)) { addLog(`${p.id} non può decollare: servono 1° e 2° pilota (Caserma).`, 'bad'); return; }
    launch(p);
    p.state = 'flight'; p.target = th.id;
    const eta = dist(p, th) / spd(p) * 60;
    addLog(`${p.id} decolla verso ${th.attack.name} per colpire ${th.id}: arrivo tra ${fmtDur(eta)}.`);
    if (eta > th.cooldownUntil - S.t) addLog(`Attenzione: ${th.id} ripartirà prima che ${p.id} arrivi.`, 'bad');
  },
  escort(fighterId, leaderId) {
    const f = findPlane(fighterId), l = findPlane(leaderId);
    if (!f || f.type !== 'fighter' || f.damaged || f.fast || f.recov || !l || !isStrike(l) || !isAir(l)) return;
    if (f.state === 'upgrading' || f.state === 'repair') return;
    if (f.state === 'base') {
      if (!crewReady(f)) { addLog(`${f.id} non può decollare: servono 1° e 2° pilota (Caserma).`, 'bad'); return; }
      launch(f);
    }
    f.state = 'escort'; f.escort = l.id; f.engaged = null; f.target = null; f.aim = null;
    addLog(`${f.id} scorta ${l.id}: attaccherà le minacce entro ${CFG.escortRangeKm} km.`);
  },
  train(planeId, trId) {
    const p = findPlane(planeId), tr = S.trainings.find(x => x.id === trId) || S.trainings[0];
    if (!tr || !p || p.type !== 'tactical' || p.state !== 'base') return;
    if (!crewReady(p)) { addLog(`${p.id} non può decollare: servono 1° e 2° pilota (Caserma).`, 'bad'); return; }
    launch(p);
    p.state = 'flight'; p.mission = 'train'; p.trainId = tr.id;
    addLog(`${p.id} decolla per l'addestramento a ${tr.base.name}: arrivo tra ${fmtDur(dist(p, tr.base) / spd(p) * 60)}.`);
  },
  closeModal() { closeModal(); },
  // acquisto di una base secondaria: nuova scelta tra 10 località casuali (il tempo si ferma)
  buyBase(kind) {
    const def = CFG.bases.find(b => b.kind === kind);
    if (!def || def !== nextBaseDef() || S.pending) return;
    if (S.credits < def.cost) { addLog(`Servono ${def.cost} crediti per la ${def.label.toLowerCase()}.`, 'bad'); return; }
    const rows = worldRows.filter(r => !isOwnBase({ lat: parseFloat(r.Lat_citta), lon: parseFloat(r.Lon_citta) }));
    S.pending = { kind, sites: pickSites(rows) };
    S.resumeSpeed = S.speed; S.speed = 0; panelTab = 'basi';
    addLog(`${def.label}: scegli una delle 10 località proposte.`);
  },
  pickSecondary(i) {
    const pd = S.pending; if (!pd || !pd.sites[+i]) return;
    const def = CFG.bases.find(b => b.kind === pd.kind), site = pd.sites[+i];
    if (S.credits < def.cost) { addLog(`Servono ${def.cost} crediti per la ${def.label.toLowerCase()}.`, 'bad'); return; }
    spend(def.cost, def.label);
    if (S.over) return;
    S.extra.push({ kind: pd.kind, site });
    S.pending = null; S.hoverSite = null; S.speed = S.resumeSpeed || 0;
    addLog(`${def.label} costruita a ${site.name} (${site.state}, ${site.cont}) per ${def.cost} crediti.`, 'good');
    if (pd.kind === 'major') { changeRep(CFG.majorRepBonus); addLog(`Base maggiore: reputazione +${CFG.majorRepBonus}%.`, 'good'); }
  },
  cancelBase() {
    if (!S.pending) return;
    S.pending = null; S.hoverSite = null; S.speed = S.resumeSpeed || 0;
    addLog('Acquisto della base annullato.');
  },
  artifact(id) { activateArtifact(id); },
  op(id) { activateOp(id); },
  declare() {
    if (S.decl || S.over) return;
    if (!S.askBankrupt && !canDeclare()) return;
    const d = CFG.declaration, wasAsked = S.askBankrupt;
    S.decl = { left: d.days };
    S.askBankrupt = false; closeModal();
    if (wasAsked) S.speed = S.resumeSpeedB || 0;
    addLog(`Dichiarazione di emergenza: ${d.days} versamenti da ${d.perDay} crediti, reputazione −${d.repPerDay}% a versamento (${d.repPerDay * d.days}% in totale).`, 'bad');
    declPay();
    checkDebt(S.bankruptWhy);
  },
  continueDebt() {
    if (!S.askBankrupt) return;
    S.askBankrupt = false; closeModal(); S.speed = S.resumeSpeedB || 0;
    addLog(`Crediti in negativo: bancarotta oltre −${CFG.debt.limit} crediti o tra ${fmtDur(debtLeftMin())}.`, 'bad');
  },
  acceptBankrupt() { S.askBankrupt = false; bankrupt(S.bankruptWhy, 'Hai accettato la bancarotta'); },
  pilotBonus(planeId) {
    const p = findPlane(planeId);
    if (!p || p.type !== 'fighter' || S.t >= S.fx.pilotUntil || S.fx.pilotLeft <= 0 || p.state === 'upgrading' || p.state === 'repair' || p.speed >= TYPES.fighter.top) return;
    S.fx.pilotLeft--;
    p.bonus = (p.bonus || 0) + 1;
    addLog(`Aggiornamento piloti: bonus su ${p.id}${p.state === 'base' ? '' : ' (si applica all\'atterraggio)'}. Ne restano ${S.fx.pilotLeft}.`, 'good');
    if (p.state === 'base') applyBonus(p);
  },
  retarget(planeId, threatId) {
    const p = findPlane(planeId), th = findThreat(threatId);
    if (!p || p.state !== 'rtb' || !th || isStrike(p) || p.damaged || p.fast || p.recov) return;
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
  restart() { newGame(); openProfileForm(); },
  newGame() { newGame(); openProfileForm(); },
  help() { helpModal(); },
  tab(t) { panelTab = t; panelDirty = true; panel.scrollTop = 0; },
  loan() { takeLoan(false); },
};
