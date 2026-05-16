// Reflector: after every runAgent call, classify the outcome and write a
// post-mortem to the entangled blackboard. The amplify layer reads these
// when biasing future routing decisions.

import { db } from "../memory.ts";

export type ReflectOutcome = "success" | "partial" | "failure";

export interface Reflection {
  taskId: string;
  task: string;
  outcome: ReflectOutcome;
  note: string;
  ts: number;
}

let initialized = false;
function ensureTable(): void {
  if (initialized) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS reflections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      task TEXT NOT NULL,
      outcome TEXT NOT NULL,
      note TEXT,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reflections_task_id ON reflections (task_id);
  `);
  initialized = true;
}

// Failure signals: catch both standalone tokens ("crashed", "failed") and
// classic camel-cased exception suffixes ("TypeError", "RangeError").
const FAIL_RE =
  /\b(?:error|errors|fail|failed|fails|failing|crash|crashed|exception|panic|traceback|cannot|unable)\b|(?:Type|Range|Syntax|Reference|URI|Eval)Error\b/i;
const PARTIAL_RE = /\b(?:partial|incomplete|todo|skipped|deferred|stub)\b/i;

export function classifyOutcome(text: string): ReflectOutcome {
  if (FAIL_RE.test(text)) return "failure";
  if (PARTIAL_RE.test(text)) return "partial";
  return "success";
}

export function reflect(taskId: string, task: string, result: string): Reflection {
  ensureTable();
  const outcome = classifyOutcome(result);
  const note = result.slice(0, 500);
  const ts = Date.now();
  db()
    .prepare("INSERT INTO reflections (task_id, task, outcome, note, ts) VALUES (?, ?, ?, ?, ?)")
    .run(taskId, task, outcome, note, ts);
  return { taskId, task, outcome, note, ts };
}

export function recentReflections(limit = 10): Reflection[] {
  ensureTable();
  const rows = db()
    .prepare("SELECT task_id, task, outcome, note, ts FROM reflections ORDER BY ts DESC LIMIT ?")
    .all(limit) as { task_id: string; task: string; outcome: string; note: string; ts: number }[];
  return rows.map((r) => ({
    taskId: r.task_id,
    task: r.task,
    outcome: r.outcome as ReflectOutcome,
    note: r.note,
    ts: r.ts,
  }));
}
