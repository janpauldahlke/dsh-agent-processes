/**
 * Agent tools for dsh-agent-processes.
 *
 * Registers plain tool definition objects on the harness `tools` service.
 * Pin note (dsh ≥ 0.1.7): parameter/output JSON Schema must NOT put
 * `required: true` on scalar property nodes — use object-level
 * `required: ['field', …]` arrays.
 *
 * Boot-safe: a tool error surfaces to the agent (typed), never crashes boot.
 */
import type { Context } from '@deepseek-ai/cordis'
import { CorruptVaultError } from './vault.ts'
import { NotFoundError, ProcessService, ValidationError } from './service.ts'
import type {
  ListResult,
  LogsResult,
  StartResult,
  StopResult,
  WaitReadyResult,
} from '../shared/types.ts'

type ExecLike = {
  agent?: {
    session?: {
      id?: string
      header?: { cwd?: string; id?: string }
    }
  }
}

type ToolArgs = Record<string, any>

type ToolsFace = {
  register: (def: Record<string, unknown>) => () => void
}

const VERSION = '0.1.0'

function toolError(err: unknown): never {
  if (
    err instanceof ValidationError
    || err instanceof NotFoundError
    || err instanceof CorruptVaultError
  ) {
    throw err
  }
  throw err instanceof Error ? err : new Error(String(err))
}

function renderJson(_args: unknown, value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
}

const recordProps = {
  id: { type: 'string' },
  pid: { type: 'integer' },
  cmd: { type: 'string' },
  argv: { type: 'array', items: { type: 'string' } },
  cwd: { type: 'string' },
  port: { type: 'integer' },
  logPath: { type: 'string' },
  startedAt: { type: 'integer' },
  state: { type: 'string', enum: ['running', 'stopped', 'dead'] },
  // Harness schema subset: type arrays are unsupported — oneOf (exactly one
  // branch must match) expresses the optional exit code / null-on-signal.
  exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
  stoppedAt: { type: 'integer' },
  alive: { type: 'boolean' },
}

export function registerTools(ctx: Context, service: ProcessService): () => void {
  const tools = (ctx as unknown as { tools: ToolsFace }).tools
  const disposers: Array<() => void> = []

  disposers.push(tools.register({
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
        package: 'dsh-agent-processes' as const,
        version: VERSION,
        at: Date.now(),
      }
    },
  }))

  disposers.push(tools.register({
    name: 'process_start',
    description:
      'Start a tracked background process (detached daemon; survives this session). '
      + 'stdout+stderr are captured to a log. '
      + 'With a port: any tracked process holding that port is stopped first (reclaim), '
      + 'a foreign untracked holder is an error (never killed), and the call waits until '
      + 'the port accepts connections (readyTimeoutMs, default 15000) returning ready, '
      + 'waitedMs, and ~20 log lines. Returns the record (id, pid, logPath, …).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['cmd'],
      properties: {
        cmd: { type: 'string', description: 'Executable (resolved via PATH).' },
        args: { type: 'array', items: { type: 'string' }, description: 'Arguments.' },
        cwd: { type: 'string', description: 'Spawn cwd (defaults to session cwd).' },
        env: { type: 'object', additionalProperties: true, description: 'Extra env vars (string → string).' },
        port: { type: 'integer', description: 'Expected listen port (reclaim + readiness watch).' },
        name: { type: 'string', description: 'Friendly name; slugified into the id.' },
        readyTimeoutMs: { type: 'integer', description: 'Max ms to wait for the port (default 15000).' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'record'],
        properties: {
          ok: { type: 'boolean' },
          record: {
            type: 'object',
            additionalProperties: true,
            properties: recordProps,
          },
          reclaimed: { type: 'array', items: { type: 'string' } },
          ready: { type: 'boolean' },
          waitedMs: { type: 'integer' },
          logPreview: { type: 'array', items: { type: 'string' } },
          error: { type: 'string' },
        },
      },
      render: renderJson,
    },
    async execute(args: ToolArgs, exec: ExecLike) {
      try {
        const out: StartResult = await service.start({
          cmd: args.cmd,
          args: args.args,
          cwd: args.cwd,
          env: args.env,
          port: args.port,
          name: args.name,
          readyTimeoutMs: args.readyTimeoutMs,
        }, exec)
        return out
      } catch (err) {
        toolError(err)
      }
    },
  }))

  disposers.push(tools.register({
    name: 'process_stop',
    description:
      'Stop a tracked process: SIGTERM to its process group, then SIGKILL after a grace period. '
      + 'Only kills pids this plugin started (tracked scope).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Process id (from process_start / process_list).' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'id', 'pid', 'signal', 'state'],
        properties: {
          ok: { type: 'boolean' },
          id: { type: 'string' },
          pid: { type: 'integer' },
          signal: { type: 'string', enum: ['SIGTERM', 'SIGKILL', 'none'] },
          graceMs: { type: 'integer' },
          elapsedMs: { type: 'integer' },
          state: { type: 'string', enum: ['running', 'stopped', 'dead'] },
        },
      },
      render: renderJson,
    },
    async execute(args: ToolArgs) {
      try {
        const out: StopResult = await service.stop(args.id)
        return out
      } catch (err) {
        toolError(err)
      }
    },
  }))

  disposers.push(tools.register({
    name: 'process_list',
    description: 'List all tracked processes with a live liveness check.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'count', 'processes'],
        properties: {
          ok: { type: 'boolean' },
          storageRoot: { type: 'string' },
          count: { type: 'integer' },
          processes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: recordProps,
            },
          },
        },
      },
      render: renderJson,
    },
    async execute() {
      try {
        const out: ListResult = await service.list()
        return out
      } catch (err) {
        toolError(err)
      }
    },
  }))

  disposers.push(tools.register({
    name: 'process_logs',
    description: 'Tail the captured stdout+stderr log for a tracked process.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string' },
        lines: { type: 'integer', description: 'Number of trailing lines (default 200).' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'id', 'logPath', 'lines', 'totalLines', 'truncated'],
        properties: {
          ok: { type: 'boolean' },
          id: { type: 'string' },
          logPath: { type: 'string' },
          lines: { type: 'array', items: { type: 'string' } },
          totalLines: { type: 'integer' },
          truncated: { type: 'boolean' },
        },
      },
      render: renderJson,
    },
    async execute(args: ToolArgs) {
      try {
        const out: LogsResult = await service.logs(args.id, args.lines)
        return out
      } catch (err) {
        toolError(err)
      }
    },
  }))

  disposers.push(tools.register({
    name: 'process_wait_ready',
    description:
      'Poll a tracked process port (127.0.0.1) until it accepts connections or the timeout elapses. '
      + 'The process must have been started with a port.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string' },
        timeoutMs: { type: 'integer', description: 'Max wait (default 15000).' },
        pollMs: { type: 'integer', description: 'Poll interval (default 250).' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'id', 'ready', 'port', 'waitedMs'],
        properties: {
          ok: { type: 'boolean' },
          id: { type: 'string' },
          ready: { type: 'boolean' },
          port: { type: 'integer' },
          waitedMs: { type: 'integer' },
          error: { type: 'string' },
        },
      },
      render: renderJson,
    },
    async execute(args: ToolArgs) {
      try {
        const out: WaitReadyResult = await service.waitReady(args.id, args.timeoutMs, args.pollMs)
        return out
      } catch (err) {
        toolError(err)
      }
    },
  }))

  return () => {
    for (const d of disposers.reverse()) d()
  }
}
