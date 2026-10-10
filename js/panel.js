'use strict';
/* Pannello laterale, HUD e registro */
// ---------- Pannello ----------
const panel = document.getElementById('panel');
let panelDirty = true;
let panelTab = 'minacce';
const openHelp = new Set();
const helpBox = (k, title, html) => `<details class="help" data-k="${k}" ${openHelp.has(k) ? 'open' : ''}><summary>${title}</summary>${html}</details>`;
let pointerDown = false;
panel.addEventListener('pointerdown', () => pointerDown = true);
panel.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.k) d.open ? openHelp.add(d.dataset.k) : openHelp.delete(d.dataset.k); }, true);
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
  const debt = S.credits < 0 && S.debtSince != null;
  cr.innerHTML = Math.floor(S.credits).toLocaleString('it-IT') + (debt ? `<small>in rosso: bancarotta sotto −${CFG.debt.limit} o tra ${fmtDur(debtLeftMin())}</small>` : '');
  cr.classList.toggle('low', S.credits < 150);
  const rep = document.getElementById('rep');
  const r = Math.round(S.rep);
  rep.innerHTML = `<span class="label">Reputazione</span><div class="repval"><b>${r}%</b><em class="medals" title="Grado e medaglie (obiettivo ${MEDALS_GOAL})">${RANKS[rankIdx(S.medals)].name} · ${S.medals}/${MEDALS_GOAL} ★</em></div><div class="repbar"><i style="width:${r}%"></i></div>`;
  rep.classList.toggle('low', r <= 50);
  document.querySelectorAll('#speeds button').forEach(b => {
    b.setAttribute('aria-pressed', String(+b.dataset.speed === S.speed));
    if (+b.dataset.speed === CFG.turboSpeed) b.textContent = S.speed === CFG.turboSpeed ? `1h · ${Math.ceil(S.turboLeft / 60)}h` : '1h';
    b.disabled = !S.base || S.over || !!S.pending;
  });
}
function renderLog() {
  document.getElementById('logbox').innerHTML = `<h2>Registro</h2>
    <ul class="log">${S.log.map(l => `<li class="${l.kind}"><time>${fmtShort(l.t)}</time><span>${l.msg}</span></li>`).join('')}</ul>`;
}
function planeStateText(p) {
  if (p.state === 'base') return 'Pronto alla base';
  if (p.state === 'repair') return p.hold ? 'Fermo alla base (ricognizione)' : 'Abbattuto, in ripristino';
  if (p.state === 'upgrading') return `Potenziamento ${Math.floor(p.upgradeMin / DAY * 100)}%`;
  if (p.state === 'rtb' && p.recov) return `Missione Recupero: rientro ×${p.recov}`;
  if (p.state === 'rtb' && p.fast) return 'Rientro rapido dopo la pattuglia';
  if (p.state === 'rtb') return p.damaged ? 'Danneggiato, rientro a metà velocità' : 'In rientro';
  if (p.state === 'flight' && p.mission === 'raid') { const lb = S.launch.find(x => x.id === p.raidId); return lb ? `Verso la base di lancio ${lb.site.name}, ${Math.round(dist(p, lb.site))} km` : 'In volo'; }
  if (p.state === 'escort') return p.engaged ? `Scorta ${p.escort}, ingaggia ${p.engaged}` : `Scorta ${p.escort}`;
  const trm = p.mission === 'train' && S.trainings.find(x => x.id === p.trainId);
  if (trm) return `Verso ${trm.base.name} (addestramento), ${Math.round(dist(p, trm.base))} km`;
  const pt = patrolOf(p);
  if (pt && p.state === 'flight') return pt.leader === p.id ? `Capo pattuglia ${pt.id} su ${p.target}` : p.joined ? `In pattuglia ${pt.id} con ${pt.leader}` : `Raggiunge ${pt.leader} (pattuglia ${pt.id}), ×${CFG.patrolJoinSpeed}`;
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
function crewLine(p) {
  const pl = crewPilots(p), c = crewOf(p);
  if (!pl.length) return '<span class="note">Nessun pilota assegnato: vedi Caserma.</span>';
  const who = slot => { const x = pilotById(c[slot]); return x ? `${SLOT_NAME[slot]} ${esc(pilotTitle(x))}` : ''; };
  const bonus = [crewWin(p) && `+${Math.round(crewWin(p) * 100)}% scontri`, crewStrikeSpeed(p) && `+${crewStrikeSpeed(p)} km/h`, patrolSpeedMult(p) > 1 && `pattuglia +${Math.round(CFG.pilots.patrolCaptainSpeed * 100)}% velocità`].filter(Boolean).join(', ');
  return `<span class="note">Equipaggio: ${[who('first'), who('second')].filter(Boolean).join(' · ')}${bonus ? ` (${bonus})` : ''}</span>`;
}
function planeCard(p, aut) {
  const T = TYPES[p.type];
  let extra = '', actions = '';
  const sel = S.selectedThreat && findThreat(S.selectedThreat);
  const hunted = S.threats.filter(t => t.state === 'hunting' && t.prey === p.id).map(t => t.id);
  if (p.state === 'repair') {
    const done = 1 - (p.repairUntil - S.t) / (p.hold ? CFG.ops.fighters.holdH * 60 : CFG.repairMin);
    extra = `<div class="bar warn"><i style="width:${done * 100}%"></i></div><span class="note">Di nuovo disponibile tra ${fmtDur(p.repairUntil - S.t)}</span>`;
  } else if (p.state === 'base' || p.state === 'upgrading') {
    if (p.state === 'base' && p.speed < T.top) actions += `<button class="btn ghost" data-action="upgrade" data-a="${p.id}">Potenzia</button>`;
    if (p.state === 'upgrading') {
      extra = `<div class="bar"><i style="width:${p.upgradeMin / DAY * 100}%"></i></div><span class="note">Non impiegabile fino alla fine del potenziamento (${fmtDur(DAY - p.upgradeMin)}).</span>`;
    } else if (!crewReady(p)) {
      extra = '<span class="note warn-text">Non può decollare: servono 1° e 2° pilota (Caserma).</span>';
    } else if (p.type === 'fighter') {
      if (sel && sel.state !== 'cooldown') actions += `<button class="btn danger" data-action="intercept" data-a="${sel.id}" data-b="${p.id}">Decolla verso ${sel.id}</button>`;
      for (const l of S.planes.filter(l => isStrike(l) && isAir(l)))
        actions += `<button class="btn" data-action="escort" data-a="${p.id}" data-b="${l.id}">Scorta ${l.id}</button>`;
    } else if (p.type === 'tactical' && S.trainings.length && !(sel && sel.state === 'cooldown')) {
      for (const tr of S.trainings) actions += `<button class="btn" data-action="train" data-a="${p.id}" data-b="${tr.id}">Addestramento a ${tr.base.name} (${fmtDur(dist(S.base, tr.base) / spd(p) * 60)})</button>`;
    } else if (sel && sel.state === 'cooldown') {
      const eta = dist(S.base, sel) / spd(p) * 60;
      actions += `<button class="btn danger" data-action="strike" data-a="${sel.id}" data-b="${p.id}">Colpisci ${sel.id} (${fmtDur(eta)})</button>`;
    }
    if (p.type === 'bomber' && p.state === 'base' && crewReady(p))
      for (const lb of S.launch) actions += `<button class="btn danger" data-action="raid" data-a="${lb.id}" data-b="${p.id}">Bombarda base di lancio ${lb.site.name} (${fmtDur(dist(S.base, lb.site) / spd(p) * 60)})</button>`;
  } else {
    const pa = p.autH || aut;
    const left = pa * 60 - p.flightMin;
    const frac = Math.max(0, left / (pa * 60));
    if (p.type === 'fighter' && p.mode === 'lead' && (p.state === 'flight' || (p.state === 'escort' && p.engaged)))
      extra += `<span class="note">${p.aim && p.aim.pos ? `Incontro previsto tra ${fmtDur(p.aim.eta - (S.t - p.aim.at))}` : 'Inseguimento diretto'}</span>`;
    if (isStrike(p) && p.state === 'flight') {
      const th = findThreat(p.target);
      if (th) {
        const eta = dist(p, th) / spd(p) * 60, cd = th.cooldownUntil - S.t;
        extra += `<span class="note ${eta > cd ? 'warn-text' : ''}">Arrivo tra ${fmtDur(eta)}, ${th.id} riparte tra ${fmtDur(cd)}</span>`;
      }
    }
    if (hunted.length) extra += `<span class="note warn-text">Inseguito da ${hunted.join(', ')}</span>`;
    if (isStrike(p)) {
      const esc = S.planes.filter(e => e.state === 'escort' && e.escort === p.id).map(e => e.id);
      extra += `<span class="note">${esc.length ? `Scortato da ${esc.join(', ')}` : 'Senza scorta'}</span>`;
    }
    if (isStrike(p)) {
      if (p.state === 'rtb') extra += `<span class="note">Deve rientrare alla base prima di una nuova missione: arrivo tra ${fmtDur(dist(p, S.base) / spd(p) * 60)}.</span>`;
    } else extra += `<div class="bar ${frac < 0.25 ? 'warn' : ''}"><i style="width:${frac * 100}%"></i></div><span class="note">Autonomia residua ${fmtDur(left)}</span>`;
    if (p.state === 'flight' || p.state === 'escort') actions = `<button class="btn ghost" data-action="recall" data-a="${p.id}">Richiama</button>`;
    else {
      const opts = isStrike(p) || p.damaged || p.fast || p.recov ? [] : S.threats.filter(t => t.state !== 'cooldown').sort((a, b) => dist(p, a) - dist(p, b)).slice(0, 4);
      if (opts.length) extra += `<div class="retarget"><span class="note">Nuovo obiettivo:</span>${opts.map(t =>
        `<button class="btn danger" data-action="retarget" data-a="${p.id}" data-b="${t.id}">${t.id}, ${Math.round(dist(p, t))} km</button>`).join('')}</div>`;
      if (p.type === 'fighter' && !p.damaged && !p.fast && !p.recov) for (const l of S.planes.filter(l => isStrike(l) && isAir(l)))
        actions += `<button class="btn" data-action="escort" data-a="${p.id}" data-b="${l.id}">Scorta ${l.id}</button>`;
    }
  }
  if (p.type === 'fighter' && S.t < S.fx.pilotUntil && S.fx.pilotLeft > 0 && p.state !== 'upgrading' && p.state !== 'repair' && p.speed < T.top)
    actions += `<button class="btn" data-action="pilotBonus" data-a="${p.id}">Bonus pilota (${S.fx.pilotLeft} rimasti)</button>`;
  const mode = p.type !== 'fighter' ? '' : `<div class="modes" role="group" aria-label="Rotta di ${p.id}">
      <button data-action="setMode" data-a="${p.id}" data-b="pursuit" aria-pressed="${p.mode === 'pursuit'}">Inseguimento</button>
      <button data-action="setMode" data-a="${p.id}" data-b="lead" aria-pressed="${p.mode === 'lead'}">Punto d'incontro</button>
    </div>`;
  return `<div class="plane ${p.state} t-${p.type}${p.patrolId && p.state === 'flight' ? ' patrol' : ''}${p.damaged && p.state === 'rtb' ? ' damaged' : ''}">
    <div class="plane-head"><span class="tag">${p.id}</span>
      <span class="state">${planeStateText(p)}</span><span class="speed">${spd(p) !== p.speed && (isAir(p) || techOn() || crewStrikeSpeed(p)) ? `${Math.round(spd(p))} km/h${p.damaged && !p.recov ? '' : p.recov ? ` (recupero ×${p.recov})` : p.fast ? ' (rientro rapido)' : p.joining ? ' (in raggiungimento)' : S.t < (p.sonicUntil || 0) ? ' (sonico)' : techOn() ? ' (addestramento tecnico)' : ' (equipaggio)'}` : `${p.speed} km/h`}</span></div>
    ${gearRow(p)}
    ${crewLine(p)}
    <span class="note">${winsText(p)}</span>
    ${extra}
    <div class="plane-foot">${mode}<div class="actions">${actions}</div></div>
  </div>`;
}
function rankBlock() {
  const i = rankIdx(S.medals), nx = RANKS[i + 1], cur = RANKS[i];
  const pct = nx ? (S.medals - cur.at) / (nx.at - cur.at) * 100 : 100;
  const trs = S.trainings;
  return `<div class="rankbox"><b>${cur.name}</b>${nx ? ` · prossimo grado: ${nx.name} a ${nx.at} medaglie` : ''}
    <div class="bar"><i style="width:${pct}%"></i></div>
    <span class="note">Obiettivo: ${MEDALS_GOAL} medaglie, Generale Planetario. Ogni grado aumenta la difficoltà: minacce +${Math.round(i * CFG.diffSpeed * 100)}% più veloci, vittoria in combattimento ${Math.round(winCh() * 100)}%, attacchi ${Math.round(atkCh() * 100)}% l'ora.</span>
    ${trs.length ? trs.map(tr => `<span class="note ok-text"><b>Addestramento a ${tr.base.name}</b> (${tr.base.state}): invia un aereo tattico entro ${fmtDur(tr.until - S.t)} per ${CFG.trainingMedals} medaglia.</span>`).join('')
         : `<span class="note">Una missione di addestramento compare in media ogni ${CFG.trainingEveryDays} giorni e resta valida ${CFG.trainingWindowDays} giorni: richiede l'aereo tattico.</span>`}
  </div>`;
}
function loanBlock() {
  const open = S.loans.filter(l => l.left > 0);
  const emOpen = S.emergency.filter(l => l.left > 0);
  const avail = CFG.loanMax - recentLoans().length;
  const debt = open.reduce((s, l) => s + l.left * CFG.loanInstallment, 0);
  const opCard = def => {
    const st = opState(def), o = st.o;
    const act = S.ops.boosts.filter(b => b.label === o.label).map(b => `<span class="note ok-text">Attivo: +${b.n} ricognitori, ancora ${fmtDur(b.until - S.t)}</span>`).join('')
      ;
    return `<div class="art${act ? ' on' : ''}">
      <div class="art-head"><b>${o.label}</b><button class="btn ${st.why ? 'ghost' : ''}" data-action="op" data-a="${def.id}" ${st.why ? 'disabled' : ''}>Attiva${o.cost ? ` (${o.cost.toLocaleString('it-IT')} cr)` : ''}</button></div>
      <span class="note">${def.desc(o)}</span>${act}
      ${st.why ? `<span class="note warn-text">${st.why}</span>` : ''}
    </div>`;
  };
  const opsBlock = `<section class="block"><h2>Operazioni speciali</h2>${OPS.map(opCard).join('')}</section>`;
  const dc = CFG.declaration;
  const declBlock = `<section class="block">
    <h2>Dichiarazione di emergenza ${S.decl ? `<span class="count">attiva, ${S.decl.left} versamenti</span>` : ''}</h2>
    <button class="btn ${S.credits < 300 ? '' : 'ghost'}" data-action="declare" ${canDeclare() ? '' : 'disabled'}>Dichiara l'emergenza</button>
    <p class="note">Ricevi ${dc.perDay} crediti al giorno per ${dc.days} giorni (il primo subito, poi a mezzanotte), al costo del ${dc.repPerDay}% di reputazione a ogni versamento (${dc.repPerDay * dc.days}% in totale). Non scatta mai da sola: è un'opzione per evitare la bancarotta, attivabile con meno di ${dc.maxCredits} crediti e una volta alla volta; quando i crediti finiscono ti verrà proposta.${S.decl ? `<br><b>In corso: ${S.decl.left} versamenti ancora da ricevere.</b>` : ''}</p>
  </section>`;
  return opsBlock + declBlock + `<section class="block loan">
    <h2>Prestito ONU <span class="count">${avail} di ${CFG.loanMax} disponibili</span></h2>
    <button class="btn ${S.credits < 300 ? '' : 'ghost'}" data-action="loan" ${avail ? '' : 'disabled'}>Chiedi ${CFG.loanAmount} crediti</button>
    <p class="note">Rimborso in ${CFG.loanInstallments} rate da ${CFG.loanInstallment} a mezzanotte, massimo ${CFG.loanMax} prestiti ogni ${CFG.loanWindowDays} giorni. Se i crediti vanno in negativo si attiva da solo un prestito fornitori di emergenza di ${CFG.emergencyAmount} crediti (${CFG.emergencyInstallments} rate da ${CFG.emergencyInstallment}), che non conta tra i prestiti ONU; se ne è già aperto uno, si usa un prestito ONU disponibile. Esauriti i prestiti, il saldo può scendere fino a −${CFG.debt.limit} crediti e restare in negativo al massimo ${CFG.debt.hours} ore di gioco: oltre, è bancarotta.
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
  const order = { apoc: -1, hunting: 0, raid: 0, cooldown: 1, inbound: 2, flight: 2 };
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
    if (th.apoc) status = `<b class="warn-text">MINACCIA DELL'APOCALISSE</b> verso ${th.goal.name}${th.goal.kind === 'main' ? ' (base principale)' : ''}: ${Math.round(dist(th, th.goal))} km a ${th.speed} km/h, arrivo tra ${fmtDur(dist(th, th.goal) / th.speed * 60)}. ${th.fkills < th.fixedKills ? `Sconfitta dei caccia fissa al ${Math.round(CFG.apoc.fixedLoss * 100)}% ancora per ${th.fixedKills - th.fkills} caccia uccisi.` : 'Probabilità di sconfitta normale.'} Ogni caccia ucciso diventa ${CFG.apoc.split} minacce; sconfitta: +${CFG.apoc.medals} medaglie.`;
    else if (th.state === 'raid') status = `<b class="warn-text">Minaccia bombardiera</b> da ${th.from} verso ${th.goal.name}${th.goal.kind === 'main' ? ' (base principale)' : ''}: ${Math.round(dist(th, th.goal))} km, arrivo tra ${fmtDur(dist(th, th.goal) / thSpeed() * 60)}. Se colpisce la base la distrugge.`;
    else if (th.training) status = `Bersaglio d'addestramento: i caccia vincono sempre, nessun credito. Si dissolve tra ${fmtDur(th.expires - S.t)}`;
    else if (th.state === 'hunting') status = `<b class="warn-text">Va incontro a ${th.prey}, ${Math.round(dist(th, findPlane(th.prey) || th))} km</b>`;
    else status = S.t - th.flightStart < CFG.attackAfterH * 60 ? `Può attaccare tra ${fmtDur(CFG.attackAfterH * 60 - (S.t - th.flightStart))}` : 'Può attaccare in qualsiasi momento';
    return `<div class="row ${sel ? 'selected' : ''}"><span class="tag" style="--tag:var(--threat)">${th.id}</span>
      <div class="info"><span class="state">${th.apoc ? 'Apocalisse · ' : ''}${Math.round(dist(th, S.base))} km dalla base</span><br>${th.training ? fmtCoord(th) : `${fmtCoord(th)}, rotta ${Math.round(th.bearing)}°`}<br>${status}${chasers.length ? `<br>Inseguita da ${chasers.join(', ')}` : ''}</div>
      <div class="actions">${selBtn}
        <button class="btn danger" data-action="intercept" data-a="${th.id}" ${readyF ? '' : 'disabled'}>Intercetta</button>
        ${chasersOf(th).length >= CFG.patrolSize ? `<button class="btn" data-action="patrol" data-a="${th.id}" title="Due caccia raggiungono il più vicino a velocità ×${CFG.patrolJoinSpeed}; al contatto successo certo">Forma pattuglia</button>` : ''}
      </div></div>`;
  }).join('') || '<p class="empty">Nessuna minaccia segnalata. Attiva i ricognitori per scoprirne.</p>';

  const secBase = `
  <section class="block">
    <h2>Base: ${S.base.name}</h2>
    ${rankBlock()}
    <div class="kpis">
      <div><b>${S.kills}</b><span>Minacce eliminate</span></div>
      <div><b>${S.medals}</b><span>Medaglie</span></div>
      <div><b>${(S.t / DAY).toFixed(1)}</b><span>Giorni di servizio</span></div>
      ${S.pilots.some(isAdmiral) ? `<div><b>${S.pilots.filter(isAdmiral).length}</b><span>Ammiragli di Volo</span></div>` : ''}
    </div>
    <p class="note">${S.profile ? `Comandante ${esc(S.profile.nome)} ${esc(S.profile.cognome)} (${esc(S.profile.stato)}). ` : ''}${S.base.zone}, ${S.base.state}, ${S.base.cont}.</p>
    ${helpBox('base', 'Come funzionano medaglie e reputazione', `<p class="note">Punti medaglia: ${S.medals} (al massimo 1 al giorno: ${CFG.medalChancePerPoint * 100}% di probabilità per ogni punto di reputazione che andrebbe oltre il 100%). La reputazione si recupera con i ricognitori e cala di ${CFG.repLossCooldown}% per ogni attacco portato a termine.</p>`)}
  </section>`;
  const readyBomb = readyOf('bomber').length;
  const launchRows = S.launch.map(lb => `<div class="row attacking"><span class="tag" style="--tag:var(--threat)">${lb.id}</span>
      <div class="info"><span class="state">Base di lancio${lb.kind === 'extra' ? ' extra' : ''}: ${lb.site.name}</span><br>${lb.site.state} · ${Math.round(dist(S.base, lb.site))} km dalla base<br>${calm() ? 'Lanci sospesi' : `Prossimo lancio tra ${fmtDur(lb.next - S.t)}`} (${lb.kind === 'extra' ? 'minaccia' : 'minaccia bombardiera'} ogni ${CFG.launch.everyH} ore). ${lb.kind === 'extra' ? 'Distrutta con un bombardiere: una minaccia eliminata.' : `Distrutta con un bombardiere: reputazione +${CFG.launch.rep}%.`}</div>
      <div class="actions"><button class="btn danger" data-action="raid" data-a="${lb.id}" ${readyBomb ? '' : 'disabled'}>Bombarda (${readyBomb ? fmtDur(dist(S.base, lb.site) / spd(readyOf('bomber')[0]) * 60) : 'nessun bombardiere'})</button></div></div>`).join('');
  const nextApoc = nextDayOfMonth(S.t, CFG.apoc.day);
  const secThreats = `
  <section class="block">
    <h2>Minacce <span class="count">${S.threats.length}</span></h2>
    <p class="note">${calm() ? `Calma: nessuna nuova minaccia per ${fmtDur(S.fx.calmUntil - S.t)}. ` : ''}Prossima minaccia dell'apocalisse: ${fmtDate(nextApoc)}.</p>
    ${threatRows}
    ${launchRows ? `<h3>Basi di lancio delle minacce</h3>${launchRows}` : ''}
    ${S.threats.length ? helpBox('threats', 'Regole di ingaggio', `<p class="note">In volo si colpiscono con i caccia (${Math.round(winCh() * 100)}% al contatto, +${CFG.killReward}). Mentre attaccano una base solo bombardiere (+${CFG.killReward}, −${CFG.rebuildCost} di ricostruzione) e aereo tattico (+${CFG.tacticalReward}) possono eliminarle.</p>`) : ''}
  </section>`;
  const readyPilots = S.pilots.filter(pl => !inAcademy(pl)), freePilots = freePilotsOf(() => true).length, admirals = readyPilots.filter(isAdmiral).length;
  const secBarracks = `
  <section class="block">
    <h2>Caserma <span class="count">${readyPilots.length} piloti</span>
      <button class="btn ghost" data-action="barracks">Apri la caserma</button></h2>
    <p class="note">${freePilots} piloti liberi, ${S.pilots.length - readyPilots.length} in accademia, ${S.pilotsLost || 0} caduti${S.pilotsSpace ? `, ${S.pilotsSpace} in missione spaziale` : ''}${admirals ? `. Ammiragli di Volo (punteggio extra): ${admirals}` : ''}. Ogni giorno arriva un cadetto; ogni ${CFG.freeMissionGroup} piloti liberi dello stesso grado, uno a caso riceve una missione premio al giorno. Assegna i piloti agli aerei per bonus negli scontri e in velocità (tasto <kbd>C</kbd>).</p>
  </section>`;
  const secFighters = `
  <section class="block">
    <h2>Caccia <span class="count">${fighters.length}/${maxOf('fighter')}</span>
      <button class="btn ghost" data-action="buy" data-a="fighter" ${fighters.length >= maxOf('fighter') ? 'disabled' : ''}>Compra</button></h2>
    ${S.slots.fighter < CFG.slotMax.fighter ? `<div class="buyrow"><button class="btn ghost" data-action="buySlot" data-a="fighter" ${S.credits < CFG.slotCost.fighter ? 'disabled' : ''}>Sblocca un posto caccia (${CFG.slotCost.fighter} crediti, fino a ${CFG.slotMax.fighter})</button></div>` : ''}
    ${fighters.map(p => planeCard(p, aut)).join('') || '<p class="empty">Nessun caccia. Ti serve almeno un caccia per intercettare le minacce.</p>'}
    ${helpBox('fighters', 'Costi, dotazioni e potenziamenti', `<p class="note">${TYPES.fighter.perHour} crediti per ora di volo, ${TYPES.fighter.base}-${TYPES.fighter.top} km/h. In scorta attaccano da soli le minacce entro ${CFG.escortRangeKm} km dall'aereo scortato. Un caccia abbattuto è perso e costa ${CFG.lossPenalty.fighter} crediti di penale. Dotazioni a terra, una per caccia, ${CFG.gear.shield.cost} crediti l'una e consumate all'uso: difesa jet (salva il caccia, che rientra a metà velocità), missile fotonico (a ${CFG.gear.missile.rangeKm} km, ${CFG.gear.missile.chance * 100}% di distruggere il bersaglio), motore sonico (velocità doppia per 24 h dal decollo). Ogni ${CFG.killsForUpgrade} abbattimenti un caccia ottiene un potenziamento istantaneo al rientro. Durante il potenziamento normale (24 h) non può decollare.</p>`)}
  </section>`;
  const secStrike = `
  <section class="block">
    <h2>Attacco al suolo <span class="count">${strikers.length}/${maxOf('bomber') + maxOf('tactical')}</span></h2>
    <div class="buyrow">
      <button class="btn ghost" data-action="buy" data-a="bomber" ${planesOf('bomber').length >= maxOf('bomber') ? 'disabled' : ''}>Compra bombardiere (${planesOf('bomber').length}/${maxOf('bomber')})</button>
      <button class="btn ghost" data-action="buy" data-a="tactical" ${planesOf('tactical').length >= maxOf('tactical') ? 'disabled' : ''}>Compra aereo tattico (${planesOf('tactical').length}/${maxOf('tactical')})</button>
      ${S.slots.bomber < CFG.slotMax.bomber ? `<button class="btn ghost" data-action="buySlot" data-a="bomber" ${S.credits < CFG.slotCost.bomber ? 'disabled' : ''}>Sblocca un posto bombardiere (${CFG.slotCost.bomber} crediti, fino a ${CFG.slotMax.bomber})</button>` : ''}
    </div>
    ${maxOf('tactical') < 2 ? `<p class="note">Con ${CFG.tacticalBonusAtBombers} bombardieri si sblocca il secondo aereo tattico.</p>` : ''}
    ${strikers.map(p => planeCard(p, aut)).join('') || '<p class="empty">Nessun aereo d\'attacco. Servono per colpire le minacce che stanno attaccando una base.</p>'}
    ${helpBox('strike', 'Costi e regole degli aerei d\'attacco', `<p class="note">Bombardiere ${TYPES.bomber.perHour} crediti/ora, aereo tattico ${TYPES.tactical.perHour} crediti/ora; entrambi ${TYPES.bomber.base}-${TYPES.bomber.top} km/h. Autonomia illimitata, ma dopo ogni missione devono rientrare alla base prima di ripartire. Le minacce entro ${CFG.huntRangeKm} km possono andargli incontro: senza scorta hanno solo il ${CFG.strikeDefense * 100}% di cavarsela. Se abbattuti: penale ${CFG.lossPenalty.bomber} (bombardiere) o ${CFG.lossPenalty.tactical} (tattico) e un giorno di ripristino. Ogni ${CFG.winsForUpgrade} missioni vinte ottengono un potenziamento istantaneo e gratuito al rientro; durante il potenziamento normale non possono decollare.</p>`)}
  </section>`;
  const secSupport = `
  <section class="block">
    <h2>Supporto</h2>
    ${supportBlock('recon', 'Ricognitori', CFG.reconLevels, CFG.reconPerDay,
      `${CFG.reconPerDay} crediti al giorno ciascuno. Reputazione recuperata ogni giorno: ${CFG.reconLevels.filter(l => l).map(l => `${l} → +${CFG.reconRep[l]}`).join(', ')}, triplicata sotto il 50% di reputazione e raddoppiata tra 50% e 90%${repMult(S.rep) > 1 ? ` (ora ×${repMult(S.rep)})` : ''}. Ognuno segnala minacce a caso, in media una ogni ${CFG.reconSignalDays} giorni.${S.support.signals ? ` Segnalazioni finora: ${S.support.signals}.` : ''}`)}
    ${supportBlock('tanker', 'Rifornitori', CFG.tankerLevels, CFG.tankerPerDay,
      `${CFG.tankerPerDay} crediti al giorno ciascuno, +${CFG.tankerBonusH} h di autonomia ai caccia per ognuno. Autonomia per i prossimi decolli: ${aut.toFixed(0)} h; ridurli non toglie autonomia ai caccia già in volo. Ogni modifica blocca i livelli per 24 ore.${Object.keys(CFG.tankerRepLoss).map(k => ` Con ${k} attivi la reputazione cala di ${CFG.tankerRepLoss[k]} al giorno.`).join('')}`)}
  </section>`;
  const baseTitle = k => k === 'main' ? 'Base operativa' : CFG.bases.find(d => d.kind === k).label;
  const artCard = a => {
    const st = artifactState(a), at = S.artAt[a.id];
    const activeLeft = { pilots: S.fx.pilotUntil, tech: S.fx.techUntil, recall: S.fx.recallUntil, monument: S.fx.monumentUntil, flight: S.fx.flight && S.fx.flight.until,
      tacCad: S.fx.cadetsUntil, sublunar: (S.fx.space.find(x => x.id === 'sublunar') || {}).at, mars: (S.fx.space.find(x => x.id === 'mars') || {}).at, venus: (S.fx.space.find(x => x.id === 'venus') || {}).at }[a.id] - S.t;
    const act = activeLeft > 0 ? `<span class="note ok-text">${a.space !== undefined ? `Missione in corso, il pilota arriva tra ${fmtDur(activeLeft)}` : `Attivo, ancora ${fmtDur(activeLeft)}`}${a.id === 'pilots' ? `, ${S.fx.pilotLeft} bonus da assegnare ai caccia` : ''}</span>` : '';
    return `<div class="art${activeLeft > 0 ? ' on' : ''}">
      <div class="art-head"><b>${a.name}</b><button class="btn ${st.why ? 'ghost' : ''}" data-action="artifact" data-a="${a.id}" ${st.why || S.pending ? 'disabled' : ''}>Attiva (${CFG.artifactCost} cr, ${CFG.artifactResearch}%)</button></div>
      <span class="note">${a.desc}</span>${act}
      ${st.why ? `<span class="note warn-text">${st.why}</span>` : ''}
    </div>`;
  };
  const nextDef = nextBaseDef();
  const ownedBlocks = S.extra.map(b => {
    const def = CFG.bases.find(d => d.kind === b.kind);
    let info = '';
    if (b.kind === 'research') info = `Ogni minaccia abbattuta in volo +${CFG.researchKill[0]}-${CFG.researchKill[1]}%, ogni bombardamento +${CFG.researchBomb}%, ogni missione tattica (non di addestramento) +${CFG.researchTactical}%. Ogni attivazione di artefatto consuma ${CFG.artifactResearch}% di ricerca; si può superare il 100%.`;
    if (b.kind === 'major') info = `Una medaglia al giorno a mezzanotte se la reputazione è al 100%; reputazione +${CFG.majorRepBonus}% ottenuta all'acquisto.`;
    return `<section class="block basebox">
      <h2>${def.label} <span class="count">${b.site.name}</span></h2>
      <p class="note">${b.site.zone}, ${b.site.state}, ${b.site.cont}. ${info}</p>
      ${ARTIFACTS.filter(a => a.base === b.kind).map(artCard).join('')}
    </section>`;
  }).join('');
  const buyBlock = S.pending ? (() => {
    const def = CFG.bases.find(d => d.kind === S.pending.kind);
    return `<section class="block"><h2>${def.label}: scegli la località</h2>
      <p class="note">Il tempo è fermo. Costo ${def.cost} crediti, addebitati alla scelta. Clicca una località sulla mappa o nell'elenco.</p>
      <ul class="sites">${S.pending.sites.map((x, i) => `
        <li class="${S.hoverSite === i ? 'hover' : ''}" data-hover="${i}">
          <div><div class="name">${x.name}</div><div class="meta">${x.zone}, ${x.state}, ${x.cont}</div></div>
          <button class="btn" data-action="pickSecondary" data-a="${i}">Costruisci qui</button>
        </li>`).join('')}</ul>
      <div class="buyrow"><button class="btn ghost" data-action="cancelBase">Annulla</button></div></section>`;
  })() : `<section class="block">
      <h2>Basi <span class="count">${1 + S.extra.length}/${1 + CFG.bases.length}</span></h2>
      <p class="note"><b>Base operativa:</b> ${S.base.name}. Aerei e hangar restano qui; le basi secondarie danno ricerca, artefatti e bonus. Si acquistano in ordine e per ognuna scegli tra 10 località casuali.</p>
      ${S.extra.length ? `<div class="rankbox"><b>Ricerca: ${Math.round(S.research)}%</b> · attivazioni disponibili: ${researchCharges()}
        <div class="bar"><i style="width:${Math.min(100, (S.research % CFG.artifactResearch) / CFG.artifactResearch * 100)}%"></i></div></div>` : ''}
      ${CFG.bases.map((d, i) => extraOf(d.kind) ? `<div class="baseline owned"><b>${d.label}</b> <span class="note">${d.short} · ${extraOf(d.kind).site.name}</span></div>`
        : d === nextDef ? `<div class="baseline"><b>${d.label}</b> <span class="note">${d.short}</span>
            <button class="btn" data-action="buyBase" data-a="${d.kind}" ${S.credits < d.cost ? 'disabled' : ''}>Acquista (${d.cost.toLocaleString('it-IT')} crediti)</button></div>`
        : `<div class="baseline locked"><b>${d.label}</b> <span class="note">${d.short} · ${d.cost.toLocaleString('it-IT')} crediti, dopo la ${CFG.bases[i - 1].label.toLowerCase()}</span></div>`).join('')}
    </section>`;
  const secBases = buyBlock + (S.pending ? '' : ownedBlocks);
  const alert = S.threats.some(t => t.state === 'hunting' || t.state === 'cooldown');
  const tabs = [
    ['minacce', 'Minacce', S.threats.length, alert],
    ['flotta', 'Flotta', fighters.length + strikers.length, false],
    ['logistica', 'Logistica', 0, false],
    ['basi', 'Basi', researchCharges() && S.extra.length ? researchCharges() : 0, false],
    ['missione', 'Missione', 0, false],
  ];
  if (S.pending) panelTab = 'basi';
  const body = { minacce: secThreats, flotta: secBarracks + secFighters + secStrike, logistica: loanBlock() + secSupport, basi: secBases, missione: secBase }[panelTab] || secThreats;
  panel.innerHTML = `<nav class="tabs" role="tablist" aria-label="Sezioni">${tabs.map(([k, label, n, hot]) =>
    `<button role="tab" data-action="tab" data-a="${k}" aria-selected="${k === panelTab}">${label}${n ? `<span class="badge ${hot ? 'hot' : ''}">${n}</span>` : ''}</button>`).join('')}</nav>${body}`;
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
  if (S && (!S.base || S.pending)) S.hoverSite = li ? +li.dataset.hover : null;
});
