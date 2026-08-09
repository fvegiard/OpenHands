import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW = readFileSync(
  join(process.cwd(), "..", ".github", "workflows", "quantum.yml"),
  "utf8",
);

describe("quantum CI truth policy", () => {
  it("does not suppress whole Node warning categories", () => {
    expect(WORKFLOW).toContain('NODE_OPTIONS: "--disable-warning=DEP0205"');
    expect(WORKFLOW).not.toContain("--disable-warning=ExperimentalWarning");
    expect(WORKFLOW).not.toContain("--no-warnings");
  });

  it("keeps both Node 26 lanes gating", () => {
    expect(WORKFLOW).not.toContain("continue-on-error: true");
    expect(WORKFLOW).toContain("green-node26-compat:");
    expect(WORKFLOW).toContain("green-windows-node26-compat:");
  });
});
