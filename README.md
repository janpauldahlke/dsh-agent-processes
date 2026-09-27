# dsh-agent-processes

Installable [DeepSeek Harness](https://github.com/deepseek-ai) (`dsh`) plugin: **Host-owned** process & port lifecycle for local coding agents.

**Status:** M1 skeleton — dual-face bundle with `process_ping` liveness tool; full docs land at M6.  
**Pin:** `dsh` **0.1.7-rc.2** · package `dsh-agent-processes`  
**Sibling:** `dsh-local-long-horizon` (seatbelt while building; compose at M6)  
**Implementer:** local DSH agent via `dsh web` — human pastes `agent/HANDOFF.md`

## Intent (v0)

Agent tools `process_start` · `process_stop` · `process_logs` · `process_list` · `process_wait_ready`, vault under `~/.dsh/storages/dsh-agent-processes/`, composer dock chip + **Processes** rightbar — so long-lived `dev` servers stop becoming zombies and `EADDRINUSE` death spirals.

## Milestones

M0 docs → M1 skeleton (this) → M2 vault + lifecycle tools → M3 port watch + reclaim
→ M4 dock chip + Processes rightbar → M5 dogfood → M6 long-horizon compose demo.
Build docs: `agent/` (local-only).

## Install (once built)

```sh
npm install && npm run build
dsh plugin --profile web add /abs/path/to/dsh-agent-processes
```
