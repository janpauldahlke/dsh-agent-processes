/** Shared types for dsh-agent-processes (host + future client). Type-only. */

export type ProcessState = 'running' | 'stopped' | 'dead'

export interface ProcessRecord {
  /** Stable id (slug of name, or `p-<base36>`). */
  id: string
  /** Leader pid of the spawned (detached) process group. */
  pid: number
  /** Full command line, argv joined for display. */
  cmd: string
  /** Working directory the child was spawned in. */
  cwd: string
  /** Port to watch, when the caller gave one. */
  port?: number
  /** Absolute path of the captured stdout+stderr log. */
  logPath: string
  /** Epoch ms the child was spawned. */
  startedAt: number
  state: ProcessState
  exitCode?: number | null
  stoppedAt?: number
}

export interface Vault {
  version: 1
  updatedAt: number
  /** Process records keyed by id. */
  processes: Record<string, ProcessRecord>
}

export interface StartArgs {
  /** Command executable (resolved via PATH). */
  cmd: string
  /** Arguments for the command. */
  args?: string[]
  /** Spawn cwd (defaults to the session workspace cwd). */
  cwd?: string
  /** Extra environment variables merged over the inherited env. */
  env?: Record<string, string>
  /** Port the process is expected to listen on (for wait_ready / port watch). */
  port?: number
  /** Friendly name; slugified into the record id. */
  name?: string
}

export interface ProcessView extends ProcessRecord {
  /** Live liveness check at read time (kill(pid, 0)). */
  alive: boolean
}

export interface StopResult {
  ok: true
  id: string
  pid: number
  signal: 'SIGTERM' | 'SIGKILL' | 'none'
  graceMs: number
  elapsedMs: number
  state: ProcessState
}

export interface LogsResult {
  ok: true
  id: string
  logPath: string
  lines: string[]
  totalLines: number
  truncated: boolean
}

export interface WaitReadyResult {
  ok: true
  id: string
  ready: boolean
  port: number
  waitedMs: number
  error?: string
}

export interface ListResult {
  ok: true
  storageRoot: string
  count: number
  processes: ProcessView[]
}

export interface StartResult {
  ok: true
  record: ProcessRecord
}
