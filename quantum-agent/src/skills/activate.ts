// Skill activation — the DRAFT -> ACTIVE state transition promised by the README.
//
// `quantum skill new` writes a DRAFT (SKILL.md + fixture + forward-tests.json,
// never activated). Activation happens ONLY here and ONLY after:
//   1. format validation (lowercase-hyphenated name, description, non-trivial body), and
//   2. both forward tests passing in a FRESH context — a separate `tsx` subprocess
//      that loads the skill's SKILL.md in a clean process (deterministic; no LLM,
//      no network).
// On success we write `activation.json` (the persisted state). On any failure we
// return `activated: false` with an explicit reason and leave the skill a draft.
//
// Note on scope: these fresh-context tests prove the skill LOADS and validates in
// a clean process. A full LLM *behavioral* forward-test needs a provider secret
// and is reported NOT_VERIFIED (never faked here).

import { execa } from "execa";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discover, type SkillManifest } from "./loader.ts";

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DEFAULT_ROOTS = ["./skills", "./skills-core"];
// quantum-agent root (…/src/skills/activate.ts -> up two).
const QA_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export interface ForwardTest {
  id: string;
  prompt: string;
  expect: string;
}
export interface ForwardTestContext {
  name: string;
  dir: string;
}
export interface ForwardTestOutcome {
  ok: boolean;
  detail: string;
}
/** Runs ONE forward test in a fresh context. Injectable for hermetic unit tests;
 * the default spawns a real `tsx` subprocess (a genuine clean process). */
export type ForwardTestRunner = (
  ctx: ForwardTestContext,
  test: ForwardTest,
) => Promise<ForwardTestOutcome>;

export interface ActivationResult {
  activated: boolean;
  skill: string;
  reason: string;
  statePath?: string;
  tests: { id: string; ok: boolean; detail: string }[];
}

export interface ActivateOptions {
  roots?: string[];
  runForwardTest?: ForwardTestRunner;
}

/** Fresh-context load test: a separate process loads the skill's SKILL.md and
 * asserts it parses with a usable name. Deterministic — no LLM, no network. */
const defaultRunner: ForwardTestRunner = async (ctx) => {
  const script =
    "import('./src/skills/loader.ts').then((m)=>{" +
    "const man=m.loadManifest(process.argv[1]);" +
    "if(!man){process.exit(3);}" +
    "const b=m.loadBody(man);" +
    "const n=man.frontmatter&&man.frontmatter.name;" +
    "process.exit(b&&n&&n!=='unknown'?0:4);" +
    "}).catch(()=>process.exit(5));";
  try {
    const r = await execa("tsx", ["-e", script, ctx.dir], {
      cwd: QA_ROOT,
      timeout: 30_000,
      env: { ...process.env, QUANTUM_HOME: join(ctx.dir, ".activation-home") },
      reject: false,
    });
    return { ok: r.exitCode === 0, detail: `exit=${r.exitCode}` };
  } catch (e) {
    return { ok: false, detail: `runner error: ${(e as Error).message}` };
  }
};

function findDraft(name: string, roots: string[]): SkillManifest | null {
  for (const root of roots) {
    for (const m of discover([root])) {
      if (m.frontmatter.name === name && existsSync(join(m.dir, "forward-tests.json"))) {
        return m;
      }
    }
  }
  return null;
}

function validateFormat(m: SkillManifest): string | null {
  const name = m.frontmatter.name;
  if (!name || name === "unknown") return "missing name";
  if (!NAME_RE.test(name)) return `name '${name}' not lowercase-hyphenated`;
  if (!m.frontmatter.description) return "missing description";
  const raw = readFileSync(m.path, "utf8");
  if (raw.length < 80) return "body too short";
  return null;
}

export function isActivated(skillDir: string): boolean {
  const p = join(skillDir, "activation.json");
  if (!existsSync(p)) return false;
  try {
    return JSON.parse(readFileSync(p, "utf8")).activated === true;
  } catch {
    return false;
  }
}

export async function activateSkill(
  name: string,
  opts: ActivateOptions = {},
): Promise<ActivationResult> {
  const roots = opts.roots ?? DEFAULT_ROOTS;
  const draft = findDraft(name, roots);
  if (!draft) {
    return {
      activated: false,
      skill: name,
      reason: `no draft skill '${name}' (need SKILL.md + forward-tests.json)`,
      tests: [],
    };
  }
  const fmtErr = validateFormat(draft);
  if (fmtErr) {
    return { activated: false, skill: name, reason: `format invalid: ${fmtErr}`, tests: [] };
  }
  const ftPath = join(draft.dir, "forward-tests.json");
  let spec: { tests?: ForwardTest[]; activated?: boolean };
  try {
    spec = JSON.parse(readFileSync(ftPath, "utf8"));
  } catch (e) {
    return {
      activated: false,
      skill: name,
      reason: `cannot read forward-tests.json: ${(e as Error).message}`,
      tests: [],
    };
  }
  const forwardTests = spec.tests ?? [];
  if (forwardTests.length < 2) {
    return {
      activated: false,
      skill: name,
      reason: `need >= 2 fresh-context forward tests, found ${forwardTests.length}`,
      tests: [],
    };
  }
  const runner = opts.runForwardTest ?? defaultRunner;
  const tests: ActivationResult["tests"] = [];
  for (const t of forwardTests) {
    const res = await runner({ name, dir: draft.dir }, t);
    tests.push({ id: t.id, ok: res.ok, detail: res.detail });
  }
  if (!tests.every((t) => t.ok)) {
    return {
      activated: false,
      skill: name,
      reason: "fresh-context forward test(s) failed — remaining a DRAFT",
      tests,
    };
  }
  // State transition: persist activation (and flip the draft spec).
  const statePath = join(draft.dir, "activation.json");
  writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        activated: true,
        skill: name,
        activated_at: new Date().toISOString(),
        forward_tests: tests.map((t) => t.id),
        note: "fresh-context LOAD tests passed; LLM behavioral forward-test NOT_VERIFIED (needs a provider secret)",
      },
      null,
      2,
    )}\n`,
  );
  spec.activated = true;
  writeFileSync(ftPath, `${JSON.stringify(spec, null, 2)}\n`);
  return { activated: true, skill: name, reason: "activated", statePath, tests };
}
