// Capability manifest + README semantic gate.
//
// `capabilities.json` is the single source of truth for what Quantum actually
// does. Every `implemented` claim MUST point to an evidence test that exists;
// any numeric `count` needs a passing `countSource`. The README embeds a
// GENERATED capability matrix (between markers) and must not contain unbacked
// marketing claims. `quantum verify` runs this gate so a README claim without
// proof — a fabricated count, stale/missing evidence, or matrix drift — fails.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type CapStatus = "implemented" | "experimental" | "not_implemented" | "not_benchmarked";

export interface Capability {
  id: string;
  title: string;
  status: CapStatus;
  /** Path (repo-relative) to a passing test/command artifact — required when implemented. */
  evidence?: string;
  note?: string;
  /** A numeric claim (e.g. an ecosystem size) — only allowed with a passing countSource. */
  count?: number;
  countSource?: string;
}

export interface ExternalComparison {
  name: string;
  status: "not_benchmarked";
}

export interface CapabilityManifest {
  date: string;
  note?: string;
  capabilities: Capability[];
  external_comparisons: ExternalComparison[];
}

export const MATRIX_START = "<!-- CAPABILITY_MATRIX:START -->";
export const MATRIX_END = "<!-- CAPABILITY_MATRIX:END -->";

// Marketing/unbacked tokens that must never appear as product truth in the
// README prose (the generated matrix block is excluded from this scan).
export const FORBIDDEN_CLAIMS: readonly RegExp[] = [
  /400[\s,]?000/i,
  /\b400k\b/i,
  /13[\s,]?729/i,
  /\bmost advanced\b/i,
  /\bsurpass(?:es|ing)?\b/i,
  /\bauto-everything\b/i,
  /\b5[\s,]?400\b/i,
];

function label(s: CapStatus): string {
  switch (s) {
    case "implemented":
      return "implemented";
    case "experimental":
      return "experimental";
    case "not_implemented":
      return "not implemented";
    case "not_benchmarked":
      return "not benchmarked";
    default: {
      const _never: never = s;
      return _never;
    }
  }
}

function evidenceCell(c: Capability): string {
  if (c.status === "implemented") return `\`${c.evidence ?? "(missing)"}\``;
  return c.note ? c.note : "—";
}

/** Deterministically render the capability matrix from the manifest. */
export function generateMatrix(m: CapabilityManifest): string {
  const rows = ["| Capability | Status | Evidence / note |", "|---|---|---|"];
  for (const c of m.capabilities) {
    rows.push(`| ${c.title} | ${label(c.status)} | ${evidenceCell(c)} |`);
  }
  for (const e of m.external_comparisons) {
    rows.push(`| ${e.name} (external) | NOT BENCHMARKED | no identical benchmark run |`);
  }
  return (
    `${MATRIX_START}\n` +
    `_Generated from \`capabilities.json\` on ${m.date}. External tools are NOT ` +
    `BENCHMARKED — no absolute "most advanced"/"surpass" claim is made without an ` +
    `identical benchmark._\n\n` +
    `${rows.join("\n")}\n` +
    `${MATRIX_END}`
  );
}

export interface CapViolation {
  code: string;
  detail: string;
}

/** Per-file test outcome from a CURRENT vitest run (passed/failed/skipped). */
export interface FileTestOutcome {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}

interface VitestAssertion {
  status?: string;
}
interface VitestFileResult {
  name?: string;
  status?: string;
  assertionResults?: VitestAssertion[];
}
interface VitestJson {
  testResults?: VitestFileResult[];
}

/** Parse a vitest `--reporter=json` file into a map keyed by repo-relative path.
 * This is the current run's ground truth: a stale/failing/skipped/absent test can
 * no longer authorize an `implemented` claim. */
export function parseVitestResults(
  jsonPath: string,
  repoRoot: string = process.cwd(),
): Map<string, FileTestOutcome> {
  const out = new Map<string, FileTestOutcome>();
  const data = JSON.parse(readFileSync(jsonPath, "utf8")) as VitestJson;
  for (const fr of data.testResults ?? []) {
    if (!fr.name) continue;
    let rel = fr.name.replaceAll("\\", "/");
    const root = repoRoot.replaceAll("\\", "/").replace(/\/$/, "");
    if (rel.startsWith(`${root}/`)) rel = rel.slice(root.length + 1);
    const asserts = fr.assertionResults ?? [];
    const o: FileTestOutcome = { passed: 0, failed: 0, skipped: 0, total: 0 };
    if (asserts.length > 0) {
      for (const a of asserts) {
        o.total += 1;
        if (a.status === "passed") o.passed += 1;
        else if (a.status === "failed") o.failed += 1;
        else o.skipped += 1;
      }
    } else {
      // No per-assertion detail: fall back to the file-level status.
      o.total = 1;
      if (fr.status === "passed") o.passed = 1;
      else if (fr.status === "failed") o.failed = 1;
      else o.skipped = 1;
    }
    out.set(rel, o);
  }
  return out;
}

