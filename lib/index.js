// src/host/index.ts
var name = "dsh-agent-processes";
var inject = ["tools"];
var VERSION = "0.1.0";
function apply(ctx) {
  const tools = ctx.tools;
  const disposePing = tools.register({
    name: "process_ping",
    description: "Health probe for the dsh-agent-processes host service.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ok", "package", "version", "at"],
        properties: {
          ok: { type: "boolean" },
          package: { type: "string" },
          version: { type: "string" },
          at: { type: "integer" }
        }
      },
      render: (_a, v) => [{ type: "text", text: JSON.stringify(v) }]
    },
    async execute() {
      return {
        ok: true,
        package: name,
        version: VERSION,
        at: Date.now()
      };
    }
  });
  ctx.effect(() => {
    disposePing();
  }, "agent-processes: tools");
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
