// Unified cache facade. Every layer is keyed by a stable hash and stored
// inside .quantum/cache/. Selective purge via `quantum cache clear`.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPaths } from "../config.ts";

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function taskKey(parts: Record<string, unknown>): string {
  return sha256(JSON.stringify(parts, Object.keys(parts).sort()));
}

export function readTask<T>(key: string): T | null {
  const file = join(getPaths().tasks, `${key}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function writeTask<T>(key: string, value: T): void {
  const file = join(getPaths().tasks, `${key}.json`);
  writeFileSync(file, JSON.stringify(value));
}

export interface CacheStatus {
  layer: string;
  bytes: number;
  entries: number;
}

export function status(): CacheStatus[] {
  const p = getPaths();
  const entries: CacheStatus[] = [];
  for (const [name, dir] of Object.entries({
    tasks: p.tasks,
    http: p.http,
    skills: p.skillsIndex,
  })) {
    if (!existsSync(dir)) {
      entries.push({ layer: name, bytes: 0, entries: 0 });
      continue;
    }
    let bytes = 0;
    let count = 0;
    for (const f of readdirSync(dir)) {
      const stat = statSync(join(dir, f));
      bytes += stat.size;
      count += 1;
    }
    entries.push({ layer: name, bytes, entries: count });
  }
  for (const f of ["llmCache", "embeddings", "blackboard"] as const) {
    const file = p[f];
    entries.push({
      layer: f,
      bytes: existsSync(file) ? statSync(file).size : 0,
      entries: existsSync(file) ? 1 : 0,
    });
  }
  return entries;
}

export function clear(layer?: string): void {
  const p = getPaths();
  const layers: Record<string, string> = {
    tasks: p.tasks,
    http: p.http,
    skills: p.skillsIndex,
    llm: p.llmCache,
    embeddings: p.embeddings,
  };
  const targets = (layer ? [layers[layer]] : Object.values(layers)).filter(
    (d): d is string => typeof d === "string" && d.length > 0,
  );
  for (const dir of targets) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}
