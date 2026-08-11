// Stack validator — uses PC inspection + web research to identify the correct
// Node/Python versions, package managers, shell syntax, and path conventions
// for a given codebase.

import { existsSync, readFileSync } from "node:fs";
import { execaSync } from "execa";
import { z } from "zod";
import { autoWebSearch, type SearchHit } from "../tools/web.ts";

export interface StackValidation {
  nodeVersion: { detected: string | null; recommended: string | null; source: string };
  pythonVersion: { detected: string | null; recommended: string | null; source: string };
  packageManager: { detected: string | null; recommended: string | null; source: string };
  shell: { detected: string | null; syntax: string | null; rcFiles: string[] };
  paths: { conventions: string[]; issues: string[] };
  summary: string;
}

function detectFromFile(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    const text = readFileSync(path, "utf8").trim();
    if (!text) return null;
    const firstLine = text.split("\n")[0]?.trim() ?? "";
    if (!firstLine) return null;
    return firstLine;
  } catch {
    return null;
  }
}

export function detectNodeVersion(root: string): {
  detected: string | null;
  recommended: string | null;
  source: string;
} {
  const candidates = [
    { path: `${root}/.nvmrc`, label: ".nvmrc" },
    { path: `${root}/.node-version`, label: ".node-version" },
  ];

  for (const c of candidates) {
    const version = detectFromFile(c.path);
    if (version) return { detected: version, recommended: null, source: c.label };
  }

  try {
    const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
    const engines = pkg.engines?.node;
    if (engines)
      return { detected: engines, recommended: null, source: "package.json engines.node" };
  } catch {
    // ignore
  }

  try {
    const r = execaSync("node", ["--version"], { reject: false, encoding: "utf8" });
    if (r.exitCode === 0)
      return { detected: r.stdout.trim(), recommended: null, source: "installed node" };
  } catch {
    // ignore
  }

  return { detected: null, recommended: null, source: "not found" };
}

export function detectPythonVersion(root: string): {
  detected: string | null;
  recommended: string | null;
  source: string;
} {
  const candidates = [
    { path: `${root}/pyproject.toml`, label: "pyproject.toml", parse: parsePyproject },
    { path: `${root}/runtime.txt`, label: "runtime.txt" },
    { path: `${root}/.python-version`, label: ".python-version" },
  ];

  for (const c of candidates) {
    if (c.parse) {
      const version = c.parse(root);
      if (version) return { detected: version, recommended: null, source: c.label };
    } else {
      const version = detectFromFile(c.path);
      if (version) return { detected: version, recommended: null, source: c.label };
    }
  }

  try {
    const r = execaSync("python3", ["--version"], { reject: false, encoding: "utf8" });
    if (r.exitCode === 0)
      return { detected: r.stdout.trim(), recommended: null, source: "installed python3" };
  } catch {
    // ignore
  }

  try {
    const r = execaSync("python", ["--version"], { reject: false, encoding: "utf8" });
    if (r.exitCode === 0)
      return { detected: r.stdout.trim(), recommended: null, source: "installed python" };
  } catch {
    // ignore
  }

  return { detected: null, recommended: null, source: "not found" };
}

function parsePyproject(root: string): string | null {
  try {
    const text = readFileSync(`${root}/pyproject.toml`, "utf8");
    const m = text.match(/python\s*=\s*["']([^"']+)["']/);
    if (m) return m[1] ?? null;
  } catch {
    // ignore
  }
  return null;
}

export function detectPackageManager(root: string): {
  detected: string | null;
  recommended: string | null;
  source: string;
} {
  const lockfiles: Record<string, string> = {
    "package-lock.json": "npm",
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "bun.lockb": "bun",
    "poetry.lock": "poetry",
    "uv.lock": "uv",
    "Pipfile.lock": "pipenv",
  };

  for (const [file, pm] of Object.entries(lockfiles)) {
    if (existsSync(`${root}/${file}`)) return { detected: pm, recommended: null, source: file };
  }

  try {
    const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
    const pmField = pkg.packageManager;
    if (pmField) {
      const name = pmField.split("@")[0] ?? pmField;
      return { detected: name, recommended: null, source: "package.json packageManager" };
    }
  } catch {
    // ignore
  }

  return { detected: null, recommended: null, source: "not found" };
}

