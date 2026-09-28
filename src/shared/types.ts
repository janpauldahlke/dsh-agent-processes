/** Shared types for dsh-agent-processes (host + future client). Type-only. */

export type ProcessState = 'running' | 'stopped' | 'dead'

export interface ProcessRecord {
  /** Stable id (slug of name, or `p-<base36>`). */
  id: string
  /** Leader pid of the spawned (detached) process group. */
  pid: number
  /** Full command line, argv joined for display. */
  cmd: string
  /** Lossless argv (kept for UI Restart — re-runs the exact command). */
  argv?: string[]
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
  /** Max ms to wait for the port to accept connections (only with port). */
  readyTimeoutMs?: number
}

export interface ProcessView extends ProcessRecord {
  /** Live liveness check at read time (kill(pid, 0)). */
  alive: boolean
}

export interface RouteProcessView extends ProcessView {
  /** Last few captured log lines (host-side tail, for the card preview). */
  logPreview: string[]
  /**
   * Only for running records with a port: whether the port accepted a TCP
   * connect at snapshot time (false while the child is still booting).
   */
  ready?: boolean
}

export interface RouteSnapshot {
  ok: true
  package: string
  version: string
  storageRoot: string
  count: number
  processes: RouteProcessView[]
}

export interface RouteSnapshotError {
  ok: false
  error: string
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
  /** Only when a port was given: tracked holder ids stopped before spawn. */
  reclaimed?: string[]
  /** Only when a port was given: whether the port now accepts connections. */
  ready?: boolean
  /** Only when a port was given: ms spent waiting for readiness. */
  waitedMs?: number
  /** Only when a port was given: trailing log lines (≤20) at return time. */
  logPreview?: string[]
  /** Only when a port was given and not ready: 'port-timeout'. */
  error?: string
}
