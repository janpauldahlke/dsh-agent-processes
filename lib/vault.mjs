// src/host/vault.ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
function defaultStorageRoot() {
  return join(homedir(), ".dsh", "storages", "dsh-agent-processes");
}
function vaultPath(storageRoot) {
  return join(storageRoot, "processes.json");
}
function logFile(storageRoot, id) {
  return join(storageRoot, "logs", `${id}.log`);
}
var CorruptVaultError = class extends Error {
  path;
  constructor(path, cause) {
    super(`corrupt process vault JSON at ${path}`);
    this.name = "CorruptVaultError";
    this.path = path;
    if (cause !== void 0) this.cause = cause;
  }
};
function emptyVault() {
  return { version: 1, updatedAt: 0, processes: {} };
}
async function loadVault(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    const code = err?.code;
    if (code === "ENOENT") return emptyVault();
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new CorruptVaultError(path, cause);
  }
  const vault = normalizeVault(parsed);
  if (vault === null) throw new CorruptVaultError(path);
  return vault;
}
function normalizeVault(value) {
  if (typeof value !== "object" || value === null) return null;
  const v = value;
  if (typeof v.processes !== "object" || v.processes === null) return null;
  const processes = {};
  for (const [k, rec] of Object.entries(v.processes)) {
    if (typeof rec !== "object" || rec === null) continue;
    processes[k] = rec;
  }
  return { version: 1, updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0, processes };
}
async function saveVault(storageRoot, vault) {
  const path = vaultPath(storageRoot);
  await mkdir(storageRoot, { recursive: true });
  const next = { version: 1, updatedAt: Date.now(), processes: vault.processes };
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const body = `${JSON.stringify(next, null, 2)}
`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, path);
  return next;
}
export {
  CorruptVaultError,
  defaultStorageRoot,
  emptyVault,
  loadVault,
  logFile,
  saveVault,
  vaultPath
};
//# sourceMappingURL=vault.mjs.map
