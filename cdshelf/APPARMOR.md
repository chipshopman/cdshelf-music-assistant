# CD Shelf AppArmor profile

Version **0.1.4** adds `cdshelf/apparmor.txt`, with `apparmor: true` explicitly set in the app configuration. The previous package relied on Docker's default profile; it did not disable AppArmor.

Home Assistant Supervisor reads the profile from the app's repository folder and loads it on the host. It does **not** need copying into the Docker image or enabling from inside the Python process. The file contains one top-level `profile cdshelf` line; Supervisor renames that profile to the installed app ID. Self-signal and self-inspection rules use AppArmor's `@{profile_name}` variable so they continue to refer to that exact renamed profile.

The shipped profile is enforcing: it has no `complain`, `unconfined` or default-allow flag. Protection mode stays on. No privileged capabilities, Docker socket, host network, host PID namespace, host configuration directory or NAS filesystem mount is requested.

## What the policy permits

| Access | Reason and limit |
| --- | --- |
| Execute Docker's init and `/usr/local/bin/python`, `python3`, `python3.13` | The official Python 3.13 Alpine image uses Docker init, not S6 or Bashio. Execution inherits the same profile; no unconfined execution transition or general shell/program execution is granted. Both known Docker-init mount paths are covered. |
| Read `/app/**` and `/data/options.json` | Serve the bundled frontend, run the Python source and read the centrally configured Music Assistant address/token. The rest of `/data` is not readable through a wildcard, and neither tree gets write permission. |
| Read/map `/lib/**`, `/usr/lib/**`, `/usr/local/lib/**` | musl/OpenSSL, the Python standard library, installed packages and their native extension modules, on both advertised architectures. The Dockerfile sets `PYTHONDONTWRITEBYTECODE=1` so imports do not need to write caches at runtime. |
| Read named DNS/system lookup files, TLS certificates, timezone/locale/MIME data and basic process/CPU information | Name resolution, certificate verification, file serving, logging and Python's runtime/thread pools. Process inspection is read-only and restricted to the same AppArmor profile. No process-memory file rule or ptrace trace permission is granted. |
| IPv4/IPv6 TCP and UDP, plus local Unix stream sockets | Ingress HTTP/WebSockets, the configured Music Assistant HTTP(S)/WebSocket connection, DNS and asyncio's wake-up socketpair. No raw/packet sockets or additional Linux capabilities are granted. These protocol rules do not restrict remote IPs/ports; the backend's Ingress peer check still controls incoming application access. |
| Receive signals and send signals within this profile | Permit Docker to stop the app and its init process to manage Python without granting signal-send access to unrelated profiles. |
| Write `/dev/null` and `/dev/zero` | Standard runtime devices only. No general writable file, `/tmp`, `/run`, `/data/**` or Home Assistant folder rule is present. Logs go to inherited standard output/error streams. |

This is an explicit policy rather than an inclusion of `abstractions/base`, because that abstraction can grant extra private-home execution/write permissions and changes between hosts. `tunables/global` supplies path-variable definitions; it does not grant file access.

The profile complements the existing Ingress authentication boundary, command validation, image restrictions and container isolation. It cannot hide the configured token from a compromised Python process that legitimately needs to read it, and it is not a per-destination network firewall.

## Checks completed here

- Compiled with the real AppArmor **4.0.1** parser, without loading policy into the kernel.
- Compiled the original `cdshelf` name and simulated Supervisor names `local_cdshelf` and `01234567_cdshelf`.
- Checked the single top-level profile/slug contract and enforcing flags.
- Checked that code/options stay read-only, execution is limited to init/Python, and no general file, capability or network grant is introduced.
- Ran the existing application tests in addition to the policy/package checks.

**Kernel enforcement has not been exercised in this development environment.** There is no exposed AppArmor security filesystem or Docker daemon here. Compilation checks syntax and policy construction, not the set of files/process operations a live container will actually use. In particular, container-init behaviour, DNS/TLS and shutdown must be checked on Home Assistant OS before presenting 0.1.4 as publicly validated. The app remains marked experimental.

## Validate on Home Assistant before public release

1. Update to **0.1.4** and start CD Shelf with Protection mode enabled. Confirm the app starts and Supervisor reports no AppArmor profile-load failure. At an authorised host console, `docker ps --format '{{.Names}}'` identifies the CD Shelf container. Check `docker inspect --format '{{.AppArmorProfile}}' <container-name>`: it should report the installed CD Shelf profile ID, not `docker-default`, blank or `unconfined`. Confirm that ID appears with `(enforce)` in `/sys/kernel/security/apparmor/profiles`. These are host checks; no extra privileges are added to CD Shelf to perform them.
2. Use the collection, search/shelf navigation, opened covers, track listing, player refresh, playback, Put back, clean-tab and full-screen controls. Include hostname resolution and HTTPS if your Music Assistant configuration uses them.
3. Stop and start the app, then restart it, to cover init/signal handling and importing the Python packages from a fresh process.
4. Review the **host's** AppArmor audit/kernel log for entries containing `apparmor="DENIED"` and CD Shelf's installed profile ID (the repository prefix followed by `_cdshelf`). The ordinary app log is not a substitute for the host audit log; Supervisor logs are also useful for profile-load errors. At an authorised host console, example commands are:

   ```sh
   journalctl _TRANSPORT=audit --since "10 minutes ago" -g 'apparmor="DENIED"'
   journalctl -k --since "10 minutes ago" -g 'apparmor="DENIED"'
   ```

5. If a required operation is denied, record its `operation`, `name`, `requested_mask` and `profile` fields and add only the access justified by that operation. Never add a broad `file,`/`capability,` rule or disable AppArmor/Protection mode to make the app work.

The Home Assistant guide recommends first exercising a new profile in **complain mode** to collect what it would block, then removing that flag after correcting the policy. If a developer needs that discovery step, use a local test copy/build with `complain` temporarily added to its flags. Do not publish that test copy or mistake it for an enforcing profile; the repository's policy checks deliberately reject complain mode. Repeat the feature/log check in enforcing mode before release.

If you cannot inspect the host audit log, a successful UI test alone does not establish that the profile has no denied operations. Record that limitation when describing the release.

## Recheck after runtime changes

When changing Python's minor version, the container base, dependencies, entrypoint, filesystem use or subprocess/network behaviour, revisit this profile and repeat the enforcing-mode test. Python 3.14, for example, would require updating the interpreter path rather than granting arbitrary `/usr/local/bin/**` execution.

To repeat compile checks on a Linux development machine with `apparmor_parser` installed:

```sh
apparmor_parser -Q -T -K cdshelf/apparmor.txt
python -m unittest discover -s tests -p test_apparmor.py -v
```

`-Q` skips kernel loading; `-T -K` avoid cache reads/writes. The test runner skips its compile test if no parser is installed, so check the test output. For a parser extracted outside the normal system path, `CDSHELF_APPARMOR_PARSER` and `CDSHELF_APPARMOR_INCLUDE_DIR` can point to that parser and its include directory.

References: [Home Assistant security guidance](https://contributors.home-assistant.io/apps/guides/security/), [AppArmor configuration option](https://contributors.home-assistant.io/apps/reference/configuration/), [Supervisor profile-name rewriting](https://github.com/home-assistant/supervisor/blob/main/supervisor/utils/apparmor.py), [AppArmor policy syntax](https://manpages.ubuntu.com/manpages/noble/man5/apparmor.d.5.html).
