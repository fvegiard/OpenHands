import { describe, expect, it } from "vitest";
import { clear, sha256, status, taskKey } from "../src/cache/index.ts";

describe("cache facade", () => {
  it("hashes deterministically", () => {
    expect(sha256("x")).toBe(sha256("x"));
    expect(taskKey({ a: 1, b: 2 })).toBe(taskKey({ b: 2, a: 1 }));
  });

  it("reports status without throwing", () => {
    const s = status();
    expect(Array.isArray(s)).toBe(true);
  });

  it("clear() is idempotent", () => {
    clear();
    clear("http");
  });
});
