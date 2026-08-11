import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  detectNodeVersion,
  detectPackageManager,
  detectPathConventions,
  detectPythonVersion,
  detectShell,
  runValidateStack,
} from "../../src/research/stack-validator.ts";

describe("stack-validator", () => {
  describe("detectNodeVersion", () => {
    it("reads .nvmrc when present", () => {
      const root = makeRoot();
      writeFileSync(join(root, ".nvmrc"), "20", "utf8");
      const result = detectNodeVersion(root);
      expect(result.detected).toBe("20");
      expect(result.source).toBe(".nvmrc");
    });

    it("falls back to package.json engines", () => {
      const root = makeRoot();
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ engines: { node: ">=18" } }),
        "utf8",
      );
      const result = detectNodeVersion(root);
      expect(result.detected).toBe(">=18");
      expect(result.source).toBe("package.json engines.node");
    });
  });

  describe("detectPythonVersion", () => {
    it("reads .python-version when present", () => {
      const root = makeRoot();
      writeFileSync(join(root, ".python-version"), "3.12.0", "utf8");
      const result = detectPythonVersion(root);
      expect(result.detected).toBe("3.12.0");
      expect(result.source).toBe(".python-version");
    });

    it("reads pyproject.toml requires-python", () => {
      const root = makeRoot();
      writeFileSync(join(root, "pyproject.toml"), 'requires-python = ">=3.11"', "utf8");
      const result = detectPythonVersion(root);
      expect(result.detected).toBe(">=3.11");
      expect(result.source).toBe("pyproject.toml");
    });
  });

  describe("detectPackageManager", () => {
    it("detects npm from package-lock.json", () => {
      const root = makeRoot();
      writeFileSync(join(root, "package-lock.json"), "{}", "utf8");
      const result = detectPackageManager(root);
      expect(result.detected).toBe("npm");
      expect(result.source).toBe("package-lock.json");
    });

    it("detects pnpm from pnpm-lock.yaml", () => {
      const root = makeRoot();
      writeFileSync(join(root, "pnpm-lock.yaml"), "", "utf8");
      const result = detectPackageManager(root);
      expect(result.detected).toBe("pnpm");
      expect(result.source).toBe("pnpm-lock.yaml");
    });

    it("detects poetry from poetry.lock", () => {
      const root = makeRoot();
      writeFileSync(join(root, "poetry.lock"), "", "utf8");
      const result = detectPackageManager(root);
      expect(result.detected).toBe("poetry");
      expect(result.source).toBe("poetry.lock");
    });

    it("reads packageManager from package.json", () => {
      const root = makeRoot();
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ packageManager: "yarn@4.0.0" }),
        "utf8",
      );
      const result = detectPackageManager(root);
      expect(result.detected).toBe("yarn");
      expect(result.source).toBe("package.json packageManager");
    });
  });

  describe("detectShell", () => {
    it("returns the shell name and rc files", () => {
      vi.stubEnv("SHELL", "/bin/bash");
      vi.stubEnv("HOME", join(tmpdir(), "fakehome"));
      mkdirSync(join(tmpdir(), "fakehome", ".bashrc"), { recursive: true });

      const result = detectShell();
      expect(result.detected).toBe("bash");
      expect(result.rcFiles.length).toBeGreaterThan(0);
    });

    it("detects tcsh rc files", () => {
      vi.stubEnv("SHELL", "/bin/tcsh");
      vi.stubEnv("HOME", join(tmpdir(), "fakehome"));
      mkdirSync(join(tmpdir(), "fakehome", ".tcshrc"), { recursive: true });

      const result = detectShell();
      expect(result.detected).toBe("tcsh");
      expect(result.rcFiles.some((f) => f.endsWith(".tcshrc"))).toBe(true);
    });

    it("returns unknown when SHELL is missing", () => {
      vi.stubEnv("SHELL", undefined);
      vi.stubEnv("COMSPEC", undefined);

      const result = detectShell();
      expect(result.detected).toBeNull();
    });

    it("returns unknown when SHELL is an empty string", () => {
      vi.stubEnv("SHELL", "");
      vi.stubEnv("COMSPEC", undefined);

      const result = detectShell();
      expect(result.detected).toBeNull();
    });

    it("detects tcsh rc files", () => {
      vi.stubEnv("SHELL", "/bin/tcsh");
      vi.stubEnv("HOME", join(tmpdir(), "fakehome"));
      mkdirSync(join(tmpdir(), "fakehome", ".tcshrc"), { recursive: true });

      const result = detectShell();
      expect(result.detected).toBe("tcsh");
      expect(result.rcFiles.some((f) => f.endsWith(".tcshrc"))).toBe(true);
    });
  });

  describe("detectPathConventions", () => {
    it("detects src/ and tests/ layouts", () => {
      const root = makeRoot();
      mkdirSync(join(root, "src"), { recursive: true });
      mkdirSync(join(root, "tests"), { recursive: true });

      const result = detectPathConventions(root);
      expect(result.conventions).toContain("src/ layout");
      expect(result.conventions).toContain("tests/ or test/ directory");
    });

    it("flags top-level index.ts as an issue", () => {
      const root = makeRoot();
      writeFileSync(join(root, "index.ts"), "", "utf8");

      const result = detectPathConventions(root);
      expect(result.issues).toContain("Top-level index.ts instead of src/ layout");
    });
  });

  describe("runValidateStack", () => {
    it("returns a summary with all stack sections", async () => {
      const root = makeRoot();
      vi.spyOn(await import("../../src/tools/web.ts"), "autoWebSearch").mockResolvedValue({
        query: "",
        results: [],
      });

      const result = await runValidateStack({ root, research: false });
      expect(result.summary).toContain("Node:");
      expect(result.summary).toContain("Python:");
      expect(result.summary).toContain("Package manager:");
      expect(result.summary).toContain("Shell:");
      expect(result.summary).toContain("Paths:");
    });
  });
});

function makeRoot(): string {
  const root = join(
    tmpdir(),
    `quantum-stack-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(root, { recursive: true });
  return root;
}
