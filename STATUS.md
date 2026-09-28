# dsh-agent-processes

- **Long horizon:** OFF
- **Phase:** M2 — vault + lifecycle tools
- **cwd:** `/home/hagbard/dev/dsh-agent-processes`
- **Updated:** 0s ago

## Now

- **In flight:** M2 vault + lifecycle tools
- **Next 3:**
  1. M2 vault: ~/.dsh/storages/dsh-agent-processes/ records (id, pid, cwd, cmd, port, logPath, startedAt, state) + corruption-safe read/write
  2. M2 lifecycle: process_start/stop/list/logs/wait_ready (detached spawn, SIGTERM->grace->SIGKILL, log tail, port poll)
  3. M2 smoke: toy server on :3090 (start -> wait_ready -> logs -> stop), clean toy cwd, commit M2

## Done (recent)

- ✓ M1 skeleton: dual-face package builds (lib/ ESM host + CJS client), web profile installed (link: dep + bundles), dump-config row present, :3090 boots with client row (rev e2bc9978d2f0) + combo route serves bundle, host probe PASS (process_ping), fresh :3080 carries row; committed f7eac3a · verify: dump-config grep 'agent-processes' (line present); curl :3090 + :3080 boot HTML → client row + plugins/??dsh-agent-processes/client.js 200; node /tmp/probe-host.mjs → HOST PROBE PASS; git log shows f7eac3a · 7h ago
- ✓ Docs re-aligned with human kickoff Q&A: D1–D5 decisions in NOTES; commit-per-phase (D2), no self-restart of :3080 (D1), no-vision UI (D3), system-card stretch S7 (D4), toy cleanup (D5) applied across ENV/SPEC/PLAN/NOTES/STATUS · verify: All five doc files edited on disk in this session; STATUS.md rewritten with updated LAW/Next-3; NOTES S7 slot + decisions section present · 7h ago

*Last write branch:* `main`
