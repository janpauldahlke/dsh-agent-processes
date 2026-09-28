# dsh-agent-processes

Installable [DeepSeek Harness](https://github.com/deepseek-ai) (`dsh`) plugin: **host-owned** process & port lifecycle for local coding agents.

**Status:** M5 — lifecycle tools + port watch/reclaim + dock chip + Processes rightbar + `GET/POST` route; dogfood `process_start → curl → process_stop` green (evidence in `agent/evidence/m5/`). M6 (long-horizon compose) next.
**Pin:** `dsh` **0.1.7-rc.2** · package `dsh-agent-processes`
**Sibling:** `dsh-local-long-horizon` (compose partner — see [Composing](#composing-with-dsh-local-long-horizon))
**Implementer:** local DSH agent via `dsh web`; human is the UI oracle

## Why

Long-lived local processes — dev servers, watchers, long `node` servers — started through
raw `bash` become zombies: the agent forgets the PID, the port stays held, the next start
hits `EADDRINUSE`, and the agent rewrites code around a bug that was really a port.
This plugin gives the agent first-class, **host-owned** hands:

- start/stop/list/logs/wait with a persistent vault (survives harness restarts),
- readiness-gated starts that **reclaim tracked holders** of a port and **refuse foreign
  ones** (no untracked PID is ever killed),
- a composer **dock chip** + **Processes** rightbar tab so the human sees and can
  kill/restart/clear anything the agent started.

## Install

```sh
npm install && npm run build
dsh plugin --profile web add /abs/path/to/dsh-agent-processes
```

The plugin is **profile-installed** (`link:` dependency + name in
`dsh.profile.bundles` of the web profile) and ships a single `lib/` bundle pair
(host ESM + client CJS). No runtime `@deepseek-ai/*` dependencies. Rebuild `lib/`
after edits; client changes hot-load into an already-running web shell, host changes
need the web shell restarted.

## Tools (6)

| Tool | Purpose | Key args | Returns |
| --- | --- | --- | --- |
| `process_start` | Spawn a detached process, track it, optionally wait for its port | `cmd`, `args`, `name?`, `cwd?`, `port?`, `env?`, `readyTimeoutMs?` | `id`, `pid`, `ready`, `waitedMs`, `reclaimed[]`, `logPreview`, `record` |
| `process_stop` | Stop a tracked process (group SIGTERM → 3s grace → SIGKILL) | `id` | `signal`, `state`, `waitedMs` |
| `process_list` | All tracked records, liveness re-checked | — | `processes[]`, `count` |
| `process_logs` | Tail a record's log | `id`, `lines?` | `lines[]`, `logPath` |
| `process_wait_ready` | Poll a tracked record's port (127.0.0.1) until it accepts connections | `id`, `timeoutMs?`, `pollMs?` | `ok`, `ready`, `port`, `waitedMs` (timeout is success-shaped with `error: 'timeout'`) |
| `process_ping` | Plugin liveness probe | — | `ok`, `package`, `version` |

**`process_start` with `port` (M3 semantics):**
1. **Reclaim** — every tracked record with `port === P`, `state === 'running'`, live PID
   is stopped first; reclaimed ids are reported in `reclaimed[]`.
2. **Foreign check** — if the port still accepts connections (an untracked process holds
   it), the start is **refused** with a typed error. The foreign process is never killed.
3. **Readiness** — the port is "open" when a TCP connect to `127.0.0.1:P` succeeds
   (Node `net`; no `ss`/`lsof`). Default timeout 15s (`readyTimeoutMs`); a timeout is a
   valid success-shaped result with `error: 'port-timeout'` and the process left running.

Records store the **lossless `argv`**, which powers `restart` (UI and route): the same
command is re-run under the **same id**, so the UI card keeps its identity.

## HTTP route (host → pane / curl)

```
GET  /api/dsh-agent-processes
→ { ok, package, version, storageRoot, count,
    processes: [{ id, pid, cmd, argv, cwd, port?, logPath, startedAt,
                  state, alive, ready?, logPreview[≤20] }] }

POST /api/dsh-agent-processes  { "action": "stop" | "restart" | "remove", "id": "…" }
→ the matching tool result (stop → StopResult, restart → StartResult, remove → { ok, id, existed })

errors: 400 bad JSON / missing id / unknown action · 404 unknown id · 405 other methods
```

The `ready` field is a **host-side TCP probe** taken at snapshot time for every *running*
record that has a `port` (absent for portless records or non-alive records) — the same
probe the client uses for its green/amber dot.

## UI (web profile)

- **Dock chip** (composer dock, below the input): hidden while the pane is open or while
  nothing runs for the followed workspace. Otherwise, per the state table:

  | State | Chip |
  | --- | --- |
  | Nothing running | *(hidden)* |
  | 1 healthy | `⚡ :3000 · next-dev` |
  | N running | `⚡ 3 running · :3000, :5432` |
  | Crashed | `⚠ 1 crashed · :3000` |
  | Starting (port not yet accepting) | `⚡ starting…` |

  Click opens the Processes tab.
- **Processes rightbar tab**: auto-follows the open chat workspace's cwd. Per-record
  card: status dot (green running / amber starting / red crashed / grey stopped),
  id + `:port` + state + pid + age, command, cwd basename, expandable ≤20-line log
  preview, and **Kill** / **Restart** / **Clear** buttons. Records from other workspaces
  appear in a muted "Other workspaces" section.
- The pane polls the route every 2s (refcounted — stops when the last viewer unmounts).

## AGENTS.md snippet (copy into your project's AGENTS.md)

```markdown
## Long-lived processes — use dsh-agent-processes

For anything that stays up (dev servers, watchers, long `node` servers):

- Start it with the `process_start` tool (include `port` if it listens). It reclaims
  tracked holders of that port, refuses foreign ones, and waits for TCP readiness —
  do **not** start long-lived processes with raw `bash` or backgrounded `&`.
- Before assuming a port is free, check `process_list`; after starting, use
  `process_wait_ready` instead of `sleep`.
- Stop with `process_stop` (SIGTERM → 3s grace → SIGKILL). Read `process_logs` when
  something looks wrong.
- On a crash or port failure: read `process_logs`, then (if dsh-local-long-horizon is
  loaded) call `status_block` with the reason, fix it, `process_start` again, verify
  with `process_wait_ready`, then `status_unblock`.
- Never kill untracked PIDs; if a foreign process holds the port, free it manually or
  start on another port.
```

## Storage

```
~/.dsh/storages/dsh-agent-processes/
  processes.json        # vault: all records (atomic tmp+rename writes; corrupt → typed error)
  logs/<id>.log         # stdout+stderr per record (append-only, tail via process_logs)
```

The vault is **global** (shared by every session of the web profile) and scoped by `cwd`
in the UI; records survive harness restarts — liveness is re-probed by PID on every list.

## Composing with `dsh-local-long-horizon`

The v0 compose path is **agent-mediated**: the AGENTS.md snippet tells the agent that on
a tracked-process crash or port failure it should `status_block` (sibling plugin) with
the reason, recover via the `process_*` tools, and `status_unblock` when green. Both
plugins read the same web shell, so the Long-horizon pane's blocked badge and the
Processes pane's crashed card agree. Demo evidence: `agent/evidence/m6/`.

## Limitations (v0)

- **Tracked-only kill scope** — the plugin never signals a PID it does not track;
  foreign port holders are refused, not killed.
- **Crash detection is by liveness probe** (1s sampler + on-request recheck), not by
  signal watching — a crashed process shows as red on the next poll and in `process_list`.
- **No log rotation**; log files are append-only and grow with the process.
- **No per-session isolation** — the vault is per web profile; UI scoping is by cwd.
- **UI is pending human visual verification** (build agent has no vision path);
  seat registration and state derivation are test-verified.
- Stretch (not in v0): read-only top-N system process card (`process_list_system`).

## Uninstall

```sh
dsh plugin --profile web remove dsh-agent-processes
```

Tools, route, chip, and tab disappear on the next shell (re)load; the vault and logs
remain on disk (delete `~/.dsh/storages/dsh-agent-processes/` to wipe).
