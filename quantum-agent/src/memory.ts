// Entangled blackboard: SQLite-backed shared state for all subagents,
// plus session/transcript persistence so `quantum chat --resume last` works.
//
// Uses Node 26's built-in `node:sqlite` — no native build step needed.

import { DatabaseSync } from "node:sqlite";
import { getPaths } from "./config.ts";

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  _db = new DatabaseSync(getPaths().blackboard);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ns      TEXT NOT NULL DEFAULT 'default',
      key     TEXT NOT NULL,
      value   TEXT NOT NULL,
      tags    TEXT,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS facts_ns_key ON facts (ns, key);
    CREATE TABLE IF NOT EXISTS sessions (
      id      TEXT PRIMARY KEY,
      label   TEXT,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcripts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created    INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS routing (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      task      TEXT NOT NULL,
      agent     TEXT NOT NULL,
      reason    TEXT,
      created   INTEGER NOT NULL
    );
  `);
  return _db;
}

export function remember(key: string, value: string, ns = "default", tags?: string[]): number {
  const stmt = db().prepare(
    "INSERT INTO facts (ns, key, value, tags, created) VALUES (?, ?, ?, ?, ?)",
  );
  const result = stmt.run(ns, key, value, tags?.join(",") ?? null, Date.now());
  return Number(result.lastInsertRowid);
}

export interface Fact {
  id: number;
  ns: string;
  key: string;
  value: string;
  tags: string | null;
  created: number;
}

export function recall(query: string, ns = "default", limit = 10): Fact[] {
  const stmt = db().prepare(
    "SELECT * FROM facts WHERE ns = ? AND (key LIKE ? OR value LIKE ?) ORDER BY created DESC LIMIT ?",
  );
  const like = `%${query}%`;
  return stmt.all(ns, like, like, limit) as unknown as Fact[];
}

export function lastSession(): string | null {
  const row = db().prepare("SELECT id FROM sessions ORDER BY updated DESC LIMIT 1").get() as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

export function touchSession(id: string, label?: string): void {
  const now = Date.now();
  db()
    .prepare(
      "INSERT INTO sessions (id, label, created, updated) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated = excluded.updated",
    )
    .run(id, label ?? null, now, now);
}

export function appendTranscript(sessionId: string, role: string, content: string): void {
  db()
    .prepare("INSERT INTO transcripts (session_id, role, content, created) VALUES (?, ?, ?, ?)")
    .run(sessionId, role, content, Date.now());
}

export function logRouting(task: string, agent: string, reason: string): void {
  db()
    .prepare("INSERT INTO routing (task, agent, reason, created) VALUES (?, ?, ?, ?)")
    .run(task, agent, reason, Date.now());
}
