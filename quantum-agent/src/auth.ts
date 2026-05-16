// Resolves how Quantum talks to Claude: OAuth (Pro/Max) first, API key fallback,
// mocked transport last so the build can always proceed (one-shot delivery).

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type AuthMode = "oauth" | "api" | "mock";

export interface AuthResult {
  mode: AuthMode;
  env: Record<string, string>;
  notes: string[];
}

export function resolveAuth(processEnv: NodeJS.ProcessEnv = process.env): AuthResult {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(processEnv)) if (typeof v === "string") env[k] = v;
  const notes: string[] = [];

  if (env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { mode: "oauth", env, notes: ["env CLAUDE_CODE_OAUTH_TOKEN present"] };
  }

  try {
    const credsPath = join(homedir(), ".claude", ".credentials.json");
    const raw = readFileSync(credsPath, "utf8");
    const parsed = JSON.parse(raw) as {
      accessToken?: string;
      oauthAccount?: { accessToken?: string };
    };
    const token = parsed.accessToken ?? parsed.oauthAccount?.accessToken;
    if (token) {
      env.CLAUDE_CODE_OAUTH_TOKEN = token;
      return { mode: "oauth", env, notes: [`loaded token from ${credsPath}`] };
    }
    notes.push("credentials.json present but no accessToken");
  } catch (err) {
    notes.push(`no ~/.claude/.credentials.json (${(err as Error).message})`);
  }

  if (env.ANTHROPIC_API_KEY) {
    return { mode: "api", env, notes: [...notes, "falling back to ANTHROPIC_API_KEY"] };
  }

  notes.push("no auth available — using mocked transport");
  notes.push("run `claude setup-token` to enable real calls");
  env.QUANTUM_MOCK = "1";
  return { mode: "mock", env, notes };
}
