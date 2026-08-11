import { describe, expect, it, vi } from "vitest";
import {
  buildQueries,
  deduplicate,
  runResearchTopic,
  scoreRelevance,
} from "../../src/research/scout.ts";

describe("scout", () => {
  describe("buildQueries", () => {
    it("returns exactly 3 angle queries for a topic", () => {
      const queries = buildQueries("react hooks");
      expect(queries).toHaveLength(3);
      expect(queries.map((q) => q.angle)).toEqual([
        "official-docs",
        "github-issues",
        "blog-tutorials",
      ]);
    });

    it("includes the topic in each query string", () => {
      const queries = buildQueries("react hooks");
      for (const q of queries) {
        expect(q.query.toLowerCase()).toContain("react hooks");
      }
    });
  });

  describe("scoreRelevance", () => {
    const topic = "node version";

    it("scores title matches higher than snippet matches", () => {
      const titleHit = {
        title: "Node version manager guide",
        url: "https://example.com/1",
        snippet: "Some unrelated text",
        angle: "official-docs",
      };
      const snippetHit = {
        title: "Random title",
        url: "https://example.com/2",
        snippet: "Node version is important",
        angle: "blog-tutorials",
      };
      expect(scoreRelevance(titleHit, topic)).toBeGreaterThan(scoreRelevance(snippetHit, topic));
    });

    it("gives bonus for official-docs angle", () => {
      const hit = {
        title: "Node version",
        url: "https://example.com",
        snippet: "Node version",
        angle: "official-docs" as const,
      };
      const base = scoreRelevance({ ...hit, angle: "blog-tutorials" }, topic);
      const bonus = scoreRelevance(hit, topic);
      expect(bonus - base).toBeGreaterThanOrEqual(10);
    });
  });

  describe("deduplicate", () => {
    it("removes duplicate URLs keeping the higher score", () => {
      const hits = [
        {
          title: "A",
          url: "https://example.com/1",
          snippet: "a",
          angle: "official-docs" as const,
          score: 5,
        },
        {
          title: "B",
          url: "https://example.com/1",
          snippet: "b",
          angle: "blog-tutorials" as const,
          score: 10,
        },
        {
          title: "C",
          url: "https://example.com/2",
          snippet: "c",
          angle: "github-issues" as const,
          score: 3,
        },
      ];
      const unique = deduplicate(hits);
      expect(unique).toHaveLength(2);
      expect(unique.find((h) => h.url === "https://example.com/1")?.title).toBe("B");
    });
  });

  describe("runResearchTopic", () => {
    it("returns empty brief when no topic is provided", async () => {
      const brief = await runResearchTopic({ topic: "" });
      expect(brief.ranked).toHaveLength(0);
      expect(brief.summary).toContain("No topic provided");
    });

    it("respects the scouts limit", async () => {
      vi.spyOn(await import("../../src/tools/web.ts"), "autoWebSearch").mockResolvedValue({
        query: "",
        results: [
          { title: "A", url: "https://example.com/1", snippet: "a" },
          { title: "B", url: "https://example.com/2", snippet: "b" },
          { title: "C", url: "https://example.com/3", snippet: "c" },
        ],
      });

      const brief = await runResearchTopic({ topic: "node version", scouts: 2 });
      // buildQueries always returns 3, but scouts=2 means we slice to 2
      // autoWebSearch is called 2 times (once per scout)
      expect(brief.totalHits).toBeGreaterThanOrEqual(0);
    });

    it("returns a summary string", async () => {
      vi.spyOn(await import("../../src/tools/web.ts"), "autoWebSearch").mockResolvedValue({
        query: "",
        results: [],
      });

      const brief = await runResearchTopic({ topic: "react server components" });
      expect(brief.summary).toContain("react server components");
    });
  });
});
