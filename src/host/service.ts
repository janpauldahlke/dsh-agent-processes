/**
 * Process lifecycle service for dsh-agent-processes.
 *
 * Owns the vault and the spawn/stop/list/logs/wait-ready logic. Boot-safe:
 * vault errors are typed (CorruptVaultError), missing ids raise NotFoundError,
 * and signal calls never throw for a vanished group (ESRCH is "already gone").
 *
 * Kill scope is TRACKED-only: we only ever signal a pid we spawned and record.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { openSync, closeSync, mkdirSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { dirname, join } from 'node:path'
import {
  defaultStorageRoot,
  loadVault,
  logFile,
  saveVault,
  vaultPath,
} from './vault.ts'
import type { Vault } from '../shared/types.ts'
import type {
  ListResult,
  LogsResult,
  ProcessRecord,
  ProcessView,
  RouteProcessView,
  RouteSnapshot,
  StartArgs,
  StartResult,
  StopResult,
  WaitReadyResult,
} from '../shared/types.ts'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends Error {
  readonly id: string
  constructor(id: string) {
    super(`no tracked process "${id}"`)
    this.name = 'NotFoundError'
    this.id = id
  }
}

type ExecLike = {
  agent?: { session?: { id?: string; header?: { cwd?: string; id?: string } } }
}

const GRACE_MS = 3000
const POLL_MS = 100
const READY_TIMEOUT_MS = 15000
const READY_POLL_MS = 250
const LOG_PREVIEW_LINES = 20

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    return code === 'EPERM'
  }
}

/** Signal the whole detached process group; false when it is already gone. */
function signalGroup(pid: number, sig: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, sig)
    return true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ESRCH' || code === 'EPERM') return false
    throw err
  }
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || `p-${Date.now().toString(36)}`
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(ok)
    }
    const socket = connect({ host: '127.0.0.1', port })
    socket.setTimeout(750, () => finish(false))
    socket.on('connect', () => finish(true))
    socket.on('error', () => finish(false))
  })
}

export class ProcessService {
  private readonly storageRoot: string
  private readonly children = new Map<string, ChildProcess>()

  constructor(storageRoot?: string) {
    this.storageRoot = storageRoot ?? defaultStorageRoot()
  }

  get root(): string {
    return this.storageRoot
  }

  private get vaultFile(): string {
    return vaultPath(this.storageRoot)
  }

  private getRecord(processes: Record<string, ProcessRecord>, id: string): ProcessRecord {
    const rec = processes[id]
    if (!rec) throw new NotFoundError(id)
    return rec
  }

  async start(args: StartArgs, exec?: ExecLike): Promise<StartResult> {
    const cmd = args.cmd?.trim()
    if (!cmd) throw new ValidationError('cmd is required')
    if (args.args !== undefined && !Array.isArray(args.args)) {
      throw new ValidationError('args must be an array of strings')
    }

    const fromArg = args.cwd?.trim()
    const fromSession = exec?.agent?.session?.header?.cwd?.trim()
    const cwd = fromArg || fromSession || process.cwd()
    const port = args.port
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new ValidationError('port must be an integer 1-65535')
    }

    // M3 — reclaim: a tracked, live holder of the expected port is stopped
    // first (EADDRINUSE recovery). Foreign holders are never killed (S5).
    let reclaimed: string[] | undefined
    if (port !== undefined) {
      const vault = await loadVault(this.vaultFile)
      const holders = Object.values(vault.processes).filter(
        (rec) => rec.port === port && rec.state === 'running' && isAlive(rec.pid),
      )
      if (holders.length > 0) {
        reclaimed = []
        for (const holder of holders) {
          await this.stop(holder.id)
          reclaimed.push(holder.id)
        }
      }
      if (await portOpen(port)) {
        throw new ValidationError(
          `port ${port} is already held by a process this plugin does not track — `
          + 'refusing to kill it. Free the port (or stop the holder) and retry; '
          + 'use process_list to see tracked processes',
        )
      }
    }

