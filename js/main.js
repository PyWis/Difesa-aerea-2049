'use strict';
/* Ciclo principale e avvio */
// ---------- Ciclo principale ----------
let last = performance.now(), lastPanel = 0;
function frame(now) {
  const realDt = Math.min(2, (now - last) / 1000); last = now;
  if (S && S.base && !S.over && S.speed > 0) {
    let gameMin = realDt * S.speed / 60;
    while (gameMin > 0 && !S.over && S.speed > 0) {
      const d = Math.min(1, gameMin); step(d); gameMin -= d;
      if (S.autosave) { S.autosave = false; autosave(); }
      if (S.speed === CFG.turboSpeed) {
        S.turboLeft -= d;
        if (S.turboLeft <= 0) {
          S.speed = S.prevSpeed;
          addLog('Velocità 1 ora/s disattivata dopo 5 ore di gioco.');
          break;
        }
      }
    }
    if (now - lastPanel > 250) { panelDirty = true; lastPanel = now; }
  }
  if (S) { draw(now); renderPanel(); }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => { resize(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);

(async () => {
  resize();
  try { worldRows = await loadWorld(); }
  catch (err) {
    openModal(`<h2>Dati mancanti</h2><p>Non riesco a leggere mondo.csv. Avvia il gioco da un server locale (ad esempio <code>python -m http.server</code>) oppure carica il file qui.</p>
      <input type="file" accept=".csv" id="csvPick">`);
    await new Promise(res => document.getElementById('csvPick').addEventListener('change', async e => {
      worldRows = parseCSV(await e.target.files[0].text()); res();
    }));
  }
  await loadNames();
  BASES = worldRows.map(r => ({ name: r.Citta_riferimento, state: r.Stato, lat: parseFloat(r.Lat_citta), lon: parseFloat(r.Lon_citta) }));
  newGame();
  const save = readSave();
  if (save) showStartMenu(save); else openProfileForm();
  requestAnimationFrame(frame);
})();
