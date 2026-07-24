import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function createGitWorkspace(root: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), "# Synthetic WorkOS\n\nUse Markdown safely.\n", "utf8");
  writeFileSync(join(root, "README.md"), "# Synthetic workspace\n", "utf8");
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "test.invalid"]);
  git(root, ["config", "user.name", "Personal Ops Test"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "initial"]);
}

export function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  }).trim();
}
