import { isTerminalEditor, type LaunchEditorInput } from "@t3tools/contracts";
import type { AtomCommandOptions } from "@t3tools/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";

import { shellEnvironment } from "./state/shell";
import { useAtomCommand } from "./state/use-atom-command";

// Paths can come from agent output, so they are always passed as one literal shell word.
const shellQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

const DIAGNOSTIC_SUFFIX = /^(.*?):(\d+)(?::\d+)?$/;

// ponytail: nvim is the only terminal editor; key this by editor id when a second one lands.
export function terminalEditorCommand(input: Pick<LaunchEditorInput, "cwd" | "position">): string {
  const suffix = input.position ? null : DIAGNOSTIC_SUFFIX.exec(input.cwd);
  const path = suffix?.[1] ?? input.cwd;
  const line = input.position?.line ?? (suffix ? Number(suffix[2]) : undefined);
  // exec: the terminal session ends when nvim quits.
  return `exec nvim ${line ? `+${line} ` : ""}-- ${shellQuote(path)}`;
}

/** Diff review against a git ref (a turn checkpoint) in nvim's side-by-side diff mode. */
export function terminalDiffCommand(ref: string, path: string): string {
  return `exec git difftool -y -t nvimdiff ${shellQuote(ref)} -- ${shellQuote(path)}`;
}

type TerminalRunner = (command: string) => void;
let runner: TerminalRunner | null = null;

/** The active thread view registers how to run a command in a new panel terminal. */
export function registerTerminalEditorRunner(next: TerminalRunner): () => void {
  runner = next;
  return () => {
    if (runner === next) runner = null;
  };
}

export function runInTerminalEditor(command: string): boolean {
  if (!runner) return false;
  runner(command);
  return true;
}

/** Drop-in for the open-in-editor command that runs terminal editors in a T3 terminal. */
export function useOpenInEditorCommand(options?: string | AtomCommandOptions) {
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, options);
  return (value: Parameters<typeof openInEditor>[0]): ReturnType<typeof openInEditor> =>
    isTerminalEditor(value.input.editor) && runInTerminalEditor(terminalEditorCommand(value.input))
      ? Promise.resolve(AsyncResult.success(undefined))
      : openInEditor(value);
}
