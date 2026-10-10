'use strict';
/* Utilità: geografia sferica, tempo e formattazione */
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

// escape HTML per i testi inseriti dal giocatore o letti da file
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
