import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runLlmCorrection } from "../src/mcp/corrector.ts";
import {
  runCheckEnvironment,
  runDetectShell,
  runMapDrive,
  runSystemInfo,
  runValidatePaths,
} from "../src/mcp/pc-inspector.ts";
import { computeDeliveryScore, runSequentialThinking } from "../src/quantum/score.ts";
import { runResearchTopic } from "../src/research/scout.ts";
import { runValidateStack } from "../src/research/stack-validator.ts";
import { runGrep } from "../src/tools/repo.ts";

describe("doctor pipeline integration", () => {
  function makeProjectRoot(): string {
    const root = join(
      tmpdir(),
      `doctor-pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "README.md"), "# Test Project\n");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "test", engines: { node: ">=20" } }),
    );
    writeFileSync(join(root, "src", "index.ts"), "export const x = 1;\n");
    writeFileSync(join(root, "tests", "index.test.ts"), "test('x', () => {});\n");
    return root;
  }

  it("maps the PC filesystem", () => {
    const root = makeProjectRoot();
    try {
      const result = runMapDrive({ path: root, maxDepth: 2 });
      const text = result.content[0]!.text;
      expect(text).toContain("README.md");
      expect(text).toContain("src/");
    } finally {
      require("node:fs").rmSync(root, { recursive: true, force: true });
    }
  });

  it("validates the stack", async () => {
    const root = makeProjectRoot();
    try {
      const result = await runValidateStack({ root, research: false });
      expect(result.summary).toContain("Node:");
      expect(result.summary).toContain("Python:");
      expect(result.summary).toContain("Package manager:");
    } finally {
      require("node:fs").rmSync(root, { recursive: true, force: true });
    }
  });

  it("indexes the codebase via grep", async () => {
    const root = makeProjectRoot();
    try {
      const result = await runGrep({ pattern: "TODO|FIXME" }, root);
      const text = result.content[0]!.text;
      expect(typeof text).toBe("string");
    } finally {
      require("node:fs").rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs research on a topic", async () => {
    vi.spyOn(await import("../src/tools/web.ts"), "autoWebSearch").mockResolvedValue({
      query: "",
      results: [],
    });

    const brief = await runResearchTopic({ topic: "project health", scouts: 2 });
    expect(brief.query).toBe("project health");
    expect(brief.totalHits).toBeGreaterThanOrEqual(0);
  });

  it("proposes corrections for an error", async () => {
    const result = await runLlmCorrection({
      errorMessage: "Module not found: 'fs'",
      stackTrace: "",
      webSearch: false,
      repoSearch: false,
    });
    const text = result.content[0]!.text;
    expect(text).toContain("LLM Correction Proposal");
    expect(text).toContain("Suggested patch");
  });

  it("evaluates branches with sequential-thinking", () => {
    const branches = ["inspect", "research", "correct"];
    const evaluations: { branch: string; score: number }[] = [];
    for (const branch of branches) {
      const thought = runSequentialThinking("doctor pipeline", branch);
      evaluations.push({ branch, score: thought.score });
      expect(thought.options.length).toBeGreaterThan(0);
      expect(thought.risks.length).toBeGreaterThan(0);
      expect(thought.evidence.length).toBeGreaterThan(0);
      expect(thought.score).toBeGreaterThanOrEqual(0);
      expect(thought.score).toBeLessThanOrEqual(10);
    }
    const avg = evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length;
    expect(avg).toBeGreaterThanOrEqual(0);
    expect(avg).toBeLessThanOrEqual(10);
  });

  it("computes a delivery score from pipeline metrics", () => {
    const score = computeDeliveryScore({
      codeCorrectness: 8,
      testCoverage: 6,
      logCleanliness: 7,
      errorCount: 3,
    });
    expect(score.finalScore).toBeGreaterThan(0);
    expect(score.finalScore).toBeLessThanOrEqual(10);
    expect(score.breakdown).toContain("code_correctness");
    expect(score.breakdown).toContain("test_coverage");
    expect(score.breakdown).toContain("log_cleanliness");
    expect(score.breakdown).toContain("error_count");
    expect(score.breakdown).toContain("final=");
  });

  it("runs system info and environment checks", () => {
    const sys = runSystemInfo({});
    expect(sys.content[0]!.text).toContain("OS:");
    expect(sys.content[0]!.text).toContain("Arch:");

    const env = runCheckEnvironment({});
    expect(env.content[0]!.text).toContain("PATH:");
    expect(env.content[0]!.text).toContain("SHELL:");
  });

  it("validates paths with suggestions", () => {
    const result = runValidatePaths({ paths: ["/nonexistent/path/xyz"] });
    const text = result.content[0]!.text;
    expect(text).toContain("MISSING");
  });

  it("detects shell configuration", () => {
    const result = runDetectShell({});
    const text = result.content[0]!.text;
    expect(text).toContain("Shell:");
    expect(text).toContain("RC files:");
  });
});