export interface CapabilityCheckOptions {
  /** Current-run vitest outcomes, keyed by repo-relative test path. */
  results?: Map<string, FileTestOutcome>;
  /** Require every `implemented` claim to be backed by a PASSING current-run test. */
  requireResults?: boolean;
}

/**
 * Validate the README against the manifest. Returns violations (empty == pass):
 *   E_NO_EVIDENCE    an implemented claim has a missing/absent evidence file
 *   E_FABRICATED_COUNT a numeric count without status=implemented + a real source
 *   E_MATRIX_MISSING README has no generated matrix block
 *   E_MATRIX_DRIFT   the README matrix != the manifest-generated matrix
 *   E_UNBACKED_CLAIM the README prose contains a forbidden marketing claim
 */
export function checkCapabilities(
  readme: string,
  m: CapabilityManifest,
  repoRoot: string,
  opts: CapabilityCheckOptions = {},
): CapViolation[] {
  const v: CapViolation[] = [];
  const { results, requireResults } = opts;
  for (const c of m.capabilities) {
    if (c.status === "implemented") {
      if (!c.evidence) {
        v.push({ code: "E_NO_EVIDENCE", detail: `${c.id}: implemented but no evidence pointer` });
      } else if (!existsSync(join(repoRoot, c.evidence))) {
        v.push({ code: "E_NO_EVIDENCE", detail: `${c.id}: evidence not found: ${c.evidence}` });
      } else if (requireResults) {
        // The evidence file merely EXISTING is not enough: it must have run in the
        // current suite and actually passed (not stale, skipped, or failing).
        const rel = c.evidence.replaceAll("\\", "/");
        const o = results?.get(rel);
        if (!o) {
          v.push({
            code: "E_STALE_EVIDENCE",
            detail: `${c.id}: evidence ${c.evidence} not in current test results`,
          });
        } else if (o.failed > 0) {
          v.push({
            code: "E_STALE_EVIDENCE",
            detail: `${c.id}: evidence ${c.evidence} has ${o.failed} failing test(s)`,
          });
        } else if (o.passed < 1) {
          v.push({
            code: "E_STALE_EVIDENCE",
            detail: `${c.id}: evidence ${c.evidence} ran no passing tests (skipped=${o.skipped})`,
          });
        }
      }
    }
    if (typeof c.count === "number") {
      const sourceOk = !!c.countSource && existsSync(join(repoRoot, c.countSource));
      if (c.status !== "implemented" || !sourceOk) {
        v.push({
          code: "E_FABRICATED_COUNT",
          detail: `${c.id}: count ${c.count} lacks a passing countSource`,
        });
      }
    }
  }

  const expected = generateMatrix(m);
  const start = readme.indexOf(MATRIX_START);
  const end = readme.indexOf(MATRIX_END);
  if (start === -1 || end === -1) {
    v.push({ code: "E_MATRIX_MISSING", detail: "README is missing the capability matrix block" });
  } else if (readme.slice(start, end + MATRIX_END.length).trim() !== expected.trim()) {
    v.push({ code: "E_MATRIX_DRIFT", detail: "README matrix != generated from capabilities.json" });
  }

  const outside =
    start !== -1 && end !== -1
      ? readme.slice(0, start) + readme.slice(end + MATRIX_END.length)
      : readme;
  for (const re of FORBIDDEN_CLAIMS) {
    if (re.test(outside)) {
      v.push({ code: "E_UNBACKED_CLAIM", detail: `README contains an unbacked claim (${re})` });
    }
  }
  return v;
}

export function loadManifest(repoRoot: string = process.cwd()): CapabilityManifest {
  return JSON.parse(
    readFileSync(join(repoRoot, "capabilities.json"), "utf8"),
  ) as CapabilityManifest;
}

export function readmePath(repoRoot: string = process.cwd()): string {
  return join(repoRoot, "README.md");
}
