import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { postAction, useProcesses } from './useProcesses.ts'
import type { ProcessAction } from './store.ts'
import { setPaneOpen } from './paneState.ts'
import { derive, toneOf, type ProcessTone } from './chipState.ts'
import type { RouteProcessView } from '../shared/types.ts'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Hook stand-in when the rightbar has not injected useSessions. */
function useNoopSessions<T>(selector: (state: { byId: Record<string, never> }) => T): T {
  return selector({ byId: {} })
}

const TONE_DOT: Record<ProcessTone, string> = {
  healthy: '#22c55e',
  starting: '#fbbf24',
  crashed: '#ef4444',
  stopped: '#8b93a7',
}

const TONE_LABEL: Record<ProcessTone, string> = {
  healthy: 'running',
  starting: 'starting',
  crashed: 'crashed',
  stopped: 'stopped',
}

const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5,
  color: 'inherit',
}

const card: CSSProperties = {
  border: '1px solid color-mix(in srgb, currentColor 18%, transparent)',
  borderRadius: 8,
  padding: '10px 12px',
  background: 'color-mix(in srgb, currentColor 4%, transparent)',
}

const muted: CSSProperties = {
  color: 'color-mix(in srgb, currentColor 55%, transparent)',
  fontSize: 12,
  fontFamily: MONO,
  margin: 0,
  overflowWrap: 'anywhere',
}

const btn: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
  background: 'color-mix(in srgb, currentColor 8%, transparent)',
  color: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

function ageLabel(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function basename(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || path
}

const COLLAPSED_LINES = 5

function LogPreview({ lines }: { lines: string[] }) {
  const [expanded, setExpanded] = useState(false)
  if (lines.length === 0) {
    return <div style={{ ...muted, opacity: 0.7 }}>(no output yet)</div>
  }
  const shown = expanded ? lines : lines.slice(-COLLAPSED_LINES)
  return (
    <div style={{ marginTop: 6 }}>
      <pre
        style={{
          margin: 0,
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid color-mix(in srgb, currentColor 12%, transparent)',
          background: 'color-mix(in srgb, currentColor 3%, transparent)',
          fontFamily: MONO,
          fontSize: 11,
          lineHeight: 1.45,
          maxHeight: expanded ? 260 : 96,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {shown.join('\n')}
      </pre>
      {lines.length > COLLAPSED_LINES ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{ ...btn, fontSize: 11, padding: '2px 8px', marginTop: 4 }}
        >
          {expanded ? 'collapse' : `show all ${lines.length} lines`}
        </button>
      ) : null}
    </div>
  )
}

function ProcessCard({
  view,
  busy,
  onAction,
}: {
  view: RouteProcessView
  busy: boolean
  onAction: (action: ProcessAction, id: string) => void
}) {
  const tone = toneOf(view)
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: TONE_DOT[tone],
            display: 'inline-block',
            flexShrink: 0,
            boxShadow: view.alive ? `0 0 5px ${TONE_DOT[tone]}` : 'none',
          }}
        />
        <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{view.id}</span>
        {typeof view.port === 'number' ? (
          <span style={{ ...muted, fontSize: 11 }}>:{view.port}</span>
        ) : null}
        <span style={{ ...muted, fontSize: 11 }}>
          {TONE_LABEL[tone]}
          {view.alive ? ` · pid ${view.pid}` : ''} · {ageLabel(view.startedAt)}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          disabled={busy || !view.alive}
          onClick={() => onAction('stop', view.id)}
          title="Stop (SIGTERM → SIGKILL after 3s)"
          style={{ ...btn, opacity: busy || !view.alive ? 0.55 : 1, cursor: busy || !view.alive ? 'default' : 'pointer' }}
        >
          Kill
        </button>
        <button
          type="button"
          disabled={busy || !view.argv || view.argv.length === 0}
          onClick={() => onAction('restart', view.id)}
          title="Re-run the same command"
          style={{ ...btn, opacity: busy || !view.argv || view.argv.length === 0 ? 0.55 : 1, cursor: busy ? 'wait' : 'pointer' }}
        >
          Restart
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction('remove', view.id)}
          title="Remove this record (and its log file)"
          style={{ ...btn, opacity: busy ? 0.55 : 1, cursor: busy ? 'wait' : 'pointer' }}
        >
          Clear
        </button>
      </div>
      <p style={muted}>{view.cmd}</p>
      <p style={{ ...muted, opacity: 0.8 }}>{basename(view.cwd)}</p>
      <LogPreview lines={view.logPreview ?? []} />
    </div>
  )
}

export function ProcessesBody(props: {
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
  const [busyId, setBusyId] = useState<string | null>(null)
  const [localErr, setLocalErr] = useState<string | null>(null)

  useEffect(() => {
    setPaneOpen(true)
    return () => setPaneOpen(false)
  }, [])

  const model = derive(snapshot, cwd || null)

  async function onAction(action: ProcessAction, id: string): Promise<void> {
    setBusyId(id)
    setLocalErr(null)
    try {
      await postAction(action, id)
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={container}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontWeight: 600 }}>Workspace</span>
          <span style={{ ...muted, fontSize: 11 }}>
            {sessionCwd
              ? `following chat workspace`
              : 'no chat workspace — showing all tracked processes'}
          </span>
        </div>
        <p style={{ ...muted, fontSize: 11 }}>{cwd || '(unknown)'}</p>
        {(error || localErr) ? (
          <div style={{ color: '#f87171', fontSize: 12 }}>{error || localErr}</div>
        ) : null}
      </div>

      {model ? (
        <>
          {model.mine.length === 0 ? (
            <div style={card}>
              <div style={{ ...muted }}>
                No tracked processes for this workspace. Start one with the
                process_start tool and it will appear here.
              </div>
            </div>
          ) : (
            model.mine.map((view) => (
              <ProcessCard
                key={view.id}
                view={view}
                busy={busyId === view.id}
                onAction={(a, id) => { void onAction(a, id) }}
              />
            ))
          )}

          {model.others.length > 0 ? (
            <div style={card}>
              <div style={{ ...muted, marginBottom: 6, opacity: 0.8 }}>
                Other workspaces ({model.others.length})
              </div>
              {model.others.map((view) => (
                <div
                  key={view.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 0',
                    borderTop: '1px solid color-mix(in srgb, currentColor 12%, transparent)',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: TONE_DOT[toneOf(view)],
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{view.id}</span>
                  {typeof view.port === 'number' ? (
                    <span style={{ ...muted, fontSize: 11 }}>:{view.port}</span>
                  ) : null}
                  <span style={{ ...muted, fontSize: 11 }}>{basename(view.cwd)}</span>
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    disabled={busyId === view.id || !view.alive}
                    onClick={() => { void onAction('stop', view.id) }}
                    style={{ ...btn, fontSize: 11, padding: '2px 8px', opacity: busyId === view.id || !view.alive ? 0.55 : 1 }}
                  >
                    Kill
                  </button>
                  <button
                    type="button"
                    disabled={busyId === view.id}
                    onClick={() => { void onAction('remove', view.id) }}
                    style={{ ...btn, fontSize: 11, padding: '2px 8px', opacity: busyId === view.id ? 0.55 : 1 }}
                  >
                    Clear
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        !error ? (
          <div style={card}>
            <div style={muted}>Waiting for the first snapshot…</div>
          </div>
        ) : null
      )}
    </div>
  )
}
