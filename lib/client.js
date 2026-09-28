window.__ModuleLoader__.load({ id: "dsh-agent-processes", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/ProcessesBody.tsx
var import_react2 = require("react");

// src/client/useProcesses.ts
var import_react = require("react");

// src/client/store.ts
var snapshot = null;
var error = null;
var refs = 0;
var timer;
var cwd = "";
var sessionId = "";
var listeners = /* @__PURE__ */ new Set();
var POLL_MS = 2e3;
var ROUTE = "/api/dsh-agent-processes";
function emit() {
  for (const l of listeners) l();
}
async function tick() {
  try {
    const res = await fetch(ROUTE, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    snapshot = await res.json();
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  emit();
}
function setTrackedCwd(next) {
  if (next === cwd) return;
  cwd = next;
  void tick();
}
function setTrackedSessionId(next) {
  const n = next.trim();
  if (n === sessionId) return;
  sessionId = n;
  void tick();
}
function getTrackedCwd() {
  return cwd;
}
function subscribe(listener) {
  listeners.add(listener);
  refs += 1;
  if (refs === 1) {
    void tick();
    timer = setInterval(() => {
      void tick();
    }, POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    refs -= 1;
    if (refs === 0 && timer !== void 0) {
      clearInterval(timer);
      timer = void 0;
    }
  };
}
function getSnapshot() {
  return snapshot;
}
function getError() {
  return error;
}
async function postAction(action, id) {
  const res = await fetch(ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, id })
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
  }
  if (!res.ok || body.ok === false) {
    throw new Error(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
  }
  await tick();
  return body;
}

// src/client/useProcesses.ts
function detectCwdFallback() {
  try {
    const w = window;
    if (typeof w.__DSH_CWD__ === "string" && w.__DSH_CWD__) return w.__DSH_CWD__;
    if (typeof w.__dsh?.cwd === "string" && w.__dsh.cwd) return w.__dsh.cwd;
  } catch {
  }
  return getTrackedCwd();
}
function useProcesses(sessionCwd, sessionId2) {
  const [, bump] = (0, import_react.useReducer)((n) => n + 1, 0);
  const lastAuto = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    return subscribe(() => bump());
  }, []);
  (0, import_react.useEffect)(() => {
    if (typeof sessionId2 === "string" && sessionId2.trim()) {
      setTrackedSessionId(sessionId2.trim());
    }
  }, [sessionId2]);
  (0, import_react.useEffect)(() => {
    const fromSession = typeof sessionCwd === "string" && sessionCwd.trim() ? sessionCwd.trim() : null;
    const next = fromSession ?? detectCwdFallback();
    if (!next) return;
    if (fromSession && fromSession === lastAuto.current && getTrackedCwd() === fromSession) return;
    if (fromSession) lastAuto.current = fromSession;
    setTrackedCwd(next);
  }, [sessionCwd]);
  return {
    snapshot: getSnapshot(),
    error: getError(),
    cwd: getTrackedCwd(),
    sessionCwd: typeof sessionCwd === "string" && sessionCwd.trim() ? sessionCwd.trim() : null
  };
}

// src/client/paneState.ts
var refs2 = 0;
var listeners2 = /* @__PURE__ */ new Set();
function setPaneOpen(open) {
  const next = open ? refs2 + 1 : Math.max(0, refs2 - 1);
  if (next === refs2) return;
  refs2 = next;
  for (const l of listeners2) l();
}
function isPaneOpen() {
  return refs2 > 0;
}
function subscribePaneOpen(listener) {
  listeners2.add(listener);
  return () => {
    listeners2.delete(listener);
  };
}

// src/client/chipState.ts
var HIDDEN = { hidden: true, label: "", dot: "#8b93a7", dim: true, title: "" };
function toneOf(p) {
  if (p.alive) {
    return p.port !== void 0 && p.ready === false ? "starting" : "healthy";
  }
  return p.state === "dead" ? "crashed" : "stopped";
}
function derive(snap, followedCwd) {
  if (!snap || snap.ok !== true) return null;
  const all = snap.processes;
  const mine = followedCwd ? all.filter((p) => p.cwd === followedCwd) : all;
  const running = mine.filter((p) => p.alive);
  const crashed = mine.filter((p) => !p.alive && p.state === "dead");
  const starting = running.filter((p) => p.port !== void 0 && p.ready === false);
  const healthy = running.filter((p) => !(p.port !== void 0 && p.ready === false));
  const ports = healthy.map((p) => p.port).filter((p) => typeof p === "number");
  return {
    mine,
    others: followedCwd ? all.filter((p) => p.cwd !== followedCwd) : [],
    running,
    crashed,
    starting,
    healthy,
    ports
  };
}
function portList(ports) {
  if (ports.length === 0) return "";
  const shown = ports.slice(0, 3).map((p) => `:${p}`).join(", ");
  return ports.length > 3 ? `${shown} +${ports.length - 3}` : shown;
}
function deriveChip(snap, error2, followedCwd) {
  if (error2) {
    return { hidden: false, label: "\u26A1 processes", dot: "#ef4444", dim: false, title: `Processes route error: ${error2}` };
  }
  if (!snap) return HIDDEN;
  if (snap.ok !== true) {
    return { hidden: false, label: "\u26A1 processes", dot: "#ef4444", dim: false, title: snap.error };
  }
  const model = derive(snap, followedCwd);
  if (!model) return HIDDEN;
  if (model.crashed.length > 0) {
    const ports = model.crashed.map((p) => p.port).filter((p) => typeof p === "number").map((p) => `:${p}`).slice(0, 3).join(", ");
    return {
      hidden: false,
      label: `\u26A0 ${model.crashed.length} crashed${ports ? ` \xB7 ${ports}` : ""}`,
      dot: "#ef4444",
      dim: false,
      title: `Crashed: ${model.crashed.map((p) => p.id).join(", ")}`
    };
  }
  if (model.running.length === 0) return HIDDEN;
  if (model.running.length === 1) {
    const only = model.running[0];
    if (only.port !== void 0 && only.ready === false) {
      return {
        hidden: false,
        label: "\u26A1 starting\u2026",
        dot: "#fbbf24",
        dim: false,
        title: `${only.id} is starting on :${only.port}`
      };
    }
    const port = typeof only.port === "number" ? `:${only.port} \xB7 ` : "";
    return {
      hidden: false,
      label: `\u26A1 ${port}${only.id}`,
      dot: "#22c55e",
      dim: false,
      title: `${only.id} (pid ${only.pid}) \u2014 ${only.cmd}`
    };
  }
  return {
    hidden: false,
    label: `\u26A1 ${model.running.length} running${portList(model.ports) ? ` \xB7 ${portList(model.ports)}` : ""}`,
    dot: model.starting.length > 0 ? "#fbbf24" : "#22c55e",
    dim: false,
    title: `Running: ${model.running.map((p) => p.id).join(", ")}`
  };
}

// src/client/ProcessesBody.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
function useNoopSessions(selector) {
  return selector({ byId: {} });
}
var TONE_DOT = {
  healthy: "#22c55e",
  starting: "#fbbf24",
  crashed: "#ef4444",
  stopped: "#8b93a7"
};
var TONE_LABEL = {
  healthy: "running",
  starting: "starting",
  crashed: "crashed",
  stopped: "stopped"
};
var container = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.5,
  color: "inherit"
};
var card = {
  border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
  borderRadius: 8,
  padding: "10px 12px",
  background: "color-mix(in srgb, currentColor 4%, transparent)"
};
var muted = {
  color: "color-mix(in srgb, currentColor 55%, transparent)",
  fontSize: 12,
  fontFamily: MONO,
  margin: 0,
  overflowWrap: "anywhere"
};
var btn = {
  fontSize: 12,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid color-mix(in srgb, currentColor 22%, transparent)",
  background: "color-mix(in srgb, currentColor 8%, transparent)",
  color: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap"
};
function ageLabel(at) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1e3));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}
function basename(path) {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || path;
}
var COLLAPSED_LINES = 5;
function LogPreview({ lines }) {
  const [expanded, setExpanded] = (0, import_react2.useState)(false);
  if (lines.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...muted, opacity: 0.7 }, children: "(no output yet)" });
  }
  const shown = expanded ? lines : lines.slice(-COLLAPSED_LINES);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 6 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "pre",
      {
        style: {
          margin: 0,
          padding: "6px 8px",
          borderRadius: 6,
          border: "1px solid color-mix(in srgb, currentColor 12%, transparent)",
          background: "color-mix(in srgb, currentColor 3%, transparent)",
          fontFamily: MONO,
          fontSize: 11,
          lineHeight: 1.45,
          maxHeight: expanded ? 260 : 96,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere"
        },
        children: shown.join("\n")
      }
    ),
    lines.length > COLLAPSED_LINES ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        onClick: () => setExpanded((e) => !e),
        style: { ...btn, fontSize: 11, padding: "2px 8px", marginTop: 4 },
        children: expanded ? "collapse" : `show all ${lines.length} lines`
      }
    ) : null
  ] });
}
function ProcessCard({
  view,
  busy,
  onAction
}) {
  const tone = toneOf(view);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "span",
        {
          "aria-hidden": true,
          style: {
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: TONE_DOT[tone],
            display: "inline-block",
            flexShrink: 0,
            boxShadow: view.alive ? `0 0 5px ${TONE_DOT[tone]}` : "none"
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600, overflowWrap: "anywhere" }, children: view.id }),
      typeof view.port === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { ...muted, fontSize: 11 }, children: [
        ":",
        view.port
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { ...muted, fontSize: 11 }, children: [
        TONE_LABEL[tone],
        view.alive ? ` \xB7 pid ${view.pid}` : "",
        " \xB7 ",
        ageLabel(view.startedAt)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          disabled: busy || !view.alive,
          onClick: () => onAction("stop", view.id),
          title: "Stop (SIGTERM \u2192 SIGKILL after 3s)",
          style: { ...btn, opacity: busy || !view.alive ? 0.55 : 1, cursor: busy || !view.alive ? "default" : "pointer" },
          children: "Kill"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          disabled: busy || !view.argv || view.argv.length === 0,
          onClick: () => onAction("restart", view.id),
          title: "Re-run the same command",
          style: { ...btn, opacity: busy || !view.argv || view.argv.length === 0 ? 0.55 : 1, cursor: busy ? "wait" : "pointer" },
          children: "Restart"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          disabled: busy,
          onClick: () => onAction("remove", view.id),
          title: "Remove this record (and its log file)",
          style: { ...btn, opacity: busy ? 0.55 : 1, cursor: busy ? "wait" : "pointer" },
          children: "Clear"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: muted, children: view.cmd }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { ...muted, opacity: 0.8 }, children: basename(view.cwd) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogPreview, { lines: view.logPreview ?? [] })
  ] });
}
function ProcessesBody(props = {}) {
  const { sessionId: sessionId2, useSessions = useNoopSessions } = props;
  const sessionCwd = useSessions((sessions) => {
    if (!sessionId2) return null;
    const cwd3 = sessions.byId[sessionId2]?.cwd;
    return typeof cwd3 === "string" && cwd3.trim() ? cwd3.trim() : null;
  });
  const { snapshot: snapshot2, error: error2, cwd: cwd2 } = useProcesses(sessionCwd, sessionId2);
  const [busyId, setBusyId] = (0, import_react2.useState)(null);
  const [localErr, setLocalErr] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
    setPaneOpen(true);
    return () => setPaneOpen(false);
  }, []);
  const model = derive(snapshot2, cwd2 || null);
  async function onAction(action, id) {
    setBusyId(id);
    setLocalErr(null);
    try {
      await postAction(action, id);
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: container, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600 }, children: "Workspace" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...muted, fontSize: 11 }, children: sessionCwd ? `following chat workspace` : "no chat workspace \u2014 showing all tracked processes" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { ...muted, fontSize: 11 }, children: cwd2 || "(unknown)" }),
      error2 || localErr ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#f87171", fontSize: 12 }, children: error2 || localErr }) : null
    ] }),
    model ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      model.mine.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: card, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...muted }, children: "No tracked processes for this workspace. Start one with the process_start tool and it will appear here." }) }) : model.mine.map((view) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        ProcessCard,
        {
          view,
          busy: busyId === view.id,
          onAction: (a, id) => {
            void onAction(a, id);
          }
        },
        view.id
      )),
      model.others.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...muted, marginBottom: 6, opacity: 0.8 }, children: [
          "Other workspaces (",
          model.others.length,
          ")"
        ] }),
        model.others.map((view) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0",
              borderTop: "1px solid color-mix(in srgb, currentColor 12%, transparent)"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "span",
                {
                  "aria-hidden": true,
                  style: {
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: TONE_DOT[toneOf(view)],
                    display: "inline-block",
                    flexShrink: 0
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600, fontSize: 12 }, children: view.id }),
              typeof view.port === "number" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { ...muted, fontSize: 11 }, children: [
                ":",
                view.port
              ] }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...muted, fontSize: 11 }, children: basename(view.cwd) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  disabled: busyId === view.id || !view.alive,
                  onClick: () => {
                    void onAction("stop", view.id);
                  },
                  style: { ...btn, fontSize: 11, padding: "2px 8px", opacity: busyId === view.id || !view.alive ? 0.55 : 1 },
                  children: "Kill"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  disabled: busyId === view.id,
                  onClick: () => {
                    void onAction("remove", view.id);
                  },
                  style: { ...btn, fontSize: 11, padding: "2px 8px", opacity: busyId === view.id ? 0.55 : 1 },
                  children: "Clear"
                }
              )
            ]
          },
          view.id
        ))
      ] }) : null
    ] }) : !error2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: card, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: muted, children: "Waiting for the first snapshot\u2026" }) }) : null
  ] });
}

