// Quantum config — paths and per-user settings.

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface QuantumPaths {
  root: string;
  cache: string;
  audit: string;
  blackboard: string;
  llmCache: string;
  embeddings: string;
  http: string;
  tasks: string;
  skillsIndex: string;
}

export function getPaths(cwd: string = process.cwd()): QuantumPaths {
  const root = process.env.QUANTUM_HOME ?? resolve(cwd, ".quantum");
  const cache = join(root, "cache");
  const paths: QuantumPaths = {
    root,
    cache,
    audit: join(root, "audit.log"),
    blackboard: join(root, "blackboard.db"),
    llmCache: join(cache, "llm.db"),
    embeddings: join(cache, "embeddings.db"),
    http: join(cache, "http"),
    tasks: join(cache, "tasks"),
    skillsIndex: join(cache, "skills"),
  };
  for (const dir of [root, cache, paths.http, paths.tasks, paths.skillsIndex]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  return paths;
}

export const DEFAULT_MODEL = "claude-opus-4-7";
export const FAST_MODEL = "claude-haiku-4-5";
export const MID_MODEL = "claude-sonnet-4-6";

export function userHome(): string {
  return process.env.HOME ?? homedir();
}
