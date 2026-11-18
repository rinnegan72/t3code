import {
  McpConfigError,
  type McpConfigListResult,
  McpServerConfig,
  type McpServerEntry,
} from "@t3tools/contracts";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import { fromJsonStringPretty } from "@t3tools/shared/schemaJson";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

// ponytail: user-scope ~/.cursor/mcp.json only; project .cursor/mcp.json needs a project-root check.
export class CursorMcpConfig extends Context.Service<
  CursorMcpConfig,
  {
    readonly list: Effect.Effect<McpConfigListResult, McpConfigError>;
    readonly upsert: (entry: McpServerEntry) => Effect.Effect<McpConfigListResult, McpConfigError>;
    readonly remove: (name: string) => Effect.Effect<McpConfigListResult, McpConfigError>;
  }
>()("t3/provider/CursorMcpConfig") {}

type RawConfig = Record<string, unknown> & { mcpServers: Record<string, unknown> };
const decodeServer = Schema.decodeUnknownOption(McpServerConfig);
const JsonValue = Schema.fromJsonString(Schema.Unknown);
const decodeJson = Schema.decodeUnknownEffect(JsonValue);
const encodeJson = Schema.encodeEffect(fromJsonStringPretty(Schema.Unknown));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const MODELED_KEYS = new Set(["command", "args", "env", "url", "headers"]);

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const configPath = path.join(yield* HostProcess.HomeDirectory, ".cursor", "mcp.json");
  const lock = yield* Semaphore.make(1);
  const fail = (detail: string) => new McpConfigError({ configPath, detail });

  const read = Effect.gen(function* () {
    const contents = yield* fileSystem.readFileString(configPath).pipe(
      Effect.asSome,
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound" ? Effect.succeedNone : Effect.fail(fail(error.message)),
      }),
    );
    if (Option.isNone(contents) || contents.value.trim() === "") {
      return { mcpServers: {} } satisfies RawConfig;
    }
    // Never overwrite a file we cannot parse: the user would lose every server in it.
    const parsed = yield* decodeJson(contents.value).pipe(
      Effect.mapError(() => fail("the file is not valid JSON; fix it by hand first")),
    );
    if (!isRecord(parsed)) return yield* fail("the file is not a JSON object");
    const servers = parsed.mcpServers ?? {};
    if (!isRecord(servers)) return yield* fail("mcpServers is not an object");
    return { ...parsed, mcpServers: servers } satisfies RawConfig;
  });

  const summarize = (raw: RawConfig): McpConfigListResult => ({
    path: configPath,
    servers: Object.entries(raw.mcpServers).map(([name, value]) => ({
      name,
      config: Option.getOrNull(decodeServer(value)),
    })),
  });

  const update = (change: (servers: Record<string, unknown>) => void) =>
    lock.withPermits(1)(
      Effect.gen(function* () {
        const raw = yield* read;
        change(raw.mcpServers);
        yield* fileSystem
          .makeDirectory(path.dirname(configPath), { recursive: true })
          .pipe(Effect.mapError((error) => fail(error.message)));
        const contents = yield* encodeJson(raw).pipe(
          Effect.mapError((error) => fail(error.message)),
        );
        yield* writeFileStringAtomically({ filePath: configPath, contents: `${contents}\n` }).pipe(
          Effect.mapError((error) => fail(String(error))),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        );
        return summarize(raw);
      }),
    );

  return CursorMcpConfig.of({
    list: read.pipe(Effect.map(summarize)),
    upsert: Effect.fn("CursorMcpConfig.upsert")(function* (entry) {
      return yield* update((servers) => {
        // Keep keys this editor does not model (Cursor-specific options) on an edited entry.
        const previous = servers[entry.name];
        const kept = isRecord(previous)
          ? Object.fromEntries(Object.entries(previous).filter(([key]) => !MODELED_KEYS.has(key)))
          : {};
        servers[entry.name] = { ...kept, ...entry.config };
      });
    }),
    remove: Effect.fn("CursorMcpConfig.remove")(function* (name) {
      return yield* update((servers) => {
        delete servers[name];
      });
    }),
  });
});

export const layer = Layer.effect(CursorMcpConfig, make);
