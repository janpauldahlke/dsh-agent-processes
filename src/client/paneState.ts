/** Refcounted "Processes pane open" flag (mirrors dsh-local-long-horizon). */
let refs = 0
const listeners = new Set<() => void>()

export function setPaneOpen(open: boolean): void {
  const next = open ? refs + 1 : Math.max(0, refs - 1)
  if (next === refs) return
  refs = next
  for (const l of listeners) l()
}

export function isPaneOpen(): boolean {
  return refs > 0
}

export function subscribePaneOpen(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
