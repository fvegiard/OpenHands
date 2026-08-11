import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  handleMessage,
  runFixNodeVersion,
  runFixPath,
  runFixPythonVersion,
  runFixShellSyntax,
  runLlmCorrection,
} from "../../src/mcp/corrector.ts";

describe("corrector tools", () => {
  describe("runFixNodeVersion", () => {
    function makeNodeRoot(versionFile: string, content: string): string {
      const root = join(
        tmpdir(),
        `corrector-node-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, versionFile), content);
      return root;
    }

    it("detects version from .nvmrc", () => {
      const root = makeNodeRoot(".nvmrc", "20\n");
      const result = runFixNodeVersion({ root });
      const text = result.content[0]!.text;
      expect(text).toContain("20");
      expect(text).toContain(".nvmrc");
    });

    it("falls back to .node-version", () => {
      const root = makeNodeRoot(".node-version", "18.17.0\n");
      const result = runFixNodeVersion({ root });
      const text = result.content[0]!.text;
      expect(text).toContain("18.17.0");
      expect(text).toContain(".node-version");
    });

    it("reads package.json engines.node", () => {
      const root = join(
        tmpdir(),
        `corrector-pkg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ engines: { node: ">=16" } }));
      const result = runFixNodeVersion({ root });
      const text = result.content[0]!.text;
      expect(text).toContain(">=16");
      expect(text).toContain("package.json engines.node");
    });

    it("returns not found when nothing is detected", () => {
      const root = join(
        tmpdir(),
        `corrector-none-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "test" }));
      const result = runFixNodeVersion({ root });
      expect(result.content[0]!.text).toContain("not found");
    });
  });

  describe("runFixPythonVersion", () => {
    it("detects from pyproject.toml", () => {
      const root = join(
        tmpdir(),
        `corrector-py-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, "pyproject.toml"), 'requires-python = ">=3.11"\n');
      const result = runFixPythonVersion({ root });
      const text = result.content[0]!.text;
      expect(text).toContain("3.11");
      expect(text).toContain("pyproject.toml");
    });

    it("falls back to runtime.txt", () => {
      const root = join(
        tmpdir(),
        `corrector-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, "runtime.txt"), "python-3.10.12\n");
      const result = runFixPythonVersion({ root });
      const text = result.content[0]!.text;
      expect(text).toContain("python-3.10.12");
      expect(text).toContain("runtime.txt");
    });

    it("falls back to .python-version", () => {
      const root = join(
        tmpdir(),
        `corrector-pv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, ".python-version"), "3.9.18\n");
      const result = runFixPythonVersion({ root });
      const text = result.content[0]!.text;
      expect(text).toContain("3.9.18");
      expect(text).toContain(".python-version");
    });

    it("suggests venv activation", () => {
      const root = join(
        tmpdir(),
        `corrector-venv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, ".python-version"), "3.11\n");
      const result = runFixPythonVersion({ root });
      const text = result.content[0]!.text;
      expect(text).toContain("venv");
      expect(text).toContain("activate");
    });
  });

  describe("runFixPath", () => {
    it("reports missing PATH entries", () => {
      const result = runFixPath({ missing: ["/nonexistent/bin"] });
      const text = result.content[0]!.text;
      expect(text).toContain("Missing PATH entries");
      expect(text).toContain("/nonexistent/bin");
    });

    it("suggests shell rc edits", () => {
      const result = runFixPath({ missing: ["/nonexistent/bin"], shell: "bash" });
      const text = result.content[0]!.text;
      expect(text).toContain(".bashrc");
      expect(text).toContain("export PATH");
    });

    it("detects common missing entries", () => {
      const result = runFixPath({});
      const text = result.content[0]!.text;
      expect(text).toContain("Shell:");
    });
  });

  describe("runFixShellSyntax", () => {
    it("detects heuristic issues in script", () => {
      const script = "echo $var\n";
      const result = runFixShellSyntax({ script });
      const text = result.content[0]!.text;
      expect(text).toContain("Issues found:");
    });

    it("reports no issues for clean script", () => {
      const script = '#!/bin/bash\necho "hello world"\n';
      const result = runFixShellSyntax({ script });
      const text = result.content[0]!.text;
      expect(text).toContain("No issues detected");
    });
  });

  describe("runLlmCorrection", () => {
    it("returns a patch proposal with web context", async () => {
      const result = await runLlmCorrection({
        errorMessage: "SyntaxError: Unexpected token",
        stackTrace: "at foo.ts:10",
        webSearch: false,
        repoSearch: false,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("LLM Correction Proposal");
      expect(text).toContain("Suggested patch");
    });

    it("searches repo when enabled", async () => {
      const result = await runLlmCorrection({
        errorMessage: "TypeError: Cannot read properties of undefined",
        stackTrace: "",
        webSearch: false,
        repoSearch: true,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("Repo references");
    });
  });

  describe("handleMessage tools/call", () => {
    it("routes fix_node_version through stdio", async () => {
      const outputs: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: string | Uint8Array) => {
        if (typeof chunk === "string") outputs.push(chunk);
        return true;
      }) as typeof process.stdout.write;

      try {
        await handleMessage(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "fix_node_version", arguments: { root: "/tmp" } },
          }),
        );
        const parsed = outputs.map((o) => JSON.parse(o));
        const response = parsed.find((p) => p.id === 1);
        expect(response).toBeDefined();
        expect(response.result).toBeDefined();
        const text = response.result.content[0].text;
        expect(text).toContain("Node version");
      } finally {
        process.stdout.write = origWrite;
      }
    });

    it("routes fix_shell_syntax through stdio", async () => {
      const outputs: string[] = [];
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: string | Uint8Array) => {
        if (typeof chunk === "string") outputs.push(chunk);
        return true;
      }) as typeof process.stdout.write;

      try {
        await handleMessage(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "fix_shell_syntax", arguments: { script: "echo hello" } },
          }),
        );
        const parsed = outputs.map((o) => JSON.parse(o));
        const response = parsed.find((p) => p.id === 1);
        expect(response).toBeDefined();
        expect(response.result).toBeDefined();
        const text = response.result.content[0].text;
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
      } finally {
        process.stdout.write = origWrite;
      }
    });
  });
});
