import {
  AuthSettingsWriteScope,
  type McpConfigListResult,
  type McpServerConfig,
} from "@t3tools/contracts";
import {
  type AtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useGT } from "gt-react";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useStableCallback } from "~/hooks/useStableCallback";

import { serverEnvironment } from "~/state/server";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import {
  formatMcpServerForm,
  type McpServerForm,
  parseMcpServerForm,
} from "./McpServersSettings.logic";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingsRow, SettingsSection } from "./settingsLayout";

type Editing = { readonly originalName: string | null; readonly name: string } & McpServerForm;

const summary = (config: McpServerConfig) =>
  "url" in config ? config.url : [config.command, ...(config.args ?? [])].join(" ");

export function McpServersSettings() {
  const gt = useGT();
  const { environment } = useSettingsScope();
  const connected =
    environment?.connection.phase === "connected" && environment.serverConfig !== null;
  const environmentId = connected ? environment.environmentId : null;
  const canManage = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const list = useStableCallback(
    useAtomCommand(serverEnvironment.listMcpConfig, { reportFailure: false }),
  );
  const upsert = useAtomCommand(serverEnvironment.upsertMcpServer, { reportFailure: false });
  const remove = useAtomCommand(serverEnvironment.removeMcpServer, { reportFailure: false });
  const [config, setConfig] = useState<McpConfigListResult | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const apply = (result: AtomCommandResult<McpConfigListResult, unknown>) => {
    if (result._tag === "Success") {
      setConfig(result.value);
      return true;
    }
    toastManager.add({
      type: "error",
      title: gt("Could not update MCP servers"),
      description: String(squashAtomCommandFailure(result)),
    });
    return false;
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads the environment's MCP config from the server when the selected environment changes
  useEffect(() => {
    if (environmentId === null || !canManage) return;
    let current = true;
    void list({ environmentId, input: {} }).then((result) => {
      if (current && result._tag === "Success") setConfig(result.value);
    });
    return () => {
      current = false;
    };
  }, [environmentId, canManage, list]);

  if (environmentId === null || !canManage) return null;

  const save = async () => {
    if (!editing) return;
    const parsed = parseMcpServerForm(editing);
    const name = editing.name.trim();
    if (!parsed || !/^[A-Za-z0-9._-]+$/.test(name)) {
      toastManager.add({
        type: "error",
        title: gt("Enter a name (letters, numbers, . _ -) and a command or URL"),
      });
      return;
    }
    if (!apply(await upsert({ environmentId, input: { name, config: parsed } }))) return;
    if (editing.originalName && editing.originalName !== name) {
      apply(await remove({ environmentId, input: { name: editing.originalName } }));
    }
    setEditing(null);
  };

  return (
    <SettingsSection
      id="mcp-servers"
      title={gt("MCP servers (Cursor)")}
      headerAction={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={editing !== null}
          onClick={() => setEditing({ originalName: null, name: "", target: "", variables: "" })}
        >
          <PlusIcon aria-hidden className="size-4" />
          {gt("Add server")}
        </Button>
      }
    >
      {editing ? (
        <form
          className="flex flex-col gap-2 px-3 py-3 sm:px-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            aria-label={gt("Name")}
            placeholder={gt("Name")}
            value={editing.name}
            onChange={(event) => setEditing({ ...editing, name: event.target.value })}
          />
          <Input
            aria-label={gt("Command or URL")}
            placeholder={gt("npx -y @scope/server or https://mcp.example.com/mcp")}
            value={editing.target}
            onChange={(event) => setEditing({ ...editing, target: event.target.value })}
          />
          <Textarea
            aria-label={gt("Environment variables or headers")}
            placeholder={gt("KEY=value, one per line (env for commands, headers for URLs)")}
            value={editing.variables}
            onChange={(event) => setEditing({ ...editing, variables: event.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
              {gt("Cancel")}
            </Button>
            <Button type="submit" size="sm">
              {gt("Save")}
            </Button>
          </div>
        </form>
      ) : null}
      {config?.servers.map((server) => (
        <SettingsRow
          key={server.name}
          title={server.name}
          description={
            server.config
              ? summary(server.config)
              : gt("Uses options this editor does not support. Edit {path} directly.", {
                  path: config.path,
                })
          }
          control={
            <div className="flex gap-1">
              {server.config ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={editing !== null}
                  onClick={() =>
                    server.config &&
                    setEditing({
                      originalName: server.name,
                      name: server.name,
                      ...formatMcpServerForm(server.config),
                    })
                  }
                >
                  {gt("Edit")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost-destructive"
                size="sm"
                onClick={() =>
                  void remove({ environmentId, input: { name: server.name } }).then(apply)
                }
              >
                {gt("Remove")}
              </Button>
            </div>
          }
        />
      ))}
      {config && config.servers.length === 0 && !editing ? (
        <p className="px-3 py-3 text-sm text-muted-foreground sm:px-4">
          {gt("No servers in {path}.", { path: config.path })}
        </p>
      ) : null}
    </SettingsSection>
  );
}
