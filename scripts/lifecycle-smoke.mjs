/**
 * Shippable lifecycle smoke (no harness / no dsh web required).
 *
 * Proves ProcessService end-to-end against a temp vault:
 *   ping-shape → start toy on free port → wait_ready → list/logs → stop
 *   reclaim tracked holder · refuse foreign PID (untouched)
 *
 * Run:  node scripts/lifecycle-smoke.mjs
 * Prefer: npm run smoke
 *
 * Optional evidence dir: AGENT_EVIDENCE=agent/evidence/publish
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, connect } from 'node:net'
import { ProcessService, ValidationError } from '../lib/service.mjs'

const lines = []
function log(msg) {
  console.log(msg)
  lines.push(msg)
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function toy(tag) {
  return `
const http = require('http');
const port = Number(process.argv[1]);
console.log('${tag}-start port=' + port);
const server = http.createServer((req, res) => {
  res.writeHead(200, {'content-type':'text/plain'});
  res.end('${tag} ok');
});
server.listen(port, '127.0.0.1', () => console.log('${tag}-ready port=' + port));
process.on('SIGTERM', () => {
  console.log('${tag}-sigterm');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 400).unref();
});
`
}

async function portAccepts(port) {
  return await new Promise((resolve) => {
    const probe = connect({ port, host: '127.0.0.1' })
    probe.once('connect', () => {
      probe.destroy()
      resolve(true)
    })
    probe.once('error', () => resolve(false))
  })
}

const root = await mkdtemp(join(tmpdir(), 'dsh-agent-processes-smoke-'))
const toyCwd = await mkdtemp(join(tmpdir(), 'dsh-agent-proc-toy-'))
const svc = new ProcessService(root)
const port = await freePort()
const startedAt = new Date().toISOString()

log(`lifecycle-smoke start ${startedAt}`)
log(`vault=${root}`)
log(`port=${port}`)

try {
  // --- 1. start → ready ----------------------------------------------------
  const first = await svc.start({
    cmd: 'node',
    args: ['-e', toy('pub-a'), String(port)],
    cwd: toyCwd,
    name: 'pub-first',
    port,
  })
  assert.equal(first.ready, true, 'first ready')
  assert.ok(first.record?.pid > 0)
  assert.ok(first.logPreview.some((l) => l.includes('pub-a-ready')))
  log(`ok 1 - start+ready id=${first.record.id} pid=${first.record.pid} waitedMs=${first.waitedMs}`)

  // --- 2. wait_ready / list / logs ----------------------------------------
  const waited = await svc.waitReady(first.record.id, 3000)
  assert.equal(waited.ok, true)
  assert.equal(waited.ready, true)
  const listed = await svc.list()
  assert.ok(listed.processes.some((p) => p.id === first.record.id && p.alive))
  const logs = await svc.logs(first.record.id, 20)
  assert.ok(logs.lines.some((l) => l.includes('pub-a-ready')))
  log(`ok 2 - wait_ready+list+logs count=${listed.count} logLines=${logs.lines.length}`)

  // --- 3. reclaim tracked holder ------------------------------------------
  const second = await svc.start({
    cmd: 'node',
    args: ['-e', toy('pub-b'), String(port)],
    cwd: toyCwd,
    name: 'pub-second',
    port,
  })
  assert.equal(second.ready, true)
  assert.deepEqual(second.reclaimed, [first.record.id])
  const afterReclaim = await svc.list()
  const a = afterReclaim.processes.find((p) => p.id === first.record.id)
  const b = afterReclaim.processes.find((p) => p.id === second.record.id)
  assert.equal(a.state, 'stopped')
  assert.equal(a.alive, false)
  assert.equal(b.state, 'running')
  assert.equal(b.alive, true)
  const firstLogs = await svc.logs(first.record.id, 50)
  assert.ok(firstLogs.lines.some((l) => l.includes('pub-a-sigterm')))
  log(`ok 3 - reclaim reclaimed=${JSON.stringify(second.reclaimed)} newPid=${second.record.pid}`)

  // --- 4. stop -------------------------------------------------------------
  const stopped = await svc.stop(second.record.id)
  assert.equal(stopped.state, 'stopped')
  assert.equal(await portAccepts(port), false, 'port free after stop')
  log(`ok 4 - stop signal=${stopped.signal} waitedMs=${stopped.waitedMs}`)

  // --- 5. foreign refuse ---------------------------------------------------
  const foreign = createServer()
  await new Promise((resolve, reject) => {
    foreign.once('error', reject)
    foreign.listen(port, '127.0.0.1', resolve)
  })
  let refused = false
  try {
    await svc.start({
      cmd: 'node',
      args: ['-e', 'setTimeout(()=>{},60000)'],
      cwd: toyCwd,
      name: 'pub-foreign',
      port,
    })
  } catch (err) {
    refused = true
    assert.ok(err instanceof ValidationError)
    assert.match(err.message, /already held/i, err.message)
  }
  assert.ok(refused, 'foreign start must throw')
  assert.equal(await portAccepts(port), true, 'foreign untouched')
  assert.ok(!(await svc.list()).processes.some((p) => p.id === 'pub-foreign'))
  foreign.close()
  log('ok 5 - foreign refused, not killed, no record')

  log('\nLIFECYCLE SMOKE PASS')
} finally {
  try {
    for (const p of (await svc.list()).processes) {
      try {
        await svc.stop(p.id)
      } catch {
        /* ignore */
      }
      try {
        await svc.remove(p.id)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  await rm(root, { recursive: true, force: true }).catch(() => {})
  await rm(toyCwd, { recursive: true, force: true }).catch(() => {})
}

const evidenceDir = process.env.AGENT_EVIDENCE || join('agent', 'evidence', 'publish')
try {
  await mkdir(evidenceDir, { recursive: true })
  const out = join(evidenceDir, 'lifecycle-smoke.txt')
  await writeFile(out, lines.join('\n') + '\n', 'utf8')
  console.log(`evidence → ${out}`)
} catch (err) {
  console.warn(`evidence write skipped: ${err.message}`)
}
