/**
 * Process vault storage for dsh-agent-processes.
 *
 * Layout under the storage root (default `~/.dsh/storages/dsh-agent-processes/`):
 *   processes.json   — the vault (atomic tmp+rename writes)
 *   logs/<id>.log    — captured stdout+stderr per process
 *
 * Mirrors dsh-local-long-horizon storage: read-tolerant (ENOENT → empty),
 * corruption raises CorruptVaultError, writes are atomic.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { ProcessRecord, Vault } from '../shared/types.ts'

export function defaultStorageRoot(): string {
  return join(homedir(), '.dsh', 'storages', 'dsh-agent-processes')
}

export function vaultPath(storageRoot: string): string {
  return join(storageRoot, 'processes.json')
}

export function logFile(storageRoot: string, id: string): string {
  return join(storageRoot, 'logs', `${id}.log`)
}

export class CorruptVaultError extends Error {
  readonly path: string
  constructor(path: string, cause?: unknown) {
    super(`corrupt process vault JSON at ${path}`)
    this.name = 'CorruptVaultError'
    this.path = path
    if (cause !== undefined) this.cause = cause
  }
}

export function emptyVault(): Vault {
  return { version: 1, updatedAt: 0, processes: {} }
}

/** Load vault; missing file → empty vault. Bad JSON → CorruptVaultError. */
export async function loadVault(path: string): Promise<Vault> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') return emptyVault()
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new CorruptVaultError(path, cause)
  }
  const vault = normalizeVault(parsed)
  if (vault === null) throw new CorruptVaultError(path)
  return vault
}

function normalizeVault(value: unknown): Vault | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.processes !== 'object' || v.processes === null) return null
  const processes: Record<string, ProcessRecord> = {}
  for (const [k, rec] of Object.entries(v.processes as Record<string, unknown>)) {
    if (typeof rec !== 'object' || rec === null) continue
    processes[k] = rec as ProcessRecord
  }
  return { version: 1, updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : 0, processes }
}

/** Atomic write: tmp + rename. Returns the persisted vault (with updatedAt). */
export async function saveVault(storageRoot: string, vault: Vault): Promise<Vault> {
  const path = vaultPath(storageRoot)
  await mkdir(storageRoot, { recursive: true })
  const next: Vault = { version: 1, updatedAt: Date.now(), processes: vault.processes }
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  const body = `${JSON.stringify(next, null, 2)}\n`
  await writeFile(tmp, body, 'utf8')
  await rename(tmp, path)
  return next
}
