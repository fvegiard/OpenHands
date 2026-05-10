import { describe, expect, it } from "vitest";
import { listInstalled, searchInstalled, translateSkill } from "../src/skills/manager.ts";

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
});
