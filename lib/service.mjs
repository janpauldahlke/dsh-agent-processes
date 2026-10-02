// src/host/service.ts
import { spawn } from "node:child_process";
import { openSync, closeSync, mkdirSync, rmSync } from "node:fs";
import { readFile as readFile2 } from "node:fs/promises";
import { connect } from "node:net";
import { dirname } from "node:path";

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

// src/host/service.ts
var ValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
};
var NotFoundError = class extends Error {
  id;
  constructor(id) {
    super(`no tracked process "${id}"`);
    this.name = "NotFoundError";
    this.id = id;
  }
};
var GRACE_MS = 3e3;
var POLL_MS = 100;
var READY_TIMEOUT_MS = 15e3;
var READY_POLL_MS = 250;
var LOG_PREVIEW_LINES = 20;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = err?.code;
    return code === "EPERM";
  }
}
function signalGroup(pid, sig) {
  try {
    process.kill(-pid, sig);
    return true;
  } catch (err) {
    const code = err?.code;
    if (code === "ESRCH" || code === "EPERM") return false;
    throw err;
  }
}
function slugify(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || `p-${Date.now().toString(36)}`;
}
function portOpen(port) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(750, () => finish(false));
    socket.on("connect", () => finish(true));
    socket.on("error", () => finish(false));
  });
}
var ProcessService = class {
  storageRoot;
  children = /* @__PURE__ */ new Map();
  constructor(storageRoot) {
    this.storageRoot = storageRoot ?? defaultStorageRoot();
  }
  get root() {
    return this.storageRoot;
  }
  get vaultFile() {
    return vaultPath(this.storageRoot);
  }
  getRecord(processes, id) {
    const rec = processes[id];
    if (!rec) throw new NotFoundError(id);
    return rec;
  }
  async start(args, exec) {
    const cmd = args.cmd?.trim();
    if (!cmd) throw new ValidationError("cmd is required");
    if (args.args !== void 0 && !Array.isArray(args.args)) {
      throw new ValidationError("args must be an array of strings");
    }
    const fromArg = args.cwd?.trim();
    const fromSession = exec?.agent?.session?.header?.cwd?.trim();
    const cwd = fromArg || fromSession || process.cwd();
    const port = args.port;
    if (port !== void 0 && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new ValidationError("port must be an integer 1-65535");
    }
    let reclaimed;
    if (port !== void 0) {
      const vault2 = await loadVault(this.vaultFile);
      const holders = Object.values(vault2.processes).filter(
        (rec) => rec.port === port && rec.state === "running" && isAlive(rec.pid)
      );
      if (holders.length > 0) {
        reclaimed = [];
        for (const holder of holders) {
          await this.stop(holder.id);
          reclaimed.push(holder.id);
        }
      }
      if (await portOpen(port)) {
        throw new ValidationError(
          `port ${port} is already held by a process this plugin does not track \u2014 refusing to kill it. Free the port (or stop the holder) and retry; use process_list to see tracked processes`
        );
      }
    }
    const id = args.name?.trim() ? slugify(args.name) : `p-${Date.now().toString(36)}`;
    const log = logFile(this.storageRoot, id);
    mkdirSync(dirname(log), { recursive: true });
    const fd = openSync(log, "a");
    let child;
    try {
      child = spawn(cmd, args.args ?? [], {
        cwd,
        detached: true,
        stdio: ["ignore", fd, fd],
        env: { ...process.env, ...args.env ?? {} }
      });
    } catch (err) {
      closeSync(fd);
      throw err;
    }
    closeSync(fd);
    child.unref();
    this.children.set(id, child);
    child.on("exit", (code) => {
      this.children.delete(id);
      void this.recordExit(id, code ?? null);
    });
    const record = {
      id,
      pid: child.pid ?? -1,
      cmd: [cmd, ...args.args ?? []].join(" "),
      argv: [cmd, ...args.args ?? []],
      cwd,
      ...port !== void 0 ? { port } : {},
      logPath: log,
      startedAt: Date.now(),
      state: "running"
    };
    const vault = await loadVault(this.vaultFile);
    vault.processes[id] = record;
    await saveVault(this.storageRoot, vault);
    if (port !== void 0) {
      const timeout = args.readyTimeoutMs ?? READY_TIMEOUT_MS;
      const started = Date.now();
      let ready = false;
      while (Date.now() - started < timeout) {
        if (await portOpen(port)) {
          ready = true;
          break;
        }
        await sleep(READY_POLL_MS);
      }
      const preview = await this.logs(id, LOG_PREVIEW_LINES);
      return {
        ok: true,
        record,
        ...reclaimed && reclaimed.length > 0 ? { reclaimed } : {},
        ready,
        waitedMs: Date.now() - started,
        logPreview: preview.lines,
        ...!ready ? { error: "port-timeout" } : {}
      };
    }
    return { ok: true, record };
  }
  /** Best-effort exit capture; list() re-derives liveness on read. */
  async recordExit(id, code) {
    try {
      const vault = await loadVault(this.vaultFile);
      const rec = vault.processes[id];
      if (!rec) return;
      if (rec.state === "running") rec.state = "dead";
      rec.exitCode = code;
      rec.stoppedAt = rec.stoppedAt ?? Date.now();
      await saveVault(this.storageRoot, vault);
    } catch {
    }
  }
  async stop(id) {
    const vault = await loadVault(this.vaultFile);
    const rec = this.getRecord(vault.processes, id);
    const started = Date.now();
    let signal = "none";
    if (rec.state === "running" && isAlive(rec.pid)) {
      signalGroup(rec.pid, "SIGTERM");
      signal = "SIGTERM";
      let waited = 0;
      while (waited < GRACE_MS && isAlive(rec.pid)) {
        await sleep(POLL_MS);
        waited += POLL_MS;
      }
      if (isAlive(rec.pid)) {
        signalGroup(rec.pid, "SIGKILL");
        signal = "SIGKILL";
        await sleep(POLL_MS);
      }
    }
    rec.state = "stopped";
    rec.stoppedAt = Date.now();
    await saveVault(this.storageRoot, vault);
    this.children.delete(id);
    return {
      ok: true,
      id,
      pid: rec.pid,
      signal,
      graceMs: GRACE_MS,
      elapsedMs: Date.now() - started,
      state: rec.state
    };
  }
  /**
   * UI Restart: stop the current holder (if alive) and re-run the exact
   * recorded argv under the same id, so the card keeps its identity.
   */
  async restart(id, exec) {
    const vault = await loadVault(this.vaultFile);
    const rec = this.getRecord(vault.processes, id);
    if (rec.state === "running" && isAlive(rec.pid)) {
      await this.stop(id);
    }
    if (!rec.argv || rec.argv.length === 0) {
      throw new ValidationError(`process "${id}" has no stored argv to restart`);
    }
    const [cmd, ...args] = rec.argv;
    return await this.start({
      cmd,
      ...args.length > 0 ? { args } : {},
      cwd: rec.cwd,
      ...rec.port !== void 0 ? { port: rec.port } : {},
      name: id
    }, exec);
  }
  /**
   * Route snapshot for the Processes pane / dock chip (PLAN §8.3): every
   * record with a live liveness check, a short log preview, and — for
   * running records with a port — a TCP connect probe so the client can
   * tell "starting" from "healthy" without its own probe.
   */
  async snapshotForRoute() {
    const base = await this.list();
    const processes = await Promise.all(
      base.processes.map(async (view) => {
        let preview = [];
        try {
          const res = await this.logs(view.id, LOG_PREVIEW_LINES);
          preview = res.lines;
        } catch {
        }
        const ready = view.alive && view.port !== void 0 ? await portOpen(view.port) : void 0;
        return { ...view, logPreview: preview, ...ready !== void 0 ? { ready } : {} };
      })
    );
    return {
      ok: true,
      package: "dsh-agent-processes",
      version: "1.0.0",
      storageRoot: base.storageRoot,
      count: processes.length,
      processes
    };
  }
  async list() {
    const vault = await loadVault(this.vaultFile);
    const processes = [];
    let changed = false;
    for (const rec of Object.values(vault.processes)) {
      const alive = rec.state === "running" && isAlive(rec.pid);
      if (!alive && rec.state === "running") {
        rec.state = "dead";
        rec.stoppedAt = rec.stoppedAt ?? Date.now();
        changed = true;
      }
      processes.push({ ...rec, alive });
    }
    if (changed) await saveVault(this.storageRoot, vault);
    processes.sort((a, b) => b.startedAt - a.startedAt);
    return { ok: true, storageRoot: this.storageRoot, count: processes.length, processes };
  }
  async logs(id, lines = 200) {
    const vault = await loadVault(this.vaultFile);
    const rec = this.getRecord(vault.processes, id);
    const n = Math.max(1, Math.floor(lines));
    let raw = "";
    try {
      raw = await readFile2(rec.logPath, "utf8");
    } catch (err) {
      const code = err?.code;
      if (code !== "ENOENT") throw err;
    }
    const all = raw.length === 0 ? [] : raw.split("\n");
    if (all.length > 0 && all[all.length - 1] === "") all.pop();
    const tail = all.slice(-n);
    return {
      ok: true,
      id,
      logPath: rec.logPath,
      lines: tail,
      totalLines: all.length,
      truncated: all.length > n
    };
  }
  async waitReady(id, timeoutMs = 15e3, pollMs = 250) {
    const vault = await loadVault(this.vaultFile);
    const rec = this.getRecord(vault.processes, id);
    if (rec.port === void 0) throw new ValidationError(`process "${id}" has no port to wait on`);
    const port = rec.port;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await portOpen(port)) {
        return { ok: true, id, ready: true, port, waitedMs: Date.now() - started };
      }
      await sleep(pollMs);
    }
    return {
      ok: true,
      id,
      ready: false,
      port,
      waitedMs: Date.now() - started,
      error: "timeout"
    };
  }
  /** Remove a record and (best-effort) its log file. */
  async remove(id) {
    const vault = await loadVault(this.vaultFile);
    const existed = Boolean(vault.processes[id]);
    if (existed) {
      delete vault.processes[id];
      await saveVault(this.storageRoot, vault);
      try {
        rmSync(logFile(this.storageRoot, id), { force: true });
      } catch {
      }
    }
    this.children.delete(id);
    return { ok: true, id, existed };
  }
};
export {
  NotFoundError,
  ProcessService,
  ValidationError
};
//# sourceMappingURL=service.mjs.map
