// Verifies session-id collision resistance. Pre-fix used `q-${Date.now()}`
// which would collide for parallel `--quantum` branches firing in the same
// millisecond. We test the id-generation function directly (10 000 calls)
// rather than the full runAgent pipeline so the SQLite blackboard isn't
// hammered by the test runner.

import { describe, expect, it } from "vitest";
import { newSessionId } from "../src/agent.ts";

describe("newSessionId collision resistance", () => {
  it("10 000 sequential calls produce 10 000 distinct ids", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) ids.add(newSessionId());
    expect(ids.size).toBe(10_000);
  });

  it("ids follow the documented shape q-<epoch>-<8hex>", () => {
    const id = newSessionId();
    expect(id).toMatch(/^q-\d+-[a-f0-9]{8}$/);
  });
});
