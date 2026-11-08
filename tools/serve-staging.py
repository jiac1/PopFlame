"""Serve local PopFlame with an isolated public staging configuration. No deployment."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

PRODUCTION_HOST = 'ysxinhpymvhdnfbdanvn.supabase.co'
ROOT = Path(__file__).resolve().parent.parent


def staging_config(url, key):
    if not isinstance(url, str) or re.search(r'\s', url):
        raise ValueError('URL staging inválida.')
    parsed = urlsplit(url or '')
    port = parsed.port  # Validate the port before composing headers or JavaScript.
    loopback = parsed.hostname in ('127.0.0.1', 'localhost', '::1')
    if (not parsed.hostname or parsed.hostname == PRODUCTION_HOST
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ('', '/')
            or not ((parsed.scheme == 'https' and re.fullmatch(r'[a-z0-9-]+\.supabase\.co', parsed.hostname))
                    or (loopback and parsed.scheme == 'http'))):
        raise ValueError('Se requiere la URL de un proyecto staging distinto de producción, o Supabase local.')
    if not key or not key.startswith('sb_publishable_'):
        # Legacy anon keys can be supplied after verifying their JWT role.
        import base64
        try:
            payload = key.split('.')[1]
            decoded = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
            if len(key.split('.')) != 3 or decoded.get('role') != 'anon':
                raise ValueError()
        except (AttributeError, IndexError, TypeError, ValueError):
            raise ValueError('Se requiere una clave pública staging; nunca service_role ni sb_secret_.') from None
    host = f'[{parsed.hostname}]' if ':' in parsed.hostname else parsed.hostname
    origin = f'{parsed.scheme}://{host}' + (f':{port}' if port is not None else '')
    return {'environment': 'staging', 'supabaseUrl': origin, 'publishableKey': key}


class StagingHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, config, **kwargs):
        self.config = config
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        origin = self.config['supabaseUrl']
        websocket = origin.replace('https://', 'wss://').replace('http://', 'ws://')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy',
                         "default-src 'self'; "
                         f"connect-src 'self' {origin} {websocket}; "
                         f"img-src 'self' data: blob: {origin}; media-src 'self' blob: {origin}; "
                         "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                         "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                         "font-src 'self' https://fonts.gstatic.com; frame-src 'none'; "
                         "form-action 'self'; base-uri 'self'")
        super().end_headers()

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        parts = Path(path.lstrip('/')).parts
        target = (ROOT / path.lstrip('/')).resolve()
        allowed_roots = {'admin', 'css', 'js', 'images', 'pages'}
        allowed_files = {'index.html', '404.html', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'site.webmanifest'}
        if (not target.is_relative_to(ROOT) or any(p.startswith('.') for p in parts)
                or (parts and parts[0] not in allowed_roots and path.lstrip('/') not in allowed_files)):
            self.send_error(404)
            return
        if path == '/js/runtime-config.js':
            body = ('window.POPFLAME_RUNTIME = Object.freeze(' + json.dumps(self.config) + ');').encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_HEAD(self):
        # Avoid a different access policy through HEAD.
        self.send_error(405)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def log_message(self, fmt, *args):
        # No query strings, request bodies, public keys or authorization headers.
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--supabase-url', default=os.environ.get('POPFLAME_STAGING_SUPABASE_URL'))
    parser.add_argument('--publishable-key', default=os.environ.get('POPFLAME_STAGING_PUBLISHABLE_KEY'))
    parser.add_argument('--port', type=int, default=8041)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        config = staging_config(args.supabase_url, args.publishable_key)
    except ValueError as error:
        parser.error(str(error))
    if args.check:
        print('Configuración staging válida; no se realizó ninguna conexión al backend.')
        return
    handler = partial(StagingHandler, config=config)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    print(f'Staging local: http://127.0.0.1:{server.server_port} (producción bloqueada por configuración y CSP).', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
