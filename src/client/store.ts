/**
 * Shared pane poll state (refcounted), mirroring dsh-local-long-horizon's
 * store: first subscriber starts a 2s poll of the host route, last one stops
 * it. The vault is global; the followed cwd is a client-side concern.
 */
import type { RouteSnapshot, RouteSnapshotError } from '../shared/types.ts'

export type RouteResult = RouteSnapshot | RouteSnapshotError

export type ProcessAction = 'stop' | 'restart' | 'remove'

type Listener = () => void

let snapshot: RouteResult | null = null
let error: string | null = null
let refs = 0
let timer: ReturnType<typeof setInterval> | undefined
let cwd = ''
let sessionId = ''
const listeners = new Set<Listener>()

const POLL_MS = 2000
const ROUTE = '/api/dsh-agent-processes'

function emit(): void {
  for (const l of listeners) l()
}

async function tick(): Promise<void> {
  try {
    const res = await fetch(ROUTE, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    snapshot = (await res.json()) as RouteResult
    error = null
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  emit()
}

export function setTrackedCwd(next: string): void {
  if (next === cwd) return
  cwd = next
  void tick()
}

export function setTrackedSessionId(next: string): void {
  const n = next.trim()
  if (n === sessionId) return
  sessionId = n
  void tick()
}

export function getTrackedCwd(): string {
  return cwd
}

export function getTrackedSessionId(): string {
  return sessionId
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  refs += 1
  if (refs === 1) {
    void tick()
    timer = setInterval(() => { void tick() }, POLL_MS)
  }
  return () => {
    listeners.delete(listener)
    refs -= 1
    if (refs === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export function getSnapshot(): RouteResult | null {
  return snapshot
}

export function getError(): string | null {
  return error
}

export function refreshNow(): void {
  void tick()
}

/** UI action (Kill / Restart / Clear) → host POST; re-polls on success. */
export async function postAction(action: ProcessAction, id: string): Promise<Record<string, unknown>> {
  const res = await fetch(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, id }),
  })
  let body: Record<string, unknown> = {}
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch {
    // non-JSON error body
  }
  if (!res.ok || body.ok === false) {
    throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`)
  }
  await tick()
  return body
}
