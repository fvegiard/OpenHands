// Multi-agent internet research orchestrator.
// Spawns N parallel sub-queries (configurable, default 3) with different
// research angles: official docs, GitHub issues/StackOverflow, and recent
// blog posts/tutorials. Aggregates, deduplicates, scores relevance, and
// returns a ranked brief.

import { z } from "zod";
import { autoWebSearch, type SearchHit } from "../tools/web.ts";

export interface ScoutQuery {
  angle: string;
  query: string;
}

export interface RankedHit extends SearchHit {
  score: number;
  angle: string;
}

export interface ResearchBrief {
  query: string;
  totalHits: number;
  uniqueHits: number;
  ranked: RankedHit[];
  summary: string;
}

export function buildQueries(topic: string): ScoutQuery[] {
  const t = topic.replace(/\s+/g, " ").trim();
  return [
    { angle: "official-docs", query: `${t} official documentation guide reference` },
    { angle: "github-issues", query: `${t} github issues stackoverflow error fix` },
    { angle: "blog-tutorials", query: `${t} tutorial blog post 2026` },
  ];
}

async function runSingleScout(angle: string, query: string): Promise<RankedHit[]> {
  const report = await autoWebSearch(query, 5);
  return report.results.map((r) => ({ ...r, angle, score: 0 }));
}

export function scoreRelevance(hit: SearchHit & { angle: string }, topic: string): number {
  const topicLower = topic.toLowerCase();
  const titleLower = hit.title.toLowerCase();
  const snippetLower = hit.snippet.toLowerCase();
  const urlLower = hit.url.toLowerCase();

  let score = 0;

  const topicWords = topicLower.split(/\s+/).filter((w) => w.length > 2);
  const topicToken = topicLower.replace(/\s+/g, "");

  if (urlLower.includes(topicToken)) score += 20;

  const titleMatches = topicWords.filter((w) => titleLower.includes(w)).length;
  score += titleMatches * 10;

  const snippetMatches = topicWords.filter((w) => snippetLower.includes(w)).length;
  score += snippetMatches * 5;

  if (hit.angle === "official-docs") score += 15;
  else if (hit.angle === "github-issues") score += 10;
  else if (hit.angle === "blog-tutorials") score += 5;

  if (/\b20(2[5-9]|3[0-9])\b/.test(hit.snippet)) score += 5;

  return score;
}

export function deduplicate(hits: RankedHit[]): RankedHit[] {
  const seen = new Map<string, RankedHit>();
  for (const hit of hits) {
    const existing = seen.get(hit.url);
    if (!existing) {
      seen.set(hit.url, hit);
    } else if (hit.score > existing.score) {
      seen.set(hit.url, hit);
    }
  }
  return Array.from(seen.values());
}

export async function runResearchTopic(input: {
  topic: string;
  scouts?: number;
}): Promise<ResearchBrief> {
  const topic = input.topic.trim();
  if (!topic) {
    return {
      query: topic,
      totalHits: 0,
      uniqueHits: 0,
      ranked: [],
      summary: "No topic provided.",
    };
  }

  const numScouts = input.scouts ?? 3;
  const queries = buildQueries(topic);
  const scouts = queries.slice(0, Math.min(numScouts, queries.length));

  const results = await Promise.all(scouts.map((s) => runSingleScout(s.angle, s.query)));

  const flat = results.flat();
  const scored = flat.map((h) => ({ ...h, score: scoreRelevance(h, topic) }));
  const unique = deduplicate(scored);
  unique.sort((a, b) => b.score - a.score);

  const summary =
    unique.length === 0
      ? `No research results found for "${topic}".`
      : `Found ${unique.length} unique result(s) for "${topic}" across ${scouts.length} scout(s). Top: ${unique[0]?.title} (${unique[0]?.url})`;

  return {
    query: topic,
    totalHits: flat.length,
    uniqueHits: unique.length,
    ranked: unique,
    summary,
  };
}

export const researchTopicSchema = {
  topic: z.string().min(1, "topic is required"),
  scouts: z.number().int().positive().max(5).optional(),
};
