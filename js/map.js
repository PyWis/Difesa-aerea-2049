'use strict';
/* Mappa: disegno su canvas e interazione */
// ---------- Mappa ----------
const canvas = document.getElementById('map'), ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
let W = 0, H = 0, colors = {};
// pattuglie in giallo, caccia danneggiati in rientro in grigio, caccia in rientro in verde
const planeColor = p => p.patrolId && p.state === 'flight' ? colors.patrol : p.damaged && p.state === 'rtb' ? colors.damaged : p.type === 'fighter' && p.state === 'rtb' ? colors.ok : colors[TYPES[p.type].color];
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['ocean', 'ocean-hi', 'land', 'coast', 'grid', 'ink', 'ink-soft', 'base', 'threat', 'fighter', 'bomber', 'tactical', 'panel', 'patrol', 'damaged', 'missile', 'ok']) colors[k] = cs.getPropertyValue('--' + k).trim();
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


// punti lungo il cerchio massimo (interpolazione sferica) tra due posizioni
function geoPts(a, b) {
  const d = dist(a, b) / R_EARTH, sd = Math.sin(d);
  if (d < 1e-5 || sd < 1e-6) return [a, b];
  const n = Math.max(2, Math.ceil(deg(d) / 2));
  const la1 = rad(a.lat), lo1 = rad(a.lon), la2 = rad(b.lat), lo2 = rad(b.lon), pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, k1 = Math.sin((1 - f) * d) / sd, k2 = Math.sin(f * d) / sd;
    const x = k1 * Math.cos(la1) * Math.cos(lo1) + k2 * Math.cos(la2) * Math.cos(lo2);
    const y = k1 * Math.cos(la1) * Math.sin(lo1) + k2 * Math.cos(la2) * Math.sin(lo2);
    const z = k1 * Math.sin(la1) + k2 * Math.sin(la2);
    pts.push({ lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) });
  }
  return pts;
}
// traccia una polilinea sulla mappa; al bordo dell'antimeridiano la linea esce da un lato e rientra dall'altro
function strokePts(pts, color, dash, alpha = 0.6, w = 1) {
  if (pts.length < 2) return;
  ctx.beginPath();
  let [x, y] = px(pts[0]); ctx.moveTo(x, y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    if (Math.abs(q.lon - p.lon) > 180) {
      const east = p.lon > 0, lq = q.lon + (east ? 360 : -360), t = ((east ? 180 : -180) - p.lon) / (lq - p.lon);
      const yy = (90 - (p.lat + t * (q.lat - p.lat))) / 180 * H;
      ctx.lineTo(east ? W : 0, yy); ctx.moveTo(east ? 0 : W, yy);
    }
    [x, y] = px(q); ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.setLineDash(dash); ctx.lineWidth = w; ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
}
const geoLine = (a, b, color, dash, alpha, w) => strokePts(geoPts(a, b), color, dash, alpha, w);
// proiezione della rotta di una minaccia lungo il cerchio massimo
const courseFrom = (o, brg, km, n = 16) => Array.from({ length: n + 1 }, (_, i) => i ? travel(o, brg, km * i / n).pos : { lat: o.lat, lon: o.lon });

// testo con alone, leggibile sopra terra, mare e rotte
function txt(s, x, y) {
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = colors.ocean; ctx.globalAlpha = 0.85;
  ctx.strokeText(s, x, y); ctx.restore(); ctx.fillText(s, x, y);
}
function draw(now) {
  const og = ctx.createLinearGradient(0, 0, 0, H);
  og.addColorStop(0, colors['ocean-hi'] || colors.ocean); og.addColorStop(1, colors.ocean);
  ctx.fillStyle = og; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let lon = -150; lon < 180; lon += 30) { const x = (lon + 180) / 360 * W; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let lat = -60; lat <= 60; lat += 30) { const y = (90 - lat) / 180 * H; ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // equatore e tropici più marcati, etichette dei paralleli
  ctx.save(); ctx.strokeStyle = colors.grid; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]); ctx.beginPath();
  ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.restore();
  ctx.fillStyle = colors['ink-soft']; ctx.globalAlpha = 0.55; ctx.font = '500 10px "Chakra Petch", system-ui, sans-serif';
  for (let lat = -60; lat <= 60; lat += 30) ctx.fillText(lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`, 4, (90 - lat) / 180 * H - 3);
  for (let lon = -150; lon < 180; lon += 30) ctx.fillText(lon === 0 ? '0°' : `${Math.abs(lon)}°${lon > 0 ? 'E' : 'O'}`, (lon + 180) / 360 * W + 3, H - 4);
  ctx.globalAlpha = 1;
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

  const drawSites = sites => sites.forEach((s, i) => {
    const [x, y] = px(s);
    const hot = S.hoverSite === i;
    ctx.beginPath(); ctx.arc(x, y, hot ? 9 : 6, 0, Math.PI * 2);
    ctx.fillStyle = colors.base; ctx.globalAlpha = hot ? 1 : 0.85; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x, y, 12 + pulse * 6, 0, Math.PI * 2);
    ctx.strokeStyle = colors.base; ctx.globalAlpha = 0.5 * (1 - pulse); ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = colors.ink; ctx.font = '600 12px Barlow, system-ui, sans-serif';
    txt(s.name, x + 10, y - 8);
  });
  if (!S.base) { drawSites(S.sites); return; }

  const [bx, by] = px(S.base);
  ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = colors.base; ctx.fillRect(-6, -6, 12, 12); ctx.restore();
  ctx.fillStyle = colors.ink; ctx.font = '600 12px Barlow, system-ui, sans-serif'; txt(S.base.name, bx + 11, by + 4);
  // basi secondarie: quadrato con la sigla del tipo
  for (const b of S.extra) {
    const [ex, ey] = px(b.site);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = colors.base; ctx.lineWidth = 2; ctx.strokeRect(-5, -5, 10, 10); ctx.restore();
    ctx.fillStyle = colors.ink; ctx.font = '600 11px Barlow, system-ui, sans-serif';
    txt(`${BASE_TAG[b.kind]} ${b.site.name}`, ex + 10, ey + 4);
  }
  if (S.fx.recallUntil > S.t) {
    const [rx, ry] = px(S.fx.recallBase), r = 14 + pulse * 10;
    ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI * 2); ctx.strokeStyle = colors.missile; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  const line = (a, b, color, dash, alpha = 0.6, w = 1) => geoLine(a, b, color, dash, alpha, w);

  // basi di lancio delle minacce: triangolo rosso (X = extra)
  for (const lb of S.launch) {
    const [x, y] = px(lb.site);
    ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, 6); ctx.lineTo(-7, 6); ctx.closePath();
    ctx.fillStyle = colors.threat; ctx.globalAlpha = 0.85; ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
    ctx.fillStyle = colors.threat; ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    txt(`Base di lancio${lb.kind === 'extra' ? ' extra' : ''} ${lb.site.name}`, x + 11, y - 4);
    ctx.fillStyle = colors['ink-soft']; txt(`lancio tra ${fmtDur(lb.next - S.t)}`, x + 11, y + 9);
  }

  // altre basi del mondo (bersagli possibili), discrete
  ctx.fillStyle = colors['ink-soft']; ctx.globalAlpha = 0.4;
  for (const b of BASES) { const [x, y] = px(b); ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;

  // scie dietro agli aerei e alle minacce
  for (const o of [...S.threats, ...S.planes]) {
    if (!o.trail || o.trail.length < 1 || (o.type && !isAir(o)) || o.state === 'cooldown') continue;
    const col = o.type ? planeColor(o) : colors.threat;
    strokePts([...o.trail, o], col, [], 0.28, 1.5);
  }

  // rotta prevista della minaccia selezionata (cerchio massimo lungo la rotta attuale)
  const selTh = S.selectedThreat && findThreat(S.selectedThreat);
  if (selTh && selTh.state !== 'cooldown') strokePts(courseFrom(selTh, selTh.bearing, 4000), colors.threat, [2, 5], 0.55, 1.2);

  // missione di addestramento
  for (const tr of S.trainings) {
    const [tx, ty] = px(tr.base), r = 7 + pulse * 3;
    ctx.save(); ctx.translate(tx, ty); ctx.strokeStyle = colors.tactical; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = colors.tactical; ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    txt(`Addestramento ${tr.base.name}`, tx + 12, ty - 6);
    ctx.fillStyle = colors['ink-soft']; txt(`scade tra ${fmtDur(tr.until - S.t)}`, tx + 12, ty + 8);
  }

  // rotte degli aerei: sempre archi di cerchio massimo, come le traiettorie reali
  for (const p of S.planes) {
    if (!isAir(p)) continue;
    const c = planeColor(p);
    if (p.state === 'rtb') { line(p, S.base, c, [4, 4], 0.45); continue; }
    if (p.state === 'escort') {
      const l = findPlane(p.escort);
      const th = p.engaged && findThreat(p.engaged);
      if (th) line(p, th, c, [4, 4]);
      else if (l && dist(p, l) > 30) line(p, l, c, [], 0.5);
      continue;
    }
    const pat = patrolOf(p);
    if (pat && pat.leader !== p.id) { const ld = findPlane(pat.leader); if (ld && !p.joined) line(p, ld, c, [2, 3], 0.9, 1.6); continue; }
    const trm = p.mission === 'train' && S.trainings.find(x => x.id === p.trainId);
    if (trm) { line(p, trm.base, c, [8, 4], 0.7); continue; }
    const th = findThreat(p.target);
    if (!th) continue;
    let tgt = th;
    if (p.type === 'fighter' && p.mode === 'lead' && p.aim && p.aim.pos) {
      tgt = p.aim.pos;
      line(th, tgt, colors.threat, [1, 4], 0.4); // dove la minaccia sarà all'incontro
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
      txt(`${th.id} attacca ${th.attack.name.replace(' (la tua base)', '')}`, x + 20, y - 4);
      ctx.fillStyle = colors['ink-soft'];
      txt(`riparte tra ${fmtDur(th.cooldownUntil - S.t)}`, x + 20, y + 10);
      continue;
    }
    if (th.state === 'hunting') { const prey = findPlane(th.prey); if (prey) line(th, prey, colors.threat, [2, 3], 0.9, 1.5); }
    if (th.goal) line(th, th.goal, colors.threat, [6, 4], th.apoc ? 0.7 : 0.45, th.apoc ? 1.8 : 1.2); // rotta diretta sul bersaglio
    ctx.beginPath(); ctx.arc(x, y, (th.apoc ? 16 : 10) + pulse * (th.apoc ? 12 : 8), 0, Math.PI * 2);
    ctx.strokeStyle = colors.threat; ctx.globalAlpha = 0.45 * (1 - pulse); ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
    if (th.training) { ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.strokeStyle = colors.threat; ctx.lineWidth = 1.5; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]); }
    else if (th.apoc) drawArrow(x, y, th.bearing, colors.threat, 13);
    else if (th.state === 'raid') drawBomber(x, y, th.bearing, colors.threat, false);
    else drawArrow(x, y, th.bearing, colors.threat, sel ? 9 : 7);
    if (sel) { ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.strokeStyle = colors.threat; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.fillStyle = colors.threat; txt(th.training ? `${th.id} addestramento` : th.apoc ? `APOCALISSE ${th.id}` : th.state === 'raid' ? `${th.id} bombardiera` : th.id, x + 10, y - 8);
  }

  // missili ad antimateria
  for (const m of S.missiles) {
    const th = m.target && findThreat(m.target);
    if (th) line(m, th, colors.missile, [2, 3], 0.8, 1.2);
    if (m.trail.length) strokePts([...m.trail, m], colors.missile, [], 0.4, 1.5);
    const [x, y] = px(m);
    drawArrow(x, y, m.heading || 0, colors.missile, 6);
    ctx.fillStyle = colors.missile; ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    txt(`${m.id} ${fmtDur(m.until - S.t)}`, x + 9, y + 12);
  }

  // scelta della località di una nuova base
  if (S.pending) drawSites(S.pending.sites);

  // aerei
  for (const p of S.planes) {
    if (!isAir(p)) continue;
    const [x, y] = px(p);
    const c = planeColor(p);
    if (p.type === 'fighter') drawArrow(x, y, p.heading || 0, c, 7);
    else drawBomber(x, y, p.heading || 0, c, p.type === 'tactical');
    // scorta agganciata: scostata di qualche pixel
    ctx.fillStyle = c; ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    const off = p.state === 'escort' && !p.engaged ? 12 : 0;
    txt(p.id, x + 10, y + 12 + off);
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
const BASE_TAG = { research: 'R', missile: 'M', training: 'A', major: '★' };
const THREAT_STATE = th => th.training ? 'Bersaglio d\'addestramento (fermo)' : ({
  apoc: `MINACCIA DELL'APOCALISSE verso ${th.goal && th.goal.name}`, raid: `Minaccia bombardiera verso ${th.goal && th.goal.name}`,
  flight: 'In volo', inbound: 'In volo', hunting: `Va incontro a ${th.prey}`,
  cooldown: `Attacca ${th.attack && th.attack.name}`,
}[th.state]);
canvas.addEventListener('mousemove', e => {
  const { x, y, near } = hit(e);
  let html = '';
  const sites = !S.base ? S.sites : S.pending ? S.pending.sites : null;
  if (sites) {
    const i = sites.findIndex(s => near(s));
    if (S.hoverSite !== (i < 0 ? null : i)) { S.hoverSite = i < 0 ? null : i; panelDirty = true; }
    if (i >= 0) { const s = sites[i]; html = `<b>${s.name}</b><br>${s.zone}, ${s.state}<br>${s.cont}`; }
  } else {
    const th = S.threats.find(t => near(t));
    const p = S.planes.find(f => isAir(f) && near(f));
    if (th) html = `<b>${th.id}</b> ${THREAT_STATE(th)}<br>${fmtCoord(th)}, ${Math.round(dist(th, S.base))} km dalla base<br>Clic per selezionare`;
    else if (p) html = `<b>${p.id}</b> ${TYPES[p.type].label}, ${p.speed} km/h<br>${planeStateText(p)}`;
    else if (S.trainings.find(tr => near(tr.base))) { const tr = S.trainings.find(x => near(x.base)); html = `<b>Addestramento: ${tr.base.name}</b><br>Invia un aereo tattico, premio ${CFG.trainingMedals} medaglia<br>Scade tra ${fmtDur(tr.until - S.t)}`; }
    else if (S.launch.find(lb => near(lb.site))) { const lb = S.launch.find(x => near(x.site)); html = `<b>Base di lancio delle minacce${lb.kind === 'extra' ? ' extra' : ''}: ${lb.site.name}</b><br>${lb.site.state}<br>Prossimo lancio tra ${fmtDur(lb.next - S.t)}<br>Va distrutta con un bombardiere`; }
    else if (near(S.base)) html = `<b>Base: ${S.base.name}</b><br>${S.base.state}, ${S.base.cont}`;
    else if (S.extra.find(b => near(b.site))) { const b = S.extra.find(x => near(x.site)); html = `<b>${CFG.bases.find(d => d.kind === b.kind).label}: ${b.site.name}</b><br>${b.site.state}, ${b.site.cont}`; }
  }
  if (html) {
    tooltip.innerHTML = html; tooltip.style.display = 'block';
    const left = Math.min(x + 28, canvas.clientWidth - 200);
    tooltip.style.left = left + 'px'; tooltip.style.top = (y + 28) + 'px';
  } else tooltip.style.display = 'none';
});
canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; if (!S.base || S.pending) { S.hoverSite = null; panelDirty = true; } });
canvas.addEventListener('click', e => {
  const { near } = hit(e);
  if (!S.base) { const i = S.sites.findIndex(s => near(s, 14)); if (i >= 0) A.pickBase(i); return; }
  if (S.pending) { const i = S.pending.sites.findIndex(s => near(s, 14)); if (i >= 0) { A.pickSecondary(i); panelDirty = true; renderPanel(); } return; }
  const th = S.threats.find(t => near(t, 16));
  if (th) A.selectThreat(th.id);
});
