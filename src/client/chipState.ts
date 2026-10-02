/**
 * Dock-chip state derivation — PLAN §8.1 table:
 *
 *   Nothing running → (hidden)
 *   1 healthy       → `Processes · :3000`
 *   N running       → `Processes · 3 running`
 *   Crashed         → `Processes · 1 crashed`
 *   Starting        → `Processes · starting…`
 *
 * Records are scoped to the followed workspace cwd when one is known.
 */
import type { RouteProcessView } from '../shared/types.ts'
import type { RouteResult } from './store.ts'

export interface ChipDisplay {
  hidden: boolean
  label: string
  dot: string
  dim: boolean
  title: string
}

const HIDDEN: ChipDisplay = { hidden: true, label: '', dot: '#8b93a7', dim: true, title: '' }

export type ProcessTone = 'healthy' | 'starting' | 'crashed' | 'stopped'

export function toneOf(p: RouteProcessView): ProcessTone {
  if (p.alive) {
    return p.port !== undefined && p.ready === false ? 'starting' : 'healthy'
  }
  return p.state === 'dead' ? 'crashed' : 'stopped'
}

export interface ChipModel {
  mine: RouteProcessView[]
  others: RouteProcessView[]
  running: RouteProcessView[]
  crashed: RouteProcessView[]
  starting: RouteProcessView[]
  healthy: RouteProcessView[]
  ports: number[]
}

export function derive(snap: RouteResult | null, followedCwd: string | null): ChipModel | null {
  if (!snap || snap.ok !== true) return null
  const all = snap.processes
  const mine = followedCwd
    ? all.filter((p) => p.cwd === followedCwd)
    : all
  const running = mine.filter((p) => p.alive)
  const crashed = mine.filter((p) => !p.alive && p.state === 'dead')
  const starting = running.filter((p) => p.port !== undefined && p.ready === false)
  const healthy = running.filter((p) => !(p.port !== undefined && p.ready === false))
  const ports = healthy
    .map((p) => p.port)
    .filter((p): p is number => typeof p === 'number')
  return {
    mine,
    others: followedCwd ? all.filter((p) => p.cwd !== followedCwd) : [],
    running,
    crashed,
    starting,
    healthy,
    ports,
  }
}

function portList(ports: number[]): string {
  if (ports.length === 0) return ''
  const shown = ports.slice(0, 3).map((p) => `:${p}`).join(', ')
  return ports.length > 3 ? `${shown} +${ports.length - 3}` : shown
}

export function deriveChip(snap: RouteResult | null, error: string | null, followedCwd: string | null): ChipDisplay {
  if (error) {
    return { hidden: false, label: 'Processes · error', dot: '#ef4444', dim: false, title: `Processes route error: ${error}` }
  }
  if (!snap) return HIDDEN
  if (snap.ok !== true) {
    return { hidden: false, label: 'Processes · error', dot: '#ef4444', dim: false, title: snap.error }
  }
  const model = derive(snap, followedCwd)
  if (!model) return HIDDEN

  if (model.crashed.length > 0) {
    const ports = model.crashed
      .map((p) => p.port)
      .filter((p): p is number => typeof p === 'number')
      .map((p) => `:${p}`)
      .slice(0, 3)
      .join(', ')
    return {
      hidden: false,
      label: `Processes · ${model.crashed.length} crashed${ports ? ` · ${ports}` : ''}`,
      dot: '#ef4444',
      dim: false,
      title: `Crashed: ${model.crashed.map((p) => p.id).join(', ')}`,
    }
  }
  if (model.running.length === 0) return HIDDEN
  if (model.running.length === 1) {
    const only = model.running[0]
    if (only.port !== undefined && only.ready === false) {
      return {
        hidden: false,
        label: 'Processes · starting…',
        dot: '#fbbf24',
        dim: false,
        title: `${only.id} is starting on :${only.port}`,
      }
    }
    const port = typeof only.port === 'number' ? `:${only.port}` : only.id
    return {
      hidden: false,
      label: `Processes · ${port}`,
      dot: '#22c55e',
      dim: false,
      title: `${only.id} (pid ${only.pid}) — ${only.cmd}`,
    }
  }
  return {
    hidden: false,
    label: `Processes · ${model.running.length} running${portList(model.ports) ? ` · ${portList(model.ports)}` : ''}`,
    dot: model.starting.length > 0 ? '#fbbf24' : '#22c55e',
    dim: false,
    title: `Running: ${model.running.map((p) => p.id).join(', ')}`,
  }
}
