import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as CursorMcpConfig from "./CursorMcpConfig.ts";

it.effect("edits ~/.cursor/mcp.json without losing what it does not model", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-cursor-mcp-" });
    const configPath = path.join(home, ".cursor", "mcp.json");
    yield* fileSystem.makeDirectory(path.dirname(configPath), { recursive: true });
    const config = yield* CursorMcpConfig.make.pipe(
      Effect.provideService(HostProcess.HomeDirectory, home),
    );

    yield* fileSystem.writeFileString(configPath, "{ not json");
    const error = yield* Effect.flip(config.upsert({ name: "a", config: { url: "https://a" } }));
    assert.equal(error._tag, "McpConfigError");
    assert.equal(yield* fileSystem.readFileString(configPath), "{ not json");

    yield* fileSystem.writeFileString(
      configPath,
      JSON.stringify({
        other: true,
        mcpServers: { a: { url: "https://old", disabled: true }, weird: { transport: 1 } },
      }),
    );
    const listed = yield* config.upsert({
      name: "a",
      config: { command: "npx", args: ["srv"], env: { KEY: "v" } },
    });
    assert.deepEqual(listed.servers, [
      { name: "a", config: { command: "npx", args: ["srv"], env: { KEY: "v" } } },
      { name: "weird", config: null },
    ]);
    assert.deepEqual(JSON.parse(yield* fileSystem.readFileString(configPath)), {
      other: true,
      mcpServers: {
        a: { disabled: true, command: "npx", args: ["srv"], env: { KEY: "v" } },
        weird: { transport: 1 },
      },
    });

    assert.deepEqual((yield* config.remove("a")).servers, [{ name: "weird", config: null }]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
