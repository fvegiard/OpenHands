// Vision: forwards an image path/URL plus a prompt to runAgent. The SDK
// handles the image content block; in mock mode we describe deterministically.

import { existsSync, readFileSync } from "node:fs";
import { runAgent } from "../agent.ts";

export async function see(target: string, prompt: string): Promise<string> {
  if (existsSync(target)) {
    const bytes = readFileSync(target);
    const composed = `[image: ${target} (${bytes.length} bytes)]\n${prompt}`;
    const r = await runAgent(composed);
    return r.text;
  }
  // URL — let the agent fetch it.
  const r = await runAgent(`Fetch the image at ${target} and: ${prompt}`);
  return r.text;
}
