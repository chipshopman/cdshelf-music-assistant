"""Ingress-only CD Shelf server; Music Assistant credentials never leave this process."""
import asyncio
import json
import logging
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit

from aiohttp import ClientSession, ClientTimeout, DummyCookieJar, WSMsgType, web

ROOT = Path(__file__).parent / 'www'
MAX_MESSAGE = 8 * 1024 * 1024
RASTER_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'image/x-icon'}
ALLOWED = {
    'players/all': set(),
    'config/players': {'include_values'},
    'players/cmd/stop': {'player_id'},
    'music/albums/library_items': {'offset', 'limit', 'order_by', 'summary'},
    'music/albums/album_tracks': {'item_id', 'provider_instance_id_or_domain'},
    'player_queues/get_active_queue': {'player_id'},
    'player_queues/play_media': {'queue_id', 'media', 'option', 'shuffle'},
}


def server_address(value):
    """Accept only an administrator-configured direct server base address."""
    try:
        url = urlsplit(value.strip())
        if (url.scheme not in ('http', 'https') or not url.hostname or url.username
                or url.password or url.query or url.fragment or url.path not in ('', '/')):
            raise ValueError
        _ = url.port
        return urlunsplit((url.scheme, url.netloc, '', '', ''))
    except (ValueError, AttributeError):
        raise ValueError('Set music_assistant_url to the direct http:// or https:// server address.') from None


