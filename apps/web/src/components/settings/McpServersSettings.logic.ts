import type { McpServerConfig } from "@t3tools/contracts";

export interface McpServerForm {
  readonly target: string;
  readonly variables: string;
}

const quoteIfNeeded = (value: string) => (/\s/.test(value) ? `"${value}"` : value);

/** One field holds a URL or a command line; the textarea holds env vars or headers as KEY=VALUE. */
export function formatMcpServerForm(config: McpServerConfig): McpServerForm {
  const variables = "url" in config ? config.headers : config.env;
  return {
    target:
      "url" in config
        ? config.url
        : [config.command, ...(config.args ?? [])].map(quoteIfNeeded).join(" "),
    variables: Object.entries(variables ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  };
}

// ponytail: double quotes group words; escapes and single quotes need the file itself.
export function parseMcpServerForm(form: McpServerForm): McpServerConfig | null {
  const target = form.target.trim();
  const words = [...target.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]!);
  const [first, ...rest] = words;
  if (!first) return null;
  const variables = Object.fromEntries(
    form.variables.split("\n").flatMap((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      return index > 0 && key ? [[key, line.slice(index + 1).trim()]] : [];
    }),
  );
  const hasVariables = Object.keys(variables).length > 0;
  if (/^https?:\/\//i.test(target)) {
    return { url: target, ...(hasVariables ? { headers: variables } : {}) };
  }
  return {
    command: first,
    ...(rest.length > 0 ? { args: rest } : {}),
    ...(hasVariables ? { env: variables } : {}),
  };
}
