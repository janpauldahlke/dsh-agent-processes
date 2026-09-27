/**
 * Host half of dsh-agent-processes.
 *
 * Owns the process vault service and the process_* agent tools.
 * M2: process_ping + process_start/stop/list/logs/wait_ready.
 * M3 adds the port watcher + reclaim; M4 adds the GET route (nested under
 * `ctx.inject(['webServer'], …)` so headless loads stay fast) and the UI.
 * Boot-safe: a tool error never throws into the harness.
 */
import type { Context } from '@deepseek-ai/cordis'
import { ProcessService } from './service.ts'
import { registerTools } from './tools.ts'

export const name = 'dsh-agent-processes'
export const inject = ['tools']

export function apply(ctx: Context): void {
  const service = new ProcessService()

  const disposeTools = registerTools(ctx, service)
  ctx.effect(() => disposeTools, 'agent-processes: tools')
}
