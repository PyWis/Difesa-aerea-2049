# Pubblicare Difesa Aerea 2049 su PythonAnywhere

Guida passo-passo per mettere online il gioco su [PythonAnywhere](https://www.pythonanywhere.com) (anche con l'account gratuito "Beginner").

Il gioco è statico (HTML + JavaScript); l'unica parte dinamica è la classifica condivisa (`classifica.json`), aggiornata da `POST /api/classifica`. Su PythonAnywhere non si può lanciare `server.py` (non è un'app WSGI), quindi il repository include **`pythonanywhere_wsgi.py`**: un'applicazione WSGI che serve i file del gioco e gestisce la classifica con la stessa logica di `server.py`.

## 1. Crea l'account

1. Registrati su <https://www.pythonanywhere.com> (piano **Beginner**, gratuito).
2. Il tuo sito sarà raggiungibile su `https://TUOUSERNAME.pythonanywhere.com`.

## 2. Scarica il codice

Apri una **Bash console** (*Consoles → Bash*) e clona il repository:

```bash
cd ~
git clone https://github.com/PyWis/Difesa-aerea-2049.git
```

> Se il repository è privato, usa un token personale GitHub come password oppure carica i file dalla scheda **Files** (zip del repository e `unzip`).
> La cartella risultante è `/home/TUOUSERNAME/Difesa-aerea-2049`.

Assicurati che sia presente il ramo con `pythonanywhere_wsgi.py` (`git checkout` del ramo giusto, o dopo il merge in `main`).

Non servono pacchetti da installare: il codice usa solo la libreria standard di Python.

## 3. Crea la web app

1. Scheda **Web** → **Add a new web app**.
2. Conferma il dominio `TUOUSERNAME.pythonanywhere.com` → **Next**.
3. Scegli **Manual configuration** (non Flask/Django) → scegli **Python 3.10** o superiore → **Next**.

## 4. Configura il file WSGI

1. Nella scheda **Web**, sezione *Code*, clicca sul link **WSGI configuration file** (`/var/www/TUOUSERNAME_pythonanywhere_com_wsgi.py`).
2. **Cancella tutto** il contenuto e incolla (sostituendo `TUOUSERNAME`):

```python
import sys

path = '/home/TUOUSERNAME/Difesa-aerea-2049'
if path not in sys.path:
    sys.path.insert(0, path)

from pythonanywhere_wsgi import application  # noqa
```

3. **Save**.

Nella sezione *Code* imposta anche:

- **Source code:** `/home/TUOUSERNAME/Difesa-aerea-2049`
- **Working directory:** `/home/TUOUSERNAME/Difesa-aerea-2049`

## 5. Permessi di scrittura per la classifica

`classifica.json` deve poter essere scritto dal sito. Nella Bash console:

```bash
cd ~/Difesa-aerea-2049
ls -l classifica.json
chmod 664 classifica.json
chmod 775 .          # la classifica viene scritta con un file temporaneo nella cartella
```

## 6. Avvia il sito

1. Scheda **Web** → pulsante verde **Reload TUOUSERNAME.pythonanywhere.com**.
2. Apri `https://TUOUSERNAME.pythonanywhere.com`: dovresti vedere la schermata iniziale del gioco.
3. Opzionale: nella sezione *Security* attiva **Force HTTPS**.

## 7. Verifica

- La pagina si carica e la mappa mostra i continenti.
- Il pulsante ★ apre la classifica.
- Dopo una partita conclusa, `classifica.json` si aggiorna. Controllo da console:

```bash
cat ~/Difesa-aerea-2049/classifica.json
```

- In caso di problemi leggi **Error log** e **Server log** (link nella scheda *Web*).

## Aggiornare il gioco

```bash
cd ~/Difesa-aerea-2049
git pull
```

Poi **Reload** dalla scheda *Web*. Il `git pull` non tocca i tuoi dati se non modifichi `classifica.json` a mano; se Git segnala un conflitto su quel file (perché modificato dal sito), salvalo prima:

```bash
cp classifica.json ~/classifica.backup.json
git checkout -- classifica.json
git pull
cp ~/classifica.backup.json classifica.json
```

## Note sull'account gratuito

- Il sito resta attivo ma va **riattivato ogni 3 mesi** con il pulsante *Run until 3 months from today* nella scheda *Web*.
- Il traffico in uscita è limitato ai siti in lista bianca: il gioco non fa chiamate esterne, quindi non è un problema.
- I **salvataggi delle partite** sono nel browser del giocatore (`localStorage`), non sul server.
- Il dominio personalizzato richiede un account a pagamento.

## Variante: file statici serviti direttamente (più veloce)

Per ridurre il carico sull'applicazione WSGI, nella scheda **Web → Static files** aggiungi:

| URL | Directory |
|-----|-----------|
| `/js/` | `/home/TUOUSERNAME/Difesa-aerea-2049/js/` |
| `/style.css` | `/home/TUOUSERNAME/Difesa-aerea-2049/style.css` |
| `/land.js` | `/home/TUOUSERNAME/Difesa-aerea-2049/land.js` |
| `/nomi.json` | `/home/TUOUSERNAME/Difesa-aerea-2049/nomi.json` |
| `/mondo.csv` | `/home/TUOUSERNAME/Difesa-aerea-2049/mondo.csv` |

Lascia **fuori** `classifica.json` e `index.html`: restano serviti dall'applicazione, così la classifica è sempre aggiornata. Poi esegui **Reload**.

## Risoluzione dei problemi

| Sintomo | Causa probabile | Soluzione |
|---------|-----------------|-----------|
| `ModuleNotFoundError: pythonanywhere_wsgi` | Percorso errato nel file WSGI o ramo senza il file | Controlla `path` e che `ls ~/Difesa-aerea-2049/pythonanywhere_wsgi.py` esista |
| Pagina "Something went wrong" | Errore nel file WSGI | Leggi l'**Error log** nella scheda *Web* |
| Mappa vuota / "impossibile leggere mondo.csv" | File non trovato o cache | Ricarica con Ctrl+F5; verifica che `mondo.csv` sia nella cartella |
| La classifica non si salva | Permessi di scrittura | Ripeti il passo 5 |
| Modifiche non visibili | Manca il Reload | Premi **Reload** nella scheda *Web* |
