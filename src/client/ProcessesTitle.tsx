import { useProcesses } from './useProcesses.ts'
import { derive, deriveChip } from './chipState.ts'

/** Hook stand-in when useSessions is not injected. */
function useNoopSessions<T>(selector: (state: { byId: Record<string, never> }) => T): T {
  return selector({ byId: {} })
}

export function ProcessesTitle(props: {
  sessionId?: string
  useSessions?: <T>(selector: (state: {
    byId: Record<string, { cwd?: string | null } | undefined>
  }) => T) => T
} = {}) {
  const { sessionId, useSessions = useNoopSessions } = props
  const sessionCwd = useSessions((sessions) => {
    if (!sessionId) return null
    const cwd = sessions.byId[sessionId]?.cwd
    return typeof cwd === 'string' && cwd.trim() ? cwd.trim() : null
  })
  const { snapshot, error, cwd } = useProcesses(sessionCwd, sessionId)

  const chip = deriveChip(snapshot, error, cwd || null)
  const model = derive(snapshot, cwd || null)

  let color = '#8b93a7'
  let tip = sessionCwd
    ? `Following workspace ${sessionCwd}`
    : 'Processes — open a workspace in this chat to scope the list'
  if (error || (snapshot && snapshot.ok !== true)) {
    color = '#ef4444'
    tip = 'Processes route error'
  } else if (model) {
    if (model.crashed.length > 0) {
      color = '#ef4444'
      tip = `${model.crashed.length} crashed: ${model.crashed.map((p) => p.id).join(', ')}`
    } else if (model.running.length > 0) {
      color = model.starting.length > 0 ? '#fbbf24' : '#22c55e'
      tip = chip.label
    } else {
      tip = model.mine.length > 0
        ? 'No tracked processes running'
        : 'No tracked processes for this workspace yet'
    }
  }

  return (
    <span
      title={tip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {chip.hidden ? null : (
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: chip.dot,
            display: 'inline-block',
          }}
        />
      )}
      Processes
    </span>
  )
}
