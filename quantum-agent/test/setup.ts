// Per-process QUANTUM_HOME so parallel test files don't share the
// blackboard SQLite file (which would cause "database is locked" under
// vitest's default fork pool).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.QUANTUM_HOME) {
  process.env.QUANTUM_HOME = mkdtempSync(join(tmpdir(), `quantum-test-${process.pid}-`));
}
