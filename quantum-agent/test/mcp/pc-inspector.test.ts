import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  handleMessage,
  runCheckEnvironment,
  runDetectShell,
  runListProcesses,
  runMapDrive,
  runSystemInfo,
  runValidatePaths,
} from "../../src/mcp/pc-inspector.ts";

describe("pc-inspector tools", () => {
  describe("runMapDrive", () => {
    function makeRoot(): string {
      const root = join(tmpdir(), `pc-map-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(join(root, "src"), { recursive: true });
      mkdirSync(join(root, "src", "components"), { recursive: true });
      writeFileSync(join(root, "README.md"), "# Hello\n");
      writeFileSync(join(root, "src", "index.ts"), "export const x = 1;\n");
      writeFileSync(join(root, "src", "components", "App.tsx"), "export const App = () => null;\n");
      return root;
    }

    it("returns a tree with file sizes at depth 1", () => {
      const root = makeRoot();
      try {
        const result = runMapDrive({ path: root, maxDepth: 1 });
        const text = result.content[0]!.text;
        expect(text).toContain("README.md");
        expect(text).toContain("src/");
        expect(text).toMatch(/\(\d+(?:\.\d+)? [KMG]?B\)/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("respects maxDepth", () => {
      const root = makeRoot();
      try {
        const result = runMapDrive({ path: root, maxDepth: 3 });
        const text = result.content[0]!.text;
        expect(text).toContain("components/");
        expect(text).toContain("App.tsx");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("defaults to current directory when path is omitted", () => {
      const result = runMapDrive({});
      expect(result.content[0]!.text).toContain("/\n");
    });
  });

  describe("runSystemInfo", () => {
    it("returns non-empty system info text", () => {
      const result = runSystemInfo({});
      const text = result.content[0]!.text;
      expect(text).toContain("OS:");
      expect(text).toContain("Arch:");
      expect(text).toContain("CPU:");
      expect(text).toContain("Memory:");
      expect(text).toContain("Disk:");
    });
  });

  describe("runListProcesses", () => {
    it("returns a formatted process list (may be empty)", () => {
      const result = runListProcesses({});
      const text = result.content[0]!.text;
      expect(typeof text).toBe("string");
    });
  });

  describe("runCheckEnvironment", () => {
    it("returns PATH, HOME, SHELL, and version checks", () => {
      const result = runCheckEnvironment({});
      const text = result.content[0]!.text;
      expect(text).toContain("PATH:");
      expect(text).toContain("HOME:");
      expect(text).toContain("SHELL:");
      expect(text).toContain("node:");
      expect(text).toContain("python3:");
      expect(text).toContain("rustc:");
      expect(text).toContain("go:");
    });
  });

  describe("runValidatePaths", () => {
    it("marks existing paths as EXISTS", () => {
      const result = runValidatePaths({ paths: ["/tmp", "/usr"] });
      const text = result.content[0]!.text;
      expect(text).toContain("EXISTS");
    });

    it("marks missing paths as MISSING and suggests corrections", () => {
      const result = runValidatePaths({ paths: ["/usr/loca/bin"] });
      const text = result.content[0]!.text;
      expect(text).toContain("MISSING");
      expect(text).toContain("did you mean");
    });

    it("returns suggestion only when distance is small enough", () => {
      const result = runValidatePaths({ paths: ["/completely/nonexistent/path/xyz"] });
      const text = result.content[0]!.text;
      expect(text).toContain("MISSING");
      expect(text).not.toContain("did you mean");
    });
  });

  describe("runDetectShell", () => {
    it("returns the current shell name", () => {
      const originalShell = process.env.SHELL;
      process.env.SHELL = "/bin/bash";
      try {
        const result = runDetectShell({});
        const text = result.content[0]!.text;
        expect(text).toContain("bash");
        expect(text).toContain("RC files:");
      } finally {
        process.env.SHELL = originalShell;
      }
    });

    it("detects rc files that exist", () => {
      const originalHome = process.env.HOME;
      const originalShell = process.env.SHELL;
      const home = join(tmpdir(), `pc-shell-${Date.now()}`);
      mkdirSync(home, { recursive: true });
      writeFileSync(join(home, ".bashrc"), "export PS1='test'\n");
      process.env.HOME = home;
      process.env.SHELL = "/bin/bash";
      try {
        const result = runDetectShell({});
        const text = result.content[0]!.text;
        expect(text).toContain(join(home, ".bashrc"));
      } finally {
        process.env.HOME = originalHome;
        process.env.SHELL = originalShell;
        rmSync(home, { recursive: true, force: true });
      }
    });
  });

  describe("handleMessage tools/call", () => {
    it("passes client arguments through params.arguments to the tool", async () => {
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
            params: { name: "map_drive", arguments: { path: "/tmp", maxDepth: 1 } },
          }),
        );
        const parsed = outputs.map((o) => JSON.parse(o));
        const response = parsed.find((p) => p.id === 1);
        expect(response).toBeDefined();
        expect(response.result).toBeDefined();
        const text = response.result.content[0].text;
        expect(text).toContain("tmp");
      } finally {
        process.stdout.write = origWrite;
      }
    });
  });
});
