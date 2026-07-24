import { execFile, execFileSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

import {
  assertPathInsideWorkspace,
  type WorkspaceValidation,
} from "../domain/workspace.js";

const execFileAsync = promisify(execFile);

export class GitWorkspace {
  validate(rootPath: string): WorkspaceValidation {
    const errors: string[] = [];
    let canonical = resolve(rootPath);
    if (!existsSync(canonical)) {
      return invalidValidation(canonical, "WorkOS path does not exist");
    }
    if (!statSync(canonical).isDirectory()) {
      return invalidValidation(canonical, "WorkOS path must be a directory");
    }
    canonical = realpathSync.native(canonical);
    let gitRoot: string | null = null;
    let branch: string | null = null;
    try {
      gitRoot = realpathSync.native(this.git(canonical, ["rev-parse", "--show-toplevel"]));
      if (gitRoot.toLowerCase() !== canonical.toLowerCase()) {
        errors.push("Configured path must be the Git repository root");
      }
      branch = this.git(canonical, ["branch", "--show-current"]) || null;
    } catch {
      errors.push("Configured path must be a Git repository");
    }
    const hasAgents = existsSync(resolve(canonical, "AGENTS.md"));
    if (!hasAgents) errors.push("WorkOS root must contain AGENTS.md");
    const dirtyPaths = gitRoot ? this.changedPaths(canonical) : [];
    return {
      valid: errors.length === 0,
      rootPath: canonical,
      gitRoot,
      hasAgents,
      branch,
      dirty: dirtyPaths.length > 0,
      dirtyPaths,
      errors,
    };
  }

  async status(rootPath: string): Promise<{
    branch: string | null;
    head: string;
    dirty: boolean;
    dirtyPaths: string[];
  }> {
    const [branch, head, dirtyPaths] = await Promise.all([
      this.gitAsync(rootPath, ["branch", "--show-current"]),
      this.gitAsync(rootPath, ["rev-parse", "HEAD"]),
      Promise.resolve(this.changedPaths(rootPath)),
    ]);
    return { branch: branch || null, head, dirty: dirtyPaths.length > 0, dirtyPaths };
  }

  head(rootPath: string): string {
    return this.git(rootPath, ["rev-parse", "HEAD"]);
  }

  changedPaths(rootPath: string): string[] {
    const output = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
      cwd: rootPath,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      maxBuffer: 2 * 1024 * 1024,
    });
    const entries = output.split("\0").filter(Boolean);
    const paths: string[] = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      const code = entry.slice(0, 2);
      let path = entry.slice(3);
      if (code.includes("R") || code.includes("C")) {
        const next = entries[index + 1];
        if (next) {
          path = next;
          index += 1;
        }
      }
      paths.push(path.replaceAll("\\", "/"));
    }
    return [...new Set(paths)].sort();
  }

  commit(rootPath: string, paths: string[], receiptId: string, summary: string): string {
    if (paths.length === 0) throw new Error("No workspace changes to commit");
    const safePaths = paths.map((path) => assertPathInsideWorkspace(rootPath, path));
    execFileSync("git", ["add", "--", ...safePaths], {
      cwd: rootPath,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      maxBuffer: 2 * 1024 * 1024,
    });
    const subject = cleanCommitSubject(summary);
    execFileSync("git", ["commit", "-m", `workos: ${subject}`, "-m", `Receipt: ${receiptId}`], {
      cwd: rootPath,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      maxBuffer: 2 * 1024 * 1024,
    });
    return this.head(rootPath);
  }

  diffForCommit(rootPath: string, commit: string): string {
    return execFileSync(
      "git",
      ["show", "--format=", "--no-ext-diff", "--unified=3", "--stat", "--patch", commit],
      {
        cwd: rootPath,
        encoding: "utf8",
        windowsHide: true,
        shell: false,
        maxBuffer: 512 * 1024,
      },
    );
  }

  undo(rootPath: string, commit: string): string {
    execFileSync("git", ["revert", "--no-edit", commit], {
      cwd: rootPath,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      maxBuffer: 2 * 1024 * 1024,
    });
    return this.head(rootPath);
  }

  displayName(rootPath: string): string {
    return basename(rootPath);
  }

  private git(rootPath: string, args: string[]): string {
    return execFileSync("git", args, {
      cwd: rootPath,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      maxBuffer: 2 * 1024 * 1024,
    }).trim();
  }

  private async gitAsync(rootPath: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, {
      cwd: rootPath,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout.trim();
  }
}

function invalidValidation(rootPath: string, error: string): WorkspaceValidation {
  return {
    valid: false,
    rootPath,
    gitRoot: null,
    hasAgents: false,
    branch: null,
    dirty: false,
    dirtyPaths: [],
    errors: [error],
  };
}

function cleanCommitSubject(value: string): string {
  const subject = value.replace(/\s+/gu, " ").trim().slice(0, 70);
  return subject || "apply assistant change";
}
