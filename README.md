# Difesa Aerea 2049

Gioco di strategia in tempo reale (accelerabile) ambientato il 21 marzo 2049. Difendi il pianeta dalle minacce aeree, gestisci crediti e reputazione e sali di grado fino a **Generale Planetario**.

## Avvio

Il gioco è statico (HTML + JavaScript, nessuna dipendenza). `mondo.csv` viene letto con `fetch`, quindi serve un piccolo server locale:

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Se il file non può essere letto, il gioco ti permette di caricare `mondo.csv` a mano.

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

Ogni grado raggiunto rende le minacce un po' più pericolose (+3% di velocità, −2% di probabilità di vittoria in combattimento, +1% di probabilità oraria di attacco, per ogni grado). I valori sono in `CFG` (`diffSpeed`, `diffWin`, `diffAttack`).

Si perde per **bancarotta** o con la **reputazione a 0%**.

**Salvataggio dalla bancarotta:** quando i crediti diventano negativi e non restano prestiti disponibili, il gioco si ferma e ti propone di salvarti sacrificando reputazione: **100 crediti per ogni 1%** (opzione minima, oppure con 5% in più di margine). Puoi anche accettare la bancarotta. Se la reputazione non basta a coprire il debito, la partita finisce. Il tasso è in `CFG.rescueCreditsPerRep`.

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
| `T` | seleziona la minaccia successiva |
| `Esc` | deseleziona |
| `I` | intercetta la minaccia selezionata con il caccia pronto più veloce |
| `B` / `A` | bombardiere / aereo tattico contro la minaccia selezionata che sta attaccando una base |
| `?` o `H` | aiuto e gradi |

## File

- `index.html`, `style.css`: interfaccia
- `game.js`: simulazione, mappa e pannello
- `land.js`: contorni dei continenti
- `mondo.csv`: città/basi del mondo
