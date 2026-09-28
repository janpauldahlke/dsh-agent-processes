# dsh-agent-processes

- **Long horizon:** OFF for this build (human order 2026-09-28: no `status_*` tools; this file is hand-curated)
- **Phase:** M6 — long-horizon compose demo + README acceptance (M5 done & committed)
- **cwd:** `/home/hagbard/dev/dsh-agent-processes`
- **Updated:** 2026-09-28 (hand-curated; authoritative memory is `agent/NOTES.md`)

## Now

- **In flight:** M6 — both plugins confirmed installed on the web profile
  (long-horizon + agent-processes, `link:` deps). Compose demo
  (`agent/compose-m6.mjs`): scratch toy cwd with an 8-step plan →
  `status_init`/`setNext` (sibling `TaskStatusService` from its built lib,
  real vault) → `process_start` toy server → curl OK → toy **crashes** →
  crash detected via `process_list`/`process_logs` (not raw bash) →
  `status_block(reason)` → `process_start` again → curl OK →
  `status_unblock` → `markDone`. Evidence under `agent/evidence/m6/` (vault
  snapshots per phase + transcript). Then: README final pass (UI map +
  compose + limitations already drafted), PLAN §12 acceptance checklist,
  commit, morning summary.
- **Next 3:**
  1. `agent/compose-m6.mjs` — crash → block → recover → unblock, evidenced.
  2. Run it; capture vault snapshots (long-horizon vault + process vault) at
     each phase to `agent/evidence/m6/`; clean up toy cwd (D5) + vaults.
  3. README final pass + PLAN §12 checklist (UI items stay `pending-human`) →
     commit M6 → morning summary (what shipped, evidence paths, UI glance).

## Done (recent)

- ✓ M5: AGENTS.md snippet + dogfood smoke — full README (install, 6 tools with
  exact signatures, route, UI state table, copy-paste AGENTS.md snippet,
  storage layout, compose note, limitations, uninstall); dogfood
  `agent/dogfood-m5.mjs` plays an agent in a scratch toy cwd whose AGENTS.md is
  the README snippet itself: every lifecycle action through the real
  `process_*` tool `execute()`s (session-cwd exec context), plain HTTP client
  for the curl; start (ready 251ms) → /health 200 → list/logs/wait_ready →
  stop (SIGTERM 101ms, pid gone) → **re-start on same port** (no EADDRINUSE,
  new pid) → stop → vault restored to empty baseline, no ps leftovers, toy
  cwd deleted (D5) · verify: 17/17 asserts, evidence
  `agent/evidence/m5/{dogfood-transcript.json,dogfood-summary.md}`; `:3090`
  healthy on the shared vault · commit: this commit
  · doc fix caught by dogfood: `process_wait_ready` takes `{id,timeoutMs?,pollMs?}`
  (record-scoped, M2 frozen seam), not a raw port — README aligned to impl
- ✓ M4: dock chip + Processes rightbar tab + HTTP route — host: `argv` persisted
  on records for lossless restart; `restart(id)` (stop + re-run same argv, same
  id); `snapshotForRoute()` (list + ≤20-line log preview + host-side TCP ready
  probe per running ported record); `GET/POST /api/dsh-agent-processes` via
  nested `ctx.inject(['webServer'])` (GET snapshot; POST
  `stop`/`restart`/`remove`; 400/404/405 error paths). Client: refcounted 2s
  poll `store.ts`, `useProcesses.ts` (follows session cwd), `chipState.ts`
  (PLAN §8.1: hidden / `⚡ :P · id` / `⚡ N running · :P,…` / `⚠ N crashed · :P`
  / `⚡ starting…`), `ProcessesBody.tsx` (cards: dot, cmd+port+pid+age, expand
  log preview, Kill/Restart/Clear), dock chip + title + lightning icon,
  four-seat registration mirroring long-horizon
  · verify: 27/27 unit tests (2 new: restart, snapshotForRoute);
  `agent/smoke-m4.mjs` drives the built host face on a real node:http server
  (GET/POST/restart/stop/remove + all error paths, all 12 schemas pass the
  harness's real validator); client bundle (26KB) loads + `apply()` seats all
  four registrations; **live `:3090`** (rebooted on M4 build): GET → 200 JSON,
  `agent/accept-m4.mjs` restarts a live-seeded record (new pid, ready), stops,
  removes → count 0, unknown id → 404; `tsc --noEmit` clean
  · commit: this commit
- ✓ M3: port watch + reclaim — `process_start` with a port stops tracked
  holders first (`reclaimed[]`), refuses foreign untracked holders with a typed
  error (never kills), waits for TCP readiness (`readyTimeoutMs`, default 15s),
  returns `ready`/`waitedMs`/`logPreview` (≤20 lines); timeout is a valid
  success-shaped result with `error='port-timeout'`; S5 policy frozen in NOTES
  · verify: 25/25 unit tests (4 new M3 tests); `agent/smoke-m3.mjs` drives the
  built lib through the harness's real `assertSupportedJsonSchema` +
  `validateJsonSchemaValue` and the full reclaim sequence (ready 251ms,
  reclaimed=m3-first, foreign refused+untouched, timeout state valid);
  `:3090` reboots clean on the M3 build · commit `813445c`
- ✓ M2: vault + `process_start/stop/list/logs/wait_ready` — vault under
  `~/.dsh/storages/dsh-agent-processes/` (atomic tmp+rename writes,
  `CorruptVaultError` on bad JSON, ENOENT → empty), detached group spawn,
  SIGTERM→3s grace→SIGKILL stop, log capture + tail, port polling
  · verify: `agent/smoke-m2.mjs` 10/10 through the harness schema gates;
  `:3090` booted clean · commit `78731c9`
- ✓ M1: dual-face skeleton — ESM host + CJS client (ModuleLoader factory),
  web profile install (`link:` dep + bundles), `cordis.patch.yml` row,
  `process_ping` probe
  · verify: dump-config row present; `:3090` boots, client bundle 200,
  host probe PASS · commit `f7eac3a`

*Last write:* hand-curated by the build agent, 2026-09-28 (M4 committed).
Branch `main`; commits per phase, no push.
