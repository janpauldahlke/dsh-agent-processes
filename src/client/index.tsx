/**
 * Browser half of dsh-agent-processes. (M1 stub)
 *
 * M1: no-op client — proves the dual-face install loads without throwing.
 * M4: Processes rightbar tab + dock chip (mirror gpu-monitor / slot-health /
 * long-horizon seats: sidebarRightTabs type, sidebar.right.pane.tab body/title,
 * conversation.composer.dock chip).
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-agent-processes'
export const inject: string[] = []

export function apply(_ctx: Context): void {
  // M1: no UI yet; keep a valid apply() so the ModuleLoader factory loads clean.
}
