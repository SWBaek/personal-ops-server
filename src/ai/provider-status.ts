import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ProviderStatus {
  id: "codex" | "grok";
  available: boolean;
  version: string | null;
}

export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  return Promise.all([
    checkProvider("codex", ["--version"]),
    checkProvider("grok", ["version"]),
  ]);
}

async function checkProvider(
  id: ProviderStatus["id"],
  args: string[],
): Promise<ProviderStatus> {
  try {
    const { stdout, stderr } = await execFileAsync(id, args, {
      timeout: 3_000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
      shell: false,
    });
    const version = `${stdout}${stderr}`.trim().split(/\r?\n/, 1)[0] || null;
    return { id, available: true, version };
  } catch {
    return { id, available: false, version: null };
  }
}