export function detectShell(): { detected: string | null; rcFiles: string[] } {
  const shell = process.env.SHELL ?? process.env.COMSPEC ?? "unknown";
  const shellName = shell.split("/").pop() ?? shell;
  const rcFiles: string[] = [];

  const rcMap: Record<string, string[]> = {
    bash: [".bashrc", ".bash_profile", ".bash_login", ".profile"],
    zsh: [".zshrc", ".zprofile", ".zshenv"],
    fish: [".config/fish/config.fish"],
    sh: [".profile"],
    dash: [".profile"],
    ksh: [".kshrc", ".profile"],
    tcsh: [".tcashrc", ".cshrc"],
    csh: [".cshrc"],
    pwsh: ["$PROFILE"],
    powershell: ["$PROFILE"],
  };

  const candidates = rcMap[shellName] ?? [];
  const home = process.env.HOME ?? "";

  for (const rc of candidates) {
    let full: string;
    if (rc.startsWith("$PROFILE")) {
      const pwshProfile =
        process.env.PWsh_PROFILE ?? `${home}/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`;
      full = pwshProfile;
    } else if (rc.startsWith("$")) {
      full = process.env[rc.slice(1)] ?? rc;
    } else {
      full = `${home}/${rc}`;
    }
    if (full) {
      try {
        if (existsSync(full)) rcFiles.push(full);
      } catch {
        // ignore
      }
    }
  }

  return { detected: shellName === "unknown" ? null : shellName, rcFiles };
}

export function detectPathConventions(root: string): { conventions: string[]; issues: string[] } {
  const conventions: string[] = [];
  const issues: string[] = [];

  const hasSrc = existsSync(`${root}/src`);
  const hasDist = existsSync(`${root}/dist`);
  const hasTests = existsSync(`${root}/tests`) || existsSync(`${root}/test`);

  if (hasSrc) conventions.push("src/ layout");
  if (hasDist) conventions.push("dist/ build output");
  if (hasTests) conventions.push("tests/ or test/ directory");

  if (!hasSrc && existsSync(`${root}/index.ts`)) {
    issues.push("Top-level index.ts instead of src/ layout");
  }

  return { conventions, issues };
}

async function researchBestPractices(topic: string): Promise<SearchHit[]> {
  const report = await autoWebSearch(`${topic} best practices 2026`, 5);
  return report.results;
}

export async function runValidateStack(input: {
  root?: string;
  research?: boolean;
}): Promise<StackValidation> {
  const root = input.root ?? ".";
  const doResearch = input.research ?? true;

  const node = detectNodeVersion(root);
  const python = detectPythonVersion(root);
  const pm = detectPackageManager(root);
  const shell = detectShell();
  const paths = detectPathConventions(root);

  let researchHits: SearchHit[] = [];
  if (doResearch) {
    const topics = [node.detected, python.detected, pm.detected].filter(Boolean).join(" ");
    if (topics) {
      researchHits = await researchBestPractices(topics);
    }
  }

  const summary = [
    `Node: ${node.detected ?? "not detected"} (source: ${node.source})`,
    `Python: ${python.detected ?? "not detected"} (source: ${python.source})`,
    `Package manager: ${pm.detected ?? "not detected"} (source: ${pm.source})`,
    `Shell: ${shell.detected ?? "unknown"} (RC files: ${shell.rcFiles.length})`,
    `Paths: ${paths.conventions.join(", ") || "(none detected)"}${paths.issues.length > 0 ? `; issues: ${paths.issues.join(", ")}` : ""}`,
    `Research: ${researchHits.length} hit(s)`,
  ].join("\n");

  return {
    nodeVersion: node,
    pythonVersion: python,
    packageManager: pm,
    shell: { detected: shell.detected, syntax: null, rcFiles: shell.rcFiles },
    paths,
    summary,
  };
}

export const validateStackSchema = {
  root: z.string().default(".").optional(),
  research: z.boolean().default(true).optional(),
};
