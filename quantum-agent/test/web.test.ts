import { describe, expect, it } from "vitest";
import { parseDdgHtml } from "../src/tools/web.ts";

const SAMPLE = `
<html><body>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fone">First &amp; result</a>
  <a class="result__snippet">A short snippet about <b>example</b>.</a>
</div>
<div class="result">
  <a class="result__a" href="https://second.example.org">Second</a>
  <a class="result__snippet">Another snippet.</a>
</div>
</body></html>
`;

describe("autoWebSearch parser", () => {
  it("extracts hits with cleaned URLs and titles", () => {
    const hits = parseDdgHtml(SAMPLE, 5);
    expect(hits.length).toBe(2);
    expect(hits[0]?.url).toBe("https://example.com/one");
    expect(hits[0]?.title).toBe("First & result");
    expect(hits[0]?.snippet).toContain("example");
    expect(hits[1]?.url).toBe("https://second.example.org");
  });

  it("respects the limit", () => {
    const hits = parseDdgHtml(SAMPLE, 1);
    expect(hits.length).toBe(1);
  });

  it("returns [] on garbage input", () => {
    expect(parseDdgHtml("<html>nothing here</html>", 5)).toEqual([]);
  });
});