// src/client/ProcessesDockChip.tsx
var import_react3 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function useNoopSessions2(selector) {
  return selector({ byId: {} });
}
function ProcessesDockChip(props) {
  const { onOpen, sessionId: sessionId2, useSessions = useNoopSessions2 } = props;
  const sessionCwd = useSessions((sessions) => {
    if (!sessionId2) return null;
    const cwd3 = sessions.byId[sessionId2]?.cwd;
    return typeof cwd3 === "string" && cwd3.trim() ? cwd3.trim() : null;
  });
  const { snapshot: snapshot2, error: error2, cwd: cwd2 } = useProcesses(sessionCwd, sessionId2);
  const [paneOpen, setPaneOpenState] = (0, import_react3.useState)(isPaneOpen);
  (0, import_react3.useEffect)(() => subscribePaneOpen(() => setPaneOpenState(isPaneOpen())), []);
  if (paneOpen) return null;
  const display = deriveChip(snapshot2, error2, cwd2 || null);
  if (display.hidden) return null;
  const glowing = !display.dim && display.dot !== "#8b93a7";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "button",
    {
      type: "button",
      onClick: onOpen,
      title: display.title,
      "aria-label": `Processes: ${display.label}`,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
        padding: "1px 8px",
        borderRadius: 999,
        border: "1px solid color-mix(in srgb, currentColor 22%, transparent)",
        background: "color-mix(in srgb, currentColor 6%, transparent)",
        color: "inherit",
        fontVariantNumeric: "tabular-nums",
        cursor: "pointer",
        opacity: display.dim ? 0.55 : 1,
        transition: "opacity 200ms"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "span",
          {
            "aria-hidden": true,
            style: {
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: display.dot,
              display: "inline-block",
              boxShadow: glowing ? `0 0 5px ${display.dot}` : "none",
              flexShrink: 0
            }
          }
        ),
        display.label
      ]
    }
  );
}

