/**
 * Host half of dsh-agent-processes. (M1 stub)
 *
 * M1 proves the bundle: one `process_ping` liveness tool.
 * M2 adds the process vault + lifecycle tools; M4 adds the GET route (nested
 * under `ctx.inject(['webServer'], …)` so headless loads stay fast).
 * Boot-safe: a tool error never throws into the harness.
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-agent-processes'
export const inject = ['tools']

const VERSION = '0.1.0'

type ToolsFace = {
  register: (def: Record<string, unknown>) => () => void
}

export function apply(ctx: Context): void {
  const tools = (ctx as unknown as { tools: ToolsFace }).tools

  const disposePing = tools.register({
    name: 'process_ping',
    description: 'Health probe for the dsh-agent-processes host service.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'package', 'version', 'at'],
        properties: {
          ok: { type: 'boolean' },
          package: { type: 'string' },
          version: { type: 'string' },
          at: { type: 'integer' },
        },
      },
      render: (_a: unknown, v: unknown) => [{ type: 'text', text: JSON.stringify(v) }],
    },
    async execute() {
      return {
        ok: true as const,
        package: name as const,
        version: VERSION,
        at: Date.now(),
      }
    },
  })

  ctx.effect(() => {
    disposePing()
  }, 'agent-processes: tools')
}
