// `fetch` custom tool — RFC-9111 cached HTTP via undici.
// Also exports `autoWebSearch` used by the agent to prime coding requests
// with fresh 2026 results (no API key needed; DuckDuckGo HTML endpoint).

import { request } from "undici";
import { z } from "zod";
import type { ToolResult } from "./shell.ts";

export const webSchema = {
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
};

export async function runFetch(args: {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}): Promise<ToolResult> {
  const { statusCode, body } = await request(args.url, {
    method: args.method ?? "GET",
    headers: args.headers,
    body: args.body,
  });
  const text = await body.text();
  const sliced = text.length > 32_000 ? `${text.slice(0, 32_000)}\n…[truncated]` : text;
  return {
    content: [{ type: "text", text: `status=${statusCode}\n${sliced}` }],
  };
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchReport {
  query: string;
  results: SearchHit[];
}

/**
 * Search the public web for fresh context before coding. Uses DuckDuckGo's
 * HTML endpoint (no API key, no auth). Returns at most `limit` hits. Failures
 * (network down, blocked) return an empty array — never throws — so the
 * agent loop never stalls on a missing search.
 */
export async function autoWebSearch(query: string, limit = 5): Promise<SearchReport> {
  const q = `${query} 2026`;
  try {
    const res = await request(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      method: "POST",
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
        "content-type": "application/x-www-form-urlencoded",
      },
      bodyTimeout: 8_000,
      headersTimeout: 8_000,
    });
    if (res.statusCode >= 400) return { query: q, results: [] };
    const html = await res.body.text();
    return { query: q, results: parseDdgHtml(html, limit) };
  } catch {
    return { query: q, results: [] };
  }
}

export function parseDdgHtml(html: string, limit: number): SearchHit[] {
  const hits: SearchHit[] = [];
  // DDG HTML wraps each result in <a class="result__a" href="...">title</a>
  // followed by a <a class="result__snippet">snippet</a>.
  const re =
    /<a\s+[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a\s+[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    if (hits.length >= limit) break;
    const rawUrl = m[1] ?? "";
    const title = stripTags(m[2] ?? "");
    const snippet = stripTags(m[3] ?? "");
    const url = normaliseDdgUrl(rawUrl);
    if (!url || !title) continue;
    hits.push({ url, title, snippet });
  }
  return hits;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseDdgUrl(raw: string): string {
  // DDG sometimes wraps in /l/?uddg=<encoded>&… Decode if so.
  const m = raw.match(/[?&]uddg=([^&]+)/);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return raw;
    }
  }
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
}
