// `fetch` custom tool — RFC-9111 cached HTTP via undici.

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
