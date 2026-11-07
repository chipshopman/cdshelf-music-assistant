"""Real local HTTP/WebSocket tests; no Home Assistant or Music Assistant required."""
import asyncio
import importlib.util
import json
from pathlib import Path
import unittest

from aiohttp import WSMsgType, web
from aiohttp.test_utils import TestClient, TestServer

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cdshelf_server', ROOT / 'cdshelf/server.py')
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)
SECRET = 'test-only-secret-never-in-browser'


class BackendTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.calls = []
        self.images = []
        self.reject_auth = False
        self.disconnect_upstream = False
        self.clients = []
        self.upstream_sockets = set()

        async def ws_handler(request):
            ws = web.WebSocketResponse()
            await ws.prepare(request)
            self.upstream_sockets.add(ws)
            try:
                await ws.send_json({'server_version': '2.10.9', 'private': SECRET})
                async for msg in ws:
                    if msg.type != WSMsgType.TEXT:
                        continue
                    data = json.loads(msg.data)
                    self.calls.append(data)
                    mid, cmd = data['message_id'], data['command']
                    if cmd == 'auth':
                        if self.reject_auth:
                            await ws.send_json({'message_id': mid, 'error_code': 20, 'details': SECRET})
                        else:
                            await ws.send_json({'message_id': mid, 'result': {'authenticated': True, 'user': {'secret': SECRET}}})
                            await ws.send_json({'event': 'config_updated', 'data': SECRET})
                    elif self.disconnect_upstream:
                        await ws.close()
                    elif cmd == 'config/players':
                        await ws.send_json({'message_id': mid, 'result': [{'player_id': 'onkyo', 'name': 'New Onkyo name', 'default_name': 'Onkyo', 'values': {'password': SECRET}, 'secret': SECRET}]})
                    elif cmd == 'players/all':
                        await ws.send_json({'message_id': mid, 'result': [{'player_id': 'onkyo'}]})
                    elif cmd == 'music/albums/library_items':
                        await ws.send_json({'message_id': mid, 'result': [{'item_id': '1'}], 'partial': True})
                        await ws.send_json({'message_id': mid, 'result': [{'item_id': '2'}]})
                    elif cmd == 'music/albums/album_tracks':
                        await ws.send_json({'message_id': mid, 'error_code': 999, 'details': SECRET})
                    else:
                        await ws.send_json({'message_id': mid, 'result': {'ok': True}})
            finally:
                self.upstream_sockets.discard(ws)
            return ws

        async def image_handler(request):
            self.images.append((request.path, request.query_string, request.headers.get('Authorization')))
            return web.Response(body=b'fake-image', content_type='image/jpeg')

        upstream = web.Application()
        upstream.router.add_get('/ws', ws_handler)
        upstream.router.add_get('/imageproxy/{image_id}', image_handler)
        self.ma = TestServer(upstream)
        await self.ma.start_server()
        self.options = {'music_assistant_url': str(self.ma.make_url('/')), 'music_assistant_token': SECRET}
        self.client = await self.make_client()

    async def make_client(self, options=None, allowed_peers=frozenset({'127.0.0.1'})):
        app = backend.create_app(self.options if options is None else options, allowed_peers=allowed_peers)
        client = TestClient(TestServer(app))
        await client.start_server()
        self.clients.append(client)
        return client

    async def asyncTearDown(self):
        for client in self.clients:
            await client.close()
        for ws in list(self.upstream_sockets):
            await ws.close()
        await self.ma.close()

    async def connect(self, client=None):
        ws = await (client or self.client).ws_connect('/api/ws')
        greeting = await ws.receive_json(timeout=2)
        return ws, greeting

    async def test_auth_stays_server_side_and_filters_events_and_errors(self):
        ws, greeting = await self.connect()
        self.assertEqual(greeting, {'server_version': '2.10.9'})
        self.assertEqual(self.calls[0]['args']['token'], SECRET)
        await ws.send_json({'message_id': '1', 'command': 'players/all'})
        self.assertEqual((await ws.receive_json(timeout=2))['result'][0]['player_id'], 'onkyo')
        await ws.send_json({'message_id': '2', 'command': 'music/albums/album_tracks', 'args': {'item_id': '1', 'provider_instance_id_or_domain': 'library'}})
        self.assertEqual(await ws.receive_json(timeout=2), {'message_id': '2', 'error_code': 999})
        await ws.close()

    async def test_saved_names_are_sanitised_and_stop_is_forwarded(self):
        ws, _ = await self.connect()
        await ws.send_json({'message_id': '1', 'command': 'config/players', 'args': {'include_values': False}})
        response = await ws.receive_json(timeout=2)
        self.assertEqual(response['result'], [{'player_id': 'onkyo', 'name': 'New Onkyo name', 'default_name': 'Onkyo'}])
        self.assertNotIn(SECRET, json.dumps(response))
        await ws.send_json({'message_id': '2', 'command': 'players/cmd/stop', 'args': {'player_id': 'onkyo'}})
        self.assertEqual((await ws.receive_json(timeout=2))['result'], {'ok': True})
        self.assertEqual(self.calls[-1], {'message_id': '2', 'command': 'players/cmd/stop', 'args': {'player_id': 'onkyo'}})
        await ws.close()

    async def test_multiple_tablets_keep_request_ids_separate(self):
        a, _ = await self.connect()
        b, _ = await self.connect()
        for ws in (a, b):
            await ws.send_json({'message_id': '1', 'command': 'players/all', 'args': {}})
        for ws in (a, b):
            self.assertEqual((await ws.receive_json(timeout=2))['message_id'], '1')
            await ws.close()
        self.assertEqual(len([c for c in self.calls if c['command'] == 'auth']), 2)

    async def test_partial_results_and_explicit_playback(self):
        ws, _ = await self.connect()
        await ws.send_json({'message_id': '1', 'command': 'music/albums/library_items', 'args': {'offset': 0, 'limit': 200, 'summary': False, 'order_by': 'sort_name'}})
        self.assertTrue((await ws.receive_json(timeout=2))['partial'])
        self.assertFalse((await ws.receive_json(timeout=2))['partial'])
        self.assertFalse(any(c['command'].startswith('player_queues/') for c in self.calls))
        await ws.send_json({'message_id': '2', 'command': 'player_queues/play_media', 'args': {'queue_id': 'onkyo', 'media': 'library://album/1', 'option': 'replace', 'shuffle': False}})
        self.assertEqual((await ws.receive_json(timeout=2))['result'], {'ok': True})
        await ws.close()

    async def test_rejects_config_commands_auth_and_impersonation(self):
        cases = [
            {'command': 'config/get', 'args': {}},
            {'command': 'config/players', 'args': {'include_values': True}},
            {'command': 'auth', 'args': {'token': 'browser-token'}},
            {'command': 'players/all', 'args': {'impersonate_user': 'admin'}},
            {'command': 'player_queues/play_media', 'args': {'media': 'x', 'option': 'add', 'shuffle': False}},
        ]
        for case in cases:
            ws, _ = await self.connect()
            await ws.send_json({'message_id': '1', **case})
            self.assertEqual((await ws.receive(timeout=2)).type, WSMsgType.CLOSE)
            self.assertEqual(ws.close_code, 1008)
            await ws.close()
        self.assertTrue(all(c['command'] == 'auth' for c in self.calls))

    async def test_rejected_saved_token_and_missing_configuration_are_actionable(self):
        self.reject_auth = True
        ws, greeting = await self.connect()
        self.assertIn('saved token', greeting['managed_error'])
        self.assertNotIn(SECRET, json.dumps(greeting))
        await ws.close()
        client = await self.make_client({})
        ws, greeting = await self.connect(client)
        self.assertIn('administrator', greeting['managed_error'])
        await ws.close()

    async def test_direct_access_and_spoofed_headers_are_denied(self):
        client = await self.make_client(allowed_peers=frozenset({'172.30.32.2'}))
        for path in ('/', '/api/ws', '/web/connection.js', '/api/imageproxy/' + 'a' * 64):
            response = await client.get(path, headers={'X-Forwarded-For': '172.30.32.2', 'X-Remote-User-Id': 'admin'})
            self.assertEqual(response.status, 403)
        self.assertEqual(self.calls, [])

    async def test_only_frontend_assets_are_served_and_html_has_no_credentials(self):
        response = await self.client.get('/')
        html = await response.text()
        self.assertIn('data-managed="true"', html)
        self.assertNotIn(SECRET, html)
        self.assertNotIn(self.options['music_assistant_url'], html)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        for path in ('/data/options.json', '/server.py', '/config.yaml', '/web/../server.py', '/web/options.json'):
            self.assertEqual((await self.client.get(path)).status, 404)
        self.assertEqual((await self.client.get('/web/connection.js')).status, 200)

    async def test_artwork_uses_configured_server_and_bounds_paths_and_sizes(self):
        response = await self.client.get('/api/imageproxy/' + 'a' * 64 + '?size=160')
        self.assertEqual(response.status, 200)
        self.assertEqual(await response.read(), b'fake-image')
        self.assertEqual(self.images[0][2], 'Bearer ' + SECRET)
        self.assertNotIn(SECRET, str(response.headers))
        for path in ('/api/imageproxy/http://evil.test', '/api/imageproxy/not-a-hash', '/api/imageproxy/' + 'b' * 64 + '?size=999'):
            self.assertIn((await self.client.get(path)).status, (400, 404))
        self.assertEqual(len(self.images), 1)

    async def test_upstream_loss_closes_browser_and_can_reconnect(self):
        ws, _ = await self.connect()
        self.disconnect_upstream = True
        await ws.send_json({'message_id': '1', 'command': 'players/all'})
        self.assertEqual((await ws.receive(timeout=2)).type, WSMsgType.CLOSE)
        await ws.close()
        self.disconnect_upstream = False
        ws, greeting = await self.connect()
        self.assertEqual(greeting['server_version'], '2.10.9')
        await ws.close()

    def test_direct_address_validation(self):
        for value in ('http://user:pass@host', 'https://host?token=x', 'http://host/api/hassio_ingress/x', 'file:///data/options.json', 'http://host:invalid'):
            with self.assertRaises(ValueError):
                backend.server_address(value)
        self.assertEqual(backend.server_address('http://music:8095/'), 'http://music:8095')


if __name__ == '__main__':
    unittest.main()
