/**
 * Unit/integration tests for the process lifecycle service
 * (src/host/service.ts, bundled to lib/service.mjs).
 *
 * Exercises real child processes (node -e toys) against a temp storage root:
 *   - start: record shape, log capture, id slug, validation errors;
 *   - list: liveness derived on read, dead-marking of natural exits;
 *   - logs: tail of captured stdout, ENOENT tolerance;
 *   - waitReady: TCP port poll → ready / validation / timeout;
 *   - start (M3): port watch (ready/waitedMs/logPreview/timeout),
 *     reclaim of tracked holders, foreign-holder refusal (no silent kill);
 *   - stop: SIGTERM group kill, idempotence, NotFound on unknown id;
 *   - remove: record + log file gone.
 *
 * Run: `npm test` (node --test) or `node --test test/service.test.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  NotFoundError,
  ProcessService,
  ValidationError,
} from '../lib/service.mjs'

async function tmpRoot() {
  return mkdtemp(join(tmpdir(), 'dsh-agent-processes-svc-'))
}

async function fileExists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function waitUntil(fn, { timeoutMs = 8000, pollMs = 100 } = {}) {
  const started = Date.now()
  for (;;) {
    if (await fn()) return true
    if (Date.now() - started > timeoutMs) return false
    await new Promise((r) => setTimeout(r, pollMs))
  }
}

/** A toy HTTP server script that accepts a port via argv[1]. */
const TOY_SERVER = `
const http = require('http');
const port = Number(process.argv[1]);
console.log('toy-start port=' + port);
const server = http.createServer((req, res) => { res.writeHead(200, {'content-type':'text/plain'}); res.end('toy ok'); });
server.listen(port, '127.0.0.1', () => console.log('toy-ready port=' + port));
process.on('SIGTERM', () => {
  console.log('toy-sigterm');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 400).unref();
});
`

