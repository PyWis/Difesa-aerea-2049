#!/usr/bin/env python3
"""Server locale di Difesa Aerea 2049: serve i file statici e aggiorna classifica.json.

Uso: python3 server.py [porta] [indirizzo]   (default 8000, 127.0.0.1)
"""
import functools
import json
import os
import sys
import tempfile
import threading
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
BOARD = os.path.join(ROOT, 'classifica.json')
SIZE = 10
MAX_BODY = 4096
LOCK = threading.Lock()


def _num(v, lo, hi):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return lo
    return lo if v != v else min(hi, max(lo, v))


def clean(e):
    """Normalizza una voce come fa cleanEntry in js/leaderboard.js."""
    if not isinstance(e, dict):
        return None
    s = lambda k, n: str(e.get(k) or '')[:n]
    out = {
        'id': s('id', 40), 'nome': s('nome', 24), 'cognome': s('cognome', 24), 'stato': s('stato', 40),
        'medaglie': int(round(_num(e.get('medaglie'), 0, 100))), 'giorni': round(_num(e.get('giorni'), 0, 1e5), 2),
        'vittoria': e.get('vittoria') is True, 'esito': s('esito', 40), 'grado': s('grado', 30),
        'ammiragli': int(round(_num(e.get('ammiragli'), 0, 1e4))),
        'minacce': int(round(_num(e.get('minacce'), 0, 1e6))), 'crediti': int(round(_num(e.get('crediti'), -1e9, 1e9))),
        'data': s('data', 40),
    }
    return out if out['id'] else None


def order(e):
    # più medaglie; a parità chi è durato di più; tra le vittorie chi ha vinto in meno giorni
    return (-e['medaglie'], e['giorni'] if e['vittoria'] else -e['giorni'])


def load():
    try:
        with open(BOARD, encoding='utf-8') as f:
            return [c for c in map(clean, json.load(f).get('classifica', [])) if c]
    except (OSError, ValueError, AttributeError):
        return []


def store(entries):
    data = {'versione': 1, 'aggiornato': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'classifica': entries}
    fd, tmp = tempfile.mkstemp(dir=ROOT, prefix='.classifica-', suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, BOARD)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split('?')[0] != '/api/classifica':
            return self._json(404, {'errore': 'non trovato'})
        try:
            n = int(self.headers.get('Content-Length', 0))
            if not 0 < n <= MAX_BODY:
                raise ValueError
            entry = clean(json.loads(self.rfile.read(n)))
        except ValueError:
            return self._json(400, {'errore': 'richiesta non valida'})
        if not entry:
            return self._json(400, {'errore': 'voce non valida'})
        with LOCK:
            merged = {e['id']: e for e in load()}
            merged[entry['id']] = entry
            board = sorted(merged.values(), key=order)[:SIZE]
            store(board)
        self._json(200, {'classifica': board})


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
    httpd = ThreadingHTTPServer((host, port), functools.partial(Handler, directory=ROOT))
    print(f'Difesa Aerea 2049 su http://{host}:{port}  (classifica: {BOARD})')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
