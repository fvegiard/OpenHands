// Capability-manifest semantic gate + red fixtures. Proves the README gate
// FAILS on a fabricated count, stale/missing capability evidence, a README claim
// without proof, and matrix drift — and PASSES for the real repo manifest/README.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CapabilityManifest,
  checkCapabilities,
  type FileTestOutcome,
  generateMatrix,
  loadManifest,
  MATRIX_END,
  MATRIX_START,
  parseVitestResults,
  readmePath,
} from "../src/capabilities.ts";

const ROOT = process.cwd();

function baseManifest(): CapabilityManifest {
  return {
    date: "2026-01-01",
    capabilities: [
      { id: "real", title: "A real thing", status: "implemented", evidence: "test/auth.test.ts" },
      { id: "later", title: "Not yet", status: "not_implemented" },
    ],
    external_comparisons: [{ name: "SomeTool", status: "not_benchmarked" }],
  };
}

/** Build a README whose matrix block matches the manifest (so only the tested
 * defect is present). */
function readmeFor(m: CapabilityManifest, prose = "# Title\n\nHonest prose.\n\n"): string {
  return `${prose}${generateMatrix(m)}\n\nMore honest prose.\n`;
}

describe("capability gate — real repo is honest", () => {
  it("the committed README + capabilities.json pass the gate with zero violations", () => {
    const m = loadManifest(ROOT);
    const readme = readFileSync(readmePath(ROOT), "utf8");
    expect(checkCapabilities(readme, m, ROOT)).toEqual([]);
  });

  it("every implemented capability points to an evidence file that exists", () => {
    const m = loadManifest(ROOT);
    const violations = checkCapabilities(readFileSync(readmePath(ROOT), "utf8"), m, ROOT);
    expect(violations.filter((v) => v.code === "E_NO_EVIDENCE")).toEqual([]);
  });
});

describe("capability gate — red fixtures", () => {
  it("FAILS on a fabricated count (count without a passing source)", () => {
    const m = baseManifest();
    m.capabilities.push({
      id: "bogus-count",
      title: "Ecosystem",
      status: "not_implemented",
      count: 400000,
    });
    const v = checkCapabilities(readmeFor(m), m, ROOT);
    expect(v.some((x) => x.code === "E_FABRICATED_COUNT")).toBe(true);
  });

  it("FAILS on stale/missing capability evidence", () => {
    const m = baseManifest();
    m.capabilities[0] = {
      id: "real",
      title: "A real thing",
      status: "implemented",
      evidence: "test/does-not-exist.test.ts",
    };
    const v = checkCapabilities(readmeFor(m), m, ROOT);
    expect(v.some((x) => x.code === "E_NO_EVIDENCE")).toBe(true);
  });

  it("FAILS on a README claim without proof (forbidden marketing token)", () => {
    const m = baseManifest();
    const readme = readmeFor(m, "# Title\n\nThe most advanced agent with 400 000 skills.\n\n");
    const v = checkCapabilities(readme, m, ROOT);
    expect(v.some((x) => x.code === "E_UNBACKED_CLAIM")).toBe(true);
  });

  it("FAILS on matrix drift and on a missing matrix block", () => {
    const m = baseManifest();
    // Drift: hand-edit a status inside the embedded block.
    const drifted = readmeFor(m).replace("not implemented", "implemented");
    expect(checkCapabilities(drifted, m, ROOT).some((x) => x.code === "E_MATRIX_DRIFT")).toBe(true);
    // Missing: no block at all.
    const missing = "# Title\n\nno matrix here\n";
    expect(checkCapabilities(missing, m, ROOT).some((x) => x.code === "E_MATRIX_MISSING")).toBe(
      true,
    );
  });

  it("generateMatrix is deterministic and delimited by the markers", () => {
    const m = baseManifest();
    const out = generateMatrix(m);
    expect(out.startsWith(MATRIX_START)).toBe(true);
    expect(out.trimEnd().endsWith(MATRIX_END)).toBe(true);
    expect(generateMatrix(m)).toBe(out);
  });
});

function expectViolation(
  readme: string,
  m: CapabilityManifest,
  code: string,
  opts: Parameters<typeof checkCapabilities>[3],
): void {
  const v = checkCapabilities(readme, m, ROOT, opts);
  expect(v.some((x) => x.code === code)).toBe(true);
}

describe("capability gate — current-run evidence binding (--require-results)", () => {
  const results = (o: Partial<FileTestOutcome>): Map<string, FileTestOutcome> =>
    new Map([
      [
        "test/auth.test.ts",
        { passed: 0, failed: 0, skipped: 0, total: 0, ...o } as FileTestOutcome,
      ],
    ]);

  it("PASSES when the implemented evidence test passed in the current run", () => {
    const m = baseManifest();
    const v = checkCapabilities(readmeFor(m), m, ROOT, {
      results: results({ passed: 3, total: 3 }),
      requireResults: true,
    });
    expect(v.filter((x) => x.code === "E_STALE_EVIDENCE")).toEqual([]);
  });

  it("FAILS when the evidence test FAILED in the current run", () => {
    const m = baseManifest();
    expectViolation(readmeFor(m), m, "E_STALE_EVIDENCE", {
      results: results({ passed: 1, failed: 1, total: 2 }),
      requireResults: true,
    });
  });

  it("FAILS when the evidence test only SKIPPED (no passing tests)", () => {
    const m = baseManifest();
    expectViolation(readmeFor(m), m, "E_STALE_EVIDENCE", {
      results: results({ skipped: 2, total: 2 }),
      requireResults: true,
    });
  });

  it("FAILS when the evidence test is ABSENT from the current run", () => {
    const m = baseManifest();
    expectViolation(readmeFor(m), m, "E_STALE_EVIDENCE", {
      results: new Map(),
      requireResults: true,
    });
  });
});

describe("parseVitestResults", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "qa-vitest-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("keys by repo-relative path and counts pass/fail/skip", () => {
    const jsonPath = join(dir, "r.json");
    writeFileSync(
      jsonPath,
      JSON.stringify({
        testResults: [
          {
            name: `${ROOT}/test/auth.test.ts`,
            status: "passed",
            assertionResults: [{ status: "passed" }, { status: "passed" }],
          },
          {
            name: `${ROOT}/test/x.test.ts`,
            status: "failed",
            assertionResults: [{ status: "failed" }, { status: "skipped" }],
          },
        ],
      }),
    );
    const map = parseVitestResults(jsonPath, ROOT);
    expect(map.get("test/auth.test.ts")).toEqual({ passed: 2, failed: 0, skipped: 0, total: 2 });
    expect(map.get("test/x.test.ts")).toEqual({ passed: 0, failed: 1, skipped: 1, total: 2 });
  });
});
