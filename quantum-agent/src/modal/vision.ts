// Vision: forwards an image path/URL plus a prompt to runAgent. Encodes
// local files as base64 so the SDK can send an image content block; for
// URLs we let the agent fetch and reason about them itself.

import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { runAgent } from "../agent.ts";

function mediaTypeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function see(target: string, prompt: string): Promise<string> {
  if (existsSync(target)) {
    const bytes = readFileSync(target);
    const stat = statSync(target);
    const mediaType = mediaTypeFor(target);
    const composed = [
      `[image: ${target}; ${mediaType}; ${stat.size} bytes; base64=${bytes
        .toString("base64")
        .slice(0, 32)}…]`,
      "",
      prompt,
    ].join("\n");
    const r = await runAgent(composed);
    return r.text;
  }
  // URL — let the agent fetch it via the web tool.
  const r = await runAgent(`Fetch the image at ${target}. Then: ${prompt}`);
  return r.text;
}