// src/client/ProcessesIcon.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function ProcessesGuideIcon({ size = 26, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { width: size, height: size, className, viewBox: "0 0 28 28", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "path",
    {
      d: "M15.5 3.5 L8 15.5 H13 L12 24.5 L20 12.5 H15 Z",
      stroke: "currentColor",
      strokeWidth: "1.75",
      strokeLinejoin: "round",
      strokeLinecap: "round"
    }
  ) });
}

// src/client/ProcessesTitle.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function useNoopSessions3(selector) {
  return selector({ byId: {} });
}
function ProcessesTitle(props = {}) {
  const { sessionId: sessionId2, useSessions = useNoopSessions3 } = props;
  const sessionCwd = useSessions((sessions) => {
    if (!sessionId2) return null;
    const cwd3 = sessions.byId[sessionId2]?.cwd;
    return typeof cwd3 === "string" && cwd3.trim() ? cwd3.trim() : null;
  });
  const { snapshot: snapshot2, error: error2, cwd: cwd2 } = useProcesses(sessionCwd, sessionId2);
  const chip = deriveChip(snapshot2, error2, cwd2 || null);
  const model = derive(snapshot2, cwd2 || null);
  let color = "#8b93a7";
  let tip = sessionCwd ? `Following workspace ${sessionCwd}` : "Processes \u2014 open a workspace in this chat to scope the list";
  if (error2 || snapshot2 && snapshot2.ok !== true) {
    color = "#ef4444";
    tip = "Processes route error";
  } else if (model) {
    if (model.crashed.length > 0) {
      color = "#ef4444";
      tip = `${model.crashed.length} crashed: ${model.crashed.map((p) => p.id).join(", ")}`;
    } else if (model.running.length > 0) {
      color = model.starting.length > 0 ? "#fbbf24" : "#22c55e";
      tip = chip.label;
    } else {
      tip = model.mine.length > 0 ? "No tracked processes running" : "No tracked processes for this workspace yet";
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "span",
    {
      title: tip,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap"
      },
      children: [
        chip.hidden ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "span",
          {
            "aria-hidden": true,
            style: {
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: chip.dot,
              display: "inline-block"
            }
          }
        ),
        "Processes"
      ]
    }
  );
}

