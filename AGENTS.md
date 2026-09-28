# dsh-agent-processes — overnight build

You are implementing this installable dsh plugin. Pin and stack: `ENV.md`
(overnite/slot-health style — stack is already up; you do not start llama / `:3080`).
Resume: `agent/STATUS.md` first, then SPEC/PLAN as pointed there.

## Overnight directive (2026-09-28)

**The user is asleep. Implement the FULL plan, all phases, without stopping
after each phase.** Goal: surprise them in the morning with the **complete,
tested plan** — M3 (port watch + reclaim) → M4 (dock chip + Processes rightbar
+ GET route) → M5 (AGENTS.md snippet + dogfood smoke) → M6 (long-horizon
compose + README) — each verified and committed. Do not pause to ask; only stop
if truly blocked (then record the blocker in `agent/NOTES.md` and stop).
Per the human's direct order (2026-09-28): do **not** call `status_*` tools and
do **not** write `STATUS.md`, `agent/STATUS.md`, or anything under `.dsh/` —
`agent/NOTES.md` is the on-disk memory. Keep the
`:3090` acceptance instance authoritative. When done, leave a crisp morning
summary (what shipped, evidence paths, what awaits the human UI glance).

## Long horizon (required)

`dsh-local-long-horizon` is installed. Treat it as the seatbelt:

- Before coding, read `.dsh/task-status-inject.md` if present — binding current task state.
- Use `status_*` tools for Next (≤3), in-flight, done (with verify), blocked, phase.
- Do **not** invent a parallel TODO / STATUS novel. Root `STATUS.md` is a one-way vault projection — do not hand-edit it as source of truth.
- Keep Long horizon **ON** for this workspace. If unset: `status_init` (or pane “Start tracking”).

## How to work

- You will die mid-task (limits / compaction). If it is not on disk, it does not exist.
- Small slices: one change → verify → `status_mark_done` with verify → next.
- Read at most a few files, then **write** something. Never “full design in head” with zero bytes.
- Stuck twice on the same thing? `status_block` with the reason, change approach.

## Never do these

- Never `git push` / never add remotes. You may git commit your steps.
- Never kill/restart sacred ports: `:3080` (dsh), `:8080` (llama), `:11434` (ollama).
- **Never start a second `local-hauhau` / llama** — GPU OOM. If `:8080` is down, ask human — do not boot inference.
- Never POST chat to `:8080` (deadlock the slot serving you).
- Never claim an AC you did not observe. UI glances → `pending-human` if no screenshot path.
- Never put secrets (`COMPACT_API_KEY`, tokens) in commits or chat dumps.
- Acceptance: second `dsh web` on `:3090` only — see `ENV.md`.