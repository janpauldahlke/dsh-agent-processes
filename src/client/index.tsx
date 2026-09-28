/**
 * Browser half of dsh-agent-processes (M4).
 *
 * Seats mirror gpu-monitor / slot-health / long-horizon:
 *   1. tab type (sidebarRightTabs)
 *   2. body + title (sidebar.right.pane.tab*)
 *   3. collapsed dock chip (conversation.composer.dock) — hidden while the
 *      pane is open or while nothing is running (PLAN §8.1)
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// Type-only: activates conversation.composer.dock SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { ProcessesBody } from './ProcessesBody.tsx'
import { ProcessesDockChip } from './ProcessesDockChip.tsx'
import { ProcessesGuideIcon } from './ProcessesIcon.tsx'
import { ProcessesTitle } from './ProcessesTitle.tsx'

const TAB_ID = 'dsh-agent-processes'
const TAB_KIND = 'agent-processes'

export const name = 'dsh-agent-processes'
export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs']

export function apply(ctx: Context): void {
  const definition: SidebarRightTabDefinition = {
    id: TAB_ID,
    kind: TAB_KIND,
    title: () => 'Processes',
    guide: [{
      id: 'agent-processes',
      order: 260,
      title: () => 'Processes',
      description: () => 'Tracked local processes: status, logs, kill / restart / clear',
      icon: ProcessesGuideIcon,
    }],
  }
  const disposeType = ctx.sidebarRightTabs.register(definition)
  const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TAB_ID },
    ProcessesBody,
  ))
  const disposeTitle = ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: TAB_ID },
    ProcessesTitle,
  ))
  // Dock is session-scoped — framework passes sessionId / useSessions.
  const ProcessesDockSeat = (props: Record<string, unknown>) => (
    <ProcessesDockChip
      sessionId={typeof props.sessionId === 'string' ? props.sessionId : undefined}
      useSessions={typeof props.useSessions === 'function'
        ? props.useSessions as NonNullable<Parameters<typeof ProcessesDockChip>[0]['useSessions']>
        : undefined}
      onOpen={() => ctx.sidebarRight.openTab(TAB_KIND)}
    />
  )
  const disposeDock = ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
    { name: 'conversation.composer.dock', id: 'agent-processes', order: -8 },
    ProcessesDockSeat,
  ))
  ctx.effect(() => () => {
    disposeDock()
    disposeTitle()
    disposeBody()
    disposeType()
  }, 'agent-processes: rightbar tab type')
}
