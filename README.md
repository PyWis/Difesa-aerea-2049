# Difesa Aerea 2049

**Un XCOM hardcore dedicato alla logistica.** Non comandi i soldati in battaglia: comandi quello che sta dietro. Pochi aerei, crediti contati, autonomia limitata, reputazione fragile e nessuna rete di sicurezza che non si paghi. Il 21 marzo 2049 il pianeta è sotto attacco: ogni decollo ha un costo, ogni perdita una penale, ogni errore di bilancio può chiudere la partita. Gioco di strategia in tempo reale (accelerabile): difendi il cielo, gestisci crediti e reputazione e sali di grado fino a **Generale Planetario**.

## Avvio

Il gioco è statico (HTML + JavaScript, nessuna dipendenza). `mondo.csv` viene letto con `fetch`, quindi serve un server locale. Con `server.py` (solo libreria standard di Python) la classifica viene scritta in `classifica.json`:

```bash
python3 server.py          # poi apri http://127.0.0.1:8000  (opzionale: python3 server.py 8080)
```

Anche `python3 -m http.server 8000` funziona, ma la classifica resta solo nel browser (si può scaricare come `classifica.json`). Se `mondo.csv` non può essere letto, il gioco ti permette di caricarlo a mano.

## Inizio partita, salvataggio e classifica

- **Comandante:** a ogni nuova partita scegli **nome**, **cognome** e **stato** (tra quelli di `mondo.csv`); il profilo viene ricordato per la partita successiva.
- **Salvataggio automatico:** a ogni mezzanotte di gioco (le 24) la partita viene salvata nel browser (`localStorage`). All'avvio, se c'è un salvataggio, scegli tra **Continua l'ultima partita** e **Nuova partita**. Il salvataggio viene **cancellato automaticamente quando la partita finisce** (bancarotta, reputazione a zero, vittoria). La partita ripresa parte in pausa.
- **Classifica (top 10, `classifica.json`):** a fine partita il risultato viene registrato. Ordine: più **medaglie**; a parità, vince chi è **durato più a lungo**; tra le partite **vinte**, vince chi ha vinto in **meno giorni**. Il pulsante ★ in alto la mostra in qualsiasi momento. `server.py` aggiorna il file; senza server il risultato resta nel browser e puoi scaricare il file dalla finestra della classifica.

## Caserma e piloti (tasto `C`)

