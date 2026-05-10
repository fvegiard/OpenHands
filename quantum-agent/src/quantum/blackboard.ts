// Entanglement layer — typed wrapper around the SQLite blackboard for the
// quantum loop. Each branch (subagent) writes findings here; readers
// observe an entangled view.

import { db } from "../memory.ts";

export interface Finding {
  branch: string;
  kind: "hypothesis" | "evidence" | "conclusion" | "score";
  content: string;
  score?: number;
  ts: number;
}

export class Blackboard {
  constructor(private readonly task: string) {
    db().exec(`
      CREATE TABLE IF NOT EXISTS bb_findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task TEXT NOT NULL,
        branch TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        score REAL,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS bb_findings_task ON bb_findings (task, branch);
    `);
  }

  write(branch: string, kind: Finding["kind"], content: string, score?: number): void {
    db()
      .prepare(
        "INSERT INTO bb_findings (task, branch, kind, content, score, ts) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(this.task, branch, kind, content, score ?? null, Date.now());
  }

  read(branch?: string): Finding[] {
    const rows = branch
      ? db()
          .prepare("SELECT * FROM bb_findings WHERE task = ? AND branch = ? ORDER BY ts ASC")
          .all(this.task, branch)
      : db().prepare("SELECT * FROM bb_findings WHERE task = ? ORDER BY ts ASC").all(this.task);
    return rows as Finding[];
  }

  branches(): string[] {
    const rows = db()
      .prepare("SELECT DISTINCT branch FROM bb_findings WHERE task = ?")
      .all(this.task) as { branch: string }[];
    return rows.map((r) => r.branch);
  }
}
