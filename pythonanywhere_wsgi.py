"""Applicazione WSGI di Difesa Aerea 2049 per PythonAnywhere (o qualsiasi host WSGI).

Serve i file statici del gioco e accetta POST /api/classifica, riusando la logica di server.py.
Nel file WSGI di PythonAnywhere:  from pythonanywhere_wsgi import application
"""
import json
import mimetypes
import os

import server

ROOT = server.ROOT
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/csv', '.csv')
# solo i file pubblici del gioco (niente .git, server.py, ecc.)
PUBLIC_TOP = {'index.html', 'style.css', 'land.js', 'mondo.csv', 'nomi.json', 'classifica.json'}


def _respond(start, status, body, ctype, extra=()):
    start(status, [('Content-Type', ctype), ('Content-Length', str(len(body))), ('Cache-Control', 'no-store'), *extra])
    return [body]


def _json(start, code, obj):
    status = {200: '200 OK', 400: '400 Bad Request', 404: '404 Not Found', 405: '405 Method Not Allowed'}[code]
    return _respond(start, status, json.dumps(obj, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')


def application(environ, start_response):
    method = environ.get('REQUEST_METHOD', 'GET')
    path = environ.get('PATH_INFO', '/').lstrip('/') or 'index.html'

    if path == 'api/classifica':
        if method != 'POST':
            return _json(start_response, 405, {'errore': 'metodo non consentito'})
        try:
            n = int(environ.get('CONTENT_LENGTH') or 0)
            if not 0 < n <= server.MAX_BODY:
                raise ValueError
            entry = server.clean(json.loads(environ['wsgi.input'].read(n)))
        except ValueError:
            return _json(start_response, 400, {'errore': 'richiesta non valida'})
        if not entry:
            return _json(start_response, 400, {'errore': 'voce non valida'})
        with server.LOCK:
            merged = {e['id']: e for e in server.load()}
            merged[entry['id']] = entry
            board = sorted(merged.values(), key=server.order)[:server.SIZE]
            server.store(board)
        return _json(start_response, 200, {'classifica': board})

    if method not in ('GET', 'HEAD'):
        return _json(start_response, 405, {'errore': 'metodo non consentito'})
    parts = path.split('/')
    if '..' in parts or not (path in PUBLIC_TOP or (parts[0] == 'js' and len(parts) == 2 and path.endswith('.js'))):
        return _json(start_response, 404, {'errore': 'non trovato'})
    full = os.path.join(ROOT, *parts)
    try:
        with open(full, 'rb') as f:
            body = f.read()
    except OSError:
        if path == 'classifica.json':  # ancora nessuna partita registrata
            body = b'{"versione": 1, "classifica": []}'
        else:
            return _json(start_response, 404, {'errore': 'non trovato'})
    ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
    if ctype.startswith('text/') or ctype in ('application/json', 'text/javascript'):
        ctype += '; charset=utf-8'
    return _respond(start_response, '200 OK', b'' if method == 'HEAD' else body, ctype)
