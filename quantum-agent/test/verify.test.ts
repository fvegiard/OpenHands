import { describe, expect, it } from "vitest";
import { extractBashBlocks } from "../src/verify.ts";

const SAMPLE = `
# heading

\`\`\`bash
quantum doctor
mise install
\`\`\`

text

\`\`\`bash
pnpm install
quantum run "hi"
\`\`\`
`;

describe("verify", () => {
  it("extracts fenced bash blocks", () => {
    const blocks = extractBashBlocks(SAMPLE);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("quantum doctor");
    expect(blocks[1]).toContain("pnpm install");
  });
});
