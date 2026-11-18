import { describe, expect, it } from "vite-plus/test";

import { formatMcpServerForm, parseMcpServerForm } from "./McpServersSettings.logic";

describe("MCP server form", () => {
  it.each([
    [
      { target: 'npx -y "my server" --flag', variables: "API_KEY=a=b\n\nnot a pair" },
      { command: "npx", args: ["-y", "my server", "--flag"], env: { API_KEY: "a=b" } },
    ],
    [
      { target: " https://mcp.example.com/sse ", variables: "Authorization=Bearer x" },
      { url: "https://mcp.example.com/sse", headers: { Authorization: "Bearer x" } },
    ],
    [{ target: "   ", variables: "" }, null],
  ])("parses %j", (form, expected) => {
    expect(parseMcpServerForm(form)).toEqual(expected);
  });

  it("round-trips a saved config through the form", () => {
    const config = { command: "uvx", args: ["srv", "a b"], env: { K: "v" } };
    expect(parseMcpServerForm(formatMcpServerForm(config))).toEqual(config);
  });
});