// src/client/index.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var TAB_ID = "dsh-agent-processes";
var TAB_KIND = "agent-processes";
var name = "dsh-agent-processes";
var inject = ["slots", "sidebarRight", "sidebarRightTabs"];
function apply(ctx) {
  const definition = {
    id: TAB_ID,
    kind: TAB_KIND,
    title: () => "Processes",
    guide: [{
      id: "agent-processes",
      order: 260,
      title: () => "Processes",
      description: () => "Tracked local processes: status, logs, kill / restart / clear",
      icon: ProcessesGuideIcon
    }]
  };
  const disposeType = ctx.sidebarRightTabs.register(definition);
  const disposeBody = ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register(
    { name: "sidebar.right.pane.tab", key: TAB_ID },
    ProcessesBody
  ));
  const disposeTitle = ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register(
    { name: "sidebar.right.pane.tab.title", key: TAB_ID },
    ProcessesTitle
  ));
  const ProcessesDockSeat = (props) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    ProcessesDockChip,
    {
      sessionId: typeof props.sessionId === "string" ? props.sessionId : void 0,
      useSessions: typeof props.useSessions === "function" ? props.useSessions : void 0,
      onOpen: () => ctx.sidebarRight.openTab(TAB_KIND)
    }
  );
  const disposeDock = ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register(
    { name: "conversation.composer.dock", id: "agent-processes", order: -8 },
    ProcessesDockSeat
  ));
  ctx.effect(() => () => {
    disposeDock();
    disposeTitle();
    disposeBody();
    disposeType();
  }, "agent-processes: rightbar tab type");
}
return module.exports; } });
//# sourceMappingURL=client.js.map
