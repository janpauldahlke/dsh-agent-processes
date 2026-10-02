# Contributing

Thanks for poking at this. It is a small dual-face DeepSeek Harness plugin
(host process vault + agent tools + web client pane). Keep changes focused.

## Setup

```sh
git clone https://github.com/janpauldahlke/dsh-agent-processes.git
cd dsh-agent-processes
npm install
npm test                 # node --test (vault + service)
npm run smoke            # lifecycle smoke (optional)
dsh plugin --profile web add "$PWD"
# restart dsh web; hard-refresh the browser
```

Paste the README `AGENTS.md` snippet into a toy project so the local agent
actually prefers `process_*` over backgrounded bash.

## Layout

| Path | Role |
| --- | --- |
| `src/host/` | Cordis plugin, vault, service, tools, `/api/dsh-agent-processes` |
| `src/client/` | Rightbar **Processes** pane + composer dock chip (inline styles only) |
| `src/shared/` | Snapshot / record types shared by both faces |
| `test/` | Node suite (`npm test`) — no GPU required |
| `scripts/` | Shippable lifecycle smoke (`npm run smoke`) |
| `build.mjs` | esbuild → `lib/index.js` + `lib/client.js` (+ service/vault bundles) |
| `cordis.patch.yml` | Loader row (`name` must match `package.json`) |
| `media/` | README screenshots |

Client runtime may only `require` frozen DSH platform modules (react, cordis,
store, ui slots/primitives/dockkit). Everything else is bundled.

## Rules of the road

1. **Tracked-only kill.** Never signal an untracked PID. Foreign port holders
   are refused with a typed error.
2. **Honesty over polish.** Corrupt vaults error loudly; port timeout is a
   success-shaped `error: 'port-timeout'`; reclaim is reported in `reclaimed[]`.
3. **Rebuild after edits:** `npm run build` (or `npm test`). Commit updated
   `lib/` when behavior changes so install-without-toolchain keeps working.
4. **No secrets** in screenshots, logs, or commits. Prefer short paths in docs;
   never paste API keys. Local `ENV.md` / `agent/` stay gitignored.
5. **Dock chip** lives on the chat metrics strip (active session); it hides
   while the Processes pane is open or nothing is running for the followed cwd.

## Verify locally

```sh
npm test
npm run smoke
dsh --profile web --dump-config | grep dsh-agent-processes
# with dsh web up + plugin loaded:
# curl -s http://127.0.0.1:3080/api/dsh-agent-processes
# open Processes rightbar with a tracked toy; close it and confirm the dock chip
```

## Pull requests

- One concern per PR (host / client / docs / tests).
- Say what you ran (`npm test`, smoke, pane glance).
- Match existing style: small files, typed records, inline client styles.
- Bump `package.json` `version` only when we intentionally cut a release.

## Out of scope (for now)

- Killing untracked / system PIDs
- Log rotation / retention policy
- DeepSeek Harness core PRs — this stays an out-of-tree plugin

Questions or smoke reports: open a GitHub issue.
