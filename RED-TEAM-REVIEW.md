# CD Shelf review — 7 November 2026

Code reviewed: version 0.1.2, commit `fcdb4d2a1d7afc88b97326fcd52cbfde7a2c0110`. Fixes are in **0.1.3**.

This was a code review with adversarial local tests of the browser client and Ingress backend. The reviewer also wrote the implementation; this is not an independent security assessment. No production credentials were used, and no requests were sent to Steve's Home Assistant, Music Assistant or receivers. Steve has reported installation, playback and the clean display working; the new release still needs its normal live check after updating.

## Findings and fixes

| Finding | Impact and preconditions | Evidence | Resolution in 0.1.3 |
| --- | --- | --- | --- |
| Saved token followed a WebSocket redirect | High impact if the configured Music Assistant endpoint redirects to an unintended or hostile server. It does not give an arbitrary internet user access to the Ingress backend. | A local HTTP redirect to a second fake WebSocket server caused that second server to receive the test authentication token. The new regression failed against 0.1.2. | Reject HTTP redirects in the upstream client middleware before following them or sending the token. Administrators must configure the final direct address. Disable upstream cookies, which are not needed for token authentication. |
| Superseded connection could close a successful replacement | Reliability fault during overlapping connection attempts: a late timeout could disconnect the replacement. The old handshake could also continue after the destination changed. | A delayed first connection and successful second connection reproduced the unexpected close. The regression failed against 0.1.2. | Cancel handshakes on disconnect, check socket identity before authenticating, and only tear down the socket owned by the failing attempt. |
| Managed playback accepted arbitrary media strings | A user with access to CD Shelf could craft a bridge message for an external URL instead of an album. This exceeds the intended library-album interface; it is not a demonstrated network compromise. | A crafted external URL was forwarded to the fake Music Assistant server under the shared account. The rejection regression failed against 0.1.2. | Restrict managed play_media to numeric `library://album/<id>` URIs, replace mode and non-shuffled playback. Bound library page requests to 200 items and validate their offset/order/summary arguments. |
| Cover proxy accepted SVG as well as raster images | Conditional active-content exposure if the upstream image endpoint returns SVG and someone opens it as a document under the Home Assistant origin. Normal SVG-as-img rendering has different restrictions. No browser script execution or production exploitation was demonstrated. | A fake image endpoint returning `image/svg+xml` was accepted with status 200 by 0.1.2. | Reject SVG and non-raster types. Accept JPEG, PNG, WebP, GIF, AVIF, BMP and icon images only; add a sandbox content policy to proxied artwork. Existing size and path restrictions remain. |
| Unanswered bridge requests had no expiry | Stalled requests could occupy the 64 pending slots indefinitely until a reconnect. Expiry also needs protection against late responses being mistaken for newer requests with reused IDs. | Inspection confirmed no pending-entry lifetime; new tests hold replies, expire the request, reuse a browser ID and inject a late reply. | Expire bridge requests after 75 seconds, release their slots and use independent upstream request IDs. Late responses are ignored; browser IDs remain unchanged externally. |
| Malformed greeting could throw from the message callback | Reliability fault if a server sends JSON null or an array instead of an object during the greeting. | Added controlled malformed-greeting tests. | Fail the handshake cleanly with a useful error and close it. |

## Verification

- **33 JavaScript tests passed**, including connection cancellation/races, malformed greetings, authentication, timeouts, player-name refresh, protocol labels, target selection, Put back, cache behaviour, Ingress paths, display controls and packaged-asset parity.
- **16 Python tests passed**, using real local HTTP and WebSocket connections. Coverage includes the redirect-token reproduction, direct-access/header-spoofing denial, configuration redaction, command restrictions, concurrent screens, partial responses, SVG rejection, bounded album queries, request expiry, late replies and upstream disconnection.
- A separate local end-to-end run used the real JavaScript transport and Python bridge behind an Ingress-style path. Automatic library loading, renamed-device refresh, cover retrieval, track listing, explicit selected-room playback and Put back passed. The DOM is simulated; this is not a real Android browser run.
- Original source attribution and the standalone PC version are preserved. Managed-mode playback is deliberately limited to library albums.

The first four regression cases failed before the corresponding fixes and passed afterwards. All simulated authentication used test-only tokens. These tests do not establish whether a production token has ever been exposed; production logs and network traffic were not inspected.

## Remaining boundaries and follow-up

- Every person who can open CD Shelf shares the centrally configured Music Assistant account's player visibility and control rights. There is no individual Home Assistant-to-Music Assistant account mapping.
- Put back stops the selected device's current playback, including its active group. It is not restricted to an album started by the current browser. This matches the explicit stop-control behaviour; it should remain visible in the UI explanation.
- New-tab Ingress URLs depend on the current Home Assistant session. They are not permanent public bookmarks. Full-screen entry remains browser-controlled and requires a user action.
- Reconnect is manual after an interrupted connection; player availability is refreshed with Refresh players. No unattended retry ever restarts playback.
- The standalone prototype's remembered token is in browser storage. The Home Assistant version keeps its token on the server; administrators/backups can still access its options. No encrypted secret vault is claimed.
- No Docker image build, container-level vulnerability scan, dependency vulnerability scan, long-duration load test or independent production penetration test was performed in this review. The dependency is pinned; the Python base tag is not pinned to an image digest. Automated tests should be run before subsequent releases; this repository does not yet run them in CI.

## References

- [Home Assistant Ingress trust boundary](https://contributors.home-assistant.io/apps/guides/ingress/)
- [aiohttp client reference and client middleware support](https://docs.aiohttp.org/en/stable/client_reference.html)
- [SVG image-context restrictions versus direct document viewing](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)
