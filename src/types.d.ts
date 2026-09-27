/**
 * Ambient type shims for the harness host/client packages.
 *
 * Out-of-tree plugins reference host types via type-only imports that only
 * resolve inside the real harness. Declaring a minimal surface here lets
 * `tsc --noEmit` type-check our own code (esbuild erases these type imports).
 * Mirrors the dsh-local-long-horizon baseline (which relies on the host at
 * build time); this shim just keeps the local typecheck honest.
 */
declare module '@deepseek-ai/cordis' {
  export interface Context {
    tools: {
      register: (def: Record<string, unknown>) => () => void
    }
    effect: (dispose: () => void, tag?: string) => void
    inject: (deps: string[], fn: (ctx: Context) => void) => void
    [key: string]: unknown
  }
}

declare module '@deepseek-ai/dsh-host-webserver' {
  export interface WebServerContext {
    webServer: {
      register: (route: Record<string, unknown>) => () => void
    }
    effect: (dispose: () => void, tag?: string) => void
    [key: string]: unknown
  }
}