def create_app(options, *, allowed_peers=frozenset({'172.30.32.2'}), root=ROOT, request_timeout=75):
    # Peer address is the TCP peer, never a browser-supplied forwarding header.
    @web.middleware
    async def ingress_only(request, handler):
        if request.remote not in allowed_peers:
            raise web.HTTPForbidden(text='Open CD Shelf through Home Assistant.')
        return await handler(request)

    @web.middleware
    async def response_headers(request, handler):
        response = await handler(request)
        if not response.prepared:
            response.headers['X-Content-Type-Options'] = 'nosniff'
            response.headers['Referrer-Policy'] = 'same-origin'
            if not request.path.startswith('/api/imageproxy/'):
                response.headers['Cache-Control'] = 'no-store'
        return response

    app = web.Application(middlewares=[ingress_only, response_headers], client_max_size=65536)
    # Captured server-side only: no route serialises options or reads arbitrary files.
    try:
        base = server_address(options.get('music_assistant_url', ''))
        token = options.get('music_assistant_token', '').strip()
        if not token:
            raise ValueError('Set music_assistant_token in the CD Shelf app configuration.')
        config_error = None
    except (ValueError, AttributeError):
        base, token = '', ''
        config_error = 'Ask the administrator to set the Music Assistant address and token in the CD Shelf app configuration, then restart it.'

    session = None
    sockets = set()

    async def reject_redirects(request, handler):
        # ws_connect follows HTTP redirects before the application sends its token.
        # Stop at that boundary so the token cannot reach a different endpoint.
        response = await handler(request)
        if response.status in {301, 302, 303, 307, 308}:
            response.close()
            raise ValueError('Music Assistant redirected the connection. Configure its final direct address and restart CD Shelf.')
        return response

    async def lifecycle(_app):
        nonlocal session
        session = ClientSession(timeout=ClientTimeout(total=20, sock_connect=10), trust_env=False,
                                cookie_jar=DummyCookieJar(), middlewares=[reject_redirects])
        yield
        for socket in list(sockets):
            await socket.close(code=1001, message=b'App stopping')
        await session.close()

    app.cleanup_ctx.append(lifecycle)

    async def index(request):
        # Only the mode flag is inserted; no options, address or token are in HTML.
        html = (root / 'index.html').read_text().replace('<body>', '<body data-managed="true">', 1)
        return web.Response(text=html, content_type='text/html')

    async def static(request):
        name = request.match_info['name']
        if name not in {'connection.js', 'connection.css', 'shelf.js', 'shelf.css', 'ma-client.js', 'library.js', 'players.js', 'display.js'}:
            raise web.HTTPNotFound()
        return web.FileResponse(root / 'web' / name)

    async def bridge(request):
        browser = web.WebSocketResponse(heartbeat=30, max_msg_size=65536)
        await browser.prepare(request)
        sockets.add(browser)
        upstream = None
        tasks = []
        ready = False
        pending = {}
        browser_pending = set()
        sequence = 0
        try:
            if config_error:
                raise ValueError(config_error)
            endpoint = ('wss' if base.startswith('https:') else 'ws') + base[base.index(':'):] + '/ws'
            async with asyncio.timeout(10):
                upstream = await session.ws_connect(endpoint, heartbeat=30, max_msg_size=MAX_MESSAGE)
                greeting = await upstream.receive_json()
                if not isinstance(greeting, dict) or not greeting.get('server_version'):
                    raise ValueError('Music Assistant did not send a valid greeting.')
                await upstream.send_json({'message_id': 'cdshelf-auth', 'command': 'auth', 'args': {'token': token}})
                while True:
                    auth = await upstream.receive_json()
                    if auth.get('message_id') == 'cdshelf-auth':
                        break
                if 'error_code' in auth or not (auth.get('result') or {}).get('authenticated'):
                    raise ValueError('Music Assistant rejected the saved token. Ask the administrator to update it in the CD Shelf app configuration and restart the app.')
            # Do not forward the authentication result/user object or upstream events.
            await browser.send_json({'server_version': greeting['server_version']})
            ready = True

            async def from_browser():
                nonlocal sequence
                async for msg in browser:
                    if msg.type != WSMsgType.TEXT:
                        continue
                    try:
                        data = json.loads(msg.data)
                        message_id = data.get('message_id')
                        command = data.get('command')
                        args = data.get('args', {})
                        if (not isinstance(message_id, str) or not 0 < len(message_id) <= 100
                                or message_id == 'cdshelf-auth' or message_id in browser_pending
                                or command not in ALLOWED or not isinstance(args, dict)
                                or set(args) - ALLOWED[command] or len(pending) >= 64):
                            raise ValueError
                        # Playback supports only the explicit album/replace action in this UI.
                        if command == 'player_queues/play_media' and (
                            args.get('option') != 'replace' or args.get('shuffle') is not False
                            or not isinstance(args.get('media'), str)
                            or not re.fullmatch(r'library://album/[0-9]+', args['media'])
                        ):
                            raise ValueError
                        if command == 'config/players' and args.get('include_values') is not False:
                            raise ValueError
                        if command == 'music/albums/library_items' and (
                            type(args.get('offset')) is not int or args['offset'] < 0
                            or type(args.get('limit')) is not int or not 1 <= args['limit'] <= 200
                            or args.get('summary') is not False or args.get('order_by') != 'sort_name'
                        ):
                            raise ValueError
                        sequence += 1
                        upstream_id = f'cdshelf-{sequence}'
                        pending[upstream_id] = (message_id, command, asyncio.get_running_loop().time() + request_timeout)
                        browser_pending.add(message_id)
                        await upstream.send_json({'message_id': upstream_id, 'command': command, 'args': args})
                    except (ValueError, TypeError, AttributeError):
                        await browser.close(code=1008, message=b'Unsupported request')
                        return

            async def from_server():
                async for msg in upstream:
                    if msg.type != WSMsgType.TEXT:
                        continue
                    data = json.loads(msg.data)
                    message_id = str(data.get('message_id', ''))
                    if message_id not in pending:
                        continue
                    upstream_id = message_id
                    message_id, command, _ = pending[upstream_id]
                    if not data.get('partial'):
                        pending.pop(upstream_id, None)
                        browser_pending.discard(message_id)
                    if 'error_code' in data:
                        await browser.send_json({'message_id': message_id, 'error_code': 999})
                    else:
                        result = data.get('result')
                        if command == 'config/players':
                            # This read is for labels only; never expose configuration values.
                            fields = {'player_id', 'name', 'default_name'}
                            result = [{key: value for key, value in item.items() if key in fields}
                                      for item in result if isinstance(item, dict)] if isinstance(result, list) else []
                        await browser.send_json({'message_id': message_id, 'result': result, 'partial': bool(data.get('partial'))})

            async def expire_requests():
                while True:
                    await asyncio.sleep(min(1, request_timeout / 2))
                    now = asyncio.get_running_loop().time()
                    expired = [(uid, entry) for uid, entry in pending.items() if entry[2] <= now]
                    for upstream_id, (message_id, _, _) in expired:
                        pending.pop(upstream_id, None)
                        browser_pending.discard(message_id)
                        await browser.send_json({'message_id': message_id, 'error_code': 408})

            tasks = [asyncio.create_task(from_browser()), asyncio.create_task(from_server()), asyncio.create_task(expire_requests())]
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            # Never log upstream bodies, URLs, headers or exception text containing credentials.
            logging.getLogger(__name__).warning('Music Assistant connection failed (%s).', type(error).__name__)
            if not ready and not browser.closed:
                message = str(error) if isinstance(error, ValueError) else 'Cannot reach Music Assistant. Check its address and availability in the CD Shelf app configuration.'
                # ValueErrors from upstream JSON parsing are not user-facing text.
                safe_messages = ['Music Assistant redirected the connection. Configure its final direct address and restart CD Shelf.', config_error, 'Music Assistant did not send a valid greeting.', 'Music Assistant rejected the saved token. Ask the administrator to update it in the CD Shelf app configuration and restart the app.']
                if message not in safe_messages:
                    message = 'Cannot reach Music Assistant. Check its address and availability in the CD Shelf app configuration.'
                await browser.send_json({'server_version': 'unavailable', 'managed_error': message})
        finally:
            for task in tasks:
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            if upstream:
                await upstream.close()
            await browser.close()
            sockets.discard(browser)
        return browser

    async def artwork(request):
        if config_error:
            raise web.HTTPServiceUnavailable()
        image_id = request.match_info['image_id']
        size = request.query.get('size', '512')
        if not re.fullmatch(r'[a-fA-F0-9]{64}', image_id) or size not in {'0', '80', '160', '256', '512', '1024'}:
            raise web.HTTPBadRequest()
        try:
            async with session.get(f'{base}/imageproxy/{image_id}', params={'size': size},
                                   headers={'Authorization': f'Bearer {token}'}, allow_redirects=False) as response:
                if response.status != 200 or response.content_type not in RASTER_TYPES:
                    raise web.HTTPNotFound()
                # Bound memory even for chunked responses.
                image = bytearray()
                async for chunk in response.content.iter_chunked(65536):
                    image.extend(chunk)
                    if len(image) > 10 * 1024 * 1024:
                        raise web.HTTPBadGateway()
                return web.Response(body=bytes(image), headers={
                    'Content-Type': response.headers['Content-Type'],
                    'Cache-Control': 'private, max-age=3600',
                    'Content-Security-Policy': "default-src 'none'; sandbox",
                })
        except web.HTTPException:
            raise
        except Exception:
            raise web.HTTPBadGateway(text='Artwork unavailable.') from None

    app.router.add_get('/', index)
    app.router.add_get('/index.html', index)
    app.router.add_get('/web/{name}', static)
    app.router.add_get('/api/ws', bridge)
    app.router.add_get('/api/imageproxy/{image_id}', artwork)
    return app


def main():
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    try:
        options = json.loads(Path('/data/options.json').read_text())
    except (OSError, ValueError):
        options = {}
    # No host port is published. Only the Supervisor Ingress proxy is accepted.
    web.run_app(create_app(options), host='0.0.0.0', port=8099, access_log=None, print=None)


if __name__ == '__main__':
    main()
