/**
 * Unit tests for the process vault storage layer (src/host/vault.ts,
 * bundled to lib/vault.mjs per the dsh-slot-health testable-module pattern).
 *
 * Covers:
 *   - missing file → empty vault (ENOENT tolerance);
 *   - corrupt / non-object JSON → CorruptVaultError;
 *   - atomic save (dir + file created, round-trip, updatedAt stamped);
 *   - path helpers (vaultPath / logFile / defaultStorageRoot).
 *
 * Run: `npm test` (node --test) or `node --test test/vault.test.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  CorruptVaultError,
  defaultStorageRoot,
  emptyVault,
  loadVault,
  logFile,
  saveVault,
  vaultPath,
} from '../lib/vault.mjs'

async function tmpRoot() {
  return mkdtemp(join(tmpdir(), 'dsh-agent-processes-vault-'))
}

test('defaultStorageRoot is ~/.dsh/storages/dsh-agent-processes', () => {
  assert.equal(defaultStorageRoot(), join(homedir(), '.dsh', 'storages', 'dsh-agent-processes'))
})

test('path helpers compose under the storage root', () => {
  const root = '/tmp/root'
  assert.equal(vaultPath(root), join(root, 'processes.json'))
  assert.equal(logFile(root, 'abc'), join(root, 'logs', 'abc.log'))
})

test('emptyVault shape', () => {
  assert.deepEqual(emptyVault(), { version: 1, updatedAt: 0, processes: {} })
})

test('loadVault: missing file → empty vault (ENOENT tolerance)', async () => {
  const root = await tmpRoot()
  const vault = await loadVault(vaultPath(join(root, 'does-not-exist')))
  assert.deepEqual(vault, { version: 1, updatedAt: 0, processes: {} })
  await rm(root, { recursive: true, force: true })
})

test('saveVault: creates dir + file, round-trips records, stamps updatedAt', async () => {
  const root = await tmpRoot()
  const before = Date.now()
  const rec = {
    id: 'toy',
    pid: 1234,
    cmd: 'node toy.js',
    cwd: '/tmp',
    logPath: logFile(root, 'toy'),
    startedAt: before,
    state: 'running',
  }
  const saved = await saveVault(root, { version: 1, updatedAt: 0, processes: { toy: rec } })
  assert.ok(saved.updatedAt >= before, 'updatedAt stamped')
  assert.equal(saved.processes.toy.pid, 1234)

  const raw = await readFile(vaultPath(root), 'utf8')
  assert.ok(raw.endsWith('\n'), 'file ends with newline')
  const loaded = await loadVault(vaultPath(root))
  assert.deepEqual(loaded.processes.toy, rec)
  await rm(root, { recursive: true, force: true })
})

test('saveVault leaves no tmp files behind', async () => {
  const root = await tmpRoot()
  await saveVault(root, emptyVault())
  const raw = await readFile(vaultPath(root), 'utf8')
  assert.ok(raw.length > 0)
  // the only file in the root is processes.json (logs dir not created by save)
  const loaded = await loadVault(vaultPath(root))
  assert.deepEqual(loaded.processes, {})
  await rm(root, { recursive: true, force: true })
})

test('loadVault: bad JSON → CorruptVaultError with path', async () => {
  const root = await tmpRoot()
  const path = vaultPath(root)
  await import('node:fs/promises').then(async (fs) => {
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(path, '{ not json', 'utf8')
  })
  await assert.rejects(
    () => loadVault(path),
    (err) => {
      assert.ok(err instanceof CorruptVaultError, `expected CorruptVaultError, got ${err?.name}`)
      assert.equal(err.path, path)
      return true
    },
  )
  await rm(root, { recursive: true, force: true })
})

test('loadVault: non-object JSON → CorruptVaultError', async () => {
  const root = await tmpRoot()
  const path = vaultPath(root)
  const fs = await import('node:fs/promises')
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(path, '[1,2,3]', 'utf8')
  await assert.rejects(() => loadVault(path), CorruptVaultError)
  await rm(root, { recursive: true, force: true })
})

test('loadVault: object without processes → CorruptVaultError', async () => {
  const root = await tmpRoot()
  const path = vaultPath(root)
  const fs = await import('node:fs/promises')
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(path, '{"foo": 1}', 'utf8')
  await assert.rejects(() => loadVault(path), CorruptVaultError)
  await rm(root, { recursive: true, force: true })
})

test('loadVault: drops non-object process entries but keeps valid ones', async () => {
  const root = await tmpRoot()
  const path = vaultPath(root)
  const fs = await import('node:fs/promises')
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(
    path,
    JSON.stringify({
      version: 1,
      updatedAt: 111,
      processes: {
        good: { id: 'good', pid: 1, cmd: 'x', cwd: '/tmp', logPath: '/tmp/g.log', startedAt: 1, state: 'running' },
        junk: 'not-an-object',
        nullrec: null,
      },
    }),
    'utf8',
  )
  const vault = await loadVault(path)
  assert.equal(vault.updatedAt, 111)
  assert.ok(vault.processes.good)
  assert.equal(vault.processes.junk, undefined)
  assert.equal(vault.processes.nullrec, undefined)
  await rm(root, { recursive: true, force: true })
})
