import { describe, expect, it } from "vite-plus/test";

import { terminalDiffCommand, terminalEditorCommand } from "./terminalEditor";

describe("terminalEditorCommand", () => {
  it.each([
    [{ cwd: "/repo/a b.ts", position: { line: 12 } }, "exec nvim +12 -- '/repo/a b.ts'"],
    [{ cwd: "/repo/x.ts:7:3" }, "exec nvim +7 -- '/repo/x.ts'"],
    [{ cwd: "/repo/x.ts:7", position: {} }, "exec nvim -- '/repo/x.ts:7'"],
    [
      { cwd: "/repo/it's $(rm -rf ~).ts", position: {} },
      "exec nvim -- '/repo/it'\\''s $(rm -rf ~).ts'",
    ],
  ])("%j", (input, expected) => {
    expect(terminalEditorCommand(input)).toBe(expected);
  });

  it("quotes the checkpoint ref and path for diff review", () => {
    expect(terminalDiffCommand("refs/t3/x", "src/a'b.ts")).toBe(
      "exec git difftool -y -t nvimdiff 'refs/t3/x' -- 'src/a'\\''b.ts'",
    );
  });
});