    const id = args.name?.trim() ? slugify(args.name) : `p-${Date.now().toString(36)}`
    const log = logFile(this.storageRoot, id)
    mkdirSync(dirname(log), { recursive: true })

    const fd = openSync(log, 'a')
    let child: ChildProcess
    try {
      child = spawn(cmd, args.args ?? [], {
        cwd,
        detached: true,
        stdio: ['ignore', fd, fd],
        env: { ...process.env, ...(args.env ?? {}) },
      })
    } catch (err) {
      closeSync(fd)
      throw err
    }
    closeSync(fd)
    child.unref()
    this.children.set(id, child)
    child.on('exit', (code) => {
      this.children.delete(id)
      void this.recordExit(id, code ?? null)
    })

    const record: ProcessRecord = {
      id,
      pid: child.pid ?? -1,
      cmd: [cmd, ...(args.args ?? [])].join(' '),
      argv: [cmd, ...(args.args ?? [])],
      cwd,
      ...(port !== undefined ? { port } : {}),
      logPath: log,
      startedAt: Date.now(),
      state: 'running',
    }
    const vault: Vault = await loadVault(this.vaultFile)
    vault.processes[id] = record
    await saveVault(this.storageRoot, vault)

    // M3 — watch: with a port, wait until it accepts connections (or the
    // timeout elapses) and attach a short log preview either way.
    if (port !== undefined) {
      const timeout = args.readyTimeoutMs ?? READY_TIMEOUT_MS
      const started = Date.now()
      let ready = false
      while (Date.now() - started < timeout) {
        if (await portOpen(port)) {
          ready = true
          break
        }
        await sleep(READY_POLL_MS)
      }
      const preview = await this.logs(id, LOG_PREVIEW_LINES)
      return {
        ok: true,
        record,
        ...(reclaimed && reclaimed.length > 0 ? { reclaimed } : {}),
        ready,
        waitedMs: Date.now() - started,
        logPreview: preview.lines,
        ...(!ready ? { error: 'port-timeout' } : {}),
      }
    }
    return { ok: true, record }
  }

  /** Best-effort exit capture; list() re-derives liveness on read. */
  private async recordExit(id: string, code: number | null): Promise<void> {
    try {
      const vault = await loadVault(this.vaultFile)
      const rec = vault.processes[id]
      if (!rec) return
      if (rec.state === 'running') rec.state = 'dead'
      rec.exitCode = code
      rec.stoppedAt = rec.stoppedAt ?? Date.now()
      await saveVault(this.storageRoot, vault)
    } catch {
      // ignore: vault contention or corruption is reconciled on the next read
    }
  }

  async stop(id: string): Promise<StopResult> {
    const vault = await loadVault(this.vaultFile)
    const rec = this.getRecord(vault.processes, id)
    const started = Date.now()
    let signal: StopResult['signal'] = 'none'

    if (rec.state === 'running' && isAlive(rec.pid)) {
      signalGroup(rec.pid, 'SIGTERM')
      signal = 'SIGTERM'
      let waited = 0
      while (waited < GRACE_MS && isAlive(rec.pid)) {
        await sleep(POLL_MS)
        waited += POLL_MS
      }
      if (isAlive(rec.pid)) {
        signalGroup(rec.pid, 'SIGKILL')
        signal = 'SIGKILL'
        await sleep(POLL_MS)
      }
    }

    rec.state = 'stopped'
    rec.stoppedAt = Date.now()
    await saveVault(this.storageRoot, vault)
    this.children.delete(id)

    return {
      ok: true,
      id,
      pid: rec.pid,
      signal,
      graceMs: GRACE_MS,
      elapsedMs: Date.now() - started,
      state: rec.state,
    }
  }

  /**
   * UI Restart: stop the current holder (if alive) and re-run the exact
   * recorded argv under the same id, so the card keeps its identity.
   */
  async restart(id: string, exec?: ExecLike): Promise<StartResult> {
    const vault = await loadVault(this.vaultFile)
    const rec = this.getRecord(vault.processes, id)
    if (rec.state === 'running' && isAlive(rec.pid)) {
      await this.stop(id)
    }
    if (!rec.argv || rec.argv.length === 0) {
      throw new ValidationError(`process "${id}" has no stored argv to restart`)
    }
    const [cmd, ...args] = rec.argv
    return await this.start({
      cmd,
      ...(args.length > 0 ? { args } : {}),
      cwd: rec.cwd,
      ...(rec.port !== undefined ? { port: rec.port } : {}),
      name: id,
    }, exec)
  }

  /**
   * Route snapshot for the Processes pane / dock chip (PLAN §8.3): every
   * record with a live liveness check, a short log preview, and — for
   * running records with a port — a TCP connect probe so the client can
   * tell "starting" from "healthy" without its own probe.
   */
  async snapshotForRoute(): Promise<RouteSnapshot> {
    const base = await this.list()
    const processes: RouteProcessView[] = await Promise.all(
      base.processes.map(async (view) => {
        let preview: string[] = []
        try {
          const res = await this.logs(view.id, LOG_PREVIEW_LINES)
          preview = res.lines
        } catch {
          // log file missing/unreadable — preview stays empty
        }
        const ready = view.alive && view.port !== undefined ? await portOpen(view.port) : undefined
        return { ...view, logPreview: preview, ...(ready !== undefined ? { ready } : {}) }
      }),
    )
    return {
      ok: true,
      package: 'dsh-agent-processes',
      version: '0.1.0',
      storageRoot: base.storageRoot,
      count: processes.length,
      processes,
    }
  }

  async list(): Promise<ListResult> {
    const vault = await loadVault(this.vaultFile)
    const processes: ProcessView[] = []
    let changed = false
    for (const rec of Object.values(vault.processes)) {
      const alive = rec.state === 'running' && isAlive(rec.pid)
      if (!alive && rec.state === 'running') {
        rec.state = 'dead'
        rec.stoppedAt = rec.stoppedAt ?? Date.now()
        changed = true
      }
      processes.push({ ...rec, alive })
    }
    if (changed) await saveVault(this.storageRoot, vault)
    processes.sort((a, b) => b.startedAt - a.startedAt)
    return { ok: true, storageRoot: this.storageRoot, count: processes.length, processes }
  }

  async logs(id: string, lines = 200): Promise<LogsResult> {
    const vault = await loadVault(this.vaultFile)
    const rec = this.getRecord(vault.processes, id)
    const n = Math.max(1, Math.floor(lines))
    let raw = ''
    try {
      raw = await readFile(rec.logPath, 'utf8')
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code !== 'ENOENT') throw err
    }
    const all = raw.length === 0 ? [] : raw.split('\n')
    if (all.length > 0 && all[all.length - 1] === '') all.pop()
    const tail = all.slice(-n)
    return {
      ok: true,
      id,
      logPath: rec.logPath,
      lines: tail,
      totalLines: all.length,
      truncated: all.length > n,
    }
  }

  async waitReady(id: string, timeoutMs = 15000, pollMs = 250): Promise<WaitReadyResult> {
    const vault = await loadVault(this.vaultFile)
    const rec = this.getRecord(vault.processes, id)
    if (rec.port === undefined) throw new ValidationError(`process "${id}" has no port to wait on`)
    const port = rec.port
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (await portOpen(port)) {
        return { ok: true, id, ready: true, port, waitedMs: Date.now() - started }
      }
      await sleep(pollMs)
    }
    return {
      ok: true,
      id,
      ready: false,
      port,
      waitedMs: Date.now() - started,
      error: 'timeout',
    }
  }

  /** Remove a record and (best-effort) its log file. */
  async remove(id: string): Promise<{ ok: true; id: string; existed: boolean }> {
    const vault = await loadVault(this.vaultFile)
    const existed = Boolean(vault.processes[id])
    if (existed) {
      delete vault.processes[id]
      await saveVault(this.storageRoot, vault)
      try {
        rmSync(logFile(this.storageRoot, id), { force: true })
      } catch {
        // ignore
      }
    }
    this.children.delete(id)
    return { ok: true, id, existed }
  }
}
