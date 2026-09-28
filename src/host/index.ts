/**
 * Host half of dsh-agent-processes.
 *
 * Owns the process vault service, the process_* agent tools, and
 * GET/POST /api/dsh-agent-processes. Boot-safe: corrupt vault → route/tool
 * error, never a throw that kills the harness.
 *
 * Tools require only `tools`. The HTTP route is nested under
 * `ctx.inject(['webServer'])` so headless activates process_* without
 * waiting on webServer (mirrors dsh-local-long-horizon).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { ROUTE } from './route.ts'
import { NotFoundError, ProcessService, ValidationError } from './service.ts'
import { registerTools } from './tools.ts'

export const name = 'dsh-agent-processes'
export const inject = ['tools']

export { ROUTE } from './route.ts'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json',
    ...(status === 200 ? { 'cache-control': 'no-store' } : {}),
  })
  res.end(JSON.stringify(body))
}

function statusFor(err: unknown): number {
  if (err instanceof NotFoundError) return 404
  if (err instanceof ValidationError) return 400
  return 500
}

function registerRoute(ctx: Context, service: ProcessService): void {
  const unregister = ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: (req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        try {
          if (req.method === 'GET') {
            const snap = await service.snapshotForRoute()
            send(res, 200, snap)
            return
          }

          if (req.method === 'POST') {
            const raw = await readBody(req)
            let body: { action?: string; id?: string }
            try {
              body = JSON.parse(raw || '{}') as typeof body
            } catch {
              send(res, 400, { ok: false, error: 'invalid JSON body' })
              return
            }
            const id = body.id?.trim()
            if (!id) {
              send(res, 400, { ok: false, error: 'id required' })
              return
            }
            const action = body.action
            if (action === 'stop' || action === 'restart' || action === 'remove') {
              const result =
                action === 'stop' ? await service.stop(id)
                : action === 'restart' ? await service.restart(id)
                : await service.remove(id)
              send(res, 200, result)
              return
            }
            send(res, 400, {
              ok: false,
              error: 'expected { id, action: "stop" | "restart" | "remove" }',
            })
            return
          }

          send(res, 405, { error: 'method not allowed; use GET or POST' })
        } catch (err) {
          send(res, statusFor(err), {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    },
  })
  ctx.effect(() => unregister, 'agent-processes: route')
}

export function apply(ctx: Context): void {
  const service = new ProcessService()

  const disposeTools = registerTools(ctx, service)
  ctx.effect(() => disposeTools, 'agent-processes: tools')

  // Nested inject: activates when webServer exists (dsh web); no-op on headless.
  ctx.inject(['webServer'], (webCtx) => {
    registerRoute(webCtx, service)
  })
}