Ogni mezzanotte arriva **1 cadetto** con nome, cognome, nazionalità e livello. La nazionalità è casuale in proporzione al peso dello stato in `mondo.csv` (numero di righe: Cina e India pesano molto più dell'Italia); nome e cognome sono estratti dalla tabella della nazionalità in `nomi.json` (86 tabelle, una per stato). Si parte con **10 Sergenti, 10 Marescialli di Volo e 2 Luogotenenti di Volo** da assegnare. La finestra Caserma mette il gioco in pausa finché è aperta.

| Livello | Promozione | Ruolo | Bonus |
|---------|-----------|-------|-------|
| Cadetto | 3 giorni in accademia | - | - |
| Cadetto scelto | 2 giorni in accademia | - | - |
| Sergente | 2 giorni e 3 missioni | 2° pilota su caccia | - |
| Sergente Scelto | 4 giorni e 7 missioni | 2° pilota su caccia | +3% negli scontri |
| Sergente Capo | 7 giorni e 10 missioni | 2° pilota su tutti i mezzi | +5% negli scontri |
| Maresciallo di Volo | 20 missioni | 2° pilota su tutti; 1° pilota di un caccia | +10% negli scontri; +200 km/h su bombardieri e tattici |
| Luogotenente di Volo | 50 missioni | 2° pilota su tutti; 1° pilota di caccia, bombardieri e tattici | come sopra |
| Capitano di Volo | - (solo con la Missione marziana ONU o per promozione dal Luogotenente) | come sopra | se comanda una pattuglia, +25% di velocità a tutti i suoi mezzi |
| Ammiraglio di Volo | solo con la Missione venusiana ONU | non partecipa ai voli | **punteggio extra** (registrato in classifica) |

Regole (valori in `CFG.pilots`):

- Giorni e missioni si contano **nel grado** e devono valere entrambi. Una **missione** è un'uscita conclusa con l'atterraggio alla base con il pilota a bordo.
- Ogni aereo ha un **1° pilota** (comandante) e un **2° pilota**; i piloti si assegnano a terra, dalla finestra Caserma, che offre anche l'assegnazione automatica dei posti vuoti. **Un aereo decolla solo con 1° e 2° pilota assegnati** (`CFG.pilots.crewRequired`): senza equipaggio completo non può intercettare, colpire, scortare né fare addestramento. I bombardieri e gli aerei tattici hanno bisogno di un Luogotenente di Volo (o superiore) come 1° pilota, quindi all'inizio se ne possono equipaggiare solo due.
- I bonus dei piloti a bordo **si sommano** (tetto del 95% di vittoria) e valgono anche per la difesa dei bombardieri contro le imboscate. La pattuglia certa resta al 100%.
- Un aereo **perso** (abbattuto o senza carburante) porta con sé l'equipaggio, che cade (`CFG.pilots.deathOnLoss`). La difesa jet salva anche i piloti.
- **Missione premio:** a mezzanotte, per ogni 5 piloti in servizio dello stesso grado **senza assegnazione**, uno a caso riceve 1 missione (`CFG.freeMissionGroup`), ogni giorno finché non viene promosso.
- **Capienza:** la caserma ospita **25 piloti** (cadetti compresi). A posti esauriti **l'arrivo dei cadetti si blocca**. Dalla finestra Caserma si compra un posto alla volta: **2500 crediti** fino a 30 posti, **5000** fino a 40, **10000** fino a 50 (massimo). In più, fino a **10 posti riservati agli Ammiragli di Volo**, **50000 crediti** l'uno (solo gli ammiragli li occupano; se sono finiti, un ammiraglio in più occupa un posto ordinario). I piloti in missione spaziale non occupano posto. Valori in `CFG.pilots.barracks`.
- I gradi dopo il Sergente Scelto non hanno bonus propri oltre a quelli elencati: Luogotenente e Capitano hanno gli stessi bonus del Maresciallo (+10%, +200 km/h).

## Obiettivo

Raggiungi **100 medaglie**. Le medaglie sono il tuo grado:

| Medaglie | Grado |
|---------:|-------|
| 0 | Maresciallo |
| 5 | Sottotenente |
| 10 | Tenente |
| 20 | Capitano |
| 40 | Maggiore |
| 65 | Colonnello |
| 95 | Generale |
| 100 | **Generale Planetario** (il gioco finisce con la vittoria) |

La probabilità standard di vittoria dei caccia contro una minaccia è del **70%** (`CFG.winChance`, minimo 25% salendo di grado). Ogni grado raggiunto rende le minacce un po' più pericolose (+3% di velocità, −2% di probabilità di vittoria in combattimento, +1% di probabilità oraria di attacco, per ogni grado). I valori sono in `CFG` (`diffSpeed`, `diffWin`, `diffAttack`).

Si perde per **bancarotta** o con la **reputazione a 0%**.

**Debito e bancarotta:** quando i crediti vanno sotto zero scattano prima i prestiti automatici (fornitori di emergenza e ONU, se disponibili). Se il saldo resta negativo compare un **avviso** (puoi dichiarare l'emergenza, continuare o accettare la bancarotta) e parte il conto alla rovescia: la **bancarotta** scatta se il debito supera **250 crediti** oppure se resti **in negativo per 6 ore di gioco** consecutive. Tornare sopra zero azzera il conto. Valori in `CFG.debt`.

**Dichiarazione di emergenza (scheda Logistica):** opzione manuale, mai automatica. Dà **2000 crediti al giorno per 5 giorni** (il primo subito, gli altri a mezzanotte) e costa **10% di reputazione ogni giorno** (50% in totale su 5 giorni). Si può chiedere con meno di 1000 crediti, una alla volta; quando i crediti finiscono il gioco si ferma e te la propone al posto della bancarotta. Valori in `CFG.declaration`.

**Operazioni speciali (scheda Logistica):**

| Operazione | Costo | Effetto |
|------------|------:|---------|
| Ricognitori ONU | 5000 | +50 ricognitori per 3 giorni, +10% reputazione, 1 medaglia (max 1 ogni 7 giorni) |
| Ricognitori Coalizione | 20000 | +100 ricognitori per 1 giorno, +10% reputazione, 1 medaglia (max 1 ogni 7 giorni) |
| Caccia-Ricognitori | gratis | +25 ricognitori per 1 giorno; i caccia sono usati come ricognitori: quelli alla base e quelli che atterrano durante l'operazione restano fermi 6 ore (max 1 al giorno) |
| Missione Recupero | 800 | ×2 la velocità di rientro dei 5 caccia in rientro più vicini alla base (di pattuglia, normali o danneggiati); senza nuove missioni finché non atterrano |
| Missione Recupero totale | 1500 | ×5 il rientro di tutti i caccia; 20% (per ciascuno) di richiamare anche quelli in missione; senza nuove missioni finché non atterrano |
| Missione tattica automatica | gratis | una volta ogni 7 giorni: rifornitori a 0 e bloccati 12 ore; ogni aereo tattico in volo (anche in rientro) riceve una nuova missione tattica (base sotto attacco o addestramento più vicini) |
| Mappa Tattica | gratis | una minaccia in volo a caso atterra alla base libera più vicina a velocità ×2: −10% reputazione subito, +20% dopo 1 giorno (una alla volta) |

I ricognitori aggiuntivi segnalano minacce come quelli normali (in media una ogni 3 giorni ciascuno), senza costo giornaliero. Valori in `CFG.ops`.

### Come si ottengono le medaglie

- **Reputazione extra:** ogni mezzanotte, i punti di reputazione che andrebbero oltre il 100% danno il 25% di probabilità di medaglia per punto (massimo una al giorno).
- **Missioni di addestramento:** in media una volta a settimana compare una missione in una base del mondo. Devi inviare un **aereo tattico** entro **10 giorni**, poi scade. Premio: 1 medaglia.

## Come si gioca

1. Scegli la base operativa tra le 10 località proposte.
2. Parti con **5 caccia** (fino a 12 con i posti aggiuntivi); compra altri caccia, bombardieri e aerei tattici. Attiva i **ricognitori**, che segnalano le minacce a caso (e recuperano reputazione ogni giorno).
3. **Pattuglia:** quando una minaccia è inseguita da almeno 3 caccia, dalla sua scheda puoi premere *Forma pattuglia*: i due caccia più lontani raggiungono il più vicino a velocità ×3. Se la pattuglia unita arriva al contatto, l'abbattimento è certo (100%); i tre caccia rientrano a velocità ×2 e non possono intercettare altro fino all'atterraggio. Se un membro viene richiamato o perso, la pattuglia si scioglie.
4. **Caccia:** intercettano le minacce in volo (autonomia limitata; i **rifornitori** la aumentano). Due modalità di rotta: *inseguimento diretto* oppure *punto d'incontro* (calcolato per anticipare la minaccia).
5. **Minacce a terra:** quando una minaccia attacca una base resta lì 3-7 giorni. Solo **bombardiere** (+1000, −500 di ricostruzione) e **aereo tattico** (+2000) possono eliminarla. Se riparte, perdi 50% di reputazione.
6. **Potenziamenti**, dotazioni dei caccia (difesa jet, missile fotonico, motore sonico), posti aggiuntivi, scorta ai bombardieri e prestiti ONU completano la gestione economica.

Tutti i parametri di bilanciamento sono in `CFG` in cima a `game.js`.

## Basi secondarie e artefatti (scheda *Basi*)

Si acquistano in ordine; per ognuna si rifà la scelta tra 10 località casuali (il tempo si ferma durante la scelta, il costo è addebitato alla conferma). Aerei e hangar restano nella base operativa.

| Base | Costo | Cosa dà |
|------|------:|---------|
| Ricerca (2ª) | 10.000 | Ricerca: +1-10% per minaccia abbattuta in volo, +12% per bombardamento, +20% per missione tattica (non di addestramento). Può superare il 100%. Artefatti *Ricerca* (+300%), Missione sublunare / marziana / venusiana ONU |
| Missilistica (3ª) | 25.000 | Missile ad antimateria, Missile quantico, Richiamo, Terremoto |
| Addestramento (4ª) | 50.000 | Aggiornamento piloti (5 bonus), Addestramento tecnico, volo, tattico; Missione tattica Sergenti, Ufficiali, Cadetti |
| Maggiore (5ª) | 100.000 | +10% reputazione all'acquisto, +1 medaglia al giorno con reputazione al 100%, artefatto Monumento Minaccia Ignota |

Ogni attivazione di artefatto costa **2500 crediti e il 100% di ricerca**; lo stesso artefatto non si riattiva prima di 3 giorni. Durate non specificate: 3 giorni (piloti, tecnico, volo, monumento), 1 giorno (richiamo). I bersagli dell'addestramento volo compaiono entro 600 km dalla base operativa e svaniscono dopo 24 ore. Tutti i valori sono in `CFG` (`bases`, `art`, ...).

### Artefatti dell'Accademia (base di addestramento)

| Artefatto | Effetto |
|-----------|---------|
| Aggiornamento piloti (ex Addestramento piloti) | per 3 giorni, 5 bonus di velocità da assegnare ai caccia |
| Missione tattica Sergenti | +3 missioni a ogni sergente, sergente scelto e sergente capo |
| Missione tattica Ufficiali | +1 missione a tutti i piloti in servizio (ufficiali e sergenti) |
| Missione tattica Cadetti | per 30 giorni i cadetti in uscita sono già cadetti scelti; per 3 giorni i cadetti che diventano sergenti hanno 3 missioni già effettuate |

### Missioni spaziali ONU (base ricerca)

I piloti partono **senza assegnazione**, sono tolti dal gioco; dopo 3 giorni ne arriva uno di grado superiore e la reputazione cala.

| Artefatto | Partono | Arriva (dopo 3 giorni) | Reputazione |
|-----------|---------|------------------------|-------------|
| Missione sublunare ONU | 10 sergenti (sergente, scelto, capo) senza assegnazione; prima +1 missione a tutti i sergenti senza assegnazione | 1 Maresciallo di Volo | −60% |
| Missione marziana ONU | 10 marescialli senza assegnazione | 1 Capitano di Volo | −80% |
| Missione venusiana ONU | 10 capitani senza assegnazione | 1 **Ammiraglio di Volo** (non vola, punteggio extra) | - |

## Minacce speciali

### Minaccia dell'apocalisse
- Compare **il 15 di ogni mese a mezzanotte** (la prima il 15 aprile), ad almeno **5000 km** da una base attiva scelta a caso (operativa o secondaria), e vola dritta su di essa a **500 km/h**. Non è segnalata dai ricognitori e non è colpita da missili, missile quantico, Mappa Tattica e Richiamo.
- **Probabilità di sconfitta dei caccia: 90% fissa** per i primi *(N−3)* caccia uccisi, dove N è il mese di gioco (aprile 1, maggio 2, giugno 3, luglio 4…): quindi 0 fino a giugno, 1 a luglio, 2 ad agosto… Poi vale la probabilità normale contro le minacce. Valori in `CFG.apoc` (`fixedLoss`, `fixedOffset`).
- Ogni **caccia ucciso** si trasforma in **3 minacce** (nel punto dello scontro). Un caccia salvato dalla difesa jet non è ucciso.
- **Sconfiggerla:** +5 medaglie e **1 giorno senza nuove minacce** (ricognitori, lanci e nuove basi di lancio sospesi).
- Se raggiunge la **base principale**: game over. Se raggiunge una **base secondaria**, le distrugge **tutte** (si possono riacquistare) e prosegue verso la base principale a **1500 km/h**.

### Basi di lancio delle minacce
- Il **1° di ogni mese** una base del mondo (tra 2000 e 6000 km dalla tua base operativa) diventa **Base di lancio**: ogni **5 ore** lancia una **minaccia bombardiera** contro una delle tue basi attive. Se la colpisce, **la distrugge** (la base principale: game over; una secondaria: va riacquistata) e poi viaggia come una minaccia normale. Si ferma con i caccia come qualsiasi minaccia. La nuova base di lancio sostituisce quella del mese precedente.
- Per distruggere la base di lancio serve un **bombardiere** (scheda *Minacce* o scheda del bombardiere): **reputazione +5%**.
- **Base di lancio extra:** dal grado **Tenente** in su, se non ci sono minacce in cielo, ne compare una (una alla volta) che lancia una minaccia normale ogni 5 ore. Distrutta con un bombardiere vale **una minaccia eliminata**.
- Valori in `CFG.launch`.

## Interfaccia (desktop)

Lo schermo non scorre: ogni area ha il suo scroll.

- **In alto a sinistra:** la mappa, che occupa tutto lo spazio disponibile.
- **In alto a destra:** minacce, caccia e attacco al suolo (bombardieri e aereo tattico).
- **In basso a sinistra:** economia (grado, base, prestiti).
- **In basso a destra:** supporto aereo (ricognitori e rifornitori).
- **In fondo:** il registro è una barra compatta con l'ultimo messaggio; si apre con un clic o con `L`.

Sotto i 900 px di larghezza tutto passa in un'unica colonna.

## La mappa

- Le rotte dei velivoli sono **geodetiche** (archi di cerchio massimo), come il movimento reale, e attraversano correttamente l'antimeridiano.
- Linee tratteggiate: rotta di caccia/bombardieri verso l'obiettivo. Con il *punto d'incontro* appare la croce di intercettazione e la rotta prevista della minaccia verso quel punto.
- Scie sbiadite mostrano il percorso già fatto; la minaccia selezionata mostra la sua rotta prevista.
- Puntini discreti: le altre basi del mondo (possibili bersagli). Il rombo verde è l'addestramento disponibile.
- Passa il mouse su basi, aerei e minacce per i dettagli; clic su una minaccia per selezionarla.

## Scorciatoie da tastiera

| Tasto | Azione |
|-------|--------|
| `Spazio` | pausa / riprendi |
| `1`-`7` | velocità: pausa, tempo reale, 1, 2, 5, 15 min/s, 1 ora/s |
| `L` | apre/chiude il registro |
| `C` | apre la caserma |
| `T` | seleziona la minaccia successiva |
| `Esc` | deseleziona |
| `I` | intercetta la minaccia selezionata con il caccia pronto più veloce |
| `B` / `A` | bombardiere / aereo tattico contro la minaccia selezionata che sta attaccando una base |
| `?` o `H` | aiuto e gradi |

## File

- `index.html`, `style.css`: interfaccia
- `js/`: il gioco, diviso in moduli (script classici caricati in ordine da `index.html`, con scope condiviso)
  - `config.js` parametri (`CFG`), gradi e tipi di aereo · `util.js` geografia, tempo, formattazione · `world.js` lettura di `mondo.csv`
  - `state.js` stato, economia, prestiti e debito · `actions.js` azioni del giocatore · `fleet.js` decollo, pattuglie, abbattimenti
  - `ops.js` operazioni speciali, artefatti, addestramenti · `special.js` minaccia dell'apocalisse, basi di lancio, missioni spaziali ONU · `pilots.js` piloti, gradi e bonus · `barracks.js` finestra Caserma · `sim.js` passo di simulazione, minacce e combattimento
  - `endgame.js` vittoria/sconfitta · `save.js` salvataggio locale · `leaderboard.js` classifica
  - `map.js` mappa su canvas · `panel.js` pannello e HUD · `ui.js` tastiera, modali, profilo e menu iniziale · `main.js` ciclo principale e avvio
- `land.js`: contorni dei continenti
- `mondo.csv`: città/basi del mondo · `nomi.json`: nomi e cognomi dei piloti per nazionalità
- `server.py`: server locale che aggiorna `classifica.json` · `classifica.json`: i migliori 10
