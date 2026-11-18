import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

const StringRecord = Schema.Record(Schema.String, Schema.String);

export const McpServerConfig = Schema.Union([
  Schema.Struct({
    command: TrimmedNonEmptyString,
    args: Schema.optionalKey(Schema.Array(Schema.String)),
    env: Schema.optionalKey(StringRecord),
  }),
  Schema.Struct({
    url: TrimmedNonEmptyString,
    headers: Schema.optionalKey(StringRecord),
  }),
]);
export type McpServerConfig = typeof McpServerConfig.Type;

export const McpServerName = TrimmedNonEmptyString.check(
  Schema.isMaxLength(128),
  Schema.isPattern(/^[A-Za-z0-9._-]+$/),
);

export const McpServerEntry = Schema.Struct({ name: McpServerName, config: McpServerConfig });
export type McpServerEntry = typeof McpServerEntry.Type;

export const McpConfigListResult = Schema.Struct({
  path: Schema.String,
  /** `config` is null for entries this editor cannot represent; they stay untouched in the file. */
  servers: Schema.Array(
    Schema.Struct({ name: Schema.String, config: Schema.NullOr(McpServerConfig) }),
  ),
});
export type McpConfigListResult = typeof McpConfigListResult.Type;

export const McpConfigRemoveInput = Schema.Struct({ name: McpServerName });

export class McpConfigError extends Schema.TaggedError<McpConfigError>()("McpConfigError", {
  configPath: Schema.String,
  detail: Schema.String,
}) {
  override get message(): string {
    return `MCP config at ${this.configPath} could not be updated: ${this.detail}`;
  }
}
