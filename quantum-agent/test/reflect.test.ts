import { describe, expect, it } from "vitest";
import { classifyOutcome, recentReflections, reflect } from "../src/quantum/reflect.ts";

describe("reflector", () => {
  it("classifies outcomes from text", () => {
    expect(classifyOutcome("All tests passed and code shipped.")).toBe("success");
    expect(classifyOutcome("Implemented basic version; remaining steps are TODO.")).toBe("partial");
    expect(classifyOutcome("Build crashed with a TypeError.")).toBe("failure");
  });

  it("persists a reflection and reads it back", () => {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const r = reflect(taskId, "compile widget", "Done; all 5 tests passed.");
    expect(r.outcome).toBe("success");
    expect(r.task).toBe("compile widget");
    const recent = recentReflections(200);
    const found = recent.find((row) => row.taskId === taskId);
    expect(found).toBeDefined();
    expect(found?.task).toBe("compile widget");
  });

  it("truncates very long notes", () => {
    const r = reflect("t-long", "do thing", "x".repeat(2000));
    expect(r.note.length).toBeLessThanOrEqual(500);
  });
});
