'use strict';
/* Mondo: lettura di mondo.csv e scelta delle località */
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