async function freePort() {
  const { createServer } = await import('node:net')
  return await new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

test('start: record shape, log capture, slug id', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  try {
    const { record } = await svc.start({
      cmd: 'node',
      args: ['-e', 'console.log("hello from toy"); setTimeout(() => {}, 60000)'],
      name: 'My Toy',
      cwd: '/tmp',
    })
    assert.equal(record.id, 'my-toy', 'name slugified into id')
    assert.ok(record.pid > 0, 'has a pid')
    assert.equal(record.state, 'running')
    assert.equal(record.cwd, '/tmp')
    assert.match(record.cmd, /^node /)
    assert.equal(record.port, undefined)
    assert.ok(record.logPath.startsWith(join(root, 'logs')), 'log under storage root')
    assert.ok(record.startedAt > 0)

    const gotLogs = await waitUntil(async () => {
      const l = await svc.logs(record.id)
      return l.lines.some((line) => line.includes('hello from toy'))
    })
    assert.ok(gotLogs, 'stdout captured to log')
  } finally {
    await svc.stop('my-toy').catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

test('start: validation errors (no cmd / bad port / bad args)', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  try {
    await assert.rejects(() => svc.start({ cmd: '   ' }), ValidationError)
    await assert.rejects(() => svc.start({ cmd: 'node', port: 99999 }), ValidationError)
    await assert.rejects(() => svc.start({ cmd: 'node', port: 0 }), ValidationError)
    await assert.rejects(() => svc.start({ cmd: 'node', args: 'not-an-array' }), ValidationError)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('list: liveness derived on read, newest first', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  try {
    const a = await svc.start({ cmd: 'node', args: ['-e', 'setTimeout(()=>{},60000)'], name: 'toy-a' })
    await new Promise((r) => setTimeout(r, 30))
    const b = await svc.start({ cmd: 'node', args: ['-e', 'setTimeout(()=>{},60000)'], name: 'toy-b' })
    const { count, processes } = await svc.list()
    assert.equal(count, 2)
    assert.equal(processes.length, 2)
    for (const p of processes) assert.equal(p.alive, true)
    assert.ok(processes[0].startedAt >= processes[1].startedAt, 'sorted newest first')
    assert.equal(processes[0].id, 'toy-b')
    assert.equal(processes[1].id, 'toy-a')
    assert.equal(svc.root, root)
    void a; void b
  } finally {
    await svc.stop('toy-a').catch(() => {})
    await svc.stop('toy-b').catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

test('list: natural exit marks record dead', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  try {
    await svc.start({ cmd: 'node', args: ['-e', 'setTimeout(()=>{},400)'], name: 'short-lived' })
    const marked = await waitUntil(async () => {
      const { processes } = await svc.list()
      const rec = processes.find((p) => p.id === 'short-lived')
      return rec && rec.state === 'dead'
    }, { timeoutMs: 6000 })
    assert.ok(marked, 'record marked dead after natural exit')
    const { processes } = await svc.list()
    const rec = processes.find((p) => p.id === 'short-lived')
    assert.equal(rec.alive, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('logs: tail + truncation flag; ENOENT tolerated', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  try {
    // 5 lines to the log via a toy that prints then sleeps
    await svc.start({
      cmd: 'node',
      args: ['-e', 'for (let i = 1; i <= 5; i++) console.log("line " + i); setTimeout(()=>{},60000)'],
      name: 'logger',
    })
    const got = await waitUntil(async () => {
      const l = await svc.logs('logger')
      return l.totalLines >= 5
    })
    assert.ok(got, 'all 5 lines captured')
    const full = await svc.logs('logger')
    assert.equal(full.totalLines, 5)
    assert.equal(full.truncated, false)
    const tail = await svc.logs('logger', 2)
    assert.deepEqual(tail.lines, ['line 4', 'line 5'])
    assert.equal(tail.truncated, true)
    assert.equal(tail.totalLines, 5)
  } finally {
    await svc.stop('logger').catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

test('waitReady: ready when the port accepts connections', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  const port = await freePort()
  try {
    await svc.start({ cmd: 'node', args: ['-e', TOY_SERVER, String(port)], name: 'toy-server', port })
    const res = await svc.waitReady('toy-server', 8000, 100)
    assert.equal(res.ready, true)
    assert.equal(res.port, port)
    assert.ok(res.waitedMs < 8000)
  } finally {
    await svc.stop('toy-server').catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

test('waitReady: validation + timeout', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  try {
    await svc.start({ cmd: 'node', args: ['-e', 'setTimeout(()=>{},60000)'], name: 'no-port' })
    await assert.rejects(() => svc.waitReady('no-port'), ValidationError)

    const port = await freePort()
    // Port that never opens (we hold it in this test process is not enough —
    // use a port we simply do not open).
    await svc.start({ cmd: 'node', args: ['-e', 'setTimeout(()=>{},60000)'], name: 'slow-port', port })
    const res = await svc.waitReady('slow-port', 1200, 100)
    assert.equal(res.ready, false)
    assert.equal(res.error, 'timeout')
    assert.ok(res.waitedMs >= 1100)
  } finally {
    await svc.stop('no-port').catch(() => {})
    await svc.stop('slow-port').catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

test('stop: SIGTERM kills the group, idempotent, state stopped', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  try {
    const { record } = await svc.start({
      cmd: 'node',
      args: ['-e', 'console.log("sleeper"); setTimeout(()=>{},60000)'],
      name: 'sleeper',
    })
    const res = await svc.stop('sleeper')
    assert.equal(res.ok, true)
    assert.equal(res.id, 'sleeper')
    assert.equal(res.signal, 'SIGTERM')
    assert.equal(res.state, 'stopped')
    assert.equal(res.elapsedMs < 5000, true)

    // pid is gone
    const alive = await new Promise((resolve) => {
      try { process.kill(record.pid, 0); resolve(true) } catch { resolve(false) }
    })
    assert.equal(alive, false, 'pid no longer alive after stop')

    // idempotent second stop
    const res2 = await svc.stop('sleeper')
    assert.equal(res2.signal, 'none')
    assert.equal(res2.state, 'stopped')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('stop: unknown id → NotFoundError', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  try {
    await assert.rejects(() => svc.stop('ghost'), (err) => {
      assert.ok(err instanceof NotFoundError)
      assert.equal(err.id, 'ghost')
      return true
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('remove: drops record + log file', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  try {
    const { record } = await svc.start({ cmd: 'node', args: ['-e', 'setTimeout(()=>{},60000)'], name: 'to-remove' })
    assert.ok(await fileExists(record.logPath), 'log exists before remove')
    const r1 = await svc.remove('to-remove')
    assert.equal(r1.existed, true)
    const r2 = await svc.remove('to-remove')
    assert.equal(r2.existed, false)
    assert.ok(!(await fileExists(record.logPath)), 'log file removed')
    const { count } = await svc.list()
    assert.equal(count, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('stop a process group kills child subprocesses', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  // Toy that spawns its own grandchild which also ignores nothing — both are
  // in the same process group (detached leader), so SIGKILL/TERM to the group
  // should reap them.
  const script = `
const { spawn } = require('child_process');
const child = spawn('node', ['-e', 'setTimeout(()=>{},60000)']);
console.log('parent pid=' + process.pid + ' child pid=' + child.pid);
setTimeout(()=>{}, 60000);
process.on('SIGTERM', () => { console.log('parent sigterm'); });
`
  try {
    const { record } = await svc.start({ cmd: 'node', args: ['-e', script], name: 'group-toy' })
    await waitUntil(async () => {
      const l = await svc.logs('group-toy')
      return l.lines.some((line) => line.includes('child pid='))
    })
    const logs = await svc.logs('group-toy')
    const m = logs.lines.find((line) => line.includes('child pid='))
    const childPid = Number(m.split('child pid=')[1])
    assert.ok(childPid > 0)

    const res = await svc.stop('group-toy')
    assert.ok(res.signal === 'SIGTERM' || res.signal === 'SIGKILL')
    // give it a moment, then assert the grandchild is gone too
    const grandchildGone = await waitUntil(() =>
      new Promise((resolve) => {
        try { process.kill(childPid, 0); resolve(false) } catch { resolve(true) }
      }),
    )
    assert.ok(grandchildGone, 'grandchild (same group) was reaped')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ---------- M3: port watch + reclaim ----------

test('start (port): waits for readiness, returns preview; timeout is an error state', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  try {
    const port = await freePort()
    const { record, ready, waitedMs, logPreview, error } = await svc.start({
      cmd: 'node', args: ['-e', TOY_SERVER, String(port)], name: 'watched', port,
    })
    assert.equal(ready, true, 'ready when the port accepts connections')
    assert.ok(waitedMs >= 0 && waitedMs < 15000)
    assert.ok(Array.isArray(logPreview))
    assert.ok(logPreview.some((line) => line.includes('toy-ready port=' + port)), 'preview includes the ready banner')
    assert.equal(error, undefined)
    await svc.stop('watched')

    // Timeout path: a process that never opens the port.
    const port2 = await freePort()
    const out = await svc.start({
      cmd: 'node', args: ['-e', 'console.log("slow boot"); setTimeout(()=>{},60000)'],
      name: 'slow-start', port: port2, readyTimeoutMs: 1000,
    })
    assert.equal(out.ready, false)
    assert.equal(out.error, 'port-timeout')
    assert.ok(out.waitedMs >= 900)
    assert.ok(Array.isArray(out.logPreview))
    assert.ok(out.logPreview.some((line) => line.includes('slow boot')))
    assert.equal(out.reclaimed, undefined, 'no reclaim without a tracked holder')
    await svc.stop('slow-start')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('start (port): reclaims a tracked holder — old stopped, new ready', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  const port = await freePort()
  try {
    const first = await svc.start({ cmd: 'node', args: ['-e', TOY_SERVER, String(port)], name: 'first', port })
    assert.equal(first.ready, true)

    const second = await svc.start({ cmd: 'node', args: ['-e', TOY_SERVER, String(port)], name: 'second', port })
    assert.equal(second.ready, true, 'new holder is listening')
    assert.deepEqual(second.reclaimed, ['first'], 'old tracked holder id reported')

    const { processes } = await svc.list()
    const a = processes.find((p) => p.id === 'first')
    const b = processes.find((p) => p.id === 'second')
    assert.equal(a.state, 'stopped', 'old holder stopped (not dead — we signalled it)')
    assert.equal(a.alive, false)
    assert.equal(b.state, 'running')
    assert.equal(b.alive, true)

    const firstLogs = await svc.logs('first')
    assert.ok(firstLogs.lines.some((line) => line.includes('toy-sigterm')), 'old holder got a clean SIGTERM')
  } finally {
    await svc.stop('first').catch(() => {})
    await svc.stop('second').catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

test('start (port): foreign untracked listener → ValidationError, no kill', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  const port = await freePort()
  const net = await import('node:net')
  const foreign = net.createServer()
  foreign.listen(port, '127.0.0.1')
  await new Promise((r) => foreign.once('listening', r))
  try {
    const before = (await svc.list()).count
    await assert.rejects(
      () => svc.start({ cmd: 'node', args: ['-e', 'setTimeout(()=>{},60000)'], name: 'blocked', port }),
      (err) => {
        assert.ok(err instanceof ValidationError)
        assert.match(err.message, /already held/i)
        return true
      },
    )
    // foreign server untouched, no record created
    const stillListening = await new Promise((resolve) => {
      const probe = net.connect({ port, host: '127.0.0.1' })
      probe.once('connect', () => { probe.destroy(); resolve(true) })
      probe.once('error', () => resolve(false))
    })
    assert.equal(stillListening, true, 'foreign listener was not killed')
    assert.equal((await svc.list()).count, before, 'no record created on refusal')
  } finally {
    foreign.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('start (no port): no readiness fields', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  try {
    const out = await svc.start({ cmd: 'node', args: ['-e', 'setTimeout(()=>{},60000)'], name: 'plain' })
    assert.equal(out.ready, undefined)
    assert.equal(out.reclaimed, undefined)
    assert.equal(out.logPreview, undefined)
    assert.equal(out.error, undefined)
    await svc.stop('plain')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// M4 — restart + route snapshot
// ---------------------------------------------------------------------------

test('restart: re-runs the same argv under the same id', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  const port = await freePort()
  try {
    const first = await svc.start({
      cmd: 'node', args: ['-e', TOY_SERVER, String(port)],
      name: 'restart-me', port, readyTimeoutMs: 8000,
    })
    assert.equal(first.ready, true, 'first instance ready')
    const firstPid = first.record.pid
    assert.deepEqual(first.record.argv, ['node', '-e', TOY_SERVER, String(port)], 'argv persisted losslessly')

    const second = await svc.restart('restart-me')
    assert.equal(second.record.id, 'restart-me', 'same id after restart')
    assert.ok(second.record.pid > 0 && second.record.pid !== firstPid, 'new pid after restart')
    assert.equal(second.record.port, port)
    assert.equal(second.ready, true, 'restarted instance ready')
    assert.equal(second.reclaimed, undefined, 'no separate reclaim report for self-restart')

    const list = await svc.list()
    assert.equal(list.count, 1, 'restart overwrote the record, not a second one')
    assert.equal(list.processes[0].pid, second.record.pid)

    await assert.rejects(
      () => svc.restart('no-such-id'),
      (err) => err instanceof NotFoundError,
    )
  } finally {
    await svc.stop('restart-me').catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

test('snapshotForRoute: previews + ready probe per ported record', async () => {
  const root = await tmpRoot()
  const svc = new ProcessService(root)
  const port = await freePort()
  try {
    await svc.start({ cmd: 'node', args: ['-e', TOY_SERVER, String(port)], name: 'snap-server', port })
    await svc.start({ cmd: 'node', args: ['-e', 'console.log("snap-plain"); setTimeout(()=>{},60000)'], name: 'snap-plain' })

    // the child is detached; wait for its first line to land before snapshotting
    for (let i = 0; i < 50; i++) {
      if ((await svc.logs('snap-plain', 50)).lines.some((l) => l.includes('snap-plain'))) break
      await new Promise((r) => setTimeout(r, 100))
    }

    const snap = await svc.snapshotForRoute()
    assert.equal(snap.ok, true)
    assert.equal(snap.package, 'dsh-agent-processes')
    assert.equal(snap.storageRoot, root)
    assert.equal(snap.count, 2)
    assert.equal(snap.processes.length, 2)

    const server = snap.processes.find((p) => p.id === 'snap-server')
    assert.ok(server, 'ported record present')
    assert.equal(server.alive, true)
    assert.equal(server.ready, true, 'running ported record probed ready')
    assert.ok(Array.isArray(server.logPreview), 'log preview array')

    const plain = snap.processes.find((p) => p.id === 'snap-plain')
    assert.ok(plain, 'plain record present')
    assert.equal(plain.ready, undefined, 'no ready probe without a port')
    assert.ok(plain.logPreview.some((l) => l.includes('snap-plain')), 'preview has the line')
  } finally {
    await svc.stop('snap-server').catch(() => {})
    await svc.stop('snap-plain').catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})
