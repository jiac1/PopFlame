"""Only contacts a temporary HTTP server on 127.0.0.1; never Supabase."""
import importlib.util
import json
from pathlib import Path
import sys
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('staging_server', Path(__file__).resolve().parents[1] / 'tools/serve-staging.py')
staging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(staging)


class StagingServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from functools import partial
        cls.config = staging.staging_config('https://qa-fixture.supabase.co', 'sb_publishable_synthetic')
        cls.server = staging.ThreadingHTTPServer(('127.0.0.1', 0), partial(staging.StagingHandler, config=cls.config))
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def test_production_and_secret_configuration_rejected(self):
        for url in ['https://ysxinhpymvhdnfbdanvn.supabase.co', 'https://YSXINHPYMVHDNFBDANVN.supabase.co',
                    'https://ysxinhpymvhdnfbdanvn.supabase.co.', 'https://other.invalid',
                    'https://qa-fixture.supabase.co/path', 'https://user:pass@qa-fixture.supabase.co',
                    'http://localhost:54321;connect-src *', 'https://qa-fixture.supabase.co\n']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                staging.staging_config(url, 'sb_publishable_synthetic')
        for key in ['sb_secret_test', '', 'invalid']:
            with self.assertRaises(ValueError):
                staging.staging_config('https://qa-fixture.supabase.co', key)

    def test_runtime_is_injected_without_changing_repository_file(self):
        original = (staging.ROOT / 'js/runtime-config.js').read_bytes()
        with urlopen(self.base + '/js/runtime-config.js?v=10', timeout=5) as response:
            body = response.read().decode()
        self.assertIn('qa-fixture.supabase.co', body)
        self.assertNotIn(staging.PRODUCTION_HOST, body)
        self.assertEqual((staging.ROOT / 'js/runtime-config.js').read_bytes(), original)

    def test_csp_only_allows_staging_backend_and_assets(self):
        with urlopen(self.base + '/admin/panel.html', timeout=5) as response:
            csp = response.headers['Content-Security-Policy']
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertIn("connect-src 'self' https://qa-fixture.supabase.co wss://qa-fixture.supabase.co", csp)
            self.assertNotIn(staging.PRODUCTION_HOST, csp)
            self.assertIn("img-src 'self' data: blob: https://qa-fixture.supabase.co", csp)

    def test_private_files_and_traversal_are_not_served(self):
        for path in ['/.git/config', '/db/schema.sql', '/tests/security-rls.sql', '/tools/serve-staging.py', '/%2e%2e/README.md', '/js/']:
            with self.subTest(path=path), self.assertRaises(HTTPError) as error:
                urlopen(self.base + path, timeout=5)
            self.assertEqual(error.exception.code, 404)

    def test_local_supabase_is_explicitly_supported(self):
        self.assertEqual(staging.staging_config('http://127.0.0.1:54321', 'sb_publishable_local')['environment'], 'staging')


if __name__ == '__main__':
    unittest.main()
