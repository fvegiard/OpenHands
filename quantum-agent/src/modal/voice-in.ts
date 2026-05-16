// Voice-in: transcribe audio with whisper.cpp when available. Never throws —
// the agent loop never stalls on a missing transcriber.

import { existsSync } from "node:fs";
import { execa } from "execa";

const CANDIDATES = [
  // [binary, args]
  ["whisper-cpp", ["%PATH%", "--no-prints", "--output-txt"]],
  ["whisper", ["%PATH%", "--output-format", "txt", "--quiet"]],
  ["main", ["%PATH%"]],
] as const;

export async function transcribe(audioPath: string): Promise<string> {
  if (!existsSync(audioPath)) return `[voice-in] no file at ${audioPath}`;
  for (const [bin, args] of CANDIDATES) {
    try {
      const realArgs = args.map((a) => (a === "%PATH%" ? audioPath : a));
      const r = await execa(bin, realArgs, { timeout: 120_000, reject: false });
      if (r.exitCode === 0 && r.stdout) return r.stdout.trim();
    } catch {
      // try next
    }
  }
  return `[voice-in] whisper.cpp not found (install via mise or apt). Path: ${audioPath}`;
}
