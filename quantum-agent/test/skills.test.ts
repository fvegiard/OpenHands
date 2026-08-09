import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  listInstalled,
  searchInstalled,
  syncSkills,
  translateSkill,
} from "../src/skills/manager.ts";

describe("skills manager", () => {
  it("discovers shipped meta-skills", () => {
    const installed = listInstalled();
    const names = installed.map((m) => m.frontmatter.name);
    expect(names).toContain("hyperplan");
    expect(names).toContain("quantum-loop");
    expect(names).toContain("skill-new");
  });

  it("searches by name and description", () => {
    const r = searchInstalled("hyperplan");
    expect(r.length).toBeGreaterThan(0);
  });

  it("translates a skill to openclaw format", () => {
    const text = translateSkill("hyperplan", "openclaw");
    const obj = JSON.parse(text);
    expect(obj.name).toBe("hyperplan");
    expect(obj.instructions).toBeTruthy();
  });

  it("syncs supporting assets and removes stale generated files", () => {
    const root = mkdtempSync(join(tmpdir(), "quantum-skill-sync-"));
    const source = join(root, "skills-core");
    const target = join(root, ".agents", "skills");
    const skill = join(source, "with-assets");
    mkdirSync(join(skill, "references"), { recursive: true });
    writeFileSync(
      join(skill, "SKILL.md"),
      "---\nname: with-assets\ndescription: Test supporting asset sync.\n---\n\nRead [schema](references/schema.md).\n",
    );
    writeFileSync(join(skill, "references", "schema.md"), "version one\n");

    syncSkills(target, source);
    const generated = join(target, "with-assets");
    expect(readFileSync(join(generated, "references", "schema.md"), "utf8")).toBe("version one\n");
    expect(readFileSync(join(generated, "SKILL.md"), "utf8")).toContain("by `quantum skill sync`");

    writeFileSync(join(generated, "stale.txt"), "stale\n");
    writeFileSync(join(skill, "references", "schema.md"), "version two\n");
    syncSkills(target, source);
    expect(existsSync(join(generated, "stale.txt"))).toBe(false);
    expect(readFileSync(join(generated, "references", "schema.md"), "utf8")).toBe("version two\n");
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a frontmatter name that does not match its source directory", () => {
    const root = mkdtempSync(join(tmpdir(), "quantum-skill-sync-unsafe-"));
    const source = join(root, "skills-core", "safe-folder");
    const target = join(root, ".agents", "skills");
    mkdirSync(source, { recursive: true });
    writeFileSync(
      join(source, "SKILL.md"),
      "---\nname: ../escape\ndescription: Invalid sync target.\n---\n",
    );
    expect(() => syncSkills(target, join(root, "skills-core"))).toThrow(/unsafe or mismatched/);
    expect(existsSync(join(root, ".agents", "escape"))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});
